import type { Logger } from "pino";
import { PgBoss, type Job } from "pg-boss";
import { checkAlertsAfterImport } from "./alert-checker";

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
    await b.createQueue(Q_ALERTS);
    // Handler dostaje batch zadań (Job[]); pojedynczy userId per zadanie.
    await b.work<{ userId: string }>(Q_ALERTS, async (jobs: Job<{ userId: string }>[]) => {
      for (const job of jobs) {
        await checkAlertsAfterImport(job.data.userId, log);
      }
    });
    boss = b;
    log.info("pg-boss: kolejka wystartowała (alerts-check)");
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

// Łagodne zatrzymanie (np. przy zamykaniu procesu). No-op gdy nie wystartowano.
export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop().catch(() => {});
    boss = null;
    starting = null;
  }
}
