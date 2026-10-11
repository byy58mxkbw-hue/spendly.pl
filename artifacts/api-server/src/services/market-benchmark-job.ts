import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db, marketPriceBenchmarksTable, marketPriceRangesTable, marketUserPricesTable } from "@workspace/db";
import { runMarketProductMatcher } from "../lib/market-product-matcher.js";
import { normalizedUnitSql } from "../lib/units.js";
// Mediana liczona tylko z wydatków: bez excluded i bez KOR/ROZ (korekty różnic cen
// mają kwoty ujemne, rozliczenia zaliczek dublują towar) — ta sama definicja co ekrany.
import { spendInvoicesFilter } from "../lib/invoice-line-classify.js";
import { medianMinKsef, publicMinUsers, spreadMinOthers } from "../lib/benchmark-thresholds.js";

// Batch dzienny — NIE live query. Wzorowany na ksef-scheduler.ts (setInterval).
//
// Spec benchmark v2 (2026-10-11):
//  - JEDNA cena na restaurację (wcześniej per dostawca — lokal z 3 dostawcami miał 3 głosy),
//  - średnia WAŻONA ilością: Σ(cena × ilość) / Σ(ilość ÷ factor) w kg/l/szt (1 kg po 10 zł
//    i 99 kg po 5 zł to ~5,05 zł/kg, nie 7,50),
//  - per przedział opakowania (luz/S/M/L/szt),
//  - wynik w market_user_prices (wewnętrzna; mediany dla zalogowanych liczy routes/benchmarks.ts
//    na żądanie BEZ oglądającego) + publiczne agregaty (market_price_benchmarks miesięcznie,
//    market_price_ranges z 12 mies.) dla strony cen rynkowych — próg ≥ 5 restauracji,
//    ceny zaokrąglone do 10 gr, p25–p75 tylko przy ≥ 8.

export const RANGE_WINDOW_MONTHS = 12;
/** Okres „ostatnie 12 miesięcy” w market_user_prices. */
export const R12 = "R12";

type UserPriceRow = {
  market_group_key: string;
  compare_unit: string;
  pack_tier: string;
  period_month: string;
  user_id: string;
  category: string | null;
  price_per_unit: string | null;
  quantity: string;
};

type PublicAggRow = {
  market_group_key: string;
  unit: string;
  category: string | null;
  period_month: string;
  median_price: string | null;
  p25_price: string | null;
  p75_price: string | null;
  n: number;
  nk: number;
  from_month: string | null;
  to_month: string | null;
};

const round1 = (v: string | null) => (v == null ? null : (Math.round(Number(v) * 10) / 10).toFixed(2));

/**
 * Batch benchmarku rynkowego: (1) matcher — karty produktów i aliasy, (2) jedna ważona cena na
 * restaurację → market_user_prices, (3) publiczne agregaty. Respektuje benchmark_opt_in w obie
 * strony — user z opt-out nie jest źródłem (WHERE niżej), a routes/benchmarks.ts pilnuje, że
 * taki user nie widzi porównania. Harmonogram (startMarketBenchmarkScheduler) i ręcznie
 * (admin POST /admin/benchmarks/run).
 */
export async function runMarketBenchmarkJob(log: Logger): Promise<{
  groups: number;
  benchmarkRows: number;
  published: number;
}> {
  const matcherResult = await runMarketProductMatcher(log);

  // Restauracje z co najmniej jedną fakturą z KSeF — do progu „≥ 2 z KSeF” (trudne do
  // podrobienia: ktoś z kilkoma kontami i ręcznymi plikami nie otworzy sam publikacji).
  const ksefUsers = new Set(
    (await db.execute<{ user_id: string }>(sql`SELECT DISTINCT user_id FROM invoices WHERE source = 'ksef_sync'`)).rows.map((r) => r.user_id),
  );

  const perUser = await db.execute<UserPriceRow>(sql`
    WITH base AS (
      SELECT
        mpa.market_group_key,
        COALESCE(mpa.compare_unit, mpa.unit) AS compare_unit,
        COALESCE(mpa.pack_tier, 'szt') AS pack_tier,
        mpa.category,
        SUBSTRING(i.invoice_date, 1, 7) AS period_month,
        i.invoice_date,
        i.user_id,
        ii.unit_price::numeric AS price,
        ii.quantity::numeric AS qty,
        mpa.price_factor::numeric AS factor
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN products p ON p.id = ii.product_id
      JOIN market_product_aliases mpa
        ON mpa.canonical_name = p.canonical_name AND mpa.unit = ${normalizedUnitSql(sql`p.unit`)}
      LEFT JOIN user_settings us ON us.user_id = i.user_id
      WHERE p.canonical_name IS NOT NULL
        ${spendInvoicesFilter("i")}
        AND COALESCE(us.benchmark_opt_in, true) = true
        AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0 AND mpa.price_factor > 0
    )
    SELECT market_group_key, compare_unit, pack_tier, period_month, user_id, MAX(category) AS category,
           (SUM(price * qty) / NULLIF(SUM(qty / factor), 0))::text AS price_per_unit,
           SUM(qty / factor)::text AS quantity
    FROM base
    GROUP BY 1, 2, 3, 4, 5
    UNION ALL
    SELECT market_group_key, compare_unit, pack_tier, ${R12} AS period_month, user_id, MAX(category) AS category,
           (SUM(price * qty) / NULLIF(SUM(qty / factor), 0))::text AS price_per_unit,
           SUM(qty / factor)::text AS quantity
    FROM base
    WHERE invoice_date >= to_char(current_date - make_interval(months => ${RANGE_WINDOW_MONTHS}), 'YYYY-MM-DD')
    GROUP BY 1, 2, 3, 5
  `);

  const userRows = perUser.rows.filter((r) => r.price_per_unit != null);
  await db.transaction(async (tx) => {
    await tx.delete(marketUserPricesTable);
    for (const batch of chunk(userRows, 500)) {
      await tx.insert(marketUserPricesTable).values(
        batch.map((r) => ({
          marketGroupKey: r.market_group_key,
          compareUnit: r.compare_unit,
          packTier: r.pack_tier,
          periodMonth: r.period_month,
          userId: r.user_id,
          pricePerUnit: r.price_per_unit!,
          quantity: r.quantity,
          hasKsef: ksefUsers.has(r.user_id),
          category: r.category,
        })),
      );
    }
  });

  // Publiczne agregaty — wszystkie przedziały opakowań razem (najpierw jedna cena na lokal
  // przez wszystkie przedziały, ważona ilością); tu oglądający nie jest uczestnikiem porównania.
  const publicAgg = await db.execute<PublicAggRow>(sql`
    WITH u AS (
      SELECT market_group_key, compare_unit, period_month, user_id, MAX(category) AS category,
             SUM(price_per_unit * quantity) / NULLIF(SUM(quantity), 0) AS price,
             bool_or(has_ksef) AS has_ksef
      FROM market_user_prices
      GROUP BY 1, 2, 3, 4
    ),
    months AS (
      SELECT market_group_key, compare_unit, MIN(period_month) AS from_month, MAX(period_month) AS to_month
      FROM market_user_prices
      WHERE period_month <> ${R12}
        AND period_month >= to_char(current_date - make_interval(months => ${RANGE_WINDOW_MONTHS}), 'YYYY-MM')
      GROUP BY 1, 2
    )
    SELECT u.market_group_key, u.compare_unit AS unit, MAX(u.category) AS category, u.period_month,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY u.price)::text AS median_price,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY u.price)::text AS p25_price,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY u.price)::text AS p75_price,
           COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE u.has_ksef)::int AS nk,
           MAX(m.from_month) AS from_month, MAX(m.to_month) AS to_month
    FROM u
    LEFT JOIN months m ON m.market_group_key = u.market_group_key AND m.compare_unit = u.compare_unit
    GROUP BY u.market_group_key, u.compare_unit, u.period_month
  `);

  const PUBLIC_MIN = publicMinUsers();
  const MIN_KSEF = medianMinKsef();
  const SPREAD_MIN = spreadMinOthers();
  const publish = (r: PublicAggRow) => r.n >= PUBLIC_MIN && r.nk >= MIN_KSEF;
  let published = 0;
  let rangesPublished = 0;
  // Liczby restauracji w tabelach publicznych służą tylko decyzji o publikacji — żaden
  // endpoint ich nie zwraca (public-market.ts ich nie wybiera).
  const monthlyValues = publicAgg.rows
    .filter((r) => r.period_month !== R12)
    .map((r) => {
      const isPublished = publish(r);
      if (isPublished) published++;
      const spread = r.n >= SPREAD_MIN;
      return {
        marketGroupKey: r.market_group_key,
        unit: r.unit,
        category: r.category,
        periodMonth: r.period_month,
        medianPrice: round1(r.median_price),
        p25Price: spread ? round1(r.p25_price) : null,
        p75Price: spread ? round1(r.p75_price) : null,
        distinctUserCount: r.n,
        distinctSupplierCount: 0,
        sampleRowCount: r.n,
        isPublished,
      };
    });
  const rangeValues = publicAgg.rows
    .filter((r) => r.period_month === R12 && r.from_month && r.to_month)
    .map((r) => {
      const isPublished = publish(r);
      if (isPublished) rangesPublished++;
      const spread = r.n >= SPREAD_MIN;
      return {
        marketGroupKey: r.market_group_key,
        unit: r.unit,
        category: r.category,
        windowMonths: RANGE_WINDOW_MONTHS,
        fromMonth: r.from_month!,
        toMonth: r.to_month!,
        medianPrice: round1(r.median_price),
        p25Price: spread ? round1(r.p25_price) : null,
        p75Price: spread ? round1(r.p75_price) : null,
        distinctUserCount: r.n,
        verifiedUserCount: r.nk,
        sampleRowCount: r.n,
        isPublished,
      };
    });

  // Przeliczenie OD ZERA w jednej transakcji — bez starych wierszy z poprzedniego grupowania.
  await db.transaction(async (tx) => {
    await tx.delete(marketPriceBenchmarksTable);
    for (const batch of chunk(monthlyValues, 500)) await tx.insert(marketPriceBenchmarksTable).values(batch);
    await tx.delete(marketPriceRangesTable);
    for (const batch of chunk(rangeValues, 500)) await tx.insert(marketPriceRangesTable).values(batch);
  });

  log.info(
    {
      grupy: matcherResult.groups,
      cenyLokali: userRows.length,
      wierszeMiesieczne: monthlyValues.length,
      opublikowaneMiesiecznie: published,
      opublikowane12m: rangesPublished,
      progPubliczny: PUBLIC_MIN,
    },
    "benchmark rynkowy: job zakończony",
  );

  return { groups: matcherResult.groups, benchmarkRows: monthlyValues.length, published };
}

const TICK_MS = 24 * 60 * 60 * 1000; // raz dziennie — dane nie wymagają świeżości co do minuty

/** Startuje harmonogram benchmarku rynkowego: pierwszy przelicz krótko po starcie, potem co 24h. */
export function startMarketBenchmarkScheduler(log: Logger): void {
  const runSafely = () => {
    runMarketBenchmarkJob(log).catch((err) => log.error({ err: String(err) }, "benchmark rynkowy: job nieudany"));
  };
  const initialDelay = setTimeout(runSafely, 60_000); // 1 min po starcie, nie blokuje bootu
  if (typeof initialDelay.unref === "function") initialDelay.unref();

  const timer = setInterval(runSafely, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  log.info("Harmonogram benchmarku rynkowego uruchomiony (tik co 24h)");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
