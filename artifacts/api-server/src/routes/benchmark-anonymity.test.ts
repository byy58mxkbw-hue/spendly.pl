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

async function seedPurchase(
  userId: string,
  canonicalName: string,
  unit: string,
  category: string,
  unitPrice: number,
  opts: { invoiceDate?: string; invoiceType?: string; invoiceNumber?: string; source?: "ksef_sync" | "manual" | "viewer" } = {},
): Promise<number> {
  const [supplier] = await db
    .insert(suppliersTable)
    .values({ userId, name: `Dostawca anon (${userId})`, taxId: "0000000000" })
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
      invoiceNumber: opts.invoiceNumber ?? `ANON-${userId}`,
      invoiceDate: opts.invoiceDate ?? today,
      totalAmount: unitPrice.toFixed(2),
      excluded: false,
      // Domyślnie jak z KSeF — tylko takie konta liczą się do progu k (job benchmarku).
      source: opts.source ?? "ksef_sync",
      ...(opts.invoiceType ? { invoiceType: opts.invoiceType } : {}),
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
  return invoice!.id;
}

describe.skipIf(!RUN_DB)("anonimowość benchmarku rynkowego: GET /api/benchmarks", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Ustalone na sztywno, niezależnie od DEFAULT_MIN_USERS/DEFAULT_MIN_ROWS w kodzie
    // (te bywają tymczasowo obniżone przy małej bazie userów — patrz market-benchmark-job.ts) —
    // test sprawdza próg 5/8 z brief'u, nie to, co akurat jest fallbackiem na dany dzień.
    process.env.BENCHMARK_MIN_USERS = "5";
    process.env.BENCHMARK_MIN_ROWS = "8";

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
    await db.delete(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "karkowka anon testowa"));
    await db.delete(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "cytryna anon manual"));
    server?.close();
  });

  async function getBenchmarks(query = ""): Promise<{ status: number; body: unknown; raw: string }> {
    const res = await fetch(`${baseUrl}/api/benchmarks${query}`);
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

  type Item = Record<string, unknown>;
  const itemsOf = (body: unknown) => (body as { items: Item[] }).items;

  it("faktura KOR (korekta z ceną 500 zł) nie zmienia mediany ani „Twojej ceny”", async () => {
    authState.userId = OK_USERS[1]!;
    const before = itemsOf((await getBenchmarks()).body).find((i) => i.productName === "karkowka anon test")!;

    await seedPurchase(OK_USERS[1]!, "karkowka anon test", "kg", "mieso", 500, { invoiceType: "KOR", invoiceNumber: "ANON-KOR-1" });
    const { runMarketBenchmarkJob } = await import("../services/market-benchmark-job");
    await runMarketBenchmarkJob(log);

    const after = itemsOf((await getBenchmarks()).body).find((i) => i.productName === "karkowka anon test")!;
    expect(after.medianPrice).toBe(before.medianPrice);
    expect(after.yourPrice).toBe(25);
  });

  it("brak zakupów w 3 mies. → „Twoja cena” z najnowszego miesiąca z zakupami (scope latestMonth)", async () => {
    const OLD_USER = "anon_old_user";
    ALL_USERS.push(OLD_USER);
    const old = new Date();
    old.setMonth(old.getMonth() - 5);
    const oldDate = old.toISOString().slice(0, 10);
    await seedPurchase(OLD_USER, "karkowka anon test", "kg", "mieso", 27, { invoiceDate: oldDate });

    authState.userId = OLD_USER;
    const { body } = await getBenchmarks();
    const b = body as { scope: string; yourPricePeriodFrom: string; yourPricePeriodTo: string };
    expect(b.scope).toBe("latestMonth");
    expect(b.yourPricePeriodFrom).toBe(oldDate.slice(0, 7));
    expect(b.yourPricePeriodTo).toBe(oldDate.slice(0, 7));
    const row = itemsOf(body).find((i) => i.productName === "karkowka anon test");
    expect(row?.yourPrice).toBe(27);
  });

  it("nazwa bez aliasu dopasowuje się w locie (pg_trgm) do opublikowanej grupy", async () => {
    const NEW_USER = "anon_fuzzy_user";
    ALL_USERS.push(NEW_USER);
    // Brak aliasu dla tej nazwy — job nie był odpalony po seedzie.
    const invId = await seedPurchase(NEW_USER, "karkowka anon testowa", "kg", "mieso", 30);

    authState.userId = NEW_USER;
    const row = itemsOf((await getBenchmarks()).body).find((i) => i.productName === "karkowka anon testowa");
    expect(row).toBeDefined();
    expect(row!.insufficientData).toBe(false);
    expect(row!.matchedBy).toBe("fuzzy");
    expect(typeof row!.medianPrice).toBe("number");

    // Sprzątamy od razu: kolejny test (opt-out) liczy próg dokładnie 8 wierszy, a ten user
    // po przeliczeniu joba trafiłby do tej samej grupy i zawyżył próbę.
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invId));
    await db.delete(invoicesTable).where(eq(invoicesTable.id, invId));
    await db.delete(productsTable).where(eq(productsTable.id, createdProductIds[createdProductIds.length - 1]!));
  });

  it("invoiceId: tylko pozycje tej faktury, cudza faktura → 404", async () => {
    authState.userId = OK_USERS[2]!;
    const myInvoiceId = createdInvoiceIds[BELOW_USERS.length + 2]!; // seed OK_USERS[2]
    const { status, body } = await getBenchmarks(`?invoiceId=${myInvoiceId}`);
    expect(status).toBe(200);
    expect((body as { scope: string }).scope).toBe("invoice");
    expect(itemsOf(body).map((i) => i.productName)).toEqual(["karkowka anon test"]);

    const foreign = await getBenchmarks(`?invoiceId=${createdInvoiceIds[0]}`);
    expect(foreign.status).toBe(404);
  });

  it("konta wyłącznie z importem ręcznym/podglądem nie publikują mediany (nawet 8 kont ≥ progu)", async () => {
    const MANUAL_USERS = Array.from({ length: 8 }, (_, n) => `anon_manual_${n}`);
    ALL_USERS.push(...MANUAL_USERS);
    for (const [n, u] of MANUAL_USERS.entries()) {
      await seedPurchase(u, "cytryna anon manual", "kg", "warzywa", 9 + n / 10, { source: n % 2 ? "viewer" : "manual" });
    }
    const { runMarketBenchmarkJob } = await import("../services/market-benchmark-job");
    await runMarketBenchmarkJob(log);

    authState.userId = MANUAL_USERS[0]!;
    const row = itemsOf((await getBenchmarks()).body).find((i) => i.productName === "cytryna anon manual");
    expect(row).toBeDefined();
    expect(row!.insufficientData).toBe(true);
    expect(row).not.toHaveProperty("medianPrice");
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
