import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Logger } from "pino";
import { inArray, eq, and } from "drizzle-orm";
import {
  db,
  suppliersTable,
  productsTable,
  invoicesTable,
  invoiceItemsTable,
  userSettingsTable,
  marketProductAliasesTable,
  marketPriceBenchmarksTable,
  marketMatchFeedbackTable,
  marketMatchReviewTable,
} from "@workspace/db";

// Anonimowość i poprawność porównania cen (spec benchmark v2). Uderza w PRAWDZIWY route
// GET /api/benchmarks po przeliczeniu prawdziwego joba. Każdy test używa innego produktu
// bazowego, bo job przelicza wszystko od zera.
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
const ALL_USERS: string[] = [];
const users = (prefix: string, n: number) => {
  const list = Array.from({ length: n }, (_, i) => `anon_${prefix}_${i}`);
  ALL_USERS.push(...list);
  return list;
};

const createdSupplierIds: number[] = [];
const createdProductIds: number[] = [];
const createdInvoiceIds: number[] = [];
const createdItemIds: number[] = [];

async function seedPurchase(
  userId: string,
  canonicalName: string,
  unit: string,
  category: string,
  unitPrice: number,
  opts: { invoiceDate?: string; invoiceType?: string; invoiceNumber?: string; source?: "ksef_sync" | "manual" | "viewer"; quantity?: number; supplier?: string } = {},
): Promise<{ invoiceId: number; itemId: number; productId: number }> {
  const [supplier] = await db
    .insert(suppliersTable)
    .values({ userId, name: opts.supplier ?? `Dostawca anon (${userId})`, taxId: "0000000000" })
    .returning({ id: suppliersTable.id });
  createdSupplierIds.push(supplier!.id);

  const existing = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.canonicalName, canonicalName), eq(productsTable.unit, unit)));
  let productId = existing[0]?.id;
  if (!productId) {
    const [product] = await db.insert(productsTable).values({ userId, name: canonicalName, unit, category, canonicalName }).returning({ id: productsTable.id });
    productId = product!.id;
    createdProductIds.push(productId);
  }

  const qty = opts.quantity ?? 10;
  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      userId,
      supplierId: supplier!.id,
      invoiceNumber: opts.invoiceNumber ?? `ANON-${userId}-${canonicalName}-${Math.random()}`,
      invoiceDate: opts.invoiceDate ?? today,
      totalAmount: (unitPrice * qty).toFixed(2),
      excluded: false,
      // Domyślnie jak z KSeF — tylko takie konta liczą się do progu „≥ 2 z KSeF”.
      source: opts.source ?? "ksef_sync",
      ...(opts.invoiceType ? { invoiceType: opts.invoiceType } : {}),
    })
    .returning({ id: invoicesTable.id });
  createdInvoiceIds.push(invoice!.id);

  const [item] = await db
    .insert(invoiceItemsTable)
    .values({
      invoiceId: invoice!.id,
      productId,
      productName: canonicalName,
      quantity: String(qty),
      unit,
      unitPrice: unitPrice.toFixed(4),
      totalPrice: (unitPrice * qty).toFixed(2),
    })
    .returning({ id: invoiceItemsTable.id });
  createdItemIds.push(item!.id);
  return { invoiceId: invoice!.id, itemId: item!.id, productId };
}

async function runJob() {
  const { runMarketBenchmarkJob } = await import("../services/market-benchmark-job");
  await runMarketBenchmarkJob(log);
}

describe.skipIf(!RUN_DB)("porównanie cen v2: GET /api/benchmarks", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Próg ze specyfikacji (5 innych / 2 z KSeF / 8 do p25–p75) — także gdy env jest niżej.
    process.env.BENCHMARK_MIN_USERS = "3";
    const { ensureMarketBenchmarkExtensions } = await import("../services/ensure-market-benchmark");
    await ensureMarketBenchmarkExtensions(log);
    const { ensurePreListenColumns } = await import("../services/ensure-invoice-source");
    await ensurePreListenColumns(log);

    const app = (await import("../app")).default;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 90_000);

  afterAll(async () => {
    await db.delete(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, createdInvoiceIds));
    await db.delete(invoicesTable).where(inArray(invoicesTable.id, createdInvoiceIds));
    await db.delete(marketMatchFeedbackTable).where(inArray(marketMatchFeedbackTable.userId, ALL_USERS));
    await db.delete(productsTable).where(inArray(productsTable.id, createdProductIds));
    await db.delete(suppliersTable).where(inArray(suppliersTable.id, createdSupplierIds));
    await db.delete(userSettingsTable).where(inArray(userSettingsTable.userId, ALL_USERS));
    await runJob(); // aliasy i agregaty bez danych z testu
    server?.close();
  }, 90_000);

  type Item = Record<string, unknown>;
  async function getBenchmarks(query = ""): Promise<{ status: number; body: { items: Item[]; skipped: Array<{ name: string; reason: string }>; summary: Record<string, unknown>; scope?: string; yourPricePeriodFrom?: string; yourPricePeriodTo?: string; optedIn: boolean }; raw: string }> {
    const res = await fetch(`${baseUrl}/api/benchmarks${query}`);
    const raw = await res.text();
    return { status: res.status, body: JSON.parse(raw), raw };
  }
  const itemOf = async (userId: string, name: string) => {
    authState.userId = userId;
    return (await getBenchmarks()).body.items.find((i) => i.productName === name || (i.invoiceNames as string[] | undefined)?.includes(name));
  };

  it("3 restauracje → żadna nie dostaje mediany ani percentyli", async () => {
    const U = users("three", 3);
    for (const u of U) await seedPurchase(u, "limonka anon", "kg", "owoce", 12);
    await runJob();
    for (const u of U) {
      const row = await itemOf(u, "limonka anon");
      expect(row?.insufficientData).toBe(true);
      expect(row).not.toHaveProperty("medianPrice");
      expect(row).not.toHaveProperty("p25Price");
    }
  });

  it("6 restauracji → każda dostaje medianę z 5 POZOSTAŁYCH; własna cena jej nie zmienia; bez p25/p75", async () => {
    const U = users("six", 6);
    const prices = [10, 11, 12, 13, 14, 15];
    const seeded = [];
    for (const [i, u] of U.entries()) seeded.push(await seedPurchase(u, "ananas anon", "kg", "owoce", prices[i]!));
    await runJob();

    const viewer = await itemOf(U[0]!, "ananas anon");
    expect(viewer?.insufficientData).toBe(false);
    expect(viewer?.medianPrice).toBe(13); // mediana z 11..15, bez 10 oglądającego
    expect(viewer?.p25Price ?? null).toBeNull();
    expect(viewer?.sourceBucket).toBe("5-9");
    const last = await itemOf(U[5]!, "ananas anon");
    expect(last?.medianPrice).toBe(12); // mediana z 10..14

    // Zmiana ceny oglądającego nie zmienia JEGO mediany.
    await db.update(invoiceItemsTable).set({ unitPrice: "14.5000", totalPrice: "145.00" }).where(eq(invoiceItemsTable.id, seeded[0]!.itemId));
    await runJob();
    const after = await itemOf(U[0]!, "ananas anon");
    expect(after?.medianPrice).toBe(13);
  });

  it("9 restauracji → jest środkowa połowa rynku (p25–p75); mediana zaokrąglona do 10 gr", async () => {
    const U = users("nine", 9);
    for (const [i, u] of U.entries()) await seedPurchase(u, "mango anon", "kg", "owoce", 10.03 + i * 0.37);
    await runJob();
    const row = await itemOf(U[0]!, "mango anon");
    expect(row?.insufficientData).toBe(false);
    expect(typeof row?.p25Price).toBe("number");
    expect(typeof row?.p75Price).toBe("number");
    for (const k of ["medianPrice", "p25Price", "p75Price"] as const) {
      const v = Number(row?.[k]);
      expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
    }
  });

  it("odpowiedź nie zawiera dokładnych liczb źródeł ani identyfikatorów innych lokali", async () => {
    const U = users("keys", 6);
    for (const [i, u] of U.entries()) await seedPurchase(u, "banan anon", "kg", "owoce", 5 + i / 10);
    await runJob();
    authState.userId = U[0]!;
    const { body, raw } = await getBenchmarks();
    for (const forbidden of ["distinctUserCount", "sampleRowCount", "contributionCount", "minRows", "verified"]) expect(raw).not.toContain(forbidden);
    for (const u of U.slice(1)) {
      expect(raw).not.toContain(u);
      expect(raw).not.toContain(`Dostawca anon (${u})`);
    }
    expect(["<5", "5-9", "10+"]).toContain(body.summary.contributionBucket);
  });

  it("lokal z 3 dostawcami liczy się w medianie raz", async () => {
    const [viewer, multi, ...rest] = users("multi", 7);
    for (const s of ["A", "B", "C"]) await seedPurchase(multi!, "kiwi anon", "kg", "owoce", 30, { supplier: `Dostawca ${s}` });
    const restPrices = [10, 12, 14, 16, 18];
    for (const [i, u] of rest.entries()) await seedPurchase(u, "kiwi anon", "kg", "owoce", restPrices[i]!);
    await seedPurchase(viewer!, "kiwi anon", "kg", "owoce", 11);
    await runJob();
    // Inni: [10,12,14,16,18,30] → mediana 15 (gdyby 30 liczyło się 3×: [10,12,14,16,18,30,30,30] → 17).
    expect((await itemOf(viewer!, "kiwi anon"))?.medianPrice).toBe(15);
  });

  it("cena ważona ilością: 1 kg po 10 zł + 99 kg po 5 zł ≈ 5,05 zł/kg", async () => {
    const [viewer] = users("weighted", 1);
    await seedPurchase(viewer!, "gruszka anon", "kg", "owoce", 10, { quantity: 1 });
    await seedPurchase(viewer!, "gruszka anon", "kg", "owoce", 5, { quantity: 99 });
    authState.userId = viewer!;
    const row = (await getBenchmarks()).body.items.find((i) => i.productName === "gruszka anon");
    expect(Number(row?.yourPrice)).toBeCloseTo(5.05, 5);
  });

  it("cukier 1 kg i worek 25 kg: różne przedziały, „większe opakowania”, fallback ze wszystkimi wielkościami", async () => {
    const [viewer, viewerM, ...others] = users("sugar", 12);
    const small = others.slice(0, 5);
    const big = others.slice(5, 10);
    for (const [i, u] of small.entries()) await seedPurchase(u!, "cukier bialy 1kg", "szt", "spozywcze", 3.8 + i / 10);
    for (const [i, u] of big.entries()) await seedPurchase(u!, "cukier bialy 25kg", "szt", "spozywcze", 75 + i);
    await seedPurchase(viewer!, "cukier bialy 1kg", "szt", "spozywcze", 4.3);
    await seedPurchase(viewerM!, "cukier bialy 5kg", "szt", "spozywcze", 21);
    await runJob();

    const s = await itemOf(viewer!, "cukier bialy 1kg");
    expect(s?.insufficientData).toBe(false);
    expect(s?.unit).toBe("kg");
    expect(s?.packTier).toBe("S");
    expect(s?.tierFallback).toBe(false);
    expect(s?.medianPrice).toBe(4); // 3.8..4.2 → 4.0
    expect(s?.largerPackMedian).toBe(3.1); // 75..79 / 25 kg → mediana 3.08 → 3.1

    const m = await itemOf(viewerM!, "cukier bialy 5kg");
    expect(m?.packTier).toBe("M");
    expect(m?.tierFallback).toBe(true); // w przedziale M brak innych restauracji
  });

  it("vegeburger z kalafiora nie jest porównywany z kalafiorem — trafia do „Pominiętych” z powodem", async () => {
    const [viewer] = users("skip", 1);
    await seedPurchase(viewer!, "vegeburger z kalafiora 1,5kg cook vege", "szt", "mrozonki", 39);
    await runJob();
    authState.userId = viewer!;
    const { body } = await getBenchmarks();
    expect(body.items.find((i) => i.productName === "vegeburger z kalafiora 1,5kg cook vege")).toBeUndefined();
    expect(body.skipped).toContainEqual({ name: "vegeburger z kalafiora 1,5kg cook vege", reason: "dish" });
  });

  it("„To nie ten produkt”: znika od razu u zgłaszającego; 2 restauracje → wariant poza grupą; admin może przywrócić", async () => {
    const [a, b, ...others] = users("report", 8);
    for (const [i, u] of others.entries()) await seedPurchase(u!, "rzodkiewka anon", "kg", "warzywa", 6 + i / 10);
    await seedPurchase(a!, "rzodkiewka dziwna odmiana", "kg", "warzywa", 6.2);
    await seedPurchase(b!, "rzodkiewka dziwna odmiana", "kg", "warzywa", 6.4);
    await runJob();
    expect((await itemOf(a!, "rzodkiewka dziwna odmiana"))?.insufficientData).toBe(false);

    for (const u of [a!, b!]) {
      authState.userId = u;
      const res = await fetch(`${baseUrl}/api/benchmarks/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variants: [{ canonicalName: "rzodkiewka dziwna odmiana", unit: "kg" }], reason: "other_product", marketGroupKey: "Rzodkiewka" }),
      });
      expect(res.status).toBe(200);
      // Natychmiast: pozycja znika z porównania zgłaszającego.
      expect((await getBenchmarks()).body.items.find((i) => i.productName === "rzodkiewka dziwna odmiana")).toBeUndefined();
    }
    // Cudzej pozycji zgłosić się nie da.
    authState.userId = others[0]!;
    const foreign = await fetch(`${baseUrl}/api/benchmarks/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variants: [{ canonicalName: "nie moja nazwa", unit: "kg" }], reason: "other_product" }),
    });
    expect(foreign.status).toBe(404);

    await runJob();
    const [alias] = await db.select().from(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "rzodkiewka dziwna odmiana"));
    expect(alias?.marketGroupKey).not.toBe("Rzodkiewka");

    await db.insert(marketMatchReviewTable).values({ canonicalName: "rzodkiewka dziwna odmiana", unit: "kg", decision: "restored" });
    await runJob();
    const [restored] = await db.select().from(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "rzodkiewka dziwna odmiana"));
    expect(restored?.marketGroupKey).toBe("Rzodkiewka");
    await db.delete(marketMatchReviewTable).where(eq(marketMatchReviewTable.canonicalName, "rzodkiewka dziwna odmiana"));
  });

  it("faktura KOR (korekta z ceną 500 zł) nie zmienia mediany ani „Twojej ceny”", async () => {
    const U = users("kor", 6);
    for (const [i, u] of U.entries()) await seedPurchase(u, "karkowka anon", "kg", "mieso", 25 + i / 10);
    await runJob();
    const before = await itemOf(U[1]!, "karkowka anon");
    await seedPurchase(U[0]!, "karkowka anon", "kg", "mieso", 500, { invoiceType: "KOR" });
    await runJob();
    const after = await itemOf(U[1]!, "karkowka anon");
    expect(after?.medianPrice).toBe(before?.medianPrice);
    expect((await itemOf(U[0]!, "karkowka anon"))?.yourPrice).toBe(25);
  });

  it("brak zakupów w 3 mies. → „Twoja cena” z najnowszego miesiąca z zakupami (scope latestMonth)", async () => {
    const [oldUser] = users("old", 1);
    const old = new Date();
    old.setMonth(old.getMonth() - 14);
    const oldDate = old.toISOString().slice(0, 10);
    await seedPurchase(oldUser!, "boczniak anon", "kg", "warzywa", 27, { invoiceDate: oldDate });
    authState.userId = oldUser!;
    const { body } = await getBenchmarks();
    expect(body.scope).toBe("latestMonth");
    expect(body.yourPricePeriodFrom).toBe(oldDate.slice(0, 7));
    expect(body.items.find((i) => i.productName === "boczniak anon")?.yourPrice).toBe(27);
  });

  it("invoiceId: tylko pozycje tej faktury, cudza faktura → 404", async () => {
    const [me, other] = users("inv", 2);
    const mine = await seedPurchase(me!, "imbir anon", "kg", "warzywa", 20);
    await seedPurchase(me!, "batat anon", "kg", "warzywa", 9);
    const foreign = await seedPurchase(other!, "imbir anon", "kg", "warzywa", 21);
    authState.userId = me!;
    const { status, body } = await getBenchmarks(`?invoiceId=${mine.invoiceId}`);
    expect(status).toBe(200);
    expect(body.scope).toBe("invoice");
    expect(body.items.map((i) => i.productName)).toEqual(["imbir anon"]);
    expect((await getBenchmarks(`?invoiceId=${foreign.invoiceId}`)).status).toBe(404);
  });

  it("mediana z 12 mies., gdy w miesiącu za mało danych (periodFallback R12) + publiczna lista grup", async () => {
    const U = users("roll", 7);
    for (const [n, u] of U.entries()) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - n);
      await seedPurchase(u, "pieczarki rolling", "kg", "warzywa", 10 + n, { invoiceDate: d.toISOString().slice(0, 10) });
    }
    await runJob();
    authState.userId = U[0]!;
    const row = (await getBenchmarks()).body.items.find((i) => i.productName === "pieczarki rolling");
    expect(row?.insufficientData).toBe(false);
    expect(row?.periodFallback).toBe("R12");
    expect(row?.medianWindow).toBe("12m");
    expect(row?.medianPrice).toBe(13.5); // 11..16 bez oglądającego (10)

    const { __resetPublicMarketCache } = await import("./public-market");
    __resetPublicMarketCache();
    const pub = (await (await fetch(`${baseUrl}/api/public/market-groups`)).json()) as { groups: Array<{ name: string }> };
    expect(pub.groups.map((g) => g.name)).toContain("Pieczarki");
  });

  it("różne nazwy tego samego produktu → jedna grupa „Cytryna”; publiczne ceny bez surowych nazw i liczników", async () => {
    const U = users("lemon", 8);
    for (const [n, u] of U.entries()) await seedPurchase(u, n % 2 ? "cytryny argentyna kl.i" : "cytryna luz", "kg", n % 2 ? "owoce" : "warzywa", 8 + n / 10);
    await runJob();
    expect((await itemOf(U[0]!, "cytryna luz"))?.insufficientData).toBe(false);
    expect((await itemOf(U[1]!, "cytryny argentyna kl.i"))?.marketLabel).toBe("Cytryna");
    const aliases = await db.select().from(marketProductAliasesTable).where(inArray(marketProductAliasesTable.canonicalName, ["cytryna luz", "cytryny argentyna kl.i"]));
    expect(new Set(aliases.map((a) => a.marketGroupKey))).toEqual(new Set(["Cytryna"]));

    const { __resetPublicMarketCache } = await import("./public-market");
    __resetPublicMarketCache();
    const raw = await (await fetch(`${baseUrl}/api/public/market-prices`)).text();
    const lemon = (JSON.parse(raw) as { items: Array<{ name: string; unit: string; median: number; p25: number | null }> }).items.find((i) => i.name === "Cytryna" && i.unit === "kg");
    expect(typeof lemon?.median).toBe("number");
    expect(typeof lemon?.p25).toBe("number"); // 8 restauracji → jest środkowa połowa
    for (const forbidden of ["cytryna luz", "argentyna", "distinctUserCount", "sampleRowCount", "verified", "anon_"]) {
      expect(raw.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("paczka „1kg” za sztukę → cena za kg; granulat i cena 7× od mediany nie porównują się z czosnkiem", async () => {
    const G = users("garlic", 8);
    const [buyer] = users("garlicbuyer", 1);
    for (const [n, u] of G.entries()) await seedPurchase(u, "czosnek polski", "szt", "warzywa", 2.8 + n / 100);
    await seedPurchase(buyer!, "czosnek granulowany 1,05kg pet", "szt", "warzywa", 44.8);
    await seedPurchase(buyer!, "czosnek polski 1kg", "szt", "warzywa", 30);
    await seedPurchase(buyer!, "czosnek fioletowy", "szt", "warzywa", 20);
    await runJob();

    const pack = (await db.select().from(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "czosnek polski 1kg")))[0];
    expect(pack?.marketGroupKey).toBe("Czosnek");
    expect(pack?.compareUnit).toBe("kg");
    expect(pack?.matchConfidence).toBe("dictionary_pack");

    authState.userId = buyer!;
    const { body } = await getBenchmarks();
    expect(body.items.find((i) => i.productName === "czosnek fioletowy")?.notComparableReason).toBe("price_outlier");
    expect(body.items.find((i) => i.productName === "czosnek polski 1kg")?.medianPrice).toBeUndefined();
    expect(body.skipped.map((s) => s.name)).toContain("czosnek granulowany 1,05kg pet");
  });

  it("karton 10 kg za sztukę porównuje się za kg; płyn do naczyń „mięta” nie trafia do mięty", async () => {
    const K = users("kg", 6);
    const [buyer] = users("kgbuyer", 1);
    for (const [n, u] of K.entries()) await seedPurchase(u, "pomarancza luz", "kg", "owoce", 6 + n / 10);
    await seedPurchase(buyer!, "pomarancze skrzynka 10kg", "szt", "owoce", 70);
    await seedPurchase(buyer!, "gar kubus pl.d/naczyn 5l mieta karnister", "szt", "chemia", 8.5);
    await runJob();
    authState.userId = buyer!;
    const { body } = await getBenchmarks();
    const box = body.items.find((i) => i.productName === "pomarancze skrzynka 10kg");
    expect(box?.insufficientData).toBe(false);
    expect(box?.unit).toBe("kg");
    expect(Number(box?.yourPrice)).toBeCloseTo(7, 5);
    expect(box?.priceFactor).toBeCloseTo(0.1, 6);
    expect(box?.invoiceUnitPrice).toBeCloseTo(70, 6);
    const [alias] = await db.select().from(marketProductAliasesTable).where(eq(marketProductAliasesTable.canonicalName, "gar kubus pl.d/naczyn 5l mieta karnister"));
    expect(alias?.marketGroupKey).not.toBe("Mięta");
  });

  it("konta wyłącznie z importem ręcznym nie publikują mediany (próg „≥ 2 z KSeF”)", async () => {
    const M = users("manual", 8);
    for (const [n, u] of M.entries()) await seedPurchase(u, "brokul anon", "kg", "warzywa", 9 + n / 10, { source: n % 2 ? "viewer" : "manual" });
    await runJob();
    const row = await itemOf(M[0]!, "brokul anon");
    expect(row?.insufficientData).toBe(true);
    expect(row).not.toHaveProperty("medianPrice");
  });

  it("opt-out działa w obie strony: user nie widzi porównania i nie zasila go dla innych", async () => {
    const U = users("optout", 6);
    for (const [n, u] of U.entries()) await seedPurchase(u, "szpinak anon", "kg", "warzywa", 20 + n / 10);
    await runJob();
    expect((await itemOf(U[1]!, "szpinak anon"))?.insufficientData).toBe(false);

    await db.insert(userSettingsTable).values({ userId: U[0]!, benchmarkOptIn: false });
    authState.userId = U[0]!;
    const own = (await getBenchmarks()).body;
    expect(own.optedIn).toBe(false);
    expect(own.items).toHaveLength(0);

    await runJob(); // teraz U[1] ma tylko 4 innych
    expect((await itemOf(U[1]!, "szpinak anon"))?.insufficientData).toBe(true);
  });

  it("publiczna lista grup: tylko opublikowane, bez cen i liczników", async () => {
    const KEYS = ["pubtest cytryna", "pubtest tajne"];
    await db.insert(marketPriceBenchmarksTable).values([
      { marketGroupKey: KEYS[0]!, unit: "kg", category: "warzywa", periodMonth: "2026-09", medianPrice: "7.80", p25Price: "7.20", p75Price: "8.60", distinctUserCount: 5, distinctSupplierCount: 4, sampleRowCount: 9, isPublished: true },
      { marketGroupKey: KEYS[1]!, unit: "kg", category: "warzywa", periodMonth: "2026-09", medianPrice: "99.99", p25Price: "90", p75Price: "110", distinctUserCount: 1, distinctSupplierCount: 1, sampleRowCount: 1, isPublished: false },
    ]);
    const { __resetPublicMarketCache } = await import("./public-market");
    __resetPublicMarketCache();
    const res = await fetch(`${baseUrl}/api/public/market-groups`);
    const raw = await res.text();
    const names = (JSON.parse(raw) as { groups: Array<{ name: string }> }).groups.map((g) => g.name);
    expect(names).toContain("pubtest cytryna");
    expect(names).not.toContain("pubtest tajne");
    for (const forbidden of ["7.8", "7.20", "8.60", "medianPrice", "distinctUserCount", "sampleRowCount", "p25", "p75"]) expect(raw).not.toContain(forbidden);
    await db.delete(marketPriceBenchmarksTable).where(inArray(marketPriceBenchmarksTable.marketGroupKey, KEYS));
  });
});
