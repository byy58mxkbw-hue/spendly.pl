import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { runAutoSyncForUser } from "../routes/ksef";

// Idempotentna migracja kolumn auto-sync — uruchamiana na starcie serwera.
// Postgres wspiera ADD COLUMN IF NOT EXISTS, więc bezpieczne przy każdym boocie.
export async function ensureAutoSyncColumns(log: Logger): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE ksef_config
        ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS auto_sync_interval_hours integer NOT NULL DEFAULT 12,
        ADD COLUMN IF NOT EXISTS last_auto_sync_at timestamptz
    `);
    log.info("ksef_config: kolumny auto-sync gotowe");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się zapewnić kolumn auto-sync");
    throw err;
  }
}

const TICK_MS = 5 * 60 * 1000; // co 5 minut sprawdzamy, kto jest „due"
let ticking = false;

async function tick(log: Logger): Promise<void> {
  if (ticking) return; // nie nakładaj tików
  ticking = true;
  try {
    // Konfiguracje z włączonym auto-sync, poza aktywnym rate-limitem, których
    // ostatnia próba była dawniej niż wybrany interwał (lub nigdy).
    const due = await db.execute<{ id: number; user_id: string }>(sql`
      SELECT id, user_id FROM ksef_config
      WHERE auto_sync_enabled = true
        AND (rate_limited_until IS NULL OR rate_limited_until < now())
        AND (last_auto_sync_at IS NULL
             OR last_auto_sync_at < now() - (auto_sync_interval_hours || ' hours')::interval)
    `);

    for (const row of due.rows) {
      // Znacznik próby PRZED uruchomieniem — kolejny tik nie odpali tego samego usera,
      // nawet jeśli sync trwa dłużej niż interwał tików.
      await db.execute(sql`UPDATE ksef_config SET last_auto_sync_at = now() WHERE id = ${row.id}`);
      await runAutoSyncForUser(row.user_id, log).catch((err) =>
        log.warn({ userId: row.user_id, err: String(err) }, "Auto-sync KSeF: błąd w tle"),
      );
    }
  } catch (err) {
    log.warn({ err: String(err) }, "Auto-sync KSeF: tik harmonogramu nieudany");
  } finally {
    ticking = false;
  }
}

/** Startuje harmonogram auto-synchronizacji KSeF (idempotentny tik co 5 min). */
export function startKsefAutoSyncScheduler(log: Logger): void {
  const timer = setInterval(() => { void tick(log); }, TICK_MS);
  // Nie blokuj zamykania procesu tym timerem.
  if (typeof timer.unref === "function") timer.unref();
  log.info("Harmonogram auto-sync KSeF uruchomiony (tik co 5 min)");
}
