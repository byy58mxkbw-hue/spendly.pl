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
