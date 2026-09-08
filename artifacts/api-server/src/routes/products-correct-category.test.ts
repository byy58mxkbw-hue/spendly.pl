import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, productsTable, productCorrectionsTable } from "@workspace/db";

// P6 (Krok 7): PATCH /products/:id/correct-category propaguje korektę na duplikaty
// przez indeksowane zapytanie po canonical_name zamiast pełnego skanu + normalizacji
// w JS. Sprawdzamy obie ścieżki: szybką (canonical_name ustawiony) i fallback
// (canonical_name NULL, legacy wiersze sprzed backfillu). DB-gated: TEST_DATABASE_URL.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_corrcat_R" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const R = "test_corrcat_R";

describe.skipIf(!RUN_DB)("PATCH /products/:id/correct-category — propagacja na duplikaty", () => {
  let server: Server;
  let baseUrl: string;

  const patchCorrect = (id: number, body: Record<string, unknown>) => {
    authState.userId = R;
    return fetch(`${baseUrl}/api/products/${id}/correct-category`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await db.delete(productCorrectionsTable).where(eq(productCorrectionsTable.userId, R));
    await db.delete(productsTable).where(eq(productsTable.userId, R));
    server?.close();
  });

  it("ścieżka szybka: propaguje na produkt o tym samym canonical_name (indeksowane zapytanie)", async () => {
    const [p1] = await db.insert(productsTable)
      .values({ userId: R, name: "Ser Cheddar 1kg", unit: "kg", category: "nabiał", canonicalName: "ser cheddar" })
      .returning({ id: productsTable.id });
    const [p2] = await db.insert(productsTable)
      .values({ userId: R, name: "SER CHEDDAR   (duplikat)", unit: "kg", category: "nabiał", canonicalName: "ser cheddar" })
      .returning({ id: productsTable.id });

    const res = await patchCorrect(p1.id, { category: "sery", subcategory: "ser cheddar" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updatedCount: number };
    expect(body.updatedCount).toBe(2);

    const [row1] = await db.select().from(productsTable).where(eq(productsTable.id, p1.id));
    const [row2] = await db.select().from(productsTable).where(eq(productsTable.id, p2.id));
    expect(row1.category).toBe("sery");
    expect(row2.category).toBe("sery");
    expect(row2.classificationConfidence).toBe(1);
    expect(row2.needsReview).toBe(false);
  });

  it("fallback: canonical_name NULL (legacy) nadal propaguje przez normalizację w JS", async () => {
    const [p1] = await db.insert(productsTable)
      .values({ userId: R, name: "Masło Extra 200g", unit: "kg", category: "inne", canonicalName: null })
      .returning({ id: productsTable.id });
    const [p2] = await db.insert(productsTable)
      .values({ userId: R, name: "masło extra 200g", unit: "kg", category: "inne", canonicalName: null })
      .returning({ id: productsTable.id });

    const res = await patchCorrect(p1.id, { category: "nabiał" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updatedCount: number };
    expect(body.updatedCount).toBe(2);

    const [row2] = await db.select().from(productsTable).where(eq(productsTable.id, p2.id));
    expect(row2.category).toBe("nabiał");
    // Efekt uboczny korekty: canonical_name uzupełniony nawet na starej ścieżce.
    expect(row2.canonicalName).not.toBeNull();
  });

  it("nie propaguje na produkt z INNYM canonical_name", async () => {
    const [p1] = await db.insert(productsTable)
      .values({ userId: R, name: "Jogurt Naturalny", unit: "szt", category: "inne", canonicalName: "jogurt naturalny" })
      .returning({ id: productsTable.id });
    const [unrelated] = await db.insert(productsTable)
      .values({ userId: R, name: "Jogurt Owocowy", unit: "szt", category: "inne", canonicalName: "jogurt owocowy" })
      .returning({ id: productsTable.id });

    const res = await patchCorrect(p1.id, { category: "nabiał" });
    const body = (await res.json()) as { updatedCount: number };
    expect(body.updatedCount).toBe(1);

    const [rowUnrelated] = await db.select().from(productsTable).where(eq(productsTable.id, unrelated.id));
    expect(rowUnrelated.category).toBe("inne"); // nietknięty
  });
});
