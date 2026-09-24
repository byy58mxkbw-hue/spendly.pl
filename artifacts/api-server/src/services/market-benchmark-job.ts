import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db, marketPriceBenchmarksTable } from "@workspace/db";
import { runMarketProductMatcher } from "../lib/market-product-matcher.js";

// Batch dzienny — NIE live query. Wzorowany na ksef-scheduler.ts (setInterval).
// Liczy jedną cenę na usera na okres (żeby duży klient z wieloma fakturami tego
// samego produktu w miesiącu nie ważył mediany nieproporcjonalnie).
export const DEFAULT_MIN_USERS = 5;
export const DEFAULT_MIN_ROWS = 8;

function minUsers(): number {
  const v = Number(process.env.BENCHMARK_MIN_USERS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MIN_USERS;
}
function minRows(): number {
  const v = Number(process.env.BENCHMARK_MIN_ROWS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MIN_ROWS;
}

type AggregatedBenchmarkRow = {
  market_group_key: string;
  unit: string;
  category: string | null;
  period_month: string;
  median_price: string | null;
  p25_price: string | null;
  p75_price: string | null;
  distinct_user_count: number;
  distinct_supplier_count: number;
  sample_row_count: number;
};

/**
 * Batch benchmarku rynkowego: (1) przelicza grupowanie rozmyte nazw produktów
 * (market-product-matcher.ts), (2) liczy median/p25/p75 per (market_group_key,
 * unit, period_month) i upsertuje do market_price_benchmarks. Respektuje
 * benchmark_opt_in w OBIE strony — user z opt-out=false nie jest źródłem danych
 * (WHERE niżej), a routes/benchmarks.ts osobno pilnuje, że taki user nie WIDZI
 * benchmarku. Wywoływane przez harmonogram (startMarketBenchmarkScheduler) i
 * ręcznie (admin POST /admin/benchmarks/run).
 */
export async function runMarketBenchmarkJob(log: Logger): Promise<{
  groups: number;
  benchmarkRows: number;
  published: number;
}> {
  const matcherResult = await runMarketProductMatcher(log);

  const MIN_USERS = minUsers();
  const MIN_ROWS = minRows();

  const aggResult = await db.execute<AggregatedBenchmarkRow>(sql`
    WITH per_user_price AS (
      SELECT
        mpa.market_group_key,
        p.unit,
        mpa.category,
        SUBSTRING(i.invoice_date, 1, 7) AS period_month,
        i.user_id,
        i.supplier_id,
        AVG(ii.unit_price::numeric) AS avg_price
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN products p ON p.id = ii.product_id
      JOIN market_product_aliases mpa ON mpa.canonical_name = p.canonical_name AND mpa.unit = p.unit
      LEFT JOIN user_settings us ON us.user_id = i.user_id
      WHERE p.canonical_name IS NOT NULL
        AND i.excluded = false
        AND COALESCE(us.benchmark_opt_in, true) = true
      GROUP BY mpa.market_group_key, p.unit, mpa.category, period_month, i.user_id, i.supplier_id
    )
    SELECT
      market_group_key, unit, category, period_month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_price)::text AS median_price,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY avg_price)::text AS p25_price,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY avg_price)::text AS p75_price,
      COUNT(DISTINCT user_id)::int AS distinct_user_count,
      COUNT(DISTINCT supplier_id)::int AS distinct_supplier_count,
      COUNT(*)::int AS sample_row_count
    FROM per_user_price
    GROUP BY market_group_key, unit, category, period_month
  `);

  const aggRows = aggResult.rows;
  let published = 0;
  for (const row of aggRows) {
    const isPublished = row.distinct_user_count >= MIN_USERS && row.sample_row_count >= MIN_ROWS;
    if (isPublished) published++;
    await db
      .insert(marketPriceBenchmarksTable)
      .values({
        marketGroupKey: row.market_group_key,
        unit: row.unit,
        category: row.category,
        periodMonth: row.period_month,
        medianPrice: row.median_price,
        p25Price: row.p25_price,
        p75Price: row.p75_price,
        distinctUserCount: row.distinct_user_count,
        distinctSupplierCount: row.distinct_supplier_count,
        sampleRowCount: row.sample_row_count,
        isPublished,
      })
      .onConflictDoUpdate({
        target: [marketPriceBenchmarksTable.marketGroupKey, marketPriceBenchmarksTable.unit, marketPriceBenchmarksTable.periodMonth],
        set: {
          category: row.category,
          medianPrice: row.median_price,
          p25Price: row.p25_price,
          p75Price: row.p75_price,
          distinctUserCount: row.distinct_user_count,
          distinctSupplierCount: row.distinct_supplier_count,
          sampleRowCount: row.sample_row_count,
          isPublished,
          computedAt: new Date(),
        },
      });
  }

  log.info(
    { grupy: matcherResult.groups, wierszeBenchmarku: aggRows.length, opublikowane: published, minUsers: MIN_USERS, minRows: MIN_ROWS },
    "benchmark rynkowy: job zakończony",
  );

  return { groups: matcherResult.groups, benchmarkRows: aggRows.length, published };
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
