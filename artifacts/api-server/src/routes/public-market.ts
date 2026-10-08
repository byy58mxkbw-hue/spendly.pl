import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { EXCLUDED_BENCHMARK_CATEGORIES } from "../lib/market-product-matcher.js";

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
    const result = await db.execute<GroupRow>(sql`
      SELECT DISTINCT ON (market_group_key, unit)
        market_group_key AS name, unit, category, period_month
      FROM market_price_benchmarks
      WHERE is_published = true
        AND (category IS NULL OR category NOT IN (${sql.join(EXCLUDED_BENCHMARK_CATEGORIES.map((c) => sql`${c}`), sql`, `)}))
      ORDER BY market_group_key, unit, period_month DESC
    `);
    const rows = result.rows;
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
