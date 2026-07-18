import { Router, type IRouter, type Request } from "express";
import type { Logger } from "pino";
import { toNum, toNumOrNull } from "../lib/parse";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  db,
  ksefConfigTable,
  ksefPendingInvoicesTable,
  invoicesTable,
  invoiceItemsTable,
  suppliersTable,
  productsTable,
  costCentersTable,
} from "@workspace/db";
import {
  UpdateKsefConfigBody,
  UpdateKsefSyncFromDateBody,
  SyncKsefInvoicesBody,
  AcceptKsefPendingBody,
  GetKsefPendingParams,
  AcceptKsefPendingParams,
  RejectKsefPendingParams,
  ListKsefPendingQueryParams,
} from "@workspace/api-zod";
import {
  KsefAuthError,
  KsefClient,
  KsefRateLimitError,
  parseFA3Xml,
  type KsefSession,
  type ParsedFa3,
} from "@workspace/ksef-client";
import { decryptSecret, encryptSecret, maskToken } from "../lib/encryption";
import { checkAlertsAfterImport } from "../services/alert-checker";
import { resuggestForUser } from "./cost-centers";
import { buildCostCenterModel, computeCostCenterSuggestion } from "../lib/cost-center-suggest.js";
import { AdvisoryLock } from "../lib/advisory-lock";
import {
  encryptXml,
  describeDbErr,
  mapKsefError,
  isoDate,
  findOrCreateProductByName,
  tryMatch,
  nipRateLimitSecondsRemaining,
  markNipRateLimited,
  acquireSession,
  clearCachedSession,
  ingestViaExport,
} from "../services/ksef-ingest";

const router: IRouter = Router();

// Delay between listInvoices window queries (metadata). KSeF rate-limits aggressively
// on metadata queries — 600ms was too short for 20+ windows (triggered 1-hour ban).
// 2 500ms gives ~62s total for 25 windows, well within observed rate limits.
const INTER_WINDOW_DELAY_MS = 2500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));


// ─── Config ──────────────────────────────────────────────────────────────────

async function loadConfig(userId: string) {
  const [cfg] = await db
    .select()
    .from(ksefConfigTable)
    .where(eq(ksefConfigTable.userId, userId))
    .limit(1);
  return cfg ?? null;
}

function viewConfig(
  cfg: Awaited<ReturnType<typeof loadConfig>>,
): { nip: string; tokenMasked: string; environment: string; lastSyncedAt: string | null; syncFromDate: string | null; autoSyncEnabled: boolean; autoSyncIntervalHours: number } | null {
  if (!cfg) return null;
  return {
    nip: cfg.nip,
    tokenMasked: `••••••${cfg.tokenLast4}`,
    environment: cfg.environment,
    lastSyncedAt: cfg.lastSyncedAt ? cfg.lastSyncedAt.toISOString() : null,
    syncFromDate: cfg.syncFromDate ?? null,
    autoSyncEnabled: cfg.autoSyncEnabled,
    autoSyncIntervalHours: cfg.autoSyncIntervalHours,
  };
}

router.get("/ksef/config", async (req, res): Promise<void> => {
  const cfg = await loadConfig(req.userId!);
  res.json(viewConfig(cfg));
});

router.put("/ksef/config", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpdateKsefConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const nip = parsed.data.nip.replace(/\D/g, "");
  if (nip.length !== 10 && nip.length !== 11) {
    res.status(400).json({ error: "NIP musi składać się z 10 cyfr, PESEL z 11." });
    return;
  }

  const token = parsed.data.token.trim();
  if (token.length < 8) {
    res.status(400).json({ error: "Token KSeF wygląda na zbyt krótki." });
    return;
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(token);
  } catch (err) {
    req.log.error({ err }, "Failed to encrypt KSeF token");
    res.status(500).json({
      error:
        "Brak skonfigurowanego klucza szyfrującego KSEF_ENCRYPTION_KEY. Skontaktuj się z administratorem.",
    });
    return;
  }

  const last4 = token.slice(-4);

  // Load the user's existing config early so we know whether the NIP is changing.
  const existing = await loadConfig(userId);
  const nipIsNew = !existing || existing.nip !== nip;

  if (nipIsNew) {
    // Claiming a new or changed NIP: prove the token is valid for it before
    // reserving ownership. This prevents NIP squatting — an attacker who
    // registers an arbitrary NIP with a junk token and then blocks the
    // legitimate owner via the 409 ownership check below.
    try {
      const client = new KsefClient({ logger: req.log });
      await client.authenticate(nip, token);
      // Session expires naturally; no terminate call needed.
    } catch (err) {
      if (err instanceof KsefAuthError) {
        req.log.warn({ nip }, "KSeF token validation failed during config save");
        res.status(401).json({
          error: "Token KSeF jest nieprawidłowy dla podanego NIP. Sprawdź dane i spróbuj ponownie.",
        });
        return;
      }
      // Network errors or KSeF server errors: do not block the save — the
      // token may be valid but KSeF is temporarily unavailable. Fall through
      // and let the ownership check guard against obvious squatting.
      req.log.warn({ nip, err: String(err) }, "KSeF validation unavailable during config save, proceeding with ownership check only");
    }

    // Enforce NIP tenancy: a NIP may only be registered by one Spendly account.
    // If a different user already owns this NIP, reject the request. This prevents
    // a disgruntled employee or attacker from registering the same company NIP
    // under their own Spendly account and deliberately triggering KSeF rate limits
    // that would block the legitimate owner's account via the per-NIP cooldown.
    const [nipOwner] = await db
      .select({ id: ksefConfigTable.id })
      .from(ksefConfigTable)
      .where(and(eq(ksefConfigTable.nip, nip), ne(ksefConfigTable.userId, userId)))
      .limit(1);
    if (nipOwner) {
      req.log.warn({ nip, requestingUserId: userId }, "NIP already registered by a different account, rejecting config update");
      res.status(409).json({
        error: "Ten NIP jest już przypisany do innego konta Spendly. Skontaktuj się z administratorem.",
      });
      return;
    }
  }

  let saved;
  try {
    if (existing) {
      [saved] = await db
        .update(ksefConfigTable)
        .set({ nip, encryptedToken: encrypted, tokenLast4: last4, environment: "production" })
        .where(eq(ksefConfigTable.id, existing.id))
        .returning();
    } else {
      [saved] = await db
        .insert(ksefConfigTable)
        .values({ userId, nip, encryptedToken: encrypted, tokenLast4: last4, environment: "production" })
        .returning();
    }
  } catch (err) {
    // Unique constraint violation on nip (race condition: another account claimed
    // the NIP between our ownership check and the insert/update).
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === "23505") {
      req.log.warn({ nip, requestingUserId: userId }, "NIP uniqueness conflict during config save (race)");
      res.status(409).json({
        error: "Ten NIP jest już przypisany do innego konta Spendly. Skontaktuj się z administratorem.",
      });
      return;
    }
    throw err;
  }

  req.log.info({ nip, tokenMasked: maskToken(token) }, "KSeF config updated");
  res.json(viewConfig(saved));
});

router.put("/ksef/config/sync-from-date", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpdateKsefSyncFromDateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { syncFromDate } = parsed.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(syncFromDate)) {
    res.status(400).json({ error: "Data musi być w formacie YYYY-MM-DD." });
    return;
  }
  const d = new Date(syncFromDate);
  if (isNaN(d.getTime()) || d < new Date("2025-01-01") || d > new Date()) {
    res.status(400).json({ error: "Data musi być pomiędzy 2025-01-01 a datą dzisiejszą." });
    return;
  }

  const existing = await loadConfig(userId);
  if (!existing) {
    res.status(400).json({ error: "Brak konfiguracji KSeF. Najpierw zapisz NIP i token." });
    return;
  }

  const [saved] = await db
    .update(ksefConfigTable)
    .set({ syncFromDate })
    .where(eq(ksefConfigTable.id, existing.id))
    .returning();

  req.log.info({ syncFromDate }, "KSeF sync-from-date updated");
  res.json(viewConfig(saved));
});

// Dozwolone interwały automatycznej synchronizacji (godziny) — do wyboru przez użytkownika.
const ALLOWED_AUTO_SYNC_INTERVALS = [6, 12, 24];

router.put("/ksef/auto-sync", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = (req.body ?? {}) as { enabled?: unknown; intervalHours?: unknown };
  const enabled = body.enabled === true;
  const intervalHours = Number(body.intervalHours);
  if (enabled && !ALLOWED_AUTO_SYNC_INTERVALS.includes(intervalHours)) {
    res.status(400).json({ error: `Nieprawidłowy interwał. Dozwolone: ${ALLOWED_AUTO_SYNC_INTERVALS.join(", ")} godz.` });
    return;
  }

  const existing = await loadConfig(userId);
  if (!existing) {
    res.status(400).json({ error: "Brak konfiguracji KSeF. Najpierw zapisz NIP i token." });
    return;
  }

  const [saved] = await db
    .update(ksefConfigTable)
    .set({
      autoSyncEnabled: enabled,
      ...(enabled ? { autoSyncIntervalHours: intervalHours } : {}),
    })
    .where(eq(ksefConfigTable.id, existing.id))
    .returning();

  req.log.info({ enabled, intervalHours: saved.autoSyncIntervalHours }, "KSeF auto-sync updated");
  res.json(viewConfig(saved));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────


// ─── Sync ────────────────────────────────────────────────────────────────────

router.post("/ksef/sync", async (req, res): Promise<void> => {
  const userId = req.userId!;
  let cfg = await loadConfig(userId);
  if (!cfg) {
    res.status(400).json({
      error: "Brak konfiguracji KSeF. Przejdź do Ustawień KSeF i zapisz NIP oraz token.",
    });
    return;
  }

  // Check if this NIP is currently rate-limited before doing anything else.
  // The limit is per-NIP (not per-user/token), so one user's rate-limit exhaustion
  // blocks all accounts that share the same NIP.
  const rateLimitSecsRemaining = await nipRateLimitSecondsRemaining(cfg.nip);
  if (rateLimitSecsRemaining > 0) {
    const mins = Math.ceil(rateLimitSecsRemaining / 60);
    const timeNote =
      mins > 60
        ? `ponad godzinę`
        : mins > 1
          ? `ok. ${mins} minut`
          : `mniej niż minutę`;
    req.log.info({ nip: cfg.nip, rateLimitSecsRemaining }, "KSeF NIP rate-limited, rejecting sync early");
    res.status(429).json({
      error: `KSeF ogranicza zapytania dla tego NIP — zablokowany jeszcze przez ${timeNote}. Spróbuj ponownie później.`,
      retryAfterSeconds: rateLimitSecsRemaining,
    });
    return;
  }

  const parsed = SyncKsefInvoicesBody.safeParse(req.body ?? {});
  const fromBeginning = parsed.success && parsed.data.fromBeginning === true;

  if (fromBeginning) {
    await db
      .update(ksefConfigTable)
      .set({ lastSyncedAt: null })
      .where(eq(ksefConfigTable.id, cfg.id));
    cfg = { ...cfg, lastSyncedAt: null };
    req.log.info({ userId }, "KSeF sync reset: lastSyncedAt cleared");
  }

  // Lock per NIP, not per user: accounts sharing the same company NIP must
  // serialize their syncs so they cannot run concurrently and jointly exhaust
  // the KSeF rate limit for that NIP, which would block every Spendly account
  // configured with that NIP.
  const lock = await AdvisoryLock.tryAcquire("ksef_sync", cfg.nip);
  if (!lock) {
    res.status(409).json({
      error: "Synchronizacja KSeF już trwa dla tego NIP. Poczekaj na jej zakończenie.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function sendEvent(event: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  try {
    await runSync(req, userId, cfg, sendEvent);
  } finally {
    await lock.release().catch((err: unknown) =>
      req.log.warn({ err: String(err) }, "Failed to release ksef_sync advisory lock"),
    );
  }
  res.end();
});

async function runSync(
  req: Request,
  userId: string,
  cfg: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  onProgress: (event: Record<string, unknown>) => void,
): Promise<void> {
  let token: string;
  try {
    token = decryptSecret(cfg.encryptedToken);
  } catch (err) {
    req.log.error({ err }, "Failed to decrypt KSeF token");
    onProgress({ type: "error", status: 500, message: "Nie udało się odszyfrować zapisanego tokena KSeF. Zapisz go ponownie w Ustawieniach." });
    return;
  }

  const client = new KsefClient({ logger: req.log });
  const summary = {
    imported: 0,
    pending: 0,
    failed: 0,
    errors: [] as string[],
  };

  let session: KsefSession;
  try {
    session = await acquireSession(cfg, token, client, req);
  } catch (err) {
    if (err instanceof KsefAuthError) await clearCachedSession(cfg.id);
    const m = mapKsefError(err);
    req.log.warn({ err: String(err) }, "KSeF authenticate failed");
    onProgress({ type: "error", status: m.status, message: m.message });
    return;
  }

  const now = new Date();
  // First sync: start from the user-configured syncFromDate, or 2026-02-01 (when KSeF
  // became mandatory in Poland) as the default. Starting from 2 years back caused ~25
  // windows and reliably hit the per-NIP rate limit before reaching the mandatory period.
  // Feb 2026 → today is only ~4–5 windows, completing in seconds with no rate risk.
  const KSEF_MANDATORY_START = new Date(
    cfg.syncFromDate ? `${cfg.syncFromDate}T00:00:00.000Z` : "2026-02-01T00:00:00.000Z"
  );
  // Re-scan a short trailing overlap on every incremental sync. KSeF's
  // permanent-storage index is eventually consistent, so an invoice can surface
  // with a timestamp just below our previous cursor; without overlap it would
  // fall in the gap forever. Dedup by ksefNumber makes the re-scan duplicate-free.
  const SYNC_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;
  const overallFrom = cfg.lastSyncedAt
    ? new Date(Math.max(KSEF_MANDATORY_START.getTime(), cfg.lastSyncedAt.getTime() - SYNC_OVERLAP_MS))
    : KSEF_MANDATORY_START;

  // 30-day windows instead of 7-day windows → ~12 API calls/year instead of ~52.
  // Fewer metadata queries = much lower risk of hitting KSeF's per-NIP rate limit.
  const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const PAGE_SIZE = 250;
  const MAX_PAGE_OFFSET = 9900;

  const totalWindows = Math.max(1, Math.ceil((now.getTime() - overallFrom.getTime()) / WINDOW_MS));
  let windowsDone = 0;
  onProgress({ type: "scanning", windowsDone: 0, windowsTotal: totalWindows });

  const allRefsMap = new Map<string, { ksefReferenceNumber: string }>();
  let truncatedWindow = false;
  let lastSuccessfulWinEnd: Date | null = null;
  // Set when listInvoices is rate-limited — we proceed to import partial results
  // instead of aborting, and let the user re-sync after the cooldown expires.
  let scanRateLimited = false;
  let scanRateLimitRetryAfterSecs = 0;

  // ── Bulk export fast-path ──────────────────────────────────────────────────
  // One encrypted package instead of one request per invoice — avoids KSeF's
  // per-invoice download rate limit / hour ban. On ANY failure, fall back to the
  // per-invoice scan + fetch below (the unchanged, proven path).
  let exportHandled = false;
  try {
    exportHandled = await ingestViaExport(req, userId, cfg, client, session, overallFrom, now, summary, onProgress);
  } catch (err) {
    if (err instanceof KsefAuthError) await clearCachedSession(cfg.id);
    req.log.warn({ err: describeDbErr(err) }, "KSeF bulk export failed — falling back to per-invoice sync");
  }

  if (exportHandled) {
    lastSuccessfulWinEnd = now;
  } else {

  for (let winStart = new Date(overallFrom); winStart < now && !scanRateLimited; winStart = new Date(winStart.getTime() + WINDOW_MS)) {
    // Throttle metadata queries: wait between windows (except the very first).
    if (windowsDone > 0) await sleep(INTER_WINDOW_DELAY_MS);

    const winEndMs = Math.min(winStart.getTime() + WINDOW_MS - 1, now.getTime());
    const winEnd = new Date(winEndMs);
    const dateFrom = winStart.toISOString();
    const dateTo = winEnd.toISOString();

    let pageOffset = 0;
    let windowOk = true;
    while (true) {
      let page: Awaited<ReturnType<typeof client.listInvoices>> | undefined;
      try {
        page = await client.listInvoices(session, {
          subjectType: "buyer",
          nip: cfg.nip,
          dateFrom,
          dateTo,
          pageOffset,
          pageSize: PAGE_SIZE,
        });
      } catch (err) {
        if (err instanceof KsefRateLimitError) {
          // Rate limit during metadata scan: stop scanning, proceed to import
          // what we've collected so far, and tell the user when to retry.
          scanRateLimited = true;
          scanRateLimitRetryAfterSecs = err.retryAfterSeconds;
          windowOk = false;
          // Persist rate limit per-NIP so subsequent requests (any user with same NIP)
          // are rejected early without wasting an authentication round-trip.
          await markNipRateLimited(cfg.nip, err.retryAfterSeconds).catch(() => {});
          req.log.warn(
            { retryAfterSecs: err.retryAfterSeconds, windowsDone, dateFrom },
            "KSeF rate-limited during scan, will do partial import",
          );
        } else {
          // A cached session rejected mid-scan → drop it so the next sync re-auths.
          if (err instanceof KsefAuthError) await clearCachedSession(cfg.id);
          const m = mapKsefError(err);
          req.log.warn({ err: String(err), dateFrom, dateTo }, "KSeF listInvoices failed, aborting sync");
          onProgress({ type: "error", status: m.status, message: m.message });
          return;
        }
        break;
      }

      req.log.info({ windowsDone, dateFrom, dateTo, invoiceCount: page!.invoices.length, hasMore: page!.hasMore }, "KSeF listInvoices response");
      for (const inv of page!.invoices) {
        if (inv.ksefReferenceNumber) {
          allRefsMap.set(inv.ksefReferenceNumber, inv);
        }
      }
      if (page!.isTruncated) {
        truncatedWindow = true;
        summary.errors.push(
          `Okno ${dateFrom.slice(0, 10)}–${dateTo.slice(0, 10)} przekroczyło limit KSeF — część faktur pominięta.`,
        );
        break;
      }
      if (!page!.hasMore || page!.invoices.length === 0) break;
      pageOffset = page!.nextOffset;
      if (pageOffset > MAX_PAGE_OFFSET) {
        truncatedWindow = true;
        summary.errors.push(
          `Okno ${dateFrom.slice(0, 10)}–${dateTo.slice(0, 10)} przekroczyło ${MAX_PAGE_OFFSET} wyników — część faktur pominięta.`,
        );
        break;
      }
    }

    windowsDone++;
    onProgress({ type: "scanning", windowsDone, windowsTotal: totalWindows });
    if (windowOk) {
      lastSuccessfulWinEnd = winEnd;
    }
  }

  if (scanRateLimited) {
    const mins = Math.ceil(scanRateLimitRetryAfterSecs / 60);
    const waitNote = mins > 60
      ? `za ponad godzinę`
      : mins > 1
        ? `za ok. ${mins} min`
        : `za chwilę`;
    const partialCount = allRefsMap.size;
    onProgress({
      type: "warning",
      message: `KSeF ogranicza zapytania — zeskanowano ${windowsDone} z ${totalWindows} okien (${partialCount} faktur). Importuję co udało się pobrać. Uruchom synchronizację ponownie ${waitNote}, aby pobrać pozostałe faktury.`,
    });
  }

  const allRefs = Array.from(allRefsMap.values());
  req.log.info({ totalScanned: allRefs.length, nip: cfg.nip }, "KSeF scan complete - invoices found");

  // Filter out invoices we already have for this user.
  let newRefs: typeof allRefs = [];
  if (allRefs.length > 0) {
    const refNumbers = allRefs.map((r) => r.ksefReferenceNumber);
    const [existingImported, existingPending] = await Promise.all([
      db
        .select({ k: invoicesTable.ksefNumber })
        .from(invoicesTable)
        .where(
          and(eq(invoicesTable.userId, userId), inArray(invoicesTable.ksefNumber, refNumbers)),
        ),
      db
        .select({ k: ksefPendingInvoicesTable.ksefNumber })
        .from(ksefPendingInvoicesTable)
        .where(
          and(
            eq(ksefPendingInvoicesTable.userId, userId),
            inArray(ksefPendingInvoicesTable.ksefNumber, refNumbers),
          ),
        ),
    ]);
    const seen = new Set<string>([
      ...existingImported.map((r) => r.k!).filter(Boolean),
      ...existingPending.map((r) => r.k),
    ]);
    newRefs = allRefs.filter((r) => !seen.has(r.ksefReferenceNumber));
  }

  // Adaptive per-invoice pacing. KSeF throttles XML downloads and will temp-ban the
  // NIP (~1h) if hammered, so we start gently, back off on every 429, and cautiously
  // speed back up on sustained success — keeping a 100+ invoice batch under the limit
  // without a manual re-sync per throttle. `fetchDelayMs` is shared with the loop's
  // inter-invoice sleep so one throttled fetch slows its neighbours too.
  const MIN_FETCH_DELAY_MS = 1000;
  const MAX_FETCH_DELAY_MS = 8000;
  const MAX_SOFT_WAIT_S = 30;
  let fetchDelayMs = 1500;

  async function fetchXmlWithRetry(ksefRef: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        const xml = await client.getInvoiceXml(session, ksefRef);
        // Sustained success → cautiously speed back up.
        fetchDelayMs = Math.max(MIN_FETCH_DELAY_MS, Math.round(fetchDelayMs * 0.85));
        return xml;
      } catch (err) {
        if (err instanceof KsefRateLimitError) {
          // Back off globally so neighbouring fetches slow down too.
          fetchDelayMs = Math.min(MAX_FETCH_DELAY_MS, Math.round(fetchDelayMs * 2));
          // Long cooldown → NIP-level ban; rethrow so the outer loop stops cleanly.
          if (err.retryAfterSeconds > 120) throw err;
          // Soft throttle → honour the server-suggested wait once (bounded), then retry.
          if (attempt < 2 && err.retryAfterSeconds <= MAX_SOFT_WAIT_S) {
            await sleep(Math.max(1000, err.retryAfterSeconds * 1000));
            continue;
          }
        }
        throw err;
      }
    }
  }

  onProgress({ type: "fetching", fetched: 0, total: newRefs.length });

  let fetchHardRateLimit = false;

  for (let idx = 0; idx < newRefs.length; idx++) {
    if (fetchHardRateLimit) break;
    const ref = newRefs[idx];
    if (idx > 0) await sleep(fetchDelayMs);
    try {
      const xml = await fetchXmlWithRetry(ref.ksefReferenceNumber);
      const parsed = parseFA3Xml(xml, ref.ksefReferenceNumber);

      const match = await tryMatch(userId, parsed);
      const reasons: string[] = [];
      if (!match.supplier) {
        reasons.push(
          `nieznany dostawca${parsed.header.sellerNip ? ` (NIP ${parsed.header.sellerNip})` : ""}`,
        );
      }
      if (match.missingProducts.length > 0) {
        const sample = match.missingProducts.slice(0, 3).join(", ");
        const extra =
          match.missingProducts.length > 3
            ? ` i ${match.missingProducts.length - 3} innych`
            : "";
        reasons.push(`brak produktów: ${sample}${extra}`);
      }
      if (parsed.items.length === 0) reasons.push("brak pozycji w XML");

      await db
        .insert(ksefPendingInvoicesTable)
        .values({
          userId,
          ksefNumber: ref.ksefReferenceNumber,
          sellerNip: parsed.header.sellerNip,
          sellerName: parsed.header.sellerName,
          invoiceNumber: parsed.header.invoiceNumber,
          invoiceDate: parsed.header.invoiceDate,
          totalGross: parsed.header.totalGross != null ? parsed.header.totalGross.toString() : null,
          rawXml: xml,
          parsedJson: parsed,
          reason: reasons.join("; ") || "wymaga ręcznego przeglądu",
          status: "pending",
        })
        .onConflictDoNothing({ target: [ksefPendingInvoicesTable.userId, ksefPendingInvoicesTable.ksefNumber] });
      summary.pending++;
    } catch (err) {
      if (err instanceof KsefRateLimitError && err.retryAfterSeconds > 120) {
        // Hard NIP-level cooldown — stop fetching to avoid further 429s.
        fetchHardRateLimit = true;
        await markNipRateLimited(cfg.nip, err.retryAfterSeconds).catch(() => {});
        const remaining = newRefs.length - idx;
        const mins = Math.ceil(err.retryAfterSeconds / 60);
        summary.errors.push(
          `KSeF ogranicza zapytania — ${remaining} faktur zostanie pobrane przy kolejnej synchronizacji za ok. ${mins} min.`,
        );
        req.log.warn({ ksefRef: ref.ksefReferenceNumber, retryAfterSecs: err.retryAfterSeconds, remaining }, "KSeF hard rate limit during fetch, stopping");
      } else {
        summary.failed++;
        const m = mapKsefError(err);
        summary.errors.push(`Faktura ${ref.ksefReferenceNumber}: ${m.message}`);
        req.log.error({ ksefRef: ref.ksefReferenceNumber, err: describeDbErr(err) }, "KSeF per-invoice fetch failed");
      }
    }
    onProgress({ type: "fetching", fetched: idx + 1, total: newRefs.length });
  }
  } // end per-invoice fallback (else !exportHandled)

  // Retry existing pending invoices for this user.
  const stillPending = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(
      and(
        eq(ksefPendingInvoicesTable.userId, userId),
        inArray(ksefPendingInvoicesTable.status, ["pending", "rejected"]),
      ),
    );
  for (const row of stillPending) {
    try {
      const parsed = row.parsedJson as ParsedFa3;
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) continue;
      const match = await tryMatch(userId, parsed);
      if (!match.supplier) continue;

      const resolvedProductIds: number[] = [];
      for (let i = 0; i < parsed.items.length; i++) {
        let pid = match.itemProductIds[i];
        if (pid == null) {
          pid = await findOrCreateProductByName(userId, parsed.items[i].name, parsed.items[i].unit);
        }
        resolvedProductIds.push(pid);
      }

      const totalAmount =
        parsed.header.totalGross ?? parsed.items.reduce((s, i) => s + i.gross, 0);
      const invNum = parsed.header.invoiceNumber ?? row.ksefNumber;
      const invDate = parsed.header.invoiceDate ?? isoDate(now);

      const rowPayMethod = (parsed.header.paymentMethod as "gotowka" | "przelew" | "karta" | null | undefined) ?? null;
      const rowPayDue = rowPayMethod === "przelew" ? (parsed.header.paymentDueDate ?? null) : null;
      const wasNewlyImported = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: invoicesTable.id })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.userId, userId),
              eq(invoicesTable.supplierId, match.supplier!.id),
              eq(invoicesTable.invoiceNumber, invNum),
            ),
          )
          .limit(1);
        let inserted = false;
        if (existing) {
          await tx
            .update(invoicesTable)
            .set({
              ksefNumber: row.ksefNumber,
              xmlContent: encryptXml(row.rawXml),
              totalAmount: totalAmount.toFixed(2),
              invoiceDate: invDate,
              ...(rowPayMethod != null ? { paymentMethod: rowPayMethod, paymentDueDate: rowPayDue } : {}),
            })
            .where(eq(invoicesTable.id, existing.id));
        } else {
          const insertedRows = await tx
            .insert(invoicesTable)
            .values({
              userId,
              supplierId: match.supplier!.id,
              invoiceNumber: invNum,
              invoiceDate: invDate,
              totalAmount: totalAmount.toFixed(2),
              xmlContent: encryptXml(row.rawXml),
              ksefNumber: row.ksefNumber,
              paymentMethod: rowPayMethod,
              paymentDueDate: rowPayDue,
              isPaid: rowPayMethod === "gotowka" || rowPayMethod === "karta",
              paidAt: rowPayMethod === "gotowka" || rowPayMethod === "karta" ? new Date() : null,
              costCenterId: null, // bez auto-przypisania — sugestię nada resuggestForUser po sync, user potwierdza
            })
            .onConflictDoNothing({ target: [invoicesTable.userId, invoicesTable.ksefNumber] })
            .returning();
          const inv = insertedRows[0];
          if (inv) {
            inserted = true;
            for (let i = 0; i < parsed.items.length; i++) {
              const item = parsed.items[i];
              await tx.insert(invoiceItemsTable).values({
                invoiceId: inv.id,
                productId: resolvedProductIds[i],
                productName: item.name,
                quantity: item.quantity.toString(),
                unit: item.unit,
                unitPrice: item.unitPrice.toString(),
                totalPrice: item.net.toString(),
                vatRate: item.vatRate != null ? item.vatRate.toString() : null,
              });
            }
          }
        }
        await tx
          .update(ksefPendingInvoicesTable)
          .set({ status: "accepted" })
          .where(eq(ksefPendingInvoicesTable.id, row.id));
        return inserted;
      });
      if (wasNewlyImported) summary.imported++;
      summary.pending = Math.max(0, summary.pending - 1);
    } catch (err) {
      summary.errors.push(`Pending ${row.ksefNumber}: ${mapKsefError(err).message}`);
      req.log.error({ pendingId: row.id, err: describeDbErr(err) }, "KSeF pending retry failed");
    }
  }

  // Advance lastSyncedAt to the end of the last contiguous run of successful windows.
  // If no window succeeded at all, leave lastSyncedAt unchanged so the next sync
  // retries from the same starting point (do not advance to now).
  const updatedLastSyncedAt = lastSuccessfulWinEnd ?? cfg.lastSyncedAt;

  if (lastSuccessfulWinEnd !== null) {
    await db
      .update(ksefConfigTable)
      .set({ lastSyncedAt: lastSuccessfulWinEnd })
      .where(eq(ksefConfigTable.id, cfg.id));
  }

  onProgress({
    type: "done",
    ...summary,
    lastSyncedAt: updatedLastSyncedAt ? updatedLastSyncedAt.toISOString() : null,
  });

  // Fire-and-forget: recalculate price alert triggers after new invoices arrive.
  if (summary.imported > 0) {
    checkAlertsAfterImport(userId, req.log).catch(() => {});
  }
  // Po imporcie nadaj sugestie centrów kosztów (kod jednostki / opis / dostawca) —
  // faktury wchodzą bez przypisania, użytkownik potwierdza sugestię jednym kliknięciem.
  if (summary.imported > 0 || summary.pending > 0) {
    resuggestForUser(userId, req.log).catch((err: unknown) =>
      req.log.warn({ err: String(err) }, "resuggestForUser po sync nieudany"),
    );
  }
}

// ─── Auto-sync (harmonogram w tle) ────────────────────────────────────────────
// Bezgłowa (headless) synchronizacja uruchamiana przez scheduler — bez żądania HTTP
// ani SSE. Respektuje te same zabezpieczenia co ręczny sync: guard rate_limited_until
// oraz advisory lock per NIP (nie nachodzi na ręczną synchronizację ani inny auto-sync).
export async function runAutoSyncForUser(userId: string, log: Logger): Promise<void> {
  const cfg = await loadConfig(userId);
  if (!cfg) return;

  const remaining = await nipRateLimitSecondsRemaining(cfg.nip);
  if (remaining > 0) {
    log.info({ userId, nip: cfg.nip, remaining }, "Auto-sync KSeF pominięty — aktywny rate-limit");
    return;
  }

  const lock = await AdvisoryLock.tryAcquire("ksef_sync", cfg.nip);
  if (!lock) {
    log.info({ userId, nip: cfg.nip }, "Auto-sync KSeF pominięty — trwa inna synchronizacja");
    return;
  }

  // runSync korzysta wyłącznie z req.log — podajemy lekki obiekt z loggerem.
  const ctx = { log } as unknown as Request;
  try {
    await runSync(ctx, userId, cfg, () => { /* brak strumienia postępu w tle */ });
    log.info({ userId }, "Auto-sync KSeF zakończony");
  } catch (err) {
    log.warn({ userId, err: String(err) }, "Auto-sync KSeF nieudany");
  } finally {
    await lock.release().catch(() => {});
  }
}

// ─── Pending retry ───────────────────────────────────────────────────────────

router.post("/ksef/pending/retry", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();

  const stillPending = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(
      and(
        eq(ksefPendingInvoicesTable.userId, userId),
        inArray(ksefPendingInvoicesTable.status, ["pending", "rejected"]),
      ),
    );

  let imported = 0;
  let remainingPending = stillPending.length;

  for (const row of stillPending) {
    try {
      const parsed = row.parsedJson as ParsedFa3;
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) continue;
      const match = await tryMatch(userId, parsed);
      if (!match.supplier) continue;

      const resolvedProductIds: number[] = [];
      for (let i = 0; i < parsed.items.length; i++) {
        let pid = match.itemProductIds[i];
        if (pid == null) {
          pid = await findOrCreateProductByName(userId, parsed.items[i].name, parsed.items[i].unit);
        }
        resolvedProductIds.push(pid);
      }

      const totalAmount =
        parsed.header.totalGross ?? parsed.items.reduce((s, it) => s + it.gross, 0);
      const invNum = parsed.header.invoiceNumber ?? row.ksefNumber;
      const invDate = parsed.header.invoiceDate ?? isoDate(now);

      const rowPayMethod = (parsed.header.paymentMethod as "gotowka" | "przelew" | "karta" | null | undefined) ?? null;
      const rowPayDue = rowPayMethod === "przelew" ? (parsed.header.paymentDueDate ?? null) : null;
      const wasNewlyImported = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: invoicesTable.id })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.userId, userId),
              eq(invoicesTable.supplierId, match.supplier!.id),
              eq(invoicesTable.invoiceNumber, invNum),
            ),
          )
          .limit(1);
        let inserted = false;
        if (existing) {
          await tx
            .update(invoicesTable)
            .set({
              ksefNumber: row.ksefNumber,
              xmlContent: encryptXml(row.rawXml),
              totalAmount: totalAmount.toFixed(2),
              invoiceDate: invDate,
              ...(rowPayMethod != null ? { paymentMethod: rowPayMethod, paymentDueDate: rowPayDue } : {}),
            })
            .where(eq(invoicesTable.id, existing.id));
        } else {
          const insertedRows = await tx
            .insert(invoicesTable)
            .values({
              userId,
              supplierId: match.supplier!.id,
              invoiceNumber: invNum,
              invoiceDate: invDate,
              totalAmount: totalAmount.toFixed(2),
              xmlContent: encryptXml(row.rawXml),
              ksefNumber: row.ksefNumber,
              paymentMethod: rowPayMethod,
              paymentDueDate: rowPayDue,
              isPaid: rowPayMethod === "gotowka" || rowPayMethod === "karta",
              paidAt: rowPayMethod === "gotowka" || rowPayMethod === "karta" ? new Date() : null,
              costCenterId: null, // bez auto-przypisania — sugestię nada resuggestForUser po sync, user potwierdza
            })
            .onConflictDoNothing({ target: [invoicesTable.userId, invoicesTable.ksefNumber] })
            .returning();
          const inv = insertedRows[0];
          if (inv) {
            inserted = true;
            for (let i = 0; i < parsed.items.length; i++) {
              const item = parsed.items[i];
              await tx.insert(invoiceItemsTable).values({
                invoiceId: inv.id,
                productId: resolvedProductIds[i],
                productName: item.name,
                quantity: item.quantity.toString(),
                unit: item.unit,
                unitPrice: item.unitPrice.toString(),
                totalPrice: item.net.toString(),
                vatRate: item.vatRate != null ? item.vatRate.toString() : null,
              });
            }
          }
        }
        await tx
          .update(ksefPendingInvoicesTable)
          .set({ status: "accepted" })
          .where(eq(ksefPendingInvoicesTable.id, row.id));
        return inserted;
      });

      if (wasNewlyImported) imported++;
      remainingPending = Math.max(0, remainingPending - 1);
    } catch (err) {
      req.log.error({ pendingId: row.id, err: String(err) }, "KSeF pending retry failed");
    }
  }

  // Reguła: po każdym imporcie faktury sprawdzamy progi alertów cenowych.
  if (imported > 0) checkAlertsAfterImport(userId, req.log).catch(() => {});

  res.json({ imported, stillPending: remainingPending });
});

// ─── Pending review ──────────────────────────────────────────────────────────

router.get("/ksef/pending", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const q = ListKsefPendingQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const status = q.data.status ?? "pending";

  const rows = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(
      and(
        eq(ksefPendingInvoicesTable.userId, userId),
        eq(ksefPendingInvoicesTable.status, status),
      ),
    )
    .orderBy(desc(ksefPendingInvoicesTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      ksefNumber: r.ksefNumber,
      sellerNip: r.sellerNip,
      sellerName: r.sellerName,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      totalGross: toNumOrNull(r.totalGross),
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.delete("/ksef/pending/delete-all", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const validStatuses = ["pending", "accepted", "rejected"] as const;
  type Status = (typeof validStatuses)[number];

  const conditions = [eq(ksefPendingInvoicesTable.userId, userId)];
  if (status && (validStatuses as readonly string[]).includes(status)) {
    conditions.push(eq(ksefPendingInvoicesTable.status, status as Status));
  }

  const result = await db
    .delete(ksefPendingInvoicesTable)
    .where(and(...conditions))
    .returning({ id: ksefPendingInvoicesTable.id });

  res.json({ deleted: result.length });
});

router.get("/ksef/pending/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const p = GetKsefPendingParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(
      and(eq(ksefPendingInvoicesTable.id, p.data.id), eq(ksefPendingInvoicesTable.userId, userId)),
    );

  if (!row) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }

  const parsed = row.parsedJson as ParsedFa3;
  const match = await tryMatch(userId, parsed);

  res.json({
    id: row.id,
    ksefNumber: row.ksefNumber,
    sellerNip: row.sellerNip,
    sellerName: row.sellerName,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    totalGross: toNumOrNull(row.totalGross),
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    suggestedSupplierId: match.supplier?.id ?? null,
    items: parsed.items.map((it, i) => ({
      ...it,
      suggestedProductId: match.itemProductIds[i] ?? null,
    })),
  });
});

router.delete("/ksef/pending/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const p = GetKsefPendingParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }

  const result = await db
    .delete(ksefPendingInvoicesTable)
    .where(
      and(eq(ksefPendingInvoicesTable.id, p.data.id), eq(ksefPendingInvoicesTable.userId, userId)),
    )
    .returning({ id: ksefPendingInvoicesTable.id });

  if (result.length === 0) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }

  res.json({ deleted: true });
});

router.post("/ksef/pending/:id/accept", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const p = AcceptKsefPendingParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  const body = AcceptKsefPendingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(
      and(eq(ksefPendingInvoicesTable.id, p.data.id), eq(ksefPendingInvoicesTable.userId, userId)),
    );

  if (!row) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }
  if (row.status !== "pending") {
    res.status(409).json({ error: "Ta faktura została już rozpatrzona." });
    return;
  }

  const [dup] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.userId, userId), eq(invoicesTable.ksefNumber, row.ksefNumber)))
    .limit(1);
  if (dup) {
    await db
      .update(ksefPendingInvoicesTable)
      .set({ status: "accepted" })
      .where(eq(ksefPendingInvoicesTable.id, row.id));
    res.status(409).json({ error: "Faktura o tym numerze KSeF jest już zaimportowana.", invoiceId: dup.id });
    return;
  }

  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, body.data.supplierId), eq(suppliersTable.userId, userId)));
  if (!supplier) {
    res.status(400).json({ error: "Wybrany dostawca nie istnieje." });
    return;
  }

  const parsed = row.parsedJson as ParsedFa3;
  if (parsed.items.length === 0) {
    res.status(400).json({ error: "Faktura nie zawiera pozycji." });
    return;
  }

  const mappingByIndex = new Map<number, number>();
  for (const m of body.data.itemMappings) {
    mappingByIndex.set(m.index, m.productId);
  }
  if (mappingByIndex.size === 0) {
    res.status(400).json({ error: "Musisz dopasować co najmniej jedną pozycję." });
    return;
  }

  const productIds = Array.from(new Set(mappingByIndex.values()));
  const products = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), inArray(productsTable.id, productIds)));
  if (products.length !== productIds.length) {
    res.status(400).json({ error: "Jeden z wybranych produktów nie istnieje." });
    return;
  }

  const totalAmount = parsed.items.reduce(
    (s, item, i) => (mappingByIndex.has(i) ? s + item.gross : s),
    0,
  );
  const acceptPayMethod = (parsed.header.paymentMethod as "gotowka" | "przelew" | "karta" | null | undefined) ?? null;
  const acceptPayDue = acceptPayMethod === "przelew" ? (parsed.header.paymentDueDate ?? null) : null;
  const acceptNow = new Date();

  const created = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoicesTable)
      .values({
        userId,
        supplierId: supplier.id,
        invoiceNumber: parsed.header.invoiceNumber ?? row.ksefNumber,
        invoiceDate: parsed.header.invoiceDate ?? isoDate(new Date()),
        totalAmount: totalAmount.toFixed(2),
        xmlContent: encryptXml(row.rawXml),
        ksefNumber: row.ksefNumber,
        paymentMethod: acceptPayMethod,
        paymentDueDate: acceptPayDue,
        isPaid: acceptPayMethod === "gotowka" || acceptPayMethod === "karta",
        paidAt: acceptPayMethod === "gotowka" || acceptPayMethod === "karta" ? new Date() : null,
        costCenterId: null, // bez auto-przypisania — sugestię nada resuggestForUser po sync, user potwierdza
      })
      .returning();

    const items: Array<typeof invoiceItemsTable.$inferSelect> = [];
    for (let i = 0; i < parsed.items.length; i++) {
      if (!mappingByIndex.has(i)) continue;
      const item = parsed.items[i];
      const [inserted] = await tx
        .insert(invoiceItemsTable)
        .values({
          invoiceId: inv.id,
          productId: mappingByIndex.get(i)!,
          productName: item.name,
          quantity: item.quantity.toString(),
          unit: item.unit,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.net.toString(),
          vatRate: item.vatRate != null ? item.vatRate.toString() : null,
        })
        .returning();
      items.push(inserted);
    }

    await tx
      .update(ksefPendingInvoicesTable)
      .set({ status: "accepted" })
      .where(eq(ksefPendingInvoicesTable.id, row.id));

    return { inv, items };
  });

  // Reguła: po każdym imporcie faktury sprawdzamy progi alertów cenowych.
  checkAlertsAfterImport(userId, req.log).catch(() => {});

  // Faktura wchodzi bez centrum — od razu (synchronicznie) liczymy sugestię do potwierdzenia,
  // żeby chip „Sugerowane" był widoczny natychmiast po odświeżeniu listy.
  let suggestedCostCenterId: number | null = null;
  try {
    const centers = await db
      .select({ id: costCentersTable.id, aliases: costCentersTable.aliases })
      .from(costCentersTable)
      .where(eq(costCentersTable.userId, userId));
    if (centers.length > 0) {
      const model = await buildCostCenterModel(userId);
      suggestedCostCenterId = computeCostCenterSuggestion({
        xml: row.rawXml,
        centers,
        productNames: created.items.map((it) => it.productName),
        supplierId: supplier.id,
        supplierDefaultCostCenterId: supplier.defaultCostCenterId ?? null,
        model,
      });
      if (suggestedCostCenterId != null) {
        await db
          .update(invoicesTable)
          .set({ suggestedCostCenterId })
          .where(eq(invoicesTable.id, created.inv.id));
      }
    }
  } catch (err) {
    req.log.warn({ err: String(err) }, "sugestia centrum po akceptacji pending nieudana");
  }

  res.json({
    id: created.inv.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    invoiceNumber: created.inv.invoiceNumber,
    invoiceDate: created.inv.invoiceDate,
    totalAmount: toNum(created.inv.totalAmount),
    suggestedCostCenterId,
    importedAt: created.inv.importedAt.toISOString(),
    items: created.items.map((it) => ({
      ...it,
      quantity: toNum(it.quantity),
      unitPrice: toNum(it.unitPrice),
      totalPrice: toNum(it.totalPrice),
      vatRate: toNumOrNull(it.vatRate),
    })),
  });
});

router.post("/ksef/pending/:id/reject", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const p = RejectKsefPendingParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  await db
    .update(ksefPendingInvoicesTable)
    .set({ status: "rejected" })
    .where(
      and(
        eq(ksefPendingInvoicesTable.id, p.data.id),
        eq(ksefPendingInvoicesTable.userId, userId),
        eq(ksefPendingInvoicesTable.status, "pending"),
      ),
    );
  res.sendStatus(204);
});

export default router;
