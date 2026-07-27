import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray, eq } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, restaurantRevenueTable, posSalesTable } from "@workspace/db";

// Food cost % + sprzedaż: PUT /revenue, GET /reports/food-cost-ratio, GET /sales.
// Uderza w prawdziwe route na test-Postgresie. DB-gated: tylko z TEST_DATABASE_URL (CI).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_fc_R" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const U = "test_fc_R";

describe.skipIf(!RUN_DB)("Food cost % + sprzedaż", () => {
  let server: Server;
  let baseUrl: string;

  const get = async (path: string) => {
    authState.userId = U;
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(200);
    return res.json();
  };
  const put = (path: string, body: unknown) => {
    authState.userId = U;
    return fetch(`${baseUrl}${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, [U]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [U]));
    await db.delete(restaurantRevenueTable).where(eq(restaurantRevenueTable.userId, U));
    await db.delete(posSalesTable).where(eq(posSalesTable.userId, U));

    const [sup] = await db.insert(suppliersTable).values({ userId: U, name: "SUP-FC", taxId: "7778889990" }).returning({ id: suppliersTable.id });
    const [inv] = await db.insert(invoicesTable).values({
      userId: U, supplierId: sup.id, invoiceNumber: "FC-1", invoiceDate: "2026-07-10", totalAmount: "3000",
    }).returning({ id: invoicesTable.id });
    await db.insert(invoiceItemsTable).values({
      invoiceId: inv.id, productName: "Kurczak", quantity: "10", unit: "kg", unitPrice: "300", totalPrice: "3000",
    });

    // Sprzedaż per pozycja: lipiec (Filet 100, Burger 50) + czerwiec (Filet 80).
    await db.insert(posSalesTable).values([
      { userId: U, period: "2026-07", productName: "Filet z kurczaka", qty: "100", netValue: "4000", source: "test" },
      { userId: U, period: "2026-07", productName: "Burger", qty: "50", netValue: "2500", source: "test" },
      { userId: U, period: "2026-06", productName: "Filet z kurczaka", qty: "80", netValue: "3200", source: "test" },
    ]);
  });

  afterAll(async () => {
    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, [U]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [U]));
    await db.delete(restaurantRevenueTable).where(eq(restaurantRevenueTable.userId, U));
    await db.delete(posSalesTable).where(eq(posSalesTable.userId, U));
    server?.close();
  });

  it("PUT /revenue zapisuje przychód miesiąca (upsert)", async () => {
    const res = await put("/api/revenue", { period: "2026-07", amountNet: 10000 });
    expect(res.status).toBe(200);
    // upsert: druga zmiana nadpisuje
    const res2 = await put("/api/revenue", { period: "2026-07", amountNet: 10000 });
    expect(res2.status).toBe(200);
  });

  it("food-cost-ratio: koszt/przychód = 30% dla lipca", async () => {
    const r = (await get("/api/reports/food-cost-ratio?month=2026-07")) as {
      totalSpend: number; totalRevenue: number; foodCostPct: number | null;
    };
    expect(r.totalSpend).toBeCloseTo(3000, 2);
    expect(r.totalRevenue).toBeCloseTo(10000, 2);
    expect(r.foodCostPct).toBeCloseTo(30, 1); // 3000/10000
  });

  it("food-cost-ratio: brak przychodu → foodCostPct null (nie dzielimy przez 0)", async () => {
    const r = (await get("/api/reports/food-cost-ratio?month=2026-05")) as { foodCostPct: number | null; totalRevenue: number };
    expect(r.totalRevenue).toBe(0);
    expect(r.foodCostPct).toBeNull();
  });

  it("/sales: pozycje wg ilości + porównanie do poprzedniego miesiąca", async () => {
    const r = (await get("/api/sales?month=2026-07")) as {
      totalQty: number;
      items: Array<{ productName: string; qty: number; prevQty: number | null; qtyChangePct: number | null }>;
    };
    expect(r.totalQty).toBeCloseTo(150, 2); // 100 + 50
    expect(r.items[0].productName).toBe("Filet z kurczaka"); // najwięcej sztuk
    expect(r.items[0].qty).toBeCloseTo(100, 2);
    expect(r.items[0].prevQty).toBeCloseTo(80, 2); // czerwiec
    expect(r.items[0].qtyChangePct).toBeCloseTo(25, 1); // (100-80)/80
    const burger = r.items.find((i) => i.productName === "Burger");
    expect(burger?.prevQty).toBeNull(); // nie było w czerwcu
  });
});
