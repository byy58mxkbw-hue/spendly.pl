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
