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

  // Run in background — never blocks startup, never crashes the process
  // Disabled for dev - database endpoint may be disabled
  // runCategoryBackfill().catch(() => {});
});
