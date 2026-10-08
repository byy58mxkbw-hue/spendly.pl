import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { EXCLUDED_BENCHMARK_CATEGORIES } from "../lib/market-product-matcher.js";
import { RANGE_WINDOW_MONTHS } from "../services/market-benchmark-job.js";

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

/** Tylko dla testów: czyści cache między przypadkami. */
export function __resetPublicMarketCache(): void {
  cache = null;
}

export default router;
