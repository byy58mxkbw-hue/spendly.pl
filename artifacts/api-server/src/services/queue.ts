import type { Logger } from "pino";
import { PgBoss, type Job } from "pg-boss";
import { checkAlertsAfterImport } from "./alert-checker";
import { runAutoSyncForUser } from "../routes/ksef";

// PoC kolejki zadań na istniejącym Postgresie (pg-boss) — bez nowej infrastruktury.
// GATED flagą PGBOSS_ENABLED: w prodzie domyślnie OFF, więc zachowanie identyczne
// jak dotąd (fallback = wywołanie inline). Gdy ON — zadania idą do trwałej kolejki
// z automatycznymi retry (exponential backoff) i przetrwają restart procesu.
//
// pg-boss jest importowany statycznie (esbuild bundluje go do dist — rule 25:
// żadnego gołego importu runtime). Top-level importu nie ma efektów ubocznych —
// połączenie z bazą powstaje dopiero w new PgBoss()+start(), gated flagą.
const ENABLED = process.env.PGBOSS_ENABLED === "true";
const Q_ALERTS = "alerts-check";
const Q_KSEF = "ksef-autosync";

let boss: PgBoss | null = null;
let starting: Promise<void> | null = null;

export function queueEnabled(): boolean {
  return ENABLED;
}

// Startuje pg-boss i rejestruje workery. Idempotentne. Bezpieczne przy fladze OFF (no-op).
// Nigdy nie rzuca do wywołującego — błąd startu = zostajemy na inline fallbacku.
export async function startQueue(log: Logger): Promise<void> {
  if (!ENABLED || starting) return starting ?? undefined;
  starting = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL wymagany dla pg-boss");
    const b = new PgBoss({ connectionString });
    b.on("error", (err: unknown) => log.error({ err: String(err) }, "pg-boss: błąd instancji"));
    await b.start();
    // Retry z exponential backoff — czysta przewaga nad dawnym inline `.catch()`,
    // który przy błędzie po prostu gubił sprawdzenie alertów.
    await b.createQueue(Q_ALERTS, { retryLimit: 5, retryBackoff: true });
    // Handler dostaje batch zadań (Job[]); pojedynczy userId per zadanie.
    await b.work<{ userId: string }>(Q_ALERTS, async (jobs: Job<{ userId: string }>[]) => {
      for (const job of jobs) {
        await checkAlertsAfterImport(job.data.userId, log);
      }
    });

    // Auto-sync KSeF w tle: retry (mniej niż alerty — sync jest cięższy), per-NIP
    // guard/advisory-lock jest w runAutoSyncForUser, więc równoległe zadania różnych
    // userów są bezpieczne. Zadanie przetrwa redeploy i wznowi się przy błędzie.
    await b.createQueue(Q_KSEF, { retryLimit: 3, retryBackoff: true });
    await b.work<{ userId: string }>(Q_KSEF, async (jobs: Job<{ userId: string }>[]) => {
      for (const job of jobs) {
        await runAutoSyncForUser(job.data.userId, log);
      }
    });

    boss = b;
    // Graceful shutdown — Railway wysyła SIGTERM przy redeployu; czyste zatrzymanie
    // pg-boss zwalnia locki i dokańcza aktywne zadania zamiast zostawiać je „w locie".
    const shutdown = () => { void stopQueue(); };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    log.info("pg-boss: kolejka wystartowała (alerts-check + ksef-autosync, retry+backoff)");
  })().catch((err) => {
    log.error({ err: String(err) }, "pg-boss: start nieudany — pozostaję na inline fallbacku");
    starting = null;
  });
  return starting;
}

// Fire-and-forget sprawdzenie alertów po imporcie:
// kolejka (z retry) gdy włączona i gotowa, inaczej inline — jak dotychczas.
export function scheduleAlertsCheck(userId: string, log: Logger): void {
  if (ENABLED && boss) {
    boss.send(Q_ALERTS, { userId }).catch(() => {
      // Nie udało się zakolejkować — nie gub roboty, zrób inline.
      checkAlertsAfterImport(userId, log).catch(() => {});
    });
    return;
  }
  checkAlertsAfterImport(userId, log).catch(() => {});
}

// Auto-sync KSeF dla jednego usera: kolejka (z retry) gdy włączona i gotowa,
// inaczej inline — sekwencyjnie jak dotąd (harmonogram awaituje ten Promise).
// Bez dedupe w kolejce — i tak jest podwójnie zabezpieczone: harmonogram ustawia
// last_auto_sync_at PRZED enqueue (ten sam user nie jest „due" przez interwał), a
// runAutoSyncForUser trzyma advisory-lock per NIP (równoległa próba się pomija).
export async function scheduleKsefAutoSync(userId: string, log: Logger): Promise<void> {
  if (ENABLED && boss) {
    try {
      await boss.send(Q_KSEF, { userId });
      return; // zakolejkowane — nie uruchamiaj inline
    } catch (err) {
      log.warn({ userId, err: String(err) }, "ksef-autosync: enqueue nieudany — inline fallback");
    }
  }
  await runAutoSyncForUser(userId, log).catch((err) =>
    log.warn({ userId, err: String(err) }, "Auto-sync KSeF: błąd w tle"),
  );
}

// Łagodne zatrzymanie (np. przy zamykaniu procesu). No-op gdy nie wystartowano.
export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop().catch(() => {});
    boss = null;
    starting = null;
  }
}
