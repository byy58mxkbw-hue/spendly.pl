import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import {
  db,
  suppliersTable,
  productsTable,
  invoicesTable,
  invoiceItemsTable,
} from "@workspace/db";
import { executeToolCall } from "./ai-cfo-tools.js";

// Test bezpieczeństwa function-calling AI CFO (brief: przebudowa na tool use).
// Żadne narzędzie nie przyjmuje userId od modelu — zawsze wstrzykiwany z req.userId
// po stronie serwera. Ten test weryfikuje, że przekazanie ID NALEŻĄCEGO DO INNEGO
// USERA (tak jak model mógłby to zrobić, gdyby zgadywał/miał złe dane) nigdy nie
// zwraca danych tego innego usera — wzorowany na tenant-isolation.test.ts i
// benchmark-anonymity.test.ts, ale bije prosto w executeToolCall (bez HTTP).
//
// Wymaga bazy: uruchamia się tylko gdy TEST_DATABASE_URL ustawione (CI z serwisem postgres).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const USER_A = "test_ai_tools_A";
const USER_B = "test_ai_tools_B";

let supplierAId: number;
let supplierBId: number;
let productAId: number;
let productBId: number;
let invoiceAId: number;
let invoiceBId: number;
let invoiceA2Id: number;
let carrotAId: number;
let chickenAId: number;
let rozSupplierId: number;

async function cleanup(): Promise<void> {
  await db.delete(suppliersTable).where(inArray(suppliersTable.userId, [USER_A, USER_B]));
  // invoices/invoice_items/products kaskadowo po usunięciu dostawców/produktów nie
  // spadają automatycznie dla products (brak FK cascade z products) — czyścimy explicit.
  await db.delete(productsTable).where(inArray(productsTable.userId, [USER_A, USER_B]));
}

describe.skipIf(!RUN_DB)("izolacja tenantów: executeToolCall (AI CFO function calling)", () => {
  beforeAll(async () => {
    await cleanup();

    const [supA] = await db.insert(suppliersTable).values({ userId: USER_A, name: "Dostawca-A-tools", taxId: "1111111111" }).returning({ id: suppliersTable.id });
    const [supB] = await db.insert(suppliersTable).values({ userId: USER_B, name: "Dostawca-B-tools", taxId: "2222222222" }).returning({ id: suppliersTable.id });
    supplierAId = supA.id;
    supplierBId = supB.id;

    const [prodA] = await db.insert(productsTable).values({ userId: USER_A, name: "Cytryna-A-tools", unit: "kg" }).returning({ id: productsTable.id });
    const [prodB] = await db.insert(productsTable).values({ userId: USER_B, name: "Cytryna-B-tools", unit: "kg" }).returning({ id: productsTable.id });
    productAId = prodA.id;
    productBId = prodB.id;

    const [invA] = await db.insert(invoicesTable).values({
      userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/1", invoiceDate: "2026-09-01", totalAmount: "100",
    }).returning({ id: invoicesTable.id });
    const [invA2] = await db.insert(invoicesTable).values({
      userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/2", invoiceDate: "2026-09-10", totalAmount: "120",
    }).returning({ id: invoicesTable.id });
    const [invB] = await db.insert(invoicesTable).values({
      userId: USER_B, supplierId: supplierBId, invoiceNumber: "FV/B-TOOLS/1", invoiceDate: "2026-09-01", totalAmount: "999",
    }).returning({ id: invoicesTable.id });
    invoiceAId = invA.id;
    invoiceA2Id = invA2.id;
    invoiceBId = invB.id;

    await db.insert(invoiceItemsTable).values([
      { invoiceId: invoiceAId, productId: productAId, productName: "Cytryna-A-tools", quantity: "10", unit: "kg", unitPrice: "5", totalPrice: "50" },
      { invoiceId: invoiceA2Id, productId: productAId, productName: "Cytryna-A-tools", quantity: "10", unit: "kg", unitPrice: "6", totalPrice: "60" },
      { invoiceId: invoiceBId, productId: productBId, productName: "Cytryna-B-tools", quantity: "10", unit: "kg", unitPrice: "77", totalPrice: "770" },
    ]);

    // Osobny produkt + 4 faktury tylko dla testu get_quantity_anomalies (3 "normalne"
    // zakupy po 10 kg + 1 anomalia 50 kg jako najnowszy) — nie mieszamy z productAId,
    // żeby nie rozjechać asercji get_product_price_history (oczekuje dokładnie 2 wierszy).
    const [carrotA] = await db.insert(productsTable).values({ userId: USER_A, name: "Marchew-A-tools", unit: "kg" }).returning({ id: productsTable.id });
    carrotAId = carrotA.id;
    const carrotInvoices = await db.insert(invoicesTable).values([
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/3", invoiceDate: "2026-09-01", totalAmount: "50" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/4", invoiceDate: "2026-09-05", totalAmount: "50" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/5", invoiceDate: "2026-09-10", totalAmount: "50" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/6", invoiceDate: "2026-09-20", totalAmount: "250" },
    ]).returning({ id: invoicesTable.id });
    await db.insert(invoiceItemsTable).values(
      [10, 10, 10, 50].map((qty, i) => ({
        invoiceId: carrotInvoices[i].id, productId: carrotAId, productName: "Marchew-A-tools",
        quantity: String(qty), unit: "kg", unitPrice: "5", totalPrice: String(qty * 5),
      })),
    );

    // Osobny produkt dla get_price_anomalies: 3 zakupy kg po 5 zł (baseline) + 1
    // anomalia kg po 20 zł jako najnowszy, PLUS jeden zakup w SZT po 50 zł — ten
    // ostatni musi zostać zignorowany (za mało historii w swojej jednostce), a
    // NIE porównany z baseline z kg — dowód, że szt i kg nigdy się nie mieszają.
    const [chickenA] = await db.insert(productsTable).values({ userId: USER_A, name: "Kurczak-A-tools", unit: "kg" }).returning({ id: productsTable.id });
    chickenAId = chickenA.id;
    const chickenInvoices = await db.insert(invoicesTable).values([
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/7", invoiceDate: "2026-09-01", totalAmount: "50" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/8", invoiceDate: "2026-09-05", totalAmount: "50" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/9", invoiceDate: "2026-09-10", totalAmount: "50" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/10", invoiceDate: "2026-09-15", totalAmount: "200" },
      { userId: USER_A, supplierId: supplierAId, invoiceNumber: "FV/A-TOOLS/11", invoiceDate: "2026-09-20", totalAmount: "50" },
    ]).returning({ id: invoicesTable.id });
    await db.insert(invoiceItemsTable).values([
      { invoiceId: chickenInvoices[0].id, productId: chickenAId, productName: "Kurczak-A-tools", quantity: "10", unit: "kg", unitPrice: "5", totalPrice: "50" },
      { invoiceId: chickenInvoices[1].id, productId: chickenAId, productName: "Kurczak-A-tools", quantity: "10", unit: "kg", unitPrice: "5", totalPrice: "50" },
      { invoiceId: chickenInvoices[2].id, productId: chickenAId, productName: "Kurczak-A-tools", quantity: "10", unit: "kg", unitPrice: "5", totalPrice: "50" },
      { invoiceId: chickenInvoices[3].id, productId: chickenAId, productName: "Kurczak-A-tools", quantity: "10", unit: "kg", unitPrice: "20", totalPrice: "200" },
      { invoiceId: chickenInvoices[4].id, productId: chickenAId, productName: "Kurczak-A-tools", quantity: "1", unit: "szt", unitPrice: "50", totalPrice: "50" },
    ]);

    // Osobny dostawca + faktura ROZLICZENIOWA (ROZ) — dowód na fix "100 tysięcy za
    // drzewo": dodatnie wiersze drewna (500) w pełni zbilansowane ujemną "Zaliczka"
    // (-500), Razem faktury = 0. get_spend_summary MUSI wykluczyć tę fakturę z sumy
    // wydatków (realny raport użytkownika 2026-09-26 — inaczej zawyża kategorię).
    const [rozSupplier] = await db.insert(suppliersTable).values({ userId: USER_A, name: "Nadlesnictwo-A-tools", taxId: "3333333333" }).returning({ id: suppliersTable.id });
    rozSupplierId = rozSupplier.id;
    const [rozInvoice] = await db.insert(invoicesTable).values({
      userId: USER_A, supplierId: rozSupplierId, invoiceNumber: "FV/A-TOOLS/ROZ-1",
      invoiceDate: "2026-09-12", totalAmount: "0", invoiceType: "ROZ",
    }).returning({ id: invoicesTable.id });
    await db.insert(invoiceItemsTable).values([
      { invoiceId: rozInvoice.id, productId: null, productName: "drewno sosnowe WC0-A-tools", quantity: "10", unit: "M3", unitPrice: "50", totalPrice: "500" },
      { invoiceId: rozInvoice.id, productId: null, productName: "Zaliczka 23% VAT", quantity: "-1", unit: "szt", unitPrice: "500", totalPrice: "-500" },
    ]);
  });

  afterAll(cleanup);

  it("search_products: user A nie widzi produktu usera B", async () => {
    const raw = await executeToolCall("search_products", { query: "Cytryna" }, USER_A);
    const parsed = JSON.parse(raw) as { products: Array<{ name: string }> };
    const names = parsed.products.map((p) => p.name);
    expect(names).toContain("Cytryna-A-tools");
    expect(names).not.toContain("Cytryna-B-tools");
  });

  it("search_suppliers: user A nie widzi dostawcy usera B", async () => {
    const raw = await executeToolCall("search_suppliers", { query: "Dostawca" }, USER_A);
    const parsed = JSON.parse(raw) as { suppliers: Array<{ name: string }> };
    const names = parsed.suppliers.map((s) => s.name);
    expect(names).toContain("Dostawca-A-tools");
    expect(names).not.toContain("Dostawca-B-tools");
  });

  it("search_suppliers: znajduje dostawcę po NIP, nie po cudzym NIP-ie", async () => {
    const raw = await executeToolCall("search_suppliers", { query: "1111111111" }, USER_A);
    const parsed = JSON.parse(raw) as { suppliers: Array<{ name: string }> };
    expect(parsed.suppliers.map((s) => s.name)).toContain("Dostawca-A-tools");

    const rawWrongUser = await executeToolCall("search_suppliers", { query: "2222222222" }, USER_A);
    const parsedWrongUser = JSON.parse(rawWrongUser) as { suppliers: unknown[] };
    expect(parsedWrongUser.suppliers).toEqual([]);
  });

  it("search_invoices: supplier_id usera B pod userId usera A -> pusto, nigdy dane usera B", async () => {
    const raw = await executeToolCall("search_invoices", { supplier_id: supplierBId }, USER_A);
    const parsed = JSON.parse(raw) as { invoices: unknown[] };
    expect(parsed.invoices).toEqual([]);
  });

  it("search_invoices: supplier_id usera A -> widzi swoje faktury", async () => {
    const raw = await executeToolCall("search_invoices", { supplier_id: supplierAId }, USER_A);
    const parsed = JSON.parse(raw) as { invoices: Array<{ invoice_number: string }> };
    expect(parsed.invoices.map((i) => i.invoice_number)).toContain("FV/A-TOOLS/1");
  });

  it("get_products_by_supplier: supplier_ids usera B pod userId usera A -> pusto, nigdy dane usera B", async () => {
    const raw = await executeToolCall("get_products_by_supplier", { supplier_ids: [supplierBId] }, USER_A);
    const parsed = JSON.parse(raw) as { products: unknown[] };
    expect(parsed.products).toEqual([]);
  });

  it("get_products_by_supplier: supplier_ids usera A -> widzi swoje produkty z zakresem cen", async () => {
    const raw = await executeToolCall("get_products_by_supplier", { supplier_ids: [supplierAId] }, USER_A);
    const parsed = JSON.parse(raw) as { products: Array<{ product_name: string; min_price: string; max_price: string }> };
    const row = parsed.products.find((p) => p.product_name === "Cytryna-A-tools");
    expect(row).toBeTruthy();
    expect(row?.min_price).toBe("5.00");
    expect(row?.max_price).toBe("6.00");
  });

  it("get_products_by_supplier: mieszane ID (własny + cudzy) -> tylko własne produkty", async () => {
    const raw = await executeToolCall("get_products_by_supplier", { supplier_ids: [supplierAId, supplierBId] }, USER_A);
    const parsed = JSON.parse(raw) as { products: Array<{ product_name: string }> };
    const names = parsed.products.map((p) => p.product_name);
    expect(names).toContain("Cytryna-A-tools");
    expect(names).not.toContain("Cytryna-B-tools");
  });

  it("get_product_price_history: product_id usera B pod userId usera A -> nie znaleziono, ZERO danych usera B", async () => {
    const raw = await executeToolCall("get_product_price_history", { product_id: productBId }, USER_A);
    const parsed = JSON.parse(raw) as { error?: string; history?: unknown[] };
    expect(parsed.error).toBeTruthy();
    expect(parsed.history).toBeUndefined();
  });

  it("get_product_price_history: product_id usera A pod userId usera A -> widzi swoją historię", async () => {
    const raw = await executeToolCall("get_product_price_history", { product_id: productAId }, USER_A);
    const parsed = JSON.parse(raw) as { history: Array<{ unit_price: string }> };
    expect(parsed.history.length).toBe(2);
  });

  it("get_cheapest_supplier_for_product: product_id usera B pod userId usera A -> nie znaleziono", async () => {
    const raw = await executeToolCall("get_cheapest_supplier_for_product", { product_id: productBId }, USER_A);
    const parsed = JSON.parse(raw) as { error?: string; suppliers?: unknown[] };
    expect(parsed.error).toBeTruthy();
    expect(parsed.suppliers).toBeUndefined();
  });

  it("search_invoices: user A po numerze faktury usera B -> pusto, nigdy dane usera B", async () => {
    const raw = await executeToolCall("search_invoices", { invoice_number: "B-TOOLS" }, USER_A);
    const parsed = JSON.parse(raw) as { invoices: unknown[] };
    expect(parsed.invoices).toEqual([]);
  });

  it("search_invoices: user A widzi własne faktury po nazwie dostawcy", async () => {
    const raw = await executeToolCall("search_invoices", { supplier_name: "Dostawca-A" }, USER_A);
    const parsed = JSON.parse(raw) as { invoices: Array<{ invoice_number: string }> };
    expect(parsed.invoices.map((i) => i.invoice_number)).toContain("FV/A-TOOLS/1");
  });

  it("get_invoice_detail: invoice_id usera B pod userId usera A -> nie znaleziono", async () => {
    const raw = await executeToolCall("get_invoice_detail", { invoice_id: invoiceBId }, USER_A);
    const parsed = JSON.parse(raw) as { error?: string; invoice?: unknown };
    expect(parsed.error).toBeTruthy();
    expect(parsed.invoice).toBeUndefined();
  });

  it("compare_invoices: jedna faktura usera A + jedna usera B, pod userId usera A -> błąd, brak danych usera B", async () => {
    const raw = await executeToolCall("compare_invoices", { invoice_id_a: invoiceAId, invoice_id_b: invoiceBId }, USER_A);
    const parsed = JSON.parse(raw) as { error?: string; invoiceA?: unknown; invoiceB?: unknown };
    expect(parsed.error).toBeTruthy();
    expect(parsed.invoiceA).toBeUndefined();
    expect(parsed.invoiceB).toBeUndefined();
  });

  it("compare_invoices: dwie faktury usera A -> działa, zwraca obie", async () => {
    const raw = await executeToolCall("compare_invoices", { invoice_id_a: invoiceAId, invoice_id_b: invoiceA2Id }, USER_A);
    const parsed = JSON.parse(raw) as { invoiceA: { invoice_number: string }; invoiceB: { invoice_number: string } };
    expect(parsed.invoiceA.invoice_number).toBe("FV/A-TOOLS/1");
    expect(parsed.invoiceB.invoice_number).toBe("FV/A-TOOLS/2");
  });

  it("get_quantity_anomalies: wykrywa skok ilości vs własna historia produktu", async () => {
    const raw = await executeToolCall("get_quantity_anomalies", {}, USER_A);
    const parsed = JSON.parse(raw) as { anomalies: Array<{ product_name: string; latest_qty: string; avg_qty: string }> };
    const row = parsed.anomalies.find((a) => a.product_name === "Marchew-A-tools");
    expect(row).toBeTruthy();
    // latest_qty nie jest ROUND-owane w SQL, więc numeric(12,4) może wrócić jako
    // "50.0000" — parsujemy liczbę, nie porównujemy dokładnego stringa.
    expect(Number(row?.latest_qty)).toBe(50);
    expect(row?.avg_qty).toBe("10.00");
  });

  it("get_quantity_anomalies: user B nie widzi anomalii produktu usera A", async () => {
    const raw = await executeToolCall("get_quantity_anomalies", {}, USER_B);
    const parsed = JSON.parse(raw) as { anomalies: Array<{ product_name: string }> };
    expect(parsed.anomalies.map((a) => a.product_name)).not.toContain("Marchew-A-tools");
  });

  it("get_price_anomalies: wykrywa skok ceny jednostkowej vs własna historia w TEJ SAMEJ jednostce", async () => {
    const raw = await executeToolCall("get_price_anomalies", {}, USER_A);
    const parsed = JSON.parse(raw) as { anomalies: Array<{ product_name: string; unit: string; latest_price: string; avg_price: string }> };
    const row = parsed.anomalies.find((a) => a.product_name === "Kurczak-A-tools");
    expect(row).toBeTruthy();
    expect(row?.unit).toBe("kg");
    expect(Number(row?.latest_price)).toBe(20);
    expect(row?.avg_price).toBe("5.00");
  });

  it("get_price_anomalies: zakup w innej jednostce (szt) NIGDY nie jest porównywany z historią w kg", async () => {
    const raw = await executeToolCall("get_price_anomalies", {}, USER_A);
    const parsed = JSON.parse(raw) as { anomalies: Array<{ product_name: string; unit: string }> };
    // Tylko JEDEN wiersz dla Kurczak-A-tools (kg) — szt nie ma własnej historii (1 zakup < 3),
    // więc nie może zostać porównany z baseline z kg, mimo że to "ten sam" produkt.
    const chickenRows = parsed.anomalies.filter((a) => a.product_name === "Kurczak-A-tools");
    expect(chickenRows).toHaveLength(1);
    expect(chickenRows[0].unit).toBe("kg");
  });

  it("get_price_anomalies: user B nie widzi anomalii produktu usera A", async () => {
    const raw = await executeToolCall("get_price_anomalies", {}, USER_B);
    const parsed = JSON.parse(raw) as { anomalies: Array<{ product_name: string }> };
    expect(parsed.anomalies.map((a) => a.product_name)).not.toContain("Kurczak-A-tools");
  });

  it("get_spend_summary: user A nie widzi wydatków/dostawców usera B w podsumowaniu", async () => {
    const raw = await executeToolCall("get_spend_summary", { date_from: "2026-01-01" }, USER_A);
    const parsed = JSON.parse(raw) as { suppliers: Array<{ supplier_name: string }> };
    const names = parsed.suppliers.map((s) => s.supplier_name);
    expect(names).toContain("Dostawca-A-tools");
    expect(names).not.toContain("Dostawca-B-tools");
  });

  it("get_spend_summary: faktura ROZ nie zawyża wydatków dostawcy ani kategorii (fix 'zawyżone wydatki za drzewo')", async () => {
    const raw = await executeToolCall("get_spend_summary", { date_from: "2026-01-01" }, USER_A);
    const parsed = JSON.parse(raw) as {
      suppliers: Array<{ supplier_name: string; total_spend: string }>;
      categories: Array<{ category: string; total_spend: string }>;
    };
    // Dostawca ROZ ma TYLKO tę jedną fakturę (500 - 500 = 0) — po wykluczeniu ROZ
    // z sumy wydatków nie powinien w ogóle pojawić się w top-8 dostawcach (total_spend
    // by był 0/pominięty), na pewno NIE z wartością 500 (co pokazywałby bug sprzed fixu).
    const rozRow = parsed.suppliers.find((s) => s.supplier_name === "Nadlesnictwo-A-tools");
    expect(rozRow).toBeUndefined();
  });

  it("nieznane narzędzie -> błąd, nie wywala procesu", async () => {
    const raw = await executeToolCall("delete_everything", {}, USER_A);
    const parsed = JSON.parse(raw) as { error: string };
    expect(parsed.error).toContain("Nieznane narzędzie");
  });

  it("brak wymaganego argumentu -> czytelny błąd walidacji, nie wyjątek", async () => {
    const raw = await executeToolCall("get_product_price_history", {}, USER_A);
    const parsed = JSON.parse(raw) as { error: string };
    expect(parsed.error).toContain("product_id");
  });
});
