import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * DDL wymagane przez benchmark rynkowy, poza tym co ogarnia `drizzle-kit push`
 * (rozszerzenie Postgresa + indeks GIN nie są kolumnami tabeli, więc push ich
 * nie tworzy) — idempotentne, uruchamiane na starcie serwera, jak inne `ensure-*`.
 *
 * pg_trgm = dopasowanie rozmyte nazw produktów w market-product-matcher.ts
 * (literówki/liczba mnoga/OCR), zero kosztu AI, liczone raz dziennie w batchu.
 */
export async function ensureMarketBenchmarkExtensions(log: Logger): Promise<void> {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS products_canonical_name_trgm_idx
      ON products USING gin (canonical_name gin_trgm_ops)
    `);
    // Mediana z okna kroczącego (np. 12 mies.) — patrz lib/db schema market-price-ranges.ts.
    // Tworzona tutaj (deploy nie robi drizzle push), PRZED startem harmonogramu joba.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_price_ranges (
        id serial PRIMARY KEY,
        market_group_key text NOT NULL,
        unit text NOT NULL,
        category text,
        window_months integer NOT NULL,
        from_month text NOT NULL,
        to_month text NOT NULL,
        median_price numeric(12,4),
        p25_price numeric(12,4),
        p75_price numeric(12,4),
        distinct_user_count integer NOT NULL,
        verified_user_count integer NOT NULL,
        sample_row_count integer NOT NULL,
        is_published boolean NOT NULL DEFAULT false,
        computed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS mpr_key_uniq ON market_price_ranges (market_group_key, unit, window_months)
    `);
    // Dopasowanie w locie w GET /benchmarks dla nazw bez aliasu (operator `%`).
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS mpa_canonical_name_trgm_idx
      ON market_product_aliases USING gin (canonical_name gin_trgm_ops)
    `);
    log.info("benchmark rynkowy: pg_trgm + indeks GIN gotowe");
  } catch (err) {
    log.error({ err: String(err) }, "benchmark rynkowy: nie udało się zapewnić pg_trgm/indeksu");
  }
}
