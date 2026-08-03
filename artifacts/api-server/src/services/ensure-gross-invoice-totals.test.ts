import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { db, suppliersTable, invoicesTable, invoiceItemsTable } from "@workspace/db";
import { ensureGrossInvoiceTotals } from "./ensure-gross-invoice-totals";

// Migracja wsteczna total_amount → BRUTTO. Kluczowe jest nie tylko to, CO naprawia,
// ale też czego NIE RUSZA (faktury z KSeF, gdzie nagłówek jest źródłem prawdy).
// Wymaga bazy: uruchamia się tylko gdy TEST_DATABASE_URL ustawione (CI). Lokalnie → pominięte.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const USER = "test_gross_totals";
const log = { info: () => {}, error: () => {}, warn: () => {} } as unknown as Logger;

// Wstawia fakturę z jedną pozycją: netto 100 przy zadanej stawce VAT.
async function makeInvoice(
  supplierId: number,
  number: string,
  totalAmount: string,
  net: number,
  vatRate: string | null,
): Promise<number> {
  const [inv] = await db
    .insert(invoicesTable)
    .values({
      userId: USER,
      supplierId,
      invoiceNumber: number,
      invoiceDate: "2026-07-15",
      totalAmount,
      excluded: false,
    })
    .returning({ id: invoicesTable.id });
  await db.insert(invoiceItemsTable).values({
    invoiceId: inv!.id,
    productName: `Produkt ${number}`,
    quantity: "1",
    unit: "szt",
    unitPrice: String(net),
    totalPrice: String(net),
    vatRate,
  });
  return inv!.id;
}

const totalOf = async (id: number): Promise<number> => {
  const [row] = await db
    .select({ total: invoicesTable.totalAmount })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, id));
  return Number(row!.total);
};

describe.skipIf(!RUN_DB)("ensureGrossInvoiceTotals", () => {
  let supplierId: number;
  let zapisanaNetto: number;
  let juzBrutto: number;
  let ksefZRabatem: number;
  let bezVat: number;

  beforeAll(async () => {
    const [s] = await db
      .insert(suppliersTable)
      .values({ userId: USER, name: "Dostawca testowy (gross totals)" })
      .returning({ id: suppliersTable.id });
    supplierId = s!.id;

    // Do naprawy: nagłówek = suma NETTO pozycji (import ręczny / po usunięciu pozycji).
    zapisanaNetto = await makeInvoice(supplierId, "GT-NETTO", "100.00", 100, "8");
    // Poprawna: nagłówek już brutto — migracja ma ją zostawić w spokoju.
    juzBrutto = await makeInvoice(supplierId, "GT-BRUTTO", "108.00", 100, "8");
    // KSeF z rabatem: nagłówek świadomie różny od sumy pozycji — źródło prawdy, nie ruszamy.
    ksefZRabatem = await makeInvoice(supplierId, "GT-RABAT", "105.00", 100, "8");
    // Pozycje bez VAT: brutto == netto, nie ma czego naprawiać.
    bezVat = await makeInvoice(supplierId, "GT-VAT0", "50.00", 50, "0");
  });

  afterAll(async () => {
    const ids = [zapisanaNetto, juzBrutto, ksefZRabatem, bezVat];
    await db.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, ids));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, ids));
    await db.delete(suppliersTable).where(eq(suppliersTable.id, supplierId));
  });

  it("przelicza na brutto fakturę zapisaną jako netto", async () => {
    await ensureGrossInvoiceTotals(log);
    expect(await totalOf(zapisanaNetto)).toBeCloseTo(108, 2);
  });

  it("nie rusza faktur już zapisanych brutto ani nagłówków z KSeF", async () => {
    await ensureGrossInvoiceTotals(log);
    expect(await totalOf(juzBrutto)).toBeCloseTo(108, 2);
    expect(await totalOf(ksefZRabatem)).toBeCloseTo(105, 2);
    expect(await totalOf(bezVat)).toBeCloseTo(50, 2);
  });

  it("jest idempotentna — drugie uruchomienie nic nie zmienia", async () => {
    await ensureGrossInvoiceTotals(log);
    const po1 = await totalOf(zapisanaNetto);
    await ensureGrossInvoiceTotals(log);
    expect(await totalOf(zapisanaNetto)).toBeCloseTo(po1, 2);
    expect(po1).toBeCloseTo(108, 2);
  });
});
