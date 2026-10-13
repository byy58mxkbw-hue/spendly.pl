import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Kolumna invoices.source ('ksef_sync' | 'manual' | 'viewer') — idempotentne DDL przy
 * starcie, jak inne ensure-*. Backfill TYLKO w chwili dodania kolumny: faktury z
 * ksef_number pochodzą z synchronizacji KSeF (import ręczny nigdy nie zapisuje
 * ksef_number), reszta zostaje 'manual'. Jednorazowość ma znaczenie — przy każdym
 * starcie nadpisywalibyśmy ręcznie ustawione wartości.
 */
/**
 * Kolumny, które Drizzle wymienia w zapytaniach od razu po deployu, więc muszą istnieć
 * przed app.listen (patrz index.ts). Idempotentne.
 */
export async function ensurePreListenColumns(log: Logger): Promise<void> {
  await ensureInvoiceSourceColumn(log);
  // Powitanie po założeniu konta — flaga per konto (2026-10-07).
  await db.execute(sql`ALTER TABLE IF EXISTS user_settings ADD COLUMN IF NOT EXISTS welcome_seen_at timestamptz`);
  // Normalizacja cen rynku (2026-10-11): GTIN z KSeF + cena za kg/l w aliasach benchmarku.
  await db.execute(sql`ALTER TABLE IF EXISTS invoice_items ADD COLUMN IF NOT EXISTS gtin text`);
  await db.execute(sql`ALTER TABLE IF EXISTS market_product_aliases ADD COLUMN IF NOT EXISTS compare_unit text`);
  await db.execute(sql`ALTER TABLE IF EXISTS market_product_aliases ADD COLUMN IF NOT EXISTS price_factor double precision NOT NULL DEFAULT 1`);
  // Benchmark v2: przedział opakowania, pewność dopasowania, ceny per lokal (leave-one-out), zgłoszenia.
  await db.execute(sql`ALTER TABLE IF EXISTS market_product_aliases ADD COLUMN IF NOT EXISTS pack_tier text`);
  await db.execute(sql`ALTER TABLE IF EXISTS market_product_aliases ADD COLUMN IF NOT EXISTS match_confidence text`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_user_prices (
      id serial PRIMARY KEY,
      market_group_key text NOT NULL,
      compare_unit text NOT NULL,
      pack_tier text NOT NULL,
      period_month text NOT NULL,
      user_id text NOT NULL,
      price_per_unit numeric(14,4) NOT NULL,
      quantity numeric(16,4) NOT NULL,
      has_ksef boolean NOT NULL,
      category text,
      computed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS mup_key_uniq ON market_user_prices (market_group_key, compare_unit, pack_tier, period_month, user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS mup_group_idx ON market_user_prices (market_group_key, compare_unit, pack_tier, period_month)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_match_feedback (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      canonical_name text NOT NULL,
      unit text NOT NULL,
      market_group_key text,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS mmf_user_variant_uniq ON market_match_feedback (user_id, canonical_name, unit)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS mmf_variant_idx ON market_match_feedback (canonical_name, unit)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS market_match_review (
      id serial PRIMARY KEY,
      canonical_name text NOT NULL,
      unit text NOT NULL,
      decision text NOT NULL,
      decided_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS mmr_variant_uniq ON market_match_review (canonical_name, unit)`);
  // Dokumenty WZ przypięte do faktur (numer + pozycje z OCR).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invoice_wz_documents (
      id serial PRIMARY KEY,
      user_id text NOT NULL,
      invoice_id integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      wz_number text NOT NULL,
      wz_date text,
      items jsonb NOT NULL,
      page_count integer NOT NULL DEFAULT 1,
      scanned_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS iwz_invoice_number_uniq ON invoice_wz_documents (invoice_id, wz_number)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS iwz_user_idx ON invoice_wz_documents (user_id)`);
  await db.execute(sql`ALTER TABLE IF EXISTS invoices ADD COLUMN IF NOT EXISTS wz_mismatches integer`);
}

export async function ensureInvoiceSourceColumn(log: Logger): Promise<void> {
  const existing = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'source'
    ) AS exists
  `);
  if (existing.rows[0]?.exists) return;

  await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`);
  const backfill = await db.execute(sql`
    UPDATE invoices SET source = 'ksef_sync' WHERE ksef_number IS NOT NULL AND source = 'manual'
  `);
  log.info({ ksefSync: backfill.rowCount ?? 0 }, "invoices.source: kolumna dodana, backfill ksef_sync zrobiony");
}
