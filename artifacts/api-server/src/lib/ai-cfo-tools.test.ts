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

  it("get_spend_summary: user A nie widzi wydatków/dostawców usera B w podsumowaniu", async () => {
    const raw = await executeToolCall("get_spend_summary", { date_from: "2026-01-01" }, USER_A);
    const parsed = JSON.parse(raw) as { suppliers: Array<{ supplier_name: string }> };
    const names = parsed.suppliers.map((s) => s.supplier_name);
    expect(names).toContain("Dostawca-A-tools");
    expect(names).not.toContain("Dostawca-B-tools");
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
