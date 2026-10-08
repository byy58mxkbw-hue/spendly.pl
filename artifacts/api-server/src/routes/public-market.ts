import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { EXCLUDED_BENCHMARK_CATEGORIES } from "../lib/market-product-matcher.js";
import { RANGE_WINDOW_MONTHS } from "../services/market-benchmark-job.js";
import { genericProduct, groupOf, type GenericProductGroup } from "@workspace/category-rules";

const router: IRouter = Router();

type GroupRow = { name: string; unit: string; category: string | null; period_month: string };
type Payload = { groups: Array<{ name: string; unit: string; category: string | null }>; count: number; latestMonth: string | null };

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; payload: Payload } | null = null;

/**
 * PUBLICZNA (bez logowania) lista produktów, które mają OPUBLIKOWANĄ medianę rynku —
 * do licznika „X z Y Twoich produktów da się porównać” w podglądzie faktury KSeF
 * (dopasowanie nazw robi przeglądarka). Celowo BEZ cen, bez liczby źródeł/restauracji
 * i bez nieopublikowanych grup: nic, z czego dałoby się odtworzyć dane konkretnego
 * lokalu. Cache 1 h w pamięci + nagłówek, osobny limit zapytań w app.ts.
 */
router.get("/public/market-groups", async (_req, res): Promise<void> => {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    // Opublikowane mediany miesięczne ORAZ z okna 12 mies. (market_price_ranges) — druga
    // daje dużo więcej produktów przy małej liczbie kont. Dedup po (nazwa, jednostka).
    const excluded = sql.join(EXCLUDED_BENCHMARK_CATEGORIES.map((c) => sql`${c}`), sql`, `);
    const result = await db.execute<GroupRow>(sql`
      SELECT market_group_key AS name, unit, category, period_month
      FROM market_price_benchmarks
      WHERE is_published = true AND (category IS NULL OR category NOT IN (${excluded}))
      UNION ALL
      SELECT market_group_key AS name, unit, category, to_month AS period_month
      FROM market_price_ranges
      WHERE is_published = true AND window_months = ${RANGE_WINDOW_MONTHS} AND (category IS NULL OR category NOT IN (${excluded}))
    `);
    const byKey = new Map<string, GroupRow>();
    for (const r of result.rows) {
      const k = `${r.name}::${r.unit}`;
      const prev = byKey.get(k);
      if (!prev || r.period_month > prev.period_month) byKey.set(k, r);
    }
    const rows = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
    cache = {
      at: Date.now(),
      payload: {
        groups: rows.map((r) => ({ name: r.name, unit: r.unit, category: r.category })),
        count: rows.length,
        latestMonth: rows.reduce<string | null>((m, r) => (m == null || r.period_month > m ? r.period_month : m), null),
      },
    };
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(cache.payload);
});

type PriceRow = {
  name: string; unit: string; median: number | null; p25: number | null; p75: number | null;
  from_month: string; to_month: string; src: "12m" | "month";
};
type PricesPayload = {
  items: Array<{ name: string; unit: string; group: GenericProductGroup; median: number; p25: number | null; p75: number | null; window: "12m" | "month"; fromMonth: string; toMonth: string }>;
  updatedAt: string;
};
let pricesCache: { at: number; payload: PricesPayload } | null = null;

const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

/**
 * PUBLICZNE ceny rynkowe (decyzja usera 2026-10-08, wariant „dokładna mediana i widełki”):
 * mediana + środkowa połowa cen NETTO dla produktów bazowych ze słownika („Cytryna”, „Schab”).
 * Tylko opublikowane grupy (próg k: kilka restauracji z KSeF), BEZ liczby restauracji/
 * dostawców i bez surowych nazw z faktur. Preferujemy medianę z 12 mies. (więcej danych),
 * a miesięczną bierzemy, gdy 12-miesięcznej nie ma. Cache 1 h, limit jak /public.
 */
router.get("/public/market-prices", async (_req, res): Promise<void> => {
  if (!pricesCache || Date.now() - pricesCache.at > TTL_MS) {
    const excluded = sql.join(EXCLUDED_BENCHMARK_CATEGORIES.map((c) => sql`${c}`), sql`, `);
    const result = await db.execute<PriceRow>(sql`
      SELECT market_group_key AS name, unit, median_price::float AS median, p25_price::float AS p25, p75_price::float AS p75,
             from_month, to_month, '12m' AS src
      FROM market_price_ranges
      WHERE is_published = true AND window_months = ${RANGE_WINDOW_MONTHS} AND (category IS NULL OR category NOT IN (${excluded}))
      UNION ALL
      (SELECT DISTINCT ON (market_group_key, unit)
              market_group_key AS name, unit, median_price::float, p25_price::float, p75_price::float,
              period_month AS from_month, period_month AS to_month, 'month' AS src
       FROM market_price_benchmarks
       WHERE is_published = true AND (category IS NULL OR category NOT IN (${excluded}))
       ORDER BY market_group_key, unit, period_month DESC)
    `);
    const best = new Map<string, PriceRow>();
    for (const r of result.rows) {
      // Tylko czyste nazwy bazowe ze słownika — surowe nazwy z faktur nie idą publicznie.
      const g = genericProduct(r.name);
      if (!g || g.label !== r.name || r.median == null) continue;
      // Publicznie tylko jednostki jednoznaczne (kg, l). „szt”/„opak” na fakturach hurtowni to
      // często karton/worek/skrzynka („Cytryna 23,99 zł/szt” = skrzynka) — jako „za sztukę”
      // wprowadzałoby w błąd. Zalogowani porównują i tak we własnej jednostce (routes/benchmarks.ts).
      if (r.unit !== "kg" && r.unit !== "l") continue;
      const k = `${r.name}::${r.unit}`;
      const prev = best.get(k);
      if (!prev || (prev.src === "month" && r.src === "12m")) best.set(k, r);
    }
    const items = [...best.values()]
      .map((r) => ({
        name: r.name, unit: r.unit, group: groupOf(r.name), median: r2(r.median)!, p25: r2(r.p25), p75: r2(r.p75),
        window: r.src, fromMonth: r.from_month, toMonth: r.to_month,
      }))
      .sort((a, b) => a.group.localeCompare(b.group, "pl") || a.name.localeCompare(b.name, "pl") || a.unit.localeCompare(b.unit));
    pricesCache = { at: Date.now(), payload: { items, updatedAt: new Date().toISOString() } };
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(pricesCache.payload);
});

/** Tylko dla testów: czyści cache między przypadkami. */
export function __resetPublicMarketCache(): void {
  cache = null;
  pricesCache = null;
}

export default router;
