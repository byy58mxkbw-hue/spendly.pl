/**
 * One-time production cleanup: remove AGATA SPÓŁKA AKCYJNA pending invoices
 *
 * Context:
 * The KSeF sync previously started from 2 years back and hit the rate limit after ~20
 * windows, creating 4 ksef_pending_invoices rows for AGATA SPÓŁKA AKCYJNA (an early
 * voluntary KSeF adopter). These are from 2024 — before the mandatory KSeF period —
 * and cannot be auto-imported as the products/supplier match logic hasn't been set up
 * for them. They can be safely removed.
 *
 * After running this script, run a fresh sync from /invoices to import the actual
 * mandatory-KSeF invoices (Feb 2026 onwards).
 *
 * Run: pnpm --filter @workspace/scripts run cleanup-prod-agata-pending
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const TARGET_USER_ID = "user_3DzRzmuDxrOL23jmsxF7j7M8SSA";
const SELLER_NIP = "6340197476";

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const db = drizzle(client);

try {
  const result = await db.execute(
    sql`DELETE FROM ksef_pending_invoices
        WHERE seller_nip = ${SELLER_NIP}
          AND user_id = ${TARGET_USER_ID}
        RETURNING id, invoice_number, invoice_date`,
  );
  const deleted = result.rows ?? [];
  if (deleted.length === 0) {
    console.log("No rows found — already cleaned up or never created.");
  } else {
    console.log(`Deleted ${deleted.length} rows:`);
    for (const row of deleted) {
      console.log(`  id=${row.id}  invoice=${row.invoice_number}  date=${row.invoice_date}`);
    }
  }
} finally {
  await client.end();
}
