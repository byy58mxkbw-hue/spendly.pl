import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Idempotentna migracja tabeli miesięcznego zużycia AI — uruchamiana na starcie
// serwera (prod tak zarządza schematem, patrz ensureAutoSyncColumns). Bezpieczna
// przy każdym boocie dzięki CREATE TABLE IF NOT EXISTS.
export async function ensureAiUsageTable(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_usage (
        user_id    text        NOT NULL,
        period     text        NOT NULL,
        count      integer     NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, period)
      )
    `);
    log.info("ai_usage: tabela gotowa");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić tabeli ai_usage");
    throw err;
  }
}
