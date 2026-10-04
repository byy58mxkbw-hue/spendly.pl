import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, suppliersTable, invoicesTable } from "@workspace/db";

// Blokady importu ręcznego/OCR (przegląd kont 2026-10-05): realny lokal miał w bazie
// puste faktury na 0 zł i te same faktury zapisane dwa razy pod różnymi rekordami
// dostawcy (OCR źle odczytał NIP). DB-gated: tylko z TEST_DATABASE_URL.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_ocr_guards" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const U = "test_ocr_guards";
const item = (name: string, total: number) => ({ productName: name, quantity: 1, unit: "szt", unitPrice: total, totalPrice: total, vatRate: null });

describe.skipIf(!RUN_DB)("Import OCR: pusta faktura i duplikaty", () => {
  let server: Server;
  let baseUrl: string;
  let supA = 0;
  let supA2 = 0;

  const post = (body: unknown) => {
    authState.userId = U;
    return fetch(`${baseUrl}/api/invoices/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  };
  const cleanup = async () => {
    await db.delete(invoicesTable).where(eq(invoicesTable.userId, U));
    await db.delete(suppliersTable).where(eq(suppliersTable.userId, U));
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await cleanup();
    // Ten sam dostawca dwa razy — jak po błędnym odczycie NIP przez OCR.
    const [a] = await db.insert(suppliersTable).values({ userId: U, name: "Chefs Culinar Sp. z o.o.", taxId: "5172930715" }).returning({ id: suppliersTable.id });
    const [a2] = await db.insert(suppliersTable).values({ userId: U, name: "Chefs Culinar oddział Warszawa", taxId: "5272930715" }).returning({ id: suppliersTable.id });
    supA = a.id;
    supA2 = a2.id;
  });

  afterAll(async () => {
    await cleanup();
    server?.close();
  });

  it("odrzuca fakturę bez pozycji (nieudany odczyt OCR)", async () => {
    const res = await post({ supplierId: supA, invoiceDate: "2026-09-18", items: [] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/nie ma żadnej pozycji/);
  });

  it("zapisuje normalną fakturę", async () => {
    const res = await post({ supplierId: supA, invoiceNumber: "302126479", invoiceDate: "2024-10-06", items: [item("Kapary", 700.8)] });
    expect(res.status).toBe(201);
  });

  it("ten sam numer i data u innego rekordu dostawcy → 409", async () => {
    const res = await post({ supplierId: supA2, invoiceNumber: "302126479", invoiceDate: "2024-10-06", items: [item("Kapary", 700.79)] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/Chefs Culinar Sp\. z o\.o\./);
  });

  it("ten sam dostawca, data i kwota, ale inny (źle odczytany) numer → 409", async () => {
    const res = await post({ supplierId: supA, invoiceNumber: "302126470", invoiceDate: "2024-10-06", items: [item("Kapary", 700.8)] });
    expect(res.status).toBe(409);
  });

  it("świadome zapisanie mimo ostrzeżenia (force) przechodzi", async () => {
    const res = await post({ supplierId: supA, invoiceNumber: "302126470", invoiceDate: "2024-10-06", items: [item("Kapary", 700.8)], force: true });
    expect(res.status).toBe(201);
  });
});
