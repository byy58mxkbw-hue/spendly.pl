import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, suppliersTable, invoicesTable } from "@workspace/db";

// Faza 2.1 — dedup faktur. Uderza w PRAWDZIWY POST /api/invoices/import:
// druga próba tej samej faktury (ten sam dostawca + numer) NIE tworzy duplikatu (409),
// a `force:true` świadomie go pomija.
//
// Wymaga bazy: tylko gdy TEST_DATABASE_URL (CI). Lokalnie → pominięte.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_dedup_user" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const USER = "test_dedup_user";

describe.skipIf(!RUN_DB)("dedup faktur: POST /api/invoices/import", () => {
  let server: Server;
  let baseUrl: string;
  let supplierId: number;

  const importBody = (extra: Record<string, unknown> = {}) => ({
    supplierId,
    invoiceNumber: "FV-DEDUP-1",
    invoiceDate: "2026-07-01",
    items: [{ productName: "Pomidor", quantity: 2, unit: "kg", unitPrice: 5, totalPrice: 10 }],
    ...extra,
  });

  const postImport = (body: Record<string, unknown>) =>
    fetch(`${baseUrl}/api/invoices/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  async function invoiceCount(): Promise<number> {
    const rows = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.userId, USER));
    return rows.length;
  }

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // czysto: usuń faktury (cascade items) i dostawcę, potem zasiej jednego dostawcę
    await db.delete(invoicesTable).where(eq(invoicesTable.userId, USER));
    await db.delete(suppliersTable).where(eq(suppliersTable.userId, USER));
    const [sup] = await db
      .insert(suppliersTable)
      .values({ userId: USER, name: "Dostawca-dedup", taxId: "9999999999" })
      .returning({ id: suppliersTable.id });
    supplierId = sup.id;
    authState.userId = USER;
  });

  afterAll(async () => {
    await db.delete(invoicesTable).where(eq(invoicesTable.userId, USER));
    await db.delete(suppliersTable).where(eq(suppliersTable.userId, USER));
    server?.close();
  });

  it("pierwszy import tworzy fakturę (201)", async () => {
    const res = await postImport(importBody());
    expect(res.status).toBe(201);
    expect(await invoiceCount()).toBe(1);
  });

  it("powtórny import tej samej faktury → 409, brak duplikatu", async () => {
    const res = await postImport(importBody());
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string; existingInvoiceId?: number };
    expect(body.error).toMatch(/zaimportowana/i);
    expect(body.existingInvoiceId).toBeTypeOf("number");
    expect(await invoiceCount()).toBe(1); // nadal jedna
  });

  it("force:true świadomie pomija dedup", async () => {
    const res = await postImport(importBody({ force: true }));
    expect(res.status).toBe(201);
    expect(await invoiceCount()).toBe(2);
  });
});
