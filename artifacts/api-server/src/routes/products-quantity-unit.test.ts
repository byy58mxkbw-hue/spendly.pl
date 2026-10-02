import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, productsTable } from "@workspace/db";

// Ilość na liście Produktów (audyt spójności 2026-10-01): liczona tylko w jednostce
// ostatniego zakupu, a nie jako suma kg + szt. Jednostka ilości wraca w polu
// quantityUnit — produkt z importu menu ma jednostkę „g”, a faktury bywają w kg.
// DB-gated: tylko z TEST_DATABASE_URL.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_products_qty_unit" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const U = "test_products_qty_unit";
type P = { id: number; name: string; totalQuantity: number | null; quantityUnit: string | null };

describe.skipIf(!RUN_DB)("Produkty: ilość w jednostce ostatniego zakupu", () => {
  let server: Server;
  let baseUrl: string;

  const cleanup = async () => {
    await db.delete(invoicesTable).where(eq(invoicesTable.userId, U));
    await db.delete(productsTable).where(eq(productsTable.userId, U));
    await db.delete(suppliersTable).where(eq(suppliersTable.userId, U));
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await cleanup();
    const [s] = await db.insert(suppliersTable).values({ userId: U, name: "QU Dostawca", taxId: "2220000001" }).returning({ id: suppliersTable.id });
    const [cytryny] = await db.insert(productsTable).values({ userId: U, name: "Cytryny", unit: "g" }).returning({ id: productsTable.id });
    const [maka] = await db.insert(productsTable).values({ userId: U, name: "Mąka", unit: "g" }).returning({ id: productsTable.id });
    const buy = async (date: string, productId: number, name: string, qty: number, unit: string) => {
      const [inv] = await db
        .insert(invoicesTable)
        .values({ userId: U, supplierId: s.id, invoiceNumber: `QU-${Math.random().toString(36).slice(2, 8)}`, invoiceDate: date, totalAmount: "10" })
        .returning({ id: invoicesTable.id });
      await db.insert(invoiceItemsTable).values({ invoiceId: inv.id, productId, productName: name, quantity: String(qty), unit, unitPrice: "1", totalPrice: String(qty) });
    };
    // Cytryny: najpierw 10 kg, potem 5 szt → ilość = 5 szt (nie 15).
    await buy("2026-08-01", cytryny.id, "Cytryny", 10, "kg");
    await buy("2026-08-02", cytryny.id, "Cytryny", 5, "szt");
    // Mąka: dwa zakupy w kg (różny zapis jednostki) → 12 kg, mimo że produkt ma „g”.
    await buy("2026-08-03", maka.id, "Mąka", 7, "kg");
    await buy("2026-08-04", maka.id, "Mąka", 5, "KG.");
  });

  afterAll(async () => {
    await cleanup();
    server?.close();
  });

  for (const path of ["/api/products?month=2026-08", "/api/products"]) {
    it(`${path}: ilość tylko w jednostce ostatniego zakupu`, async () => {
      authState.userId = U;
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(200);
      const list = (await res.json()) as P[];
      expect(list.find((p) => p.name === "Cytryny")).toMatchObject({ totalQuantity: 5, quantityUnit: "szt" });
      expect(list.find((p) => p.name === "Mąka")).toMatchObject({ totalQuantity: 12, quantityUnit: "kg" });
    });
  }
});
