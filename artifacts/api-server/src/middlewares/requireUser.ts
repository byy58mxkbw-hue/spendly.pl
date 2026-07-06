import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { sql } from "drizzle-orm";
import {
  db,
  suppliersTable,
  productsTable,
  invoicesTable,
  priceAlertsTable,
  ksefConfigTable,
  ksefPendingInvoicesTable,
} from "@workspace/db";
import { normalizePlan } from "../lib/ai-plan.js";

export const LEGACY_USER_ID = "__legacy__";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      plan?: "free" | "pro" | "business";
    }
  }
}

// Only the legacy owner is ever cached (bounded memory). Other users skip the
// claim path on the first request after we confirm they aren't the owner.
const skipClaim = new Set<string>();
let claimDone = false;
let claimInFlight: Promise<void> | null = null;

async function maybeClaimLegacy(userId: string): Promise<void> {
  if (claimDone || skipClaim.has(userId)) return;
  if (claimInFlight) return claimInFlight;

  const ownerEmail = process.env["LEGACY_OWNER_EMAIL"]?.toLowerCase().trim();
  if (!ownerEmail) {
    claimDone = true;
    return;
  }

  claimInFlight = (async () => {
    let primaryEmail: string | null = null;
    try {
      const user = await clerkClient.users.getUser(userId);
      primaryEmail =
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress?.toLowerCase() ??
        user.emailAddresses[0]?.emailAddress?.toLowerCase() ??
        null;
    } catch {
      // Transient Clerk failure — don't poison the cache, just bail and retry
      // on the next request.
      return;
    }

    if (primaryEmail !== ownerEmail) {
      // Not the owner — remember so we don't pay the Clerk lookup again.
      skipClaim.add(userId);
      return;
    }

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`UPDATE suppliers              SET user_id = ${userId} WHERE user_id = ${LEGACY_USER_ID}`);
        await tx.execute(sql`UPDATE products               SET user_id = ${userId} WHERE user_id = ${LEGACY_USER_ID}`);
        await tx.execute(sql`UPDATE invoices               SET user_id = ${userId} WHERE user_id = ${LEGACY_USER_ID}`);
        await tx.execute(sql`UPDATE price_alerts           SET user_id = ${userId} WHERE user_id = ${LEGACY_USER_ID}`);
        await tx.execute(sql`UPDATE ksef_config            SET user_id = ${userId} WHERE user_id = ${LEGACY_USER_ID}`);
        await tx.execute(sql`UPDATE ksef_pending_invoices  SET user_id = ${userId} WHERE user_id = ${LEGACY_USER_ID}`);
      });
      claimDone = true;
    } catch {
      // DB hiccup — leave claimDone false so we retry on the next request.
    }
  })().finally(() => {
    claimInFlight = null;
  });

  return claimInFlight;
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const metadata = auth.sessionClaims?.["publicMetadata"] as Record<string, unknown> | undefined;
  if (metadata?.["blocked"] === true) {
    res.status(403).json({ error: "Konto zostało zablokowane." });
    return;
  }

  req.userId = auth.userId;
  // Plan z Clerk publicMetadata (jak `blocked`); brak → free. Steruje limitem AI.
  req.plan = normalizePlan(metadata?.["plan"]);
  maybeClaimLegacy(auth.userId)
    .catch((err) => req.log?.error?.({ err }, "Legacy claim failed"))
    .finally(() => next());
}

// Reference the imports so a bare `tsc --noEmit` doesn't complain about
// `suppliersTable` etc. being unused — they are kept for type/value parity
// with the raw SQL above and to anchor cross-file rename refactors.
void suppliersTable;
void productsTable;
void invoicesTable;
void priceAlertsTable;
void ksefConfigTable;
void ksefPendingInvoicesTable;
