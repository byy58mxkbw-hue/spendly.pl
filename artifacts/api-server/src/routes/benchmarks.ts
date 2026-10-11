import { Router, type IRouter } from "express";
import { sql, type SQL } from "drizzle-orm";
import { db, userSettingsTable, marketMatchFeedbackTable } from "@workspace/db";
import { R12 } from "../services/market-benchmark-job.js";
import { normalizedUnitSql } from "../lib/units.js";
import { EXCLUDED_BENCHMARK_CATEGORIES } from "../lib/market-product-matcher.js";
import { spendInvoicesFilter } from "../lib/invoice-line-classify.js";
import { UpdateBenchmarkOptInBody, SubmitBenchmarkFeedbackBody } from "@workspace/api-zod";
import { genericProduct, priceBasis, skipReason, type SkipReason } from "@workspace/category-rules";
import {
  medianMinOthers,
  medianMinKsef,
  spreadMinOthers,
  roundPublished,
  sourceBucket,
  contributionBucket,
} from "../lib/benchmark-thresholds.js";

const router: IRouter = Router();

const uid = (name: string, unit: string) => `${name}::${unit}`;
/** Powyżej tej krotności różnicy względem mediany uznajemy porównanie za błędne dopasowanie. */
const MAX_PRICE_RATIO = 2.5;
/** Przedział „wszystkie wielkości opakowań” w agregacji na żądanie. */
const ALL_TIERS = "*";

type MatchConfidence = "gtin" | "dictionary_pack" | "dictionary" | "exact_name";
const CONFIDENCE_RANK: Record<MatchConfidence, number> = { exact_name: 0, dictionary: 1, dictionary_pack: 2, gtin: 3 };

type YourPriceRow = {
  canonical_name: string;
  unit: string;
  product_name: string;
  product_id: number;
  value: number;
  quantity: number;
};

type AliasRow = {
  canonical_name: string;
  unit: string;
  market_group_key: string;
  compare_unit: string;
  price_factor: number;
  pack_tier: string;
  match_confidence: string;
  category: string | null;
};

type AggRow = {
  market_group_key: string;
  compare_unit: string;
  pack_tier: string;
  period_month: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
  n: number;
  nk: number;
};

// ─── GET /benchmarks — Twoje ceny na tle anonimowej mediany rynkowej ───────
//
// Spec benchmark v2 (2026-10-11), anonimowość:
//  - mediana i percentyle liczone NA ŻĄDANIE z market_user_prices z warunkiem
//    user_id <> oglądający (leave-one-out) — Twoja cena nigdy nie wchodzi do mediany,
//    którą widzisz, więc nie da się „odjąć siebie” i wyliczyć cen innych lokali;
//  - mediana dopiero przy ≥ 5 innych restauracjach (≥ 2 z KSeF), p25–p75 przy ≥ 8;
//  - ceny zaokrąglone do 10 gr, liczba restauracji tylko w przedziałach (sourceBucket);
//  - po stronie własnej normalnie WHERE user_id = ${userId}.
router.get("/benchmarks", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const categoryFilter = typeof req.query.category === "string" && req.query.category.trim() ? req.query.category.trim() : null;

  const settingsResult = await db.execute<{ benchmark_opt_in: boolean }>(sql`
    SELECT benchmark_opt_in FROM user_settings WHERE user_id = ${userId} LIMIT 1
  `);
  const optedIn = settingsResult.rows[0]?.benchmark_opt_in ?? true; // brak wiersza = domyślnie true
  if (!optedIn) {
    res.json({ optedIn: false, items: [], skipped: [], summary: null });
    return;
  }

  const invoiceIdRaw = typeof req.query.invoiceId === "string" ? Number(req.query.invoiceId) : NaN;
  const invoiceId = Number.isInteger(invoiceIdRaw) && invoiceIdRaw > 0 ? invoiceIdRaw : null;

  // Wspólne warunki „Twojej ceny”: tylko wydatki (bez excluded i bez KOR/ROZ — reguła 29),
  // produkty z nazwą kanoniczną, bez kategorii wyłączonych z benchmarku, dodatnia cena i ilość.
  const baseWhere = sql`
    i.user_id = ${userId}
    ${spendInvoicesFilter("i")}
    AND p.canonical_name IS NOT NULL
    AND (p.category IS NULL OR p.category NOT IN (${sql.join(EXCLUDED_BENCHMARK_CATEGORIES.map((c) => sql`${c}`), sql`, `)}))
    AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
  `;

  // Okres „Twojej ceny” (invoice_date to TEXT YYYY-MM-DD — porównania stringów, reguła 3):
  //  - invoice: tylko wskazana faktura (ekran po imporcie z podglądu XML);
  //  - recent: ostatnie 3 miesiące, ilość miesięczna = suma / 3;
  //  - latestMonth: brak zakupów w 3 mies. → najnowszy miesiąc z zakupami.
  let scope: "recent" | "latestMonth" | "invoice";
  let periodWhere: SQL;
  let quantityDivisor: number;
  let periodFrom: string | null;
  let periodTo: string | null;

  const months = await db.execute<{ this_month: string; prev_month: string; cutoff: string }>(sql`
    SELECT to_char(current_date, 'YYYY-MM') AS this_month,
           to_char(current_date - interval '1 month', 'YYYY-MM') AS prev_month,
           to_char(current_date - interval '3 months', 'YYYY-MM-DD') AS cutoff
  `);
  const { this_month: thisMonth, prev_month: prevMonth, cutoff } = months.rows[0]!;

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
    const range = await db.execute<{ last_date: string | null }>(sql`
      SELECT MAX(i.invoice_date) AS last_date
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN products p ON p.id = ii.product_id
      WHERE ${baseWhere}
    `);
    const lastDate = range.rows[0]?.last_date ?? null;
    if (!lastDate) {
      res.json({ optedIn: true, items: [], skipped: [], summary: emptySummary(), scope: "recent", yourPricePeriodFrom: null, yourPricePeriodTo: null });
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

  // Wartość i ilość per (canonical_name, jednostka) — cena = średnia WAŻONA ilością.
  const yourPricesResult = await db.execute<YourPriceRow>(sql`
    SELECT
      p.canonical_name,
      ${normalizedUnitSql(sql`p.unit`)} AS unit,
      MAX(p.name) AS product_name,
      MAX(p.id)::int AS product_id,
      SUM(ii.unit_price::numeric * ii.quantity::numeric)::float AS value,
      SUM(ii.quantity::numeric)::float AS quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    JOIN products p ON p.id = ii.product_id
    WHERE ${baseWhere} ${periodWhere}
    GROUP BY p.canonical_name, ${normalizedUnitSql(sql`p.unit`)}
  `);
  const periodMeta = { scope, yourPricePeriodFrom: periodFrom, yourPricePeriodTo: periodTo };

  // „To nie ten produkt” (etap 4): zgłoszone przez TEGO usera warianty znikają od razu.
  const feedbackRows = await db.execute<{ canonical_name: string; unit: string }>(sql`
    SELECT canonical_name, unit FROM market_match_feedback WHERE user_id = ${userId}
  `);
  const reported = new Set(feedbackRows.rows.map((r) => uid(r.canonical_name, r.unit)));
  const yourPrices = yourPricesResult.rows.filter((r) => !reported.has(uid(r.canonical_name, r.unit)) && r.quantity > 0);

  if (yourPrices.length === 0) {
    res.json({ optedIn: true, items: [], skipped: [], summary: emptySummary(), ...periodMeta });
    return;
  }

  // Karta każdego wariantu: alias z matchera (grupa, jednostka porównania, mnożnik, przedział,
  // pewność), a dla nazw bez aliasu (matcher liczy raz na dobę) ta sama karta w locie ze słownika.
  const aliasResult = await db.execute<AliasRow>(sql`
    SELECT canonical_name, unit, market_group_key, COALESCE(compare_unit, unit) AS compare_unit,
           price_factor::float AS price_factor, COALESCE(pack_tier, 'szt') AS pack_tier,
           COALESCE(match_confidence, 'exact_name') AS match_confidence, category
    FROM market_product_aliases
    WHERE (canonical_name, unit) IN (${sql.join(yourPrices.map((r) => sql`(${r.canonical_name}, ${r.unit})`), sql`, `)})
  `);
  const aliasByKey = new Map(aliasResult.rows.map((a) => [uid(a.canonical_name, a.unit), a]));

  type Card = { group: string; label: string | null; compareUnit: string; factor: number; tier: string; confidence: MatchConfidence; category: string | null };
  const cardOf = (yp: YourPriceRow): Card | null => {
    const a = aliasByKey.get(uid(yp.canonical_name, yp.unit));
    if (a) {
      const confidence = a.match_confidence as MatchConfidence;
      return {
        group: a.market_group_key,
        label: confidence === "exact_name" ? null : a.market_group_key,
        compareUnit: a.compare_unit,
        factor: a.price_factor,
        tier: a.pack_tier,
        confidence,
        category: a.category,
      };
    }
    const g = genericProduct(yp.canonical_name);
    if (!g) return null;
    const b = priceBasis(yp.canonical_name, yp.unit);
    const group = b.packKey ? `${g.label} · ${b.packKey}` : g.label;
    return {
      group,
      label: group,
      compareUnit: b.compareUnit,
      factor: b.factor,
      tier: b.packTier,
      confidence: b.compareUnit !== yp.unit ? "dictionary_pack" : "dictionary",
      category: null,
    };
  };

  // Pozycje z tej samej grupy rynkowej i przedziału opakowania łączymy w jedną kartę
  // („Ogórki małosolne luz polski” + „OGÓRKI MAŁOSOLNE LUZ”).
  type Merged = {
    key: string;
    card: Card | null;
    variants: YourPriceRow[];
    value: number;
    compareQty: number;
  };
  const merged = new Map<string, Merged>();
  for (const yp of yourPrices) {
    const card = cardOf(yp);
    const factor = card?.factor && card.factor > 0 ? card.factor : 1;
    const key = card ? `${card.group}::${card.compareUnit}::${card.tier}` : `own::${uid(yp.canonical_name, yp.unit)}`;
    const m = merged.get(key) ?? { key, card, variants: [], value: 0, compareQty: 0 };
    m.variants.push(yp);
    m.value += yp.value;
    m.compareQty += yp.quantity / factor;
    // Najmocniejsza pewność z łączonych wariantów.
    if (card && m.card && CONFIDENCE_RANK[card.confidence] > CONFIDENCE_RANK[m.card.confidence]) m.card = { ...m.card, confidence: card.confidence };
    merged.set(key, m);
  }

  // Mediany na żądanie — BEZ oglądającego. Okresy: bieżący miesiąc, poprzedni, ostatnie 12 mies.
  // Przedziały: własny przedział opakowania i „wszystkie przedziały” ('*', jedna cena na lokal).
  const groupPairs = [...new Set([...merged.values()].filter((m) => m.card).map((m) => uid(m.card!.group, m.card!.compareUnit)))]
    .map((p) => p.split("::") as [string, string]);
  const aggByKey = new Map<string, AggRow>();
  let contributionOthers = 0;
  if (groupPairs.length > 0) {
    const pairsSql = sql.join(groupPairs.map(([g, u]) => sql`(${g}, ${u})`), sql`, `);
    const agg = await db.execute<AggRow>(sql`
      WITH t AS (
        SELECT market_group_key, compare_unit, pack_tier, period_month, user_id,
               price_per_unit::numeric AS price, quantity::numeric AS quantity, has_ksef
        FROM market_user_prices
        WHERE user_id <> ${userId}
          AND period_month IN (${thisMonth}, ${prevMonth}, ${R12})
          AND (market_group_key, compare_unit) IN (${pairsSql})
      ),
      a AS (
        SELECT market_group_key, compare_unit, ${ALL_TIERS}::text AS pack_tier, period_month, user_id,
               SUM(price * quantity) / NULLIF(SUM(quantity), 0) AS price, bool_or(has_ksef) AS has_ksef
        FROM t GROUP BY 1, 2, 4, 5
      ),
      u AS (
        SELECT market_group_key, compare_unit, pack_tier, period_month, user_id, price, has_ksef FROM t
        UNION ALL
        SELECT market_group_key, compare_unit, pack_tier, period_month, user_id, price, has_ksef FROM a
      )
      SELECT market_group_key, compare_unit, pack_tier, period_month,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::float AS median,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY price)::float AS p25,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY price)::float AS p75,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE has_ksef)::int AS nk
      FROM u
      GROUP BY 1, 2, 3, 4
    `);
    for (const r of agg.rows) aggByKey.set(`${r.market_group_key}::${r.compare_unit}::${r.pack_tier}::${r.period_month}`, r);

    // Ile innych restauracji korzysta z Twoich cen (kupuje te same produkty) — tylko przedział.
    const contrib = await db.execute<{ n: number }>(sql`
      SELECT COUNT(DISTINCT user_id)::int AS n FROM market_user_prices
      WHERE user_id <> ${userId} AND period_month = ${R12} AND (market_group_key, compare_unit) IN (${pairsSql})
    `);
    contributionOthers = contrib.rows[0]?.n ?? 0;
  }

  const MIN_OTHERS = medianMinOthers();
  const MIN_KSEF = medianMinKsef();
  const SPREAD_MIN = spreadMinOthers();
  const qualifies = (a: AggRow | undefined): a is AggRow => !!a && a.n >= MIN_OTHERS && a.nk >= MIN_KSEF && a.median != null;
  const periods = [thisMonth, prevMonth, R12];

  const skipped: Array<{ name: string; reason: SkipReason }> = [];
  const items = [];
  for (const m of merged.values()) {
    const first = m.variants[0]!;
    const yourPrice = m.compareQty > 0 ? m.value / m.compareQty : 0;
    const monthlyQuantity = m.compareQty / quantityDivisor;
    const card = m.card;
    // Przeliczenie pokazujemy tylko, gdy wszystkie łączone pozycje mają ten sam mnożnik.
    const sameFactor = m.variants.every((v) => (aliasByKey.get(uid(v.canonical_name, v.unit))?.price_factor ?? cardOf(v)?.factor ?? 1) === (card?.factor ?? 1));
    const base = {
      productId: first.product_id,
      productName: first.product_name,
      invoiceNames: m.variants.length > 1 ? m.variants.map((v) => v.product_name) : undefined,
      variants: m.variants.map((v) => ({ canonicalName: v.canonical_name, unit: v.unit })),
      marketLabel: card?.label ?? null,
      unit: card?.compareUnit ?? first.unit,
      invoiceUnit: first.unit,
      invoiceUnitPrice: sameFactor && first.quantity > 0 ? first.value / first.quantity : null,
      priceFactor: sameFactor ? (card?.factor ?? 1) : null,
      packTier: card?.tier ?? null,
      matchConfidence: card?.confidence ?? null,
      category: card?.category ?? null,
      yourPrice,
      monthlyQuantity,
      minUsers: MIN_OTHERS,
    };
    const reason = m.variants.map((v) => skipReason(v.canonical_name)).find((r) => r != null) ?? null;

    let chosen: { agg: AggRow; tierFallback: boolean; period: string } | null = null;
    if (card) {
      outer: for (const tier of [card.tier, ALL_TIERS]) {
        for (const p of periods) {
          const a = aggByKey.get(`${card.group}::${card.compareUnit}::${tier}::${p}`);
          if (qualifies(a)) {
            chosen = { agg: a, tierFallback: tier === ALL_TIERS && card.tier !== ALL_TIERS, period: p };
            break outer;
          }
        }
      }
    }

    if (!chosen || !card) {
      // Przypomina produkt ze słownika, ale odpadł przez wykluczenie (danie, przetwór, mrożonka…)
      // i nie ma z czym go porównać — lista „Pominięte w porównaniu”, nie karta „za mało danych”.
      if (reason) {
        skipped.push({ name: first.product_name, reason });
        continue;
      }
      items.push({ ...base, insufficientData: true, notComparableReason: "insufficient_data" as const });
      continue;
    }

    const median = roundPublished(chosen.agg.median)!;
    // Bezpiecznik: cena 2,5× od mediany tego samego produktu to prawie zawsze inna rzecz
    // (karton zamiast sztuki) — bez „+1400%” i fikcyjnej oszczędności.
    if (median > 0 && (yourPrice > median * MAX_PRICE_RATIO || yourPrice < median / MAX_PRICE_RATIO)) {
      items.push({ ...base, insufficientData: true, notComparableReason: "price_outlier" as const });
      continue;
    }
    const spread = chosen.agg.n >= SPREAD_MIN;
    const deltaPercent = median > 0 ? ((yourPrice - median) / median) * 100 : 0;
    const savingsPerMonth = yourPrice > median ? (yourPrice - median) * monthlyQuantity : 0;

    // Większe opakowania tańsze o ≥ 10% (cukier 1 kg vs worki 25 kg).
    let largerPackMedian: number | null = null;
    if (!chosen.tierFallback && (card.tier === "S" || card.tier === "M" || card.tier === "luz")) {
      const big = [chosen.period, R12].map((p) => aggByKey.get(`${card.group}::${card.compareUnit}::L::${p}`)).find(qualifies);
      const bigMedian = big ? roundPublished(big.median) : null;
      if (bigMedian != null && bigMedian <= median * 0.9) largerPackMedian = bigMedian;
    }

    items.push({
      ...base,
      insufficientData: false,
      medianPrice: median,
      p25Price: spread ? roundPublished(chosen.agg.p25) : null,
      p75Price: spread ? roundPublished(chosen.agg.p75) : null,
      deltaPercent,
      savingsPerMonth,
      sourceBucket: sourceBucket(chosen.agg.n),
      medianPeriod: chosen.period,
      periodFallback: chosen.period === R12 ? ("R12" as const) : null,
      tierFallback: chosen.tierFallback,
      largerPackMedian,
      // Zgodność wsteczna (podgląd faktury po imporcie): okno mediany i sposób dopasowania.
      medianWindow: chosen.period === R12 ? ("12m" as const) : ("month" as const),
      matchedBy: aliasByKey.has(uid(first.canonical_name, first.unit)) ? ("alias" as const) : ("fuzzy" as const),
    });
  }

  const filtered = categoryFilter ? items.filter((i) => i.category === categoryFilter) : items;
  type Priced = (typeof items)[number] & { deltaPercent: number; savingsPerMonth: number; tierFallback: boolean };
  const published = items.filter((i): i is Priced => i.insufficientData === false);
  // Potencjał oszczędności tylko z pewnych dopasowań i tej samej wielkości opakowań.
  const savingsPotentialTotal = published
    .filter((i) => i.matchConfidence != null && i.matchConfidence !== "exact_name" && !i.tierFallback)
    .reduce((sum, i) => sum + i.savingsPerMonth, 0);
  // Względem mediany: średnia ważona wartością zakupów, nie zwykła.
  const weight = (i: Priced) => i.yourPrice * i.monthlyQuantity;
  const totalWeight = published.reduce((s, i) => s + weight(i), 0);
  const avgDeltaPercent = totalWeight > 0 ? published.reduce((s, i) => s + i.deltaPercent * weight(i), 0) / totalWeight : 0;
  const computed = await db.execute<{ at: string | null }>(sql`SELECT max(computed_at)::text AS at FROM market_user_prices`);

  res.json({
    optedIn: true,
    items: filtered,
    skipped,
    ...periodMeta,
    summary: {
      savingsPotentialTotal,
      avgDeltaPercent,
      benchmarkedCount: published.length,
      totalCount: items.length,
      skippedCount: skipped.length,
      contributionBucket: contributionBucket(contributionOthers),
      computedAt: computed.rows[0]?.at ? new Date(computed.rows[0].at).toISOString() : null,
    },
  });
});

function emptySummary() {
  return { savingsPotentialTotal: 0, avgDeltaPercent: 0, benchmarkedCount: 0, totalCount: 0, skippedCount: 0, contributionBucket: "<5" as const, computedAt: null };
}

// ─── POST /benchmarks/feedback — „To nie ten produkt” ───────────────────────
// Natychmiast: pozycja znika z porównania TEGO usera (filtr w GET wyżej). Globalnie: gdy
// ≥ 2 różne restauracje zgłoszą ten sam wariant, matcher wyłącza go z grupy, a admin może
// to potwierdzić albo cofnąć (routes/admin.ts). Zgłaszać można tylko własne pozycje.
router.post("/benchmarks/feedback", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = SubmitBenchmarkFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { variants, reason, marketGroupKey } = parsed.data;
  // Tylko warianty, które ten user faktycznie kupuje — nikt nie „wyłączy” cudzego produktu.
  const own = await db.execute<{ canonical_name: string; unit: string }>(sql`
    SELECT DISTINCT canonical_name, ${normalizedUnitSql(sql`unit`)} AS unit
    FROM products
    WHERE user_id = ${userId}
      AND (canonical_name, ${normalizedUnitSql(sql`unit`)}) IN (${sql.join(variants.map((v) => sql`(${v.canonicalName}, ${v.unit})`), sql`, `)})
  `);
  if (own.rows.length === 0) {
    res.status(404).json({ error: "Nie znaleziono tej pozycji wśród Twoich produktów." });
    return;
  }
  for (const v of own.rows) {
    await db
      .insert(marketMatchFeedbackTable)
      .values({ userId, canonicalName: v.canonical_name, unit: v.unit, marketGroupKey: marketGroupKey ?? null, reason })
      .onConflictDoUpdate({
        target: [marketMatchFeedbackTable.userId, marketMatchFeedbackTable.canonicalName, marketMatchFeedbackTable.unit],
        set: { reason, marketGroupKey: marketGroupKey ?? null, createdAt: new Date() },
      });
  }
  res.json({ ok: true });
});

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
