import type { Logger } from "pino";
import { db, goposConfigTable } from "@workspace/db";
import { syncGoposForUser } from "./gopos-sync.js";

// Auto-sync sprzedaży GoPOS — samoistny, bez klikania "Synchronizuj" (na wyraźną
// prośbę: co 5h). Wzorowany na ksef-scheduler.ts (setInterval, ta sama rodzina
// harmonogramów co reszta apki — bez trzeciego mechanizmu kolejkowania).
const TICK_MS = 5 * 60 * 60 * 1000; // 5 godzin
let ticking = false;

async function tick(log: Logger): Promise<void> {
  if (ticking) return; // nie nakładaj tików, gdyby poprzedni sync jeszcze trwał
  ticking = true;
  try {
    const configs = await db.select({ userId: goposConfigTable.userId }).from(goposConfigTable);
    for (const { userId } of configs) {
      try {
        const summary = await syncGoposForUser(userId, log);
        log.info({ userId, ...summary }, "GoPOS: auto-sync zakończony");
      } catch (err) {
        // Jeden user z błędną konfiguracją (np. brak location_id) nie blokuje reszty.
        log.warn({ userId, err: String(err) }, "GoPOS: auto-sync nieudany");
      }
    }
  } catch (err) {
    log.warn({ err: String(err) }, "GoPOS: auto-sync — nie udało się pobrać konfiguracji");
  } finally {
    ticking = false;
  }
}

/** Startuje harmonogram auto-sync GoPOS: pierwszy przelicz krótko po starcie, potem co 5h. */
export function startGoposAutoSyncScheduler(log: Logger): void {
  const initialDelay = setTimeout(() => { void tick(log); }, 60_000); // 1 min po starcie, nie blokuje bootu
  if (typeof initialDelay.unref === "function") initialDelay.unref();

  const timer = setInterval(() => { void tick(log); }, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  log.info("Harmonogram auto-sync GoPOS uruchomiony (tik co 5h)");
}
