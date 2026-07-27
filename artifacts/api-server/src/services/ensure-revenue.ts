import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Idempotentna migracja tabeli przychodów restauracji — uruchamiana na starcie
// serwera (prod tak zarządza schematem, patrz ensureAiUsageTable). Bezpieczna
// przy każdym boocie dzięki CREATE TABLE IF NOT EXISTS.
export async function ensureRevenueTable(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurant_revenue (
        id         serial      PRIMARY KEY,
        user_id    text        NOT NULL,
        period     text        NOT NULL,
        amount_net numeric(12,2) NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS restaurant_revenue_user_period_uniq
        ON restaurant_revenue (user_id, period)
    `);
    log.info("restaurant_revenue: tabela gotowa");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić tabeli restaurant_revenue");
    throw err;
  }
}
