import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Idempotentne DDL tabeli email_log (wzorem ensureGoposTables).
// Uruchamiane na starcie serwera — prod tak zarządza schematem.
export async function ensureEmailLogTable(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_log (
        id         serial      PRIMARY KEY,
        user_id    text        NOT NULL,
        type       text        NOT NULL,
        sent_at    timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS email_log_user_type_uniq ON email_log (user_id, type)
    `);
    log.info("email_log: tabela gotowa");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić tabeli email_log");
    throw err;
  }
}
