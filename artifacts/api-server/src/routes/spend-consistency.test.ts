import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, costCentersTable } from "@workspace/db";
import { toolSpendSummary } from "../lib/ai-cfo-tools";

// Spójność „ile wydałem" między ekranami (audyt 2026-10-01). Te same faktury,
// a Dashboard, Raporty, centra kosztów, Faktury (oś czasu i kalendarz), Dostawcy
// i AI CFO muszą pokazać TĘ SAMĄ kwotę wydatku brutto. Wcześniej jedne ekrany
// wliczały faktury wykluczone, inne korekty — i liczby się rozjeżdżały.
// DB-gated: tylko z TEST_DATABASE_URL.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_spend_consistency" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const U = "test_spend_consistency";
const MONTH = "2026-08";
// Wydatek = faktura zwykła u A (100 netto + 23% = 123) + faktura u nieaktywnego B
// (100 netto + 8% = 108). Korekta, faktura rozliczeniowa i faktura wykluczona
// NIE są wydatkiem.
const EXPECTED = 231;

describe.skipIf(!RUN_DB)("Spójność wydatków między ekranami", () => {
  let server: Server;
  let baseUrl: string;
  let supplierA = 0;

  const get = async <T>(path: string): Promise<T> => {
    authState.userId = U;
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status, path).toBe(200);
    return (await res.json()) as T;
  };

  async function seed(
    supplierId: number,
    date: string,
    totalAmount: number,
    items: Array<{ name: string; net: number; vat: number }>,
    opts: { type?: string; excluded?: boolean; costCenterId?: number | null } = {},
  ) {
    const [inv] = await db
      .insert(invoicesTable)
      .values({
        userId: U,
        supplierId,
        invoiceNumber: `SC-${Math.random().toString(36).slice(2, 9)}`,
        invoiceDate: date,
        totalAmount: String(totalAmount),
        invoiceType: opts.type ?? "VAT",
        excluded: opts.excluded ?? false,
        costCenterId: opts.costCenterId ?? null,
      })
      .returning({ id: invoicesTable.id });
    await db.insert(invoiceItemsTable).values(
      items.map((it) => ({
        invoiceId: inv.id,
        productName: it.name,
        quantity: "1",
        unit: "szt",
        unitPrice: String(it.net),
        totalPrice: String(it.net),
        vatRate: String(it.vat),
      })),
    );
  }

  const cleanup = async () => {
    await db.delete(invoicesTable).where(eq(invoicesTable.userId, U));
    await db.delete(suppliersTable).where(eq(suppliersTable.userId, U));
    await db.delete(costCentersTable).where(eq(costCentersTable.userId, U));
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await cleanup();

    const [a] = await db.insert(suppliersTable).values({ userId: U, name: "SC Dostawca A", taxId: "1110000001" }).returning({ id: suppliersTable.id });
    const [b] = await db.insert(suppliersTable).values({ userId: U, name: "SC Dostawca B", taxId: "1110000002", isActive: false }).returning({ id: suppliersTable.id });
    const [cc] = await db.insert(costCentersTable).values({ userId: U, name: "Kuchnia" }).returning({ id: costCentersTable.id });
    supplierA = a.id;

    await seed(a.id, `${MONTH}-05`, 123, [{ name: "Mąka", net: 100, vat: 23 }], { costCenterId: cc.id });
    await seed(a.id, `${MONTH}-06`, -12.3, [{ name: "Mąka", net: -10, vat: 23 }], { type: "KOR" });
    await seed(a.id, `${MONTH}-07`, 0, [{ name: "Drewno", net: 50, vat: 23 }, { name: "Zaliczka 23% VAT", net: -50, vat: 23 }], { type: "ROZ" });
    await seed(a.id, `${MONTH}-08`, 246, [{ name: "Sprzęt", net: 200, vat: 23 }], { excluded: true });
    await seed(b.id, `${MONTH}-09`, 108, [{ name: "Ser", net: 100, vat: 8 }]);
  });

  afterAll(async () => {
    await cleanup();
    server?.close();
  });

  it("Dashboard", async () => {
    const r = await get<{ totalSpendThisMonth: number }>(`/api/dashboard/summary?month=${MONTH}`);
    expect(r.totalSpendThisMonth).toBeCloseTo(EXPECTED, 2);
  });

  it("Raporty: podsumowanie", async () => {
    const r = await get<{ totalSpend: number }>(`/api/reports/monthly?month=${MONTH}`);
    expect(r.totalSpend).toBeCloseTo(EXPECTED, 2);
  });

  it("Raporty: suma kafli centrów kosztów", async () => {
    const r = await get<Array<{ totalAmount: number }>>(`/api/reports/cost-centers?month=${MONTH}`);
    expect(r.reduce((s, c) => s + c.totalAmount, 0)).toBeCloseTo(EXPECTED, 2);
  });

  it("Faktury: oś czasu i kalendarz", async () => {
    const t = await get<{ totalAmount: number; invoiceCount: number }>(`/api/invoices/timeline?month=${MONTH}`);
    expect(t.totalAmount).toBeCloseTo(EXPECTED, 2);
    // Korekta i faktura rozliczeniowa zostają na liście, wykluczona nie.
    expect(t.invoiceCount).toBe(4);
    const c = await get<{ days: Array<{ totalAmount: number }> }>(`/api/invoices/calendar?month=${MONTH}`);
    expect(c.days.reduce((s, d) => s + d.totalAmount, 0)).toBeCloseTo(EXPECTED, 2);
  });

  it("Dostawcy: lista i karta dostawcy dają tę samą kwotę", async () => {
    const list = await get<Array<{ id: number; totalSpend: number | string | null; invoiceCount: number }>>(`/api/suppliers`);
    const a = list.find((s) => s.id === supplierA)!;
    expect(Number(a.totalSpend)).toBeCloseTo(123, 2);
    expect(a.invoiceCount).toBe(3); // bez faktury wykluczonej
    const detail = await get<{ totalSpend: number | string | null }>(`/api/suppliers/${supplierA}`);
    expect(Number(detail.totalSpend)).toBeCloseTo(123, 2);
  });

  it("AI CFO: suma brutto po dostawcach = ekrany (także nieaktywny dostawca)", async () => {
    const r = (await toolSpendSummary(U, { date_from: `${MONTH}-01`, date_to: `${MONTH}-31` })) as {
      suppliers: Array<{ total_spend_brutto: string | number }>;
      kwoty: string;
    };
    const sum = r.suppliers.reduce((s, x) => s + Number(x.total_spend_brutto), 0);
    expect(sum).toBeCloseTo(EXPECTED, 0);
    expect(r.kwoty).toMatch(/BRUTTO/);
  });
});
