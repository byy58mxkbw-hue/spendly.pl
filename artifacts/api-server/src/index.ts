import app from "./app";
import { logger } from "./lib/logger";
import { runCategoryBackfill } from "./services/backfill-categories.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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
  if (process.env.NODE_ENV !== "development") {
    logger.info("Starting category backfill on startup");
    runCategoryBackfill().catch((err) => {
      logger.warn({ err }, "runCategoryBackfill failed on startup (non-fatal)");
    });
  }
});
