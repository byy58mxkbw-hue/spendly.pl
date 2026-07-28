import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Idempotentne DDL tabel integracji POS (GoPOS): konfiguracja + sprzedaż per pozycja.
// Uruchamiane na starcie serwera (prod tak zarządza schematem — patrz ensureAiUsageTable).
export async function ensureGoposTables(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gopos_config (
        id            serial       PRIMARY KEY,
        user_id       text         NOT NULL,
        client_id     text         NOT NULL,
        encrypted_client_secret text NOT NULL,
        client_secret_last4     text NOT NULL DEFAULT '',
        location_id   text,
        base_url      text,
        last_synced_at timestamptz,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS gopos_config_user_uniq ON gopos_config (user_id)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pos_sales (
        id           serial        PRIMARY KEY,
        user_id      text          NOT NULL,
        period       text          NOT NULL,
        product_name text          NOT NULL,
        qty          numeric(12,3) NOT NULL DEFAULT 0,
        net_value    numeric(12,2) NOT NULL DEFAULT 0,
        source       text          NOT NULL DEFAULT 'gopos',
        updated_at   timestamptz   NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_user_period_product_uniq
        ON pos_sales (user_id, period, product_name)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS pos_sales_user_period_idx ON pos_sales (user_id, period)
    `);
    await db.execute(sql`ALTER TABLE IF EXISTS pos_sales ADD COLUMN IF NOT EXISTS pos_product_id text`);
    log.info("gopos_config + pos_sales: tabele gotowe");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić tabel GoPOS");
    throw err;
  }
}
