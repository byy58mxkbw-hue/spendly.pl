import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, posSalesTable, dishesTable } from "@workspace/db";

// Import menu z GoPOS do Food Cost: lista pozycji (GET /food-cost/gopos-menu)
// i automatyczne powiązanie zapisanego dania ze sprzedażą (posProductName).
// DB-gated: tylko z TEST_DATABASE_URL. Szacowanie składników (AI) nie jest tu
// wołane — testujemy tylko walidację wejścia tego endpointu.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_fc_gopos" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const U = "test_fc_gopos";
const OTHER = "test_fc_gopos_other";

// Bieżący miesiąc — endpoint patrzy na ostatnie 6 miesięcy względem dziś.
const now = new Date();
const PERIOD = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

type MenuItem = { posProductName: string; name: string; category: string | null; qty: number; sellPrice: number | null; alreadyImported: boolean };

describe.skipIf(!RUN_DB)("Food Cost: import menu z GoPOS", () => {
  let server: Server;
  let baseUrl: string;

  const call = (path: string, init?: RequestInit, user = U) => {
    authState.userId = user;
    return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json" } });
  };

  const cleanup = async () => {
    for (const u of [U, OTHER]) {
      await db.delete(posSalesTable).where(eq(posSalesTable.userId, u));
      await db.delete(dishesTable).where(eq(dishesTable.userId, u));
    }
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await cleanup();

    await db.insert(posSalesTable).values([
      // Warianty jednego produktu POS (wspólne id) → jedno danie.
      { userId: U, period: PERIOD, productName: "Stek wołowy Medium", posProductId: "10", category: "DANIA GŁÓWNE", qty: "6", netValue: "600", source: "test" },
      { userId: U, period: PERIOD, productName: "Stek wołowy Well Done", posProductId: "10", category: "DANIA GŁÓWNE", qty: "4", netValue: "400", source: "test" },
      // Dwa różne dania pod tym samym id (GoPOS użył id ponownie) → osobno.
      { userId: U, period: PERIOD, productName: "Zrazy wołowe", posProductId: "20", category: "DANIA GŁÓWNE", qty: "5", netValue: "250", source: "test" },
      { userId: U, period: PERIOD, productName: "Risotto", posProductId: "20", category: "DANIA GŁÓWNE", qty: "3", netValue: "180", source: "test" },
      { userId: U, period: PERIOD, productName: "Żurek", posProductId: "30", category: "ZUPY", qty: "20", netValue: "500", source: "test" },
      // Cudza sprzedaż — nie może wyciec do listy.
      { userId: OTHER, period: PERIOD, productName: "Tajne danie", posProductId: "99", category: "X", qty: "1", netValue: "10", source: "test" },
    ]);
    // Żurek jest już w Food Cost.
    await db.insert(dishesTable).values({ userId: U, name: "Żurek", sellPrice: "27" });
  });

  afterAll(async () => {
    await cleanup();
    server?.close();
  });

  it("GET /food-cost/gopos-menu bez konfiguracji GoPOS: pusta lista, configured=false", async () => {
    const res = await call("/api/food-cost/gopos-menu");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; items: MenuItem[] };
    expect(body.configured).toBe(false);
    expect(body.items).toEqual([]);
  });

  it("zapis dania z posProductName od razu wiąże je ze sprzedażą", async () => {
    const save = await call("/api/food-cost/dishes/from-menu", {
      method: "POST",
      body: JSON.stringify({
        dishes: [{ name: "Stek z polędwicy", posProductName: "Stek wołowy", sellPrice: 108, category: "DANIA GŁÓWNE", ingredients: [{ name: "polędwica wołowa", grams: 250, estPricePerKg: 120 }] }],
      }),
    });
    expect(save.status).toBe(201);

    // Nazwa dania celowo INNA niż w POS — dopasowanie musi iść po powiązaniu.
    const res = await call(`/api/food-cost/dishes-sales?month=${PERIOD}`);
    const body = (await res.json()) as { dishes: Array<{ name: string; matched: boolean; soldQty: number; posProductName: string | null }> };
    const dish = body.dishes.find((d) => d.name === "Stek z polędwicy")!;
    expect(dish.posProductName).toBe("Stek wołowy");
    expect(dish.matched).toBe(true);
    expect(dish.soldQty).toBe(10);

  });

  it("DELETE /food-cost/dishes: bez potwierdzenia 400, z potwierdzeniem kasuje tylko dania tego usera", async () => {
    await db.insert(dishesTable).values({ userId: OTHER, name: "Cudze danie", sellPrice: "10" });
    const noConfirm = await call("/api/food-cost/dishes", { method: "DELETE", body: JSON.stringify({}) });
    expect(noConfirm.status).toBe(400);
    const before = await db.select().from(dishesTable).where(eq(dishesTable.userId, U));
    expect(before.length).toBeGreaterThan(0);

    const res = await call("/api/food-cost/dishes", { method: "DELETE", body: JSON.stringify({ confirm: "WYZERUJ" }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deleted: number }).deleted).toBe(before.length);
    expect(await db.select().from(dishesTable).where(eq(dishesTable.userId, U))).toHaveLength(0);
    expect(await db.select().from(dishesTable).where(eq(dishesTable.userId, OTHER))).toHaveLength(1);
  });

  it("POST /food-cost/import-menu/gopos: odrzuca pustą i zbyt długą listę", async () => {
    const empty = await call("/api/food-cost/import-menu/gopos", { method: "POST", body: JSON.stringify({ dishes: [] }) });
    expect(empty.status).toBe(400);
    const many = Array.from({ length: 81 }, (_, i) => ({ name: `Danie ${i}`, posProductName: `Danie ${i}` }));
    const tooMany = await call("/api/food-cost/import-menu/gopos", { method: "POST", body: JSON.stringify({ dishes: many }) });
    expect(tooMany.status).toBe(400);
  });
});
