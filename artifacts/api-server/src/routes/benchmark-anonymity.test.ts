import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Logger } from "pino";
import { inArray, eq } from "drizzle-orm";
import {
  db,
  suppliersTable,
  productsTable,
  invoicesTable,
  invoiceItemsTable,
  userSettingsTable,
  marketProductAliasesTable,
  marketPriceBenchmarksTable,
} from "@workspace/db";

// Test anonimowości benchmarku rynkowego — rozszerza wzorzec z tenant-isolation.test.ts.
// Uderza w PRAWDZIWY route GET /api/benchmarks (nie w SQL joba w izolacji), żeby złapać
// regresję, gdyby ktoś pominął filtr is_published albo zwrócił userId/supplierId.
//
// Wymaga bazy: uruchamia się tylko gdy TEST_DATABASE_URL ustawione (CI z serwisem postgres).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const authState = vi.hoisted(() => ({ userId: "anon_user_1" }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: authState.userId, sessionClaims: { publicMetadata: {} } }),
  clerkClient: { users: { getUser: async () => ({ emailAddresses: [], primaryEmailAddressId: null }) } },
}));

const log = { info: () => {}, error: () => {}, warn: () => {} } as unknown as Logger;
const today = new Date().toISOString().slice(0, 10);

const BELOW_USERS = ["anon_below_a", "anon_below_b", "anon_below_c"]; // 3 < MIN_USERS(5)
const OK_USERS = ["anon_ok_a", "anon_ok_b", "anon_ok_c", "anon_ok_d", "anon_ok_e", "anon_ok_f", "anon_ok_g", "anon_ok_h"]; // 8 >= 5, sampleRows=8 >= 8
const ALL_USERS = [...BELOW_USERS, ...OK_USERS];

let createdSupplierIds: number[] = [];
let createdProductIds: number[] = [];
let createdInvoiceIds: number[] = [];

async function seedPurchase(userId: string, canonicalName: string, unit: string, category: string, unitPrice: number): Promise<void> {
  const [supplier] = await db
    .insert(suppliersTable)
    .values({ userId, name: `Dostawca anon (${userId})` })
    .returning({ id: suppliersTable.id });
  createdSupplierIds.push(supplier!.id);

  const [product] = await db
    .insert(productsTable)
    .values({ userId, name: canonicalName, unit, category, canonicalName })
    .returning({ id: productsTable.id });
  createdProductIds.push(product!.id);

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      userId,
      supplierId: supplier!.id,
      invoiceNumber: `ANON-${userId}`,
      invoiceDate: today,
      totalAmount: unitPrice.toFixed(2),
      excluded: false,
    })
    .returning({ id: invoicesTable.id });
  createdInvoiceIds.push(invoice!.id);

  await db.insert(invoiceItemsTable).values({
    invoiceId: invoice!.id,
    productId: product!.id,
    productName: canonicalName,
    quantity: "10",
    unit,
    unitPrice: unitPrice.toFixed(4),
    totalPrice: (unitPrice * 10).toFixed(2),
  });
}

describe.skipIf(!RUN_DB)("anonimowość benchmarku rynkowego: GET /api/benchmarks", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { ensureMarketBenchmarkExtensions } = await import("../services/ensure-market-benchmark");
    await ensureMarketBenchmarkExtensions(log);

    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    for (const u of BELOW_USERS) {
      await seedPurchase(u, "pomidor anon test", "kg", "warzywa", 10);
    }
    for (const u of OK_USERS) {
      await seedPurchase(u, "karkowka anon test", "kg", "mieso", 25);
    }

    const { runMarketBenchmarkJob } = await import("../services/market-benchmark-job");
    await runMarketBenchmarkJob(log);
  });

  afterAll(async () => {
    await db.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, createdInvoiceIds));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, createdInvoiceIds));
    await db.delete(productsTable).where(inArray(productsTable.id, createdProductIds));
    await db.delete(suppliersTable).where(inArray(suppliersTable.id, createdSupplierIds));
    await db.delete(userSettingsTable).where(inArray(userSettingsTable.userId, ALL_USERS));
    await db.delete(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "pomidor anon test"));
    await db.delete(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "karkowka anon test"));
    server?.close();
  });

  async function getBenchmarks(): Promise<{ status: number; body: unknown; raw: string }> {
    const res = await fetch(`${baseUrl}/api/benchmarks`);
    const raw = await res.text();
    return { status: res.status, body: JSON.parse(raw), raw };
  }

  it("poniżej progu k-anonimowości (3 userów < 5): zwraca insufficientData, żadnej liczby ceny rynkowej", async () => {
    authState.userId = BELOW_USERS[0]!;
    const { body } = await getBenchmarks();
    const items = (body as { items: Array<Record<string, unknown>> }).items;
    const row = items.find((i) => i.productName === "pomidor anon test");
    expect(row).toBeDefined();
    expect(row!.insufficientData).toBe(true);
    expect(row).not.toHaveProperty("medianPrice");
  });

  it("powyżej progu (8 userów): zwraca medianę, ale odpowiedź NIE zawiera surowych userId/nazw dostawców z seeda", async () => {
    authState.userId = OK_USERS[0]!;
    const { body, raw } = await getBenchmarks();
    const items = (body as { items: Array<Record<string, unknown>> }).items;
    const row = items.find((i) => i.productName === "karkowka anon test");
    expect(row).toBeDefined();
    expect(row!.insufficientData).toBe(false);
    expect(typeof row!.medianPrice).toBe("number");

    // Żadny userId/nazwa dostawcy użyty w seedzie nie może wyciekać w surowym JSON-ie odpowiedzi.
    for (const u of OK_USERS) {
      expect(raw).not.toContain(u);
      expect(raw).not.toContain(`Dostawca anon (${u})`);
    }
  });

  it("opt-out (benchmark_opt_in=false) działa w obie strony: user nie widzi benchmarku i nie zasila go dla innych", async () => {
    const optedOutUser = OK_USERS[0]!;

    // (a) opt-out user nie widzi benchmarku wcale.
    await db.insert(userSettingsTable).values({ userId: optedOutUser, benchmarkOptIn: false });
    authState.userId = optedOutUser;
    const { body: ownView } = await getBenchmarks();
    expect((ownView as { optedIn: boolean }).optedIn).toBe(false);
    expect((ownView as { items: unknown[] }).items).toHaveLength(0);

    // (b) po przeliczeniu joba jego dane przestają zasilać grupę dla innych —
    // sampleRowCount spada z 8 do 7, czyli PONIŻEJ MIN_ROWS(8) -> reszta userów
    // też przestaje widzieć medianę (regresja anonimowości byłaby odwrotna: gdyby
    // opt-out NIE działał, próg zostałby spełniony mimo wykluczenia usera).
    const { runMarketBenchmarkJob } = await import("../services/market-benchmark-job");
    await runMarketBenchmarkJob(log);

    authState.userId = OK_USERS[1]!;
    const { body: othersView } = await getBenchmarks();
    const items = (othersView as { items: Array<Record<string, unknown>> }).items;
    const row = items.find((i) => i.productName === "karkowka anon test");
    expect(row).toBeDefined();
    expect(row!.insufficientData).toBe(true);
  });
});
