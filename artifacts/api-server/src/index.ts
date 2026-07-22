import "./instrument.js"; // MUSI być pierwszy — inicjalizuje Sentry przed importem app/route'ów
import app from "./app";
import { logger } from "./lib/logger";
import { runCategoryBackfill } from "./services/backfill-categories.js";
import { ensureAutoSyncColumns, startKsefAutoSyncScheduler } from "./services/ksef-scheduler.js";
import { ensureAiUsageTable } from "./services/ensure-ai-usage.js";
import { startQueue } from "./services/queue.js";

// ── Walidacja zmiennych środowiskowych przy starcie ───────────────────────────
// Lepiej zawieść głośno od razu niż w trakcie żądania użytkownika.
function validateEnv(): number {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL — wymagany (connection string do PostgreSQL).");
  }

  const key = process.env.KSEF_ENCRYPTION_KEY;
  if (!key) {
    errors.push("KSEF_ENCRYPTION_KEY — wymagany (klucz szyfrowania AES).");
  } else if (key.length < 32) {
    errors.push(`KSEF_ENCRYPTION_KEY — za krótki (${key.length} znaków, minimum 32).`);
  }

  const rawPort = process.env.PORT;
  if (!rawPort) {
    errors.push("PORT — wymagany.");
  }
  const port = Number(rawPort);
  if (rawPort && (Number.isNaN(port) || port <= 0)) {
    errors.push(`PORT — nieprawidłowa wartość: "${rawPort}" (musi być liczbą > 0).`);
  }

  if (errors.length > 0) {
    logger.fatal(
      "Brak lub nieprawidłowe zmienne środowiskowe:\n" + errors.map((e) => `  • ${e}`).join("\n"),
    );
    process.exit(1);
  }

  return port;
}

const port = validateEnv();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run in background — never blocks startup, never crashes the process.
  // Runs everywhere EXCEPT local dev (NODE_ENV=development), because Railway
  // does not reliably set NODE_ENV=production at runtime — gating on
  // ==="production" silently skipped it on prod. On prod this clears the
  // "do przeglądu" queue on every deploy (deterministic keyword pass first,
  // then AI only for still-unclassified products). Fully idempotent.
  // Migracja kolumn auto-sync — ZAWSZE (idempotentne DDL), żeby zapytania ORM
  // działały też lokalnie. Harmonogram startuje tylko poza dev (nie bije w KSeF w dev).
  ensureAutoSyncColumns(logger)
    .then(() => {
      if (process.env.NODE_ENV !== "development") startKsefAutoSyncScheduler(logger);
    })
    .catch((err) => logger.error({ err }, "Auto-sync KSeF: nie wystartował (kolumny)"));

  // Tabela miesięcznego zużycia AI (limity per plan) — idempotentne DDL, zawsze.
  ensureAiUsageTable(logger).catch((err) => logger.error({ err }, "ai_usage: migracja nieudana"));

  // Kolejka zadań (pg-boss) — startuje TYLKO gdy PGBOSS_ENABLED=true (PoC).
  // Samo-gated i samo-obsługujące błędy; przy fladze OFF to no-op.
  void startQueue(logger);

  if (process.env.NODE_ENV !== "development") {
    logger.info("Starting category backfill on startup");
    runCategoryBackfill().catch((err) => {
      logger.warn({ err }, "runCategoryBackfill failed on startup (non-fatal)");
    });
  }
});
