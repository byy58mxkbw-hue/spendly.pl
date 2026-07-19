import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, suppliersTable, productsTable, invoicesTable, invoiceItemsTable } from "@workspace/db";
import type { ParsedFa3 } from "@workspace/ksef-client";
import { tryMatch, importMatchedInvoice } from "./ksef-ingest";

// Testy pipeline'u ingestii KSeF (wydzielonego z routes/ksef.ts) — bez sieci:
// tryMatch (dopasowanie dostawcy po NIP + produktów po nazwie, izolacja tenantów)
// oraz importMatchedInvoice (insert faktury+pozycji, tworzenie brakujących produktów, dedup).
// DB-gated: tylko z TEST_DATABASE_URL (CI).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

// ksef-ingest nie dotyka Clerka, ale ../app (importowane pośrednio przez inne testy)
// tego wymaga; tu importujemy tylko serwis, więc mock nie jest konieczny.

const ING_R = "test_ing_R";
const ING_OTHER = "test_ing_OTHER";

function makeParsed(over: Partial<ParsedFa3["header"]> = {}, items: ParsedFa3["items"] = []): ParsedFa3 {
  return {
    header: {
      ksefNumber: null,
      sellerNip: "1234567890",
      sellerName: "Dostawca ING",
      buyerNip: null,
      invoiceNumber: "FV/ING/1",
      invoiceDate: "2026-07-10",
      totalNet: null,
      totalGross: null,
      invoiceType: null,
      paymentMethod: null,
      paymentDueDate: null,
      ...over,
    },
    items,
  };
}

const item = (name: string, over: Partial<ParsedFa3["items"][number]> = {}): ParsedFa3["items"][number] => ({
  name,
  gtin: null,
  quantity: 10,
  unit: "kg",
  unitPrice: 5,
  net: 50,
  vatRate: 23,
  gross: 61.5,
  ...over,
});

describe.skipIf(!RUN_DB)("ksef-ingest: tryMatch", () => {
  let supRId: number;
  let mlekoId: number;

  beforeAll(async () => {
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [ING_R, ING_OTHER]));
    await db.delete(productsTable).where(inArray(productsTable.userId, [ING_R, ING_OTHER]));

    // Dostawca R z NIP zapisanym z myślnikami — dopasowanie musi ignorować formatowanie.
    const [sup] = await db.insert(suppliersTable)
      .values({ userId: ING_R, name: "SUP-ING-R", taxId: "123-456-78-90" })
      .returning({ id: suppliersTable.id });
    supRId = sup.id;
    // Ten sam NIP u innego usera — NIE może dopasować się dla R poza jego tenantem.
    await db.insert(suppliersTable)
      .values({ userId: ING_OTHER, name: "SUP-ING-OTHER", taxId: "1234567890" });

    const [mleko] = await db.insert(productsTable)
      .values({ userId: ING_R, name: "Mleko 3.2%", unit: "l" })
      .returning({ id: productsTable.id });
    mlekoId = mleko.id;
  });

  afterAll(async () => {
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [ING_R, ING_OTHER]));
    await db.delete(productsTable).where(inArray(productsTable.userId, [ING_R, ING_OTHER]));
  });

  it("dopasowuje dostawcę po NIP (ignorując myślniki) i produkty po nazwie", async () => {
    const parsed = makeParsed({ sellerNip: "1234567890" }, [item("Mleko 3.2%"), item("Nieznany X")]);
    const m = await tryMatch(ING_R, parsed);
    expect(m.supplier?.id).toBe(supRId);
    expect(m.itemProductIds[0]).toBe(mlekoId);
    expect(m.itemProductIds[1]).toBeNull();
    expect(m.missingProducts).toEqual(["Nieznany X"]);
  });

  it("dopasowanie nazwy produktu ignoruje wielkość liter i wielokrotne WEWNĘTRZNE spacje", async () => {
    // SQL kolapsuje wewnętrzne '\s+' i porównuje po LOWER — ale NIE przycina
    // wiodących/końcowych spacji, więc testujemy dokładnie to, co kod robi.
    const parsed = makeParsed({}, [item("MLEKO   3.2%")]);
    const m = await tryMatch(ING_R, parsed);
    expect(m.itemProductIds[0]).toBe(mlekoId);
    expect(m.missingProducts).toEqual([]);
  });

  it("nieznany NIP → brak dostawcy", async () => {
    const parsed = makeParsed({ sellerNip: "0000000000" }, [item("Mleko 3.2%")]);
    const m = await tryMatch(ING_R, parsed);
    expect(m.supplier).toBeNull();
  });

  it("izolacja tenantów: dostawca innego usera nie jest dopasowany", async () => {
    // NIP istnieje tylko u ING_OTHER (dla tego NIP) — ale R ma własnego z tym samym NIP,
    // więc sprawdzamy odwrotnie: user bez żadnego dostawcy nie dostaje cudzego.
    const parsed = makeParsed({ sellerNip: "1234567890" }, []);
    const m = await tryMatch("test_ing_NOONE", parsed);
    expect(m.supplier).toBeNull();
  });
});

describe.skipIf(!RUN_DB)("ksef-ingest: importMatchedInvoice", () => {
  let supRId: number;

  beforeAll(async () => {
    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, [ING_R]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [ING_R]));
    await db.delete(productsTable).where(inArray(productsTable.userId, [ING_R]));

    // taxId zgodny z domyślnym sellerNip w makeParsed, żeby tryMatch dopasował dostawcę.
    const [sup] = await db.insert(suppliersTable)
      .values({ userId: ING_R, name: "SUP-ING-IMP", taxId: "1234567890", defaultCostCenterId: null })
      .returning({ id: suppliersTable.id });
    supRId = sup.id;
    // Jeden produkt istnieje, drugi zostanie utworzony w locie.
    await db.insert(productsTable).values({ userId: ING_R, name: "Masło", unit: "kg" });
  });

  afterAll(async () => {
    await db.delete(invoicesTable).where(inArray(invoicesTable.userId, [ING_R]));
    await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [ING_R]));
    await db.delete(productsTable).where(inArray(productsTable.userId, [ING_R]));
  });

  async function invCount(): Promise<number> {
    const rows = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.userId, ING_R));
    return rows.length;
  }

  it("tworzy fakturę + pozycje i dorabia brakujący produkt (zwraca true)", async () => {
    const parsed = makeParsed({ invoiceNumber: "FV/IMP-MATCH/1", totalGross: 123 }, [
      item("Masło", { name: "Masło" }),
      item("Śmietana nowa", { name: "Śmietana nowa" }),
    ]);
    const match = await tryMatch(ING_R, parsed);
    expect(match.supplier?.id).toBe(supRId);

    const created = await importMatchedInvoice(ING_R, parsed, "<xml/>", "KSEF-IMP-1", match, new Date());
    expect(created).toBe(true);
    expect(await invCount()).toBe(1);

    const [inv] = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.userId, ING_R), eq(invoicesTable.invoiceNumber, "FV/IMP-MATCH/1")));
    expect(inv.ksefNumber).toBe("KSEF-IMP-1");
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));
    expect(items).toHaveLength(2);
    // Brakujący produkt „Śmietana nowa" powstał u usera.
    const smietana = await db.select({ id: productsTable.id }).from(productsTable)
      .where(and(eq(productsTable.userId, ING_R), eq(productsTable.name, "Śmietana nowa")));
    expect(smietana).toHaveLength(1);
  });

  it("dedup: ponowny import tego samego numeru aktualizuje, nie tworzy duplikatu (zwraca false)", async () => {
    const parsed = makeParsed({ invoiceNumber: "FV/IMP-MATCH/1", totalGross: 123 }, [item("Masło", { name: "Masło" })]);
    const match = await tryMatch(ING_R, parsed);
    const created = await importMatchedInvoice(ING_R, parsed, "<xml2/>", "KSEF-IMP-2", match, new Date());
    expect(created).toBe(false);
    expect(await invCount()).toBe(1); // nadal jedna

    // ksefNumber zaktualizowany na nowy.
    const [inv] = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.userId, ING_R), eq(invoicesTable.invoiceNumber, "FV/IMP-MATCH/1")));
    expect(inv.ksefNumber).toBe("KSEF-IMP-2");
  });

  it("płatność gotówką → faktura oznaczona jako opłacona", async () => {
    const parsed = makeParsed({ invoiceNumber: "FV/IMP-CASH/1", paymentMethod: "gotowka" }, [item("Masło", { name: "Masło" })]);
    const match = await tryMatch(ING_R, parsed);
    const created = await importMatchedInvoice(ING_R, parsed, "<xml/>", "KSEF-IMP-CASH", match, new Date());
    expect(created).toBe(true);
    const [inv] = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.userId, ING_R), eq(invoicesTable.invoiceNumber, "FV/IMP-CASH/1")));
    expect(inv.isPaid).toBe(true);
    expect(inv.paidAt).not.toBeNull();
  });
});
