import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, userSettingsTable } from "@workspace/db";
import { DEFAULT_MIN_USERS, DEFAULT_MIN_ROWS } from "../services/market-benchmark-job.js";
import { normalizedUnitSql } from "../lib/units.js";
import { UpdateBenchmarkOptInBody } from "@workspace/api-zod";

const router: IRouter = Router();

function minUsers(): number {
  const v = Number(process.env.BENCHMARK_MIN_USERS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MIN_USERS;
}
function minRows(): number {
  const v = Number(process.env.BENCHMARK_MIN_ROWS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MIN_ROWS;
}

const uid = (name: string, unit: string) => `${name}::${unit}`;

type YourPriceRow = {
  canonical_name: string;
  unit: string;
  product_name: string;
  your_price: number;
  monthly_quantity: number;
};

type BenchmarkRow = {
  canonical_name: string;
  market_group_key: string;
  unit: string;
  category: string | null;
  period_month: string;
  median_price: number | null;
  p25_price: number | null;
  p75_price: number | null;
  distinct_user_count: number;
  sample_row_count: number;
  is_published: boolean;
};

type HistoryRow = {
  market_group_key: string;
  unit: string;
  period_month: string;
  median_price: number | null;
};

// ─── GET /benchmarks — Twoje ceny na tle anonimowej mediany rynkowej ───────
//
// Jedyne miejsce łamiące regułę "zawsze filtruj po userId": po stronie rynkowej
// czyta WYŁĄCZNIE market_price_benchmarks (tabela bez userId/supplierId/invoiceId
// z definicji — patrz schema), po stronie własnej normalnie WHERE user_id = ${userId}.
// Wiersze z is_published=false NIGDY nie trafiają do odpowiedzi z liczbami — front
// dostaje samo insufficientData:true + count/threshold.
router.get("/benchmarks", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const categoryFilter = typeof req.query.category === "string" && req.query.category.trim() ? req.query.category.trim() : null;

  const settingsResult = await db.execute<{ benchmark_opt_in: boolean }>(sql`
    SELECT benchmark_opt_in FROM user_settings WHERE user_id = ${userId} LIMIT 1
  `);
  const optedIn = settingsResult.rows[0]?.benchmark_opt_in ?? true; // brak wiersza = domyślnie true
  if (!optedIn) {
    res.json({ optedIn: false, items: [], summary: null });
    return;
  }

  // Twoja cena: średnia z Twoich ostatnich 3 miesięcy zakupu per (canonical_name, unit
  // znormalizowany — musi się zgadzać z tym, co matcher zapisał w market_product_aliases),
  // plus miesięczna ilość (do liczenia potencjału oszczędności).
  const yourPricesResult = await db.execute<YourPriceRow>(sql`
    SELECT
      p.canonical_name,
      ${normalizedUnitSql(sql`p.unit`)} AS unit,
      MAX(p.name) AS product_name,
      AVG(ii.unit_price::numeric)::float AS your_price,
      (SUM(ii.quantity::numeric) / 3.0)::float AS monthly_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN products p ON p.id = ii.product_id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      AND p.canonical_name IS NOT NULL
      AND i.invoice_date >= to_char(current_date - interval '3 months', 'YYYY-MM-DD')
    GROUP BY p.canonical_name, ${normalizedUnitSql(sql`p.unit`)}
  `);
  const yourPrices = yourPricesResult.rows;

  if (yourPrices.length === 0) {
    res.json({ optedIn: true, items: [], summary: emptySummary() });
    return;
  }

  // market_group_key dla każdego (canonical_name, unit) usera + najnowszy wiersz benchmarku
  // dla tej grupy (opublikowany lub nie — nieopublikowany daje tylko liczby do komunikatu
  // "za mało danych", nigdy medianę).
  const benchResult = await db.execute<BenchmarkRow>(sql`
    SELECT DISTINCT ON (mpa.canonical_name, mpa.unit)
      mpa.canonical_name,
      mpb.market_group_key, mpb.unit, mpb.category, mpb.period_month,
      mpb.median_price::float AS median_price, mpb.p25_price::float AS p25_price, mpb.p75_price::float AS p75_price,
      mpb.distinct_user_count, mpb.sample_row_count, mpb.is_published
    FROM market_product_aliases mpa
    JOIN market_price_benchmarks mpb ON mpb.market_group_key = mpa.market_group_key AND mpb.unit = mpa.unit
    WHERE (mpa.canonical_name, mpa.unit) IN (
      ${sql.join(yourPrices.map((r) => sql`(${r.canonical_name}, ${r.unit})`), sql`, `)}
    )
    ORDER BY mpa.canonical_name, mpa.unit, mpb.period_month DESC
  `);
  const benchRows = benchResult.rows;
  const benchByKey = new Map<string, BenchmarkRow>();
  for (const r of benchRows) benchByKey.set(uid(r.canonical_name, r.unit), r);

  // 6-miesięczny mini-trend mediany rynkowej — tylko dla opublikowanych okresów.
  const historyByKey = new Map<string, Array<{ month: string; median: number }>>();
  if (benchRows.length > 0) {
    const historyResult = await db.execute<HistoryRow>(sql`
      SELECT market_group_key, unit, period_month, median_price::float AS median_price
      FROM market_price_benchmarks
      WHERE is_published = true
        AND (market_group_key, unit) IN (
          ${sql.join(benchRows.map((r) => sql`(${r.market_group_key}, ${r.unit})`), sql`, `)}
        )
      ORDER BY period_month ASC
    `);
    for (const r of historyResult.rows) {
      const k = uid(r.market_group_key, r.unit);
      const arr = historyByKey.get(k) ?? [];
      if (r.median_price != null) arr.push({ month: r.period_month, median: r.median_price });
      historyByKey.set(k, arr.slice(-6));
    }
  }

  const MIN_USERS = minUsers();
  const MIN_ROWS = minRows();

  const items = yourPrices.map((yp) => {
    const bench = benchByKey.get(uid(yp.canonical_name, yp.unit));
    const base = {
      productName: yp.product_name,
      unit: yp.unit,
      category: bench?.category ?? null,
      yourPrice: yp.your_price,
      monthlyQuantity: yp.monthly_quantity,
    };
    if (!bench || !bench.is_published) {
      return {
        ...base,
        insufficientData: true,
        distinctUserCount: bench?.distinct_user_count ?? 0,
        minUsers: MIN_USERS,
        minRows: MIN_ROWS,
      };
    }
    const median = bench.median_price ?? 0;
    const deltaPercent = median > 0 ? ((yp.your_price - median) / median) * 100 : 0;
    const savingsPerMonth = yp.your_price > median ? (yp.your_price - median) * yp.monthly_quantity : 0;
    return {
      ...base,
      insufficientData: false,
      medianPrice: median,
      p25Price: bench.p25_price,
      p75Price: bench.p75_price,
      deltaPercent,
      distinctUserCount: bench.distinct_user_count,
      sampleRowCount: bench.sample_row_count,
      savingsPerMonth,
      history: historyByKey.get(uid(bench.market_group_key, bench.unit)) ?? [],
    };
  });

  const filtered = categoryFilter ? items.filter((i) => i.category === categoryFilter) : items;
  const published = items.filter(
    (i): i is typeof i & { deltaPercent: number; savingsPerMonth: number; distinctUserCount: number } => i.insufficientData === false,
  );
  const savingsPotentialTotal = published.reduce((sum, i) => sum + i.savingsPerMonth, 0);
  const avgDeltaPercent = published.length > 0 ? published.reduce((sum, i) => sum + i.deltaPercent, 0) / published.length : 0;
  const contributionCount = published.length > 0 ? Math.max(0, Math.max(...published.map((i) => i.distinctUserCount)) - 1) : 0;

  res.json({
    optedIn: true,
    items: filtered,
    summary: {
      savingsPotentialTotal,
      avgDeltaPercent,
      benchmarkedCount: published.length,
      totalCount: items.length,
      contributionCount,
    },
  });
});

function emptySummary() {
  return { savingsPotentialTotal: 0, avgDeltaPercent: 0, benchmarkedCount: 0, totalCount: 0, contributionCount: 0 };
}

// ─── PATCH /benchmarks/opt-in — przełącznik prywatności ────────────────────
// false = user nie jest ani źródłem (market-benchmark-job.ts WHERE), ani odbiorcą
// (guard w GET wyżej) danych benchmarku. Upsert jednowierszowy per user.
router.patch("/benchmarks/opt-in", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpdateBenchmarkOptInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .insert(userSettingsTable)
    .values({ userId, benchmarkOptIn: parsed.data.optedIn })
    .onConflictDoUpdate({
      target: userSettingsTable.userId,
      set: { benchmarkOptIn: parsed.data.optedIn, updatedAt: new Date() },
    });

  res.json({ optedIn: parsed.data.optedIn });
});

export default router;
