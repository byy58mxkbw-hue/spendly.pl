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
    log.info("benchmark rynkowy: pg_trgm + indeks GIN gotowe");
  } catch (err) {
    log.error({ err: String(err) }, "benchmark rynkowy: nie udało się zapewnić pg_trgm/indeksu");
  }
}
