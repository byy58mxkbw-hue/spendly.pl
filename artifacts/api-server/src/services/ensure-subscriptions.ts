import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Idempotentne DDL tabel subscriptions + payments (wzorem ensureEmailLogTable).
// Uruchamiane na starcie serwera. Faza A: trial 30 dni bez płatności (payments
// zostaje pusta); Faza B (Tpay) reużyje tego samego schematu.
export async function ensureSubscriptionsTables(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id                     serial      PRIMARY KEY,
        user_id                text        NOT NULL,
        provider               text        NOT NULL DEFAULT 'none',
        provider_customer_ref  text,
        recurring_token_enc    text,
        plan                   text        NOT NULL DEFAULT 'pro',
        billing_cycle          text,
        status                 text        NOT NULL DEFAULT 'trialing',
        trial_ends_at          timestamptz,
        current_period_end     timestamptz,
        next_charge_at         timestamptz,
        last_charge_status     text,
        failed_charges         integer     NOT NULL DEFAULT 0,
        cancel_at_period_end   boolean     NOT NULL DEFAULT false,
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_uniq ON subscriptions (user_id)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payments (
        id               serial        PRIMARY KEY,
        user_id          text          NOT NULL,
        subscription_id  integer,
        provider         text          NOT NULL,
        provider_tx_id   text,
        amount           numeric(10,2) NOT NULL,
        currency         text          NOT NULL DEFAULT 'PLN',
        status           text          NOT NULL,
        invoice_number   text,
        created_at       timestamptz   NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_tx_id_uniq ON payments (provider, provider_tx_id)
    `);
    log.info("subscriptions + payments: tabele gotowe");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić tabel subscriptions/payments");
    throw err;
  }
}
