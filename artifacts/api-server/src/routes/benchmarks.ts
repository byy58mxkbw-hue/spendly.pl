import { Router, type IRouter } from "express";
import { sql, type SQL } from "drizzle-orm";
import { db, userSettingsTable } from "@workspace/db";
import { DEFAULT_MIN_USERS, DEFAULT_MIN_ROWS, RANGE_WINDOW_MONTHS } from "../services/market-benchmark-job.js";
import { normalizedUnitSql } from "../lib/units.js";
import { EXCLUDED_BENCHMARK_CATEGORIES, FUZZY_SIMILARITY_THRESHOLD, MIN_FUZZY_LENGTH } from "../lib/market-product-matcher.js";
import { spendInvoicesFilter } from "../lib/invoice-line-classify.js";
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

  const invoiceIdRaw = typeof req.query.invoiceId === "string" ? Number(req.query.invoiceId) : NaN;
  const invoiceId = Number.isInteger(invoiceIdRaw) && invoiceIdRaw > 0 ? invoiceIdRaw : null;

  // Wspólne warunki „Twojej ceny”: tylko wydatki (bez excluded i bez KOR/ROZ — korekty
  // różnic cen i rozliczenia zaliczek to nie cena zakupu; spójnie z regułą 29),
  // produkty z nazwą kanoniczną, bez kategorii wyłączonych z benchmarku.
  const baseWhere = sql`
    i.user_id = ${userId}
    ${spendInvoicesFilter("i")}
    AND p.canonical_name IS NOT NULL
    AND (p.category IS NULL OR p.category NOT IN (${sql.join(EXCLUDED_BENCHMARK_CATEGORIES.map((c) => sql`${c}`), sql`, `)}))
  `;

  // Okres „Twojej ceny” (invoice_date to TEXT YYYY-MM-DD — porównania stringów, reguła 3):
  //  - invoice: tylko wskazana faktura (ekran po imporcie z podglądu XML), ilość = z faktury;
  //  - recent: ostatnie 3 miesiące, ilość miesięczna = suma / 3 (jak dotąd);
  //  - latestMonth: brak zakupów w 3 mies. → najnowszy miesiąc z zakupami (ktoś wgrał
  //    fakturę z lipca i dotąd widział „brak danych”), ilość = suma z tego miesiąca.
  let scope: "recent" | "latestMonth" | "invoice";
  let periodWhere: SQL;
  let quantityDivisor: number;
  let periodFrom: string | null;
  let periodTo: string | null;

  if (invoiceId != null) {
    const inv = await db.execute<{ invoice_date: string }>(sql`
      SELECT invoice_date FROM invoices WHERE id = ${invoiceId} AND user_id = ${userId} LIMIT 1
    `);
    const d = inv.rows[0]?.invoice_date;
    if (!d) {
      res.status(404).json({ error: "Nie znaleziono faktury." });
      return;
    }
    scope = "invoice";
    periodWhere = sql`AND i.id = ${invoiceId}`;
    quantityDivisor = 1;
    periodFrom = periodTo = d.slice(0, 7);
  } else {
    const range = await db.execute<{ last_date: string | null; cutoff: string; this_month: string }>(sql`
      SELECT MAX(i.invoice_date) AS last_date,
             to_char(current_date - interval '3 months', 'YYYY-MM-DD') AS cutoff,
             to_char(current_date, 'YYYY-MM') AS this_month
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN products p ON p.id = ii.product_id
      WHERE ${baseWhere}
    `);
    const { last_date: lastDate, cutoff, this_month: thisMonth } = range.rows[0] ?? { last_date: null, cutoff: "", this_month: "" };
    if (!lastDate) {
      res.json({ optedIn: true, items: [], summary: emptySummary(), scope: "recent", yourPricePeriodFrom: null, yourPricePeriodTo: null });
      return;
    }
    if (lastDate >= cutoff) {
      scope = "recent";
      periodWhere = sql`AND i.invoice_date >= ${cutoff}`;
      quantityDivisor = 3;
      periodFrom = cutoff.slice(0, 7);
      periodTo = thisMonth;
    } else {
      scope = "latestMonth";
      const month = lastDate.slice(0, 7);
      periodWhere = sql`AND SUBSTRING(i.invoice_date, 1, 7) = ${month}`;
      quantityDivisor = 1;
      periodFrom = periodTo = month;
    }
  }

  // Twoja cena per (canonical_name, unit znormalizowany — musi się zgadzać z tym, co
  // matcher zapisał w market_product_aliases) + ilość do potencjału oszczędności.
  const yourPricesResult = await db.execute<YourPriceRow>(sql`
    SELECT
      p.canonical_name,
      ${normalizedUnitSql(sql`p.unit`)} AS unit,
      MAX(p.name) AS product_name,
      AVG(ii.unit_price::numeric)::float AS your_price,
      (SUM(ii.quantity::numeric) / ${quantityDivisor})::float AS monthly_quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN products p ON p.id = ii.product_id
    WHERE ${baseWhere} ${periodWhere}
    GROUP BY p.canonical_name, ${normalizedUnitSql(sql`p.unit`)}
  `);
  const yourPrices = yourPricesResult.rows;
  const periodMeta = { scope, yourPricePeriodFrom: periodFrom, yourPricePeriodTo: periodTo };

  if (yourPrices.length === 0) {
    res.json({ optedIn: true, items: [], summary: emptySummary(), ...periodMeta });
    return;
  }

  // market_group_key dla każdego (canonical_name, unit) usera + NAJNOWSZY OPUBLIKOWANY
  // wiersz benchmarku dla tej grupy (is_published DESC przed period_month DESC — bieżący
  // miesiąc regularnie ma jeszcze mniej niż próg userów, więc branie zwyczajnie najnowszego
  // wiersza co miesiąc "gasiło" właśnie opublikowany poprzedni miesiąc, mimo że wciąż jest
  // aktualny i ważny; realny bug znaleziony po deployu — 15 dopasowań usera, 0 widocznych).
  // Tylko gdy DANA grupa nigdy się nie opublikowała, bierzemy najnowszy nieopublikowany
  // wiersz wyłącznie do komunikatu "za mało danych" (nigdy do mediany).
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
    ORDER BY mpa.canonical_name, mpa.unit, mpb.is_published DESC, mpb.period_month DESC
  `);
  const benchRows = benchResult.rows;
  const benchByKey = new Map<string, BenchmarkRow>();
  for (const r of benchRows) benchByKey.set(uid(r.canonical_name, r.unit), r);

  // Dopasowanie zapasowe w locie dla nazw bez aliasu: matcher liczy aliasy raz na dobę,
  // więc nowy user z „Cytryny luz” do jutra widziałby zero porównań. Ten sam próg
  // podobieństwa (pg_trgm) i minimalna długość co w market-product-matcher.ts, ta sama
  // jednostka, najlepsze trafienie. Bez AI. Operator `%` korzysta z indeksu GIN
  // (mpa_canonical_name_trgm_idx), similarity() >= próg dokłada właściwy filtr.
  const fuzzyKeys = new Set<string>();
  const unmatched = yourPrices.filter(
    (yp) => !benchByKey.has(uid(yp.canonical_name, yp.unit)) && yp.canonical_name.length >= MIN_FUZZY_LENGTH,
  );
  if (unmatched.length > 0) {
    const fuzzyResult = await db.execute<BenchmarkRow>(sql`
      SELECT DISTINCT ON (q.name, q.unit)
        q.name AS canonical_name,
        mpb.market_group_key, mpb.unit, mpb.category, mpb.period_month,
        mpb.median_price::float AS median_price, mpb.p25_price::float AS p25_price, mpb.p75_price::float AS p75_price,
        mpb.distinct_user_count, mpb.sample_row_count, mpb.is_published
      FROM (VALUES ${sql.join(unmatched.map((r) => sql`(${r.canonical_name}::text, ${r.unit}::text)`), sql`, `)}) AS q(name, unit)
      JOIN market_product_aliases mpa
        ON mpa.unit = q.unit
       AND mpa.canonical_name % q.name
       AND similarity(mpa.canonical_name, q.name) >= ${FUZZY_SIMILARITY_THRESHOLD}
      JOIN market_price_benchmarks mpb ON mpb.market_group_key = mpa.market_group_key AND mpb.unit = mpa.unit
      ORDER BY q.name, q.unit, similarity(mpa.canonical_name, q.name) DESC, mpb.is_published DESC, mpb.period_month DESC
    `);
    for (const r of fuzzyResult.rows) {
      const k = uid(r.canonical_name, r.unit);
      benchByKey.set(k, r);
      benchRows.push(r);
      fuzzyKeys.add(k);
    }
  }

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

  // Zapas: gdy grupa nie ma opublikowanej mediany MIESIĘCZNEJ, bierzemy medianę z okna
  // 12 mies. (market_price_ranges, te same progi k-anonimowości). Przy małej liczbie kont
  // to ona daje większość porównań. Front podpisuje taki wiersz „mediana z 12 mies.”.
  type RangeRow = { market_group_key: string; unit: string; median_price: number | null; p25_price: number | null; p75_price: number | null; distinct_user_count: number; sample_row_count: number; from_month: string; to_month: string };
  const rangeByKey = new Map<string, RangeRow>();
  const needRange = benchRows.filter((r) => !r.is_published);
  if (needRange.length > 0) {
    const rangeResult = await db.execute<RangeRow>(sql`
      SELECT market_group_key, unit, median_price::float AS median_price, p25_price::float AS p25_price, p75_price::float AS p75_price,
             distinct_user_count, sample_row_count, from_month, to_month
      FROM market_price_ranges
      WHERE is_published = true AND window_months = ${RANGE_WINDOW_MONTHS}
        AND (market_group_key, unit) IN (${sql.join(needRange.map((r) => sql`(${r.market_group_key}, ${r.unit})`), sql`, `)})
    `);
    for (const r of rangeResult.rows) rangeByKey.set(uid(r.market_group_key, r.unit), r);
  }

  const items = yourPrices.map((yp) => {
    const monthly = benchByKey.get(uid(yp.canonical_name, yp.unit));
    const range = monthly && !monthly.is_published ? rangeByKey.get(uid(monthly.market_group_key, monthly.unit)) : undefined;
    const bench = range && monthly
      ? { ...monthly, ...range, is_published: true, period_month: range.to_month }
      : monthly;
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
      matchedBy: fuzzyKeys.has(uid(yp.canonical_name, yp.unit)) ? ("fuzzy" as const) : ("alias" as const),
      medianWindow: range ? ("12m" as const) : ("month" as const),
      medianFromMonth: range ? range.from_month : bench.period_month,
      medianToMonth: range ? range.to_month : bench.period_month,
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
    ...periodMeta,
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
