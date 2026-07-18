import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, costCentersTable } from "@workspace/db";

// Testy analityki okresu: /reports/spend-bridge (rozbicie różnicy na ceny/ilości/nowe/
// porzucone) oraz eksport Excel (SUMA brutto + porównanie do poprzedniego okresu).
// Uderzają w PRAWDZIWE route na test-Postgresie. DB-gated: tylko z TEST_DATABASE_URL (CI).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "test_sb_R" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

type Item = { name: string; qty: number; unitPrice: number; total: number; vat?: number };

async function seedInvoice(
  userId: string,
  supplierId: number,
  invoiceDate: string,
  items: Item[],
  opts: { excluded?: boolean; costCenterId?: number } = {},
) {
  const [inv] = await db
    .insert(invoicesTable)
    .values({
      userId,
      supplierId,
      invoiceNumber: `T-${invoiceDate}-${Math.random().toString(36).slice(2, 7)}`,
      invoiceDate,
      totalAmount: String(items.reduce((s, it) => s + it.total, 0)),
      excluded: opts.excluded ?? false,
      costCenterId: opts.costCenterId ?? null,
    })
    .returning({ id: invoicesTable.id });
  await db.insert(invoiceItemsTable).values(
    items.map((it) => ({
      invoiceId: inv.id,
      productName: it.name,
      quantity: String(it.qty),
      unit: "kg",
      unitPrice: String(it.unitPrice),
      totalPrice: String(it.total),
      vatRate: it.vat != null ? String(it.vat) : null,
    })),
  );
  return inv.id;
}

// ─── /reports/spend-bridge — rozbicie różnicy na efekty ───────────────────────────
describe.skipIf(!RUN_DB)("/reports/spend-bridge — dekompozycja ceny/ilości/nowe/porzucone", () => {
  let server: Server;
  let baseUrl: string;
  const SB_R = "test_sb_R";
  const SB_OTHER = "test_sb_OTHER";

  type Bridge = {
    currentSpend: number; prevSpend: number; deltaSpend: number;
    priceEffect: number; volumeEffect: number; newEffect: number; droppedEffect: number; otherEffect: number;
  };

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [SB_R, SB_OTHER]));
    const [sup] = await db.insert(suppliersTable)
      .values({ userId: SB_R, name: "SB-SUP", taxId: "5551110000" })
      .returning({ id: suppliersTable.id });
    const [supO] = await db.insert(suppliersTable)
      .values({ userId: SB_OTHER, name: "SB-OTHER", taxId: "5551119999" })
      .returning({ id: suppliersTable.id });

    // Lipiec (bieżący) vs czerwiec (poprzedni), okres = pojedynczy miesiąc.
    // Mleko: dopasowany produkt → efekt ceny + ilości.
    //   czerwiec: qty 10, cena 5, koszt 50
    //   lipiec:   qty 12, cena 6, koszt 72  → priceEffect (6-5)*12=12, volumeEffect (12-10)*5=10
    // Ser: tylko lipiec → newEffect = 50
    // Szynka: tylko czerwiec → droppedEffect = -30
    await seedInvoice(SB_R, sup.id, "2026-06-15", [{ name: "Mleko", qty: 10, unitPrice: 5, total: 50 }]);
    await seedInvoice(SB_R, sup.id, "2026-06-16", [{ name: "Szynka", qty: 1, unitPrice: 30, total: 30 }]);
    await seedInvoice(SB_R, sup.id, "2026-07-10", [{ name: "Mleko", qty: 12, unitPrice: 6, total: 72 }]);
    await seedInvoice(SB_R, sup.id, "2026-07-20", [{ name: "Ser", qty: 2, unitPrice: 25, total: 50 }]);
    // Wykluczona faktura w lipcu — nie liczy się.
    await seedInvoice(SB_R, sup.id, "2026-07-05", [{ name: "Kawior", qty: 1, unitPrice: 999, total: 999 }], { excluded: true });
    // Inny tenant — nie może wyciec.
    await seedInvoice(SB_OTHER, supO.id, "2026-07-12", [{ name: "Trufle", qty: 1, unitPrice: 7777, total: 7777 }]);
  });

  afterAll(async () => {
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [SB_R, SB_OTHER]));
    server?.close();
  });

  async function bridge(query: string, asUser = SB_R): Promise<Bridge> {
    authState.userId = asUser;
    const res = await fetch(`${baseUrl}/api/reports/spend-bridge?${query}`);
    expect(res.status).toBe(200);
    return (await res.json()) as Bridge;
  }

  it("sumuje bieżący i poprzedni okres oraz rozbija różnicę na efekty", async () => {
    const b = await bridge("month=2026-07");
    expect(b.currentSpend).toBeCloseTo(122, 2); // 72 Mleko + 50 Ser (bez 999 excluded, bez 7777 innego usera)
    expect(b.prevSpend).toBeCloseTo(80, 2);     // 50 Mleko + 30 Szynka (czerwiec)
    expect(b.deltaSpend).toBeCloseTo(42, 2);
    expect(b.priceEffect).toBeCloseTo(12, 2);   // (6-5)*12
    expect(b.volumeEffect).toBeCloseTo(10, 2);  // (12-10)*5
    expect(b.newEffect).toBeCloseTo(50, 2);     // Ser
    expect(b.droppedEffect).toBeCloseTo(-30, 2); // Szynka
    // Model domyka się: różnica = suma efektów (rezyduum ~0).
    expect(b.otherEffect).toBeCloseTo(0, 2);
    expect(
      b.priceEffect + b.volumeEffect + b.newEffect + b.droppedEffect + b.otherEffect,
    ).toBeCloseTo(b.deltaSpend, 2);
  });

  it("izolacja tenantów: inny user liczy tylko swoje", async () => {
    const b = await bridge("month=2026-07", SB_OTHER);
    expect(b.currentSpend).toBeCloseTo(7777, 2);
    expect(b.prevSpend).toBeCloseTo(0, 2);
  });
});

// ─── /reports/products-by-cost-center.xlsx — SUMA brutto + porównanie ─────────────
describe.skipIf(!RUN_DB)("Excel: /reports/products-by-cost-center.xlsx", () => {
  let server: Server;
  let baseUrl: string;
  const XL_R = "test_xl_R";
  let ccId: number;

  beforeAll(async () => {
    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await db.delete(costCentersTable).where(inArray(costCentersTable.userId, [XL_R]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [XL_R]));

    const [cc] = await db.insert(costCentersTable)
      .values({ userId: XL_R, name: "Kuchnia", color: "#14B8A6" })
      .returning({ id: costCentersTable.id });
    ccId = cc.id;
    const [sup] = await db.insert(suppliersTable)
      .values({ userId: XL_R, name: "XL-SUP", taxId: "5552220000" })
      .returning({ id: suppliersTable.id });

    // Ceny brutto = netto × (1 + VAT). VAT 23% → gross = net × 1.23.
    //   lipiec:  net 50, vat 23 → brutto 61.5
    //   czerwiec net 40, vat 23 → brutto 49.2
    await seedInvoice(XL_R, sup.id, "2026-07-10", [{ name: "Mleko", qty: 10, unitPrice: 5, total: 50, vat: 23 }], { costCenterId: ccId });
    await seedInvoice(XL_R, sup.id, "2026-06-10", [{ name: "Mleko", qty: 10, unitPrice: 4, total: 40, vat: 23 }], { costCenterId: ccId });
    // Wykluczona faktura w lipcu — nie może zawyżyć SUMY.
    await seedInvoice(XL_R, sup.id, "2026-07-05", [{ name: "Mleko", qty: 100, unitPrice: 9, total: 900, vat: 23 }], { costCenterId: ccId, excluded: true });
  });

  afterAll(async () => {
    await db.delete(costCentersTable).where(inArray(costCentersTable.userId, [XL_R]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [XL_R]));
    server?.close();
  });

  async function loadWorkbook(query: string): Promise<ExcelJS.Worksheet> {
    authState.userId = XL_R;
    const res = await fetch(`${baseUrl}/api/reports/products-by-cost-center.xlsx?${query}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK"); // magic bytes ZIP/xlsx
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    return wb.worksheets[0];
  }

  // Znajduje wiersz „Suma — <grupa>" i zwraca [wartość brutto, poprz. okres] z kolumn.
  function sumaRow(ws: ExcelJS.Worksheet): { total: number; prev: number | null } {
    let found: { total: number; prev: number | null } | null = null;
    ws.eachRow((row) => {
      const label = row.getCell(1).value;
      if (typeof label === "string" && label.startsWith("Suma — ")) {
        // Tryb ogólny (bez costCenterId): value=kol.5, pricePrev=kol.6.
        const total = Number(row.getCell(5).value);
        const prevCell = row.getCell(6).value;
        found = { total, prev: prevCell == null ? null : Number(prevCell) };
      }
    });
    if (!found) throw new Error("Nie znaleziono wiersza SUMA");
    return found;
  }

  it("SUMA brutto sumuje okres (z VAT) i porównuje do poprzedniego okresu", async () => {
    const ws = await loadWorkbook("from=2026-07-01&to=2026-07-31");
    const { total, prev } = sumaRow(ws);
    expect(total).toBeCloseTo(61.5, 1);  // 50 × 1.23 (bez excluded 900)
    expect(prev).toBeCloseTo(49.2, 1);   // czerwiec 40 × 1.23
  });

  it("zakres własnych dni zawęża SUMĘ do dat w zakresie", async () => {
    // tylko 2026-07-10 wpada; poprzedni równy okres (dni) nie łapie czerwca 10 → brak porównania
    const ws = await loadWorkbook("from=2026-07-09&to=2026-07-11");
    const { total } = sumaRow(ws);
    expect(total).toBeCloseTo(61.5, 1);
  });
});
