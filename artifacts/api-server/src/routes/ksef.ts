import { Router, type IRouter, type Request, type Response } from "express";
import { toNum, toNumOrNull } from "../lib/parse";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { categorizeProductWithAI } from "../lib/categorize-ai.js";
import {
  db,
  ksefConfigTable,
  ksefPendingInvoicesTable,
  invoicesTable,
  invoiceItemsTable,
  suppliersTable,
  productsTable,
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
  KsefError,
  KsefNetworkError,
  KsefParseError,
  KsefRateLimitError,
  KsefServerError,
  KSEF_PRODUCTION_BASE_URL,
  parseFA3Xml,
  type KsefSession,
  type ParsedFa3,
} from "@workspace/ksef-client";
import { decryptSecret, encryptSecret, maskToken } from "../lib/encryption";
import { checkAlertsAfterImport } from "../services/alert-checker";
import { AdvisoryLock } from "../lib/advisory-lock";

function encryptXml(xml: string | null | undefined): string | null {
  if (!xml) return null;
  try { return encryptSecret(xml); } catch { return null; }
}

function decryptXml(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try { return decryptSecret(enc); } catch { return enc; }
}

const router: IRouter = Router();

// Delay between listInvoices window queries (metadata). KSeF rate-limits aggressively
// on metadata queries — 600ms was too short for 20+ windows (triggered 1-hour ban).
// 2 500ms gives ~62s total for 25 windows, well within observed rate limits.
const INTER_WINDOW_DELAY_MS = 2500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function describeDbErr(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; cause?: { code?: string; detail?: string; constraint?: string; message?: string } };
    const cause = e.cause;
    if (cause) {
      return [
        cause.message ?? "",
        cause.code ? `code=${cause.code}` : "",
        cause.constraint ? `constraint=${cause.constraint}` : "",
        cause.detail ? `detail=${cause.detail}` : "",
      ].filter(Boolean).join(" | ");
    }
    return e.message ?? String(err);
  }
  return String(err);
}

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
): { nip: string; tokenMasked: string; environment: string; lastSyncedAt: string | null; syncFromDate: string | null } | null {
  if (!cfg) return null;
  return {
    nip: cfg.nip,
    tokenMasked: `••••••${cfg.tokenLast4}`,
    environment: cfg.environment,
    lastSyncedAt: cfg.lastSyncedAt ? cfg.lastSyncedAt.toISOString() : null,
    syncFromDate: cfg.syncFromDate ?? null,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapKsefError(err: unknown): { status: number; message: string } {
  if (err instanceof KsefAuthError) {
    return {
      status: 401,
      message:
        "Token KSeF został odrzucony. Wygeneruj nowy token w aplikacji KSeF i zapisz go w Ustawieniach.",
    };
  }
  if (err instanceof KsefRateLimitError) {
    const secs = err.retryAfterSeconds;
    const waitNote =
      secs > 3600
        ? `Spróbuj ponownie za ponad godzinę.`
        : secs > 60
          ? `Spróbuj ponownie za około ${Math.ceil(secs / 60)} min.`
          : `Spróbuj ponownie za chwilę.`;
    return {
      status: 429,
      message: `KSeF ogranicza liczbę zapytań. ${waitNote}`,
    };
  }
  if (err instanceof KsefServerError) {
    return { status: 502, message: "KSeF jest chwilowo niedostępny. Spróbuj ponownie później." };
  }
  if (err instanceof KsefNetworkError) {
    return { status: 502, message: "Nie udało się połączyć z KSeF. Sprawdź połączenie sieciowe." };
  }
  if (err instanceof KsefParseError) {
    return { status: 502, message: `Nie udało się odczytać odpowiedzi z KSeF: ${err.message}` };
  }
  if (err instanceof KsefError) {
    return { status: 502, message: err.message };
  }
  return { status: 500, message: (err as Error)?.message ?? "Nieznany błąd." };
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface MatchResult {
  supplier: { id: number; name: string; defaultCostCenterId: number | null } | null;
  itemProductIds: Array<number | null>;
  missingProducts: string[];
}

async function findOrCreateProductByName(
  userId: string,
  name: string,
  unit: string,
): Promise<number> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.userId, userId),
        sql`regexp_replace(LOWER(${productsTable.name}), '\s+', ' ', 'g') = regexp_replace(LOWER(${trimmed}), '\s+', ' ', 'g')`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const classification = await categorizeProductWithAI(trimmed, userId);
  const [created] = await db
    .insert(productsTable)
    .values({
      userId,
      name: trimmed,
      unit: unit?.trim() || "szt",
      category: classification.category,
      subcategory: classification.subcategory,
      classificationConfidence: classification.confidence,
      canonicalName: classification.canonicalName,
      needsReview: classification.confidence < 0.75,
    })
    .returning({ id: productsTable.id });
  return created.id;
}

async function tryMatch(userId: string, parsed: ParsedFa3): Promise<MatchResult> {
  const sellerNip = parsed.header.sellerNip ?? "";
  let supplier: { id: number; name: string; defaultCostCenterId: number | null } | null = null;
  if (sellerNip) {
    const cleaned = sellerNip.replace(/\D/g, "");
    const [s] = await db
      .select({ id: suppliersTable.id, name: suppliersTable.name, defaultCostCenterId: suppliersTable.defaultCostCenterId })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.userId, userId),
          sql`regexp_replace(${suppliersTable.taxId}, '[^0-9]', '', 'g') = ${cleaned}`,
        ),
      )
      .limit(1);
    if (s) supplier = s;
  }

  const itemProductIds: Array<number | null> = [];
  const missing: string[] = [];
  for (const item of parsed.items) {
    const [prod] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.userId, userId),
          sql`regexp_replace(LOWER(${productsTable.name}), '\s+', ' ', 'g') = regexp_replace(LOWER(${item.name}), '\s+', ' ', 'g')`,
        ),
      )
      .limit(1);
    if (prod) {
      itemProductIds.push(prod.id);
    } else {
      itemProductIds.push(null);
      missing.push(item.name);
    }
  }

  return { supplier, itemProductIds, missingProducts: missing };
}

// ─── Per-NIP rate limit helpers ──────────────────────────────────────────────

/**
 * Returns how many seconds the NIP is still blocked, or 0 if it's free.
 * Checks ALL user configs for this NIP so that one user's sync exhaustion
 * protects all other users sharing the same NIP.
 */
async function nipRateLimitSecondsRemaining(nip: string): Promise<number> {
  const [row] = await db
    .select({ rateLimitedUntil: ksefConfigTable.rateLimitedUntil })
    .from(ksefConfigTable)
    .where(and(eq(ksefConfigTable.nip, nip), gt(ksefConfigTable.rateLimitedUntil, sql`NOW()`)))
    .orderBy(desc(ksefConfigTable.rateLimitedUntil))
    .limit(1);
  if (!row?.rateLimitedUntil) return 0;
  return Math.max(0, Math.ceil((row.rateLimitedUntil.getTime() - Date.now()) / 1000));
}

/**
 * Marks every ksef_config row for this NIP as rate-limited until `until`.
 * This protects all accounts sharing the NIP from wasting retries.
 */
async function markNipRateLimited(nip: string, retryAfterSeconds: number): Promise<void> {
  const until = new Date(Date.now() + retryAfterSeconds * 1000);
  await db
    .update(ksefConfigTable)
    .set({ rateLimitedUntil: until })
    .where(eq(ksefConfigTable.nip, nip));
}

// ─── Session reuse ───────────────────────────────────────────────────────────

// Reuse a cached KSeF access token while it is comfortably valid, so repeat syncs
// (which are common because rate limits force partial imports) skip the multi-call
// auth handshake. Only trusted when KSeF gave us an explicit expiry.
const SESSION_SAFETY_MARGIN_MS = 5 * 60 * 1000;

async function acquireSession(
  cfg: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  token: string,
  client: KsefClient,
  req: Request,
): Promise<KsefSession> {
  if (
    cfg.sessionToken &&
    cfg.sessionValidUntil &&
    cfg.sessionValidUntil.getTime() - Date.now() > SESSION_SAFETY_MARGIN_MS
  ) {
    try {
      const cached = decryptSecret(cfg.sessionToken);
      req.log.info({ validUntil: cfg.sessionValidUntil.toISOString() }, "KSeF reusing cached session");
      return {
        sessionToken: cached,
        nip: cfg.nip,
        baseUrl: KSEF_PRODUCTION_BASE_URL,
        issuedAt: Date.now(),
        validUntil: cfg.sessionValidUntil.getTime(),
      };
    } catch {
      // Decrypt failed (e.g. key rotated) — fall through to a fresh authentication.
    }
  }

  const session = await client.authenticate(cfg.nip, token);
  // Persist for reuse only when KSeF returned an expiry we can trust.
  if (session.validUntil) {
    try {
      await db
        .update(ksefConfigTable)
        .set({ sessionToken: encryptSecret(session.sessionToken), sessionValidUntil: new Date(session.validUntil) })
        .where(eq(ksefConfigTable.id, cfg.id));
    } catch (err) {
      req.log.warn({ err: String(err) }, "Failed to persist KSeF session cache");
    }
  }
  return session;
}

async function clearCachedSession(cfgId: number): Promise<void> {
  await db
    .update(ksefConfigTable)
    .set({ sessionToken: null, sessionValidUntil: null })
    .where(eq(ksefConfigTable.id, cfgId))
    .catch(() => {});
}

// ─── Shared ingest (bulk export + per-invoice) ───────────────────────────────

type SyncSummary = { imported: number; pending: number; failed: number; errors: string[] };

// Insert a matched invoice straight into `invoices` (+ items), creating any missing
// products by name. Returns true when a new invoice row was created. Does not touch
// the pending queue.
async function importMatchedInvoice(
  userId: string,
  parsed: ParsedFa3,
  rawXml: string,
  ksefNumber: string,
  match: MatchResult,
  now: Date,
): Promise<boolean> {
  const supplier = match.supplier!;
  const resolvedProductIds: number[] = [];
  for (let i = 0; i < parsed.items.length; i++) {
    let pid = match.itemProductIds[i];
    if (pid == null) pid = await findOrCreateProductByName(userId, parsed.items[i].name, parsed.items[i].unit);
    resolvedProductIds.push(pid);
  }
  const totalAmount = parsed.header.totalGross ?? parsed.items.reduce((s, it) => s + it.gross, 0);
  const invNum = parsed.header.invoiceNumber ?? ksefNumber;
  const invDate = parsed.header.invoiceDate ?? isoDate(now);
  const payMethod = (parsed.header.paymentMethod as "gotowka" | "przelew" | "karta" | null | undefined) ?? null;
  const payDue = payMethod === "przelew" ? (parsed.header.paymentDueDate ?? null) : null;

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.userId, userId), eq(invoicesTable.supplierId, supplier.id), eq(invoicesTable.invoiceNumber, invNum)))
      .limit(1);
    if (existing) {
      await tx
        .update(invoicesTable)
        .set({
          ksefNumber,
          xmlContent: encryptXml(rawXml),
          totalAmount: totalAmount.toFixed(2),
          invoiceDate: invDate,
          ...(payMethod != null ? { paymentMethod: payMethod, paymentDueDate: payDue } : {}),
        })
        .where(eq(invoicesTable.id, existing.id));
      return false;
    }
    const insertedRows = await tx
      .insert(invoicesTable)
      .values({
        userId,
        supplierId: supplier.id,
        invoiceNumber: invNum,
        invoiceDate: invDate,
        totalAmount: totalAmount.toFixed(2),
        xmlContent: encryptXml(rawXml),
        ksefNumber,
        paymentMethod: payMethod,
        paymentDueDate: payDue,
        isPaid: payMethod === "gotowka" || payMethod === "karta",
        paidAt: payMethod === "gotowka" || payMethod === "karta" ? new Date() : null,
        costCenterId: supplier.defaultCostCenterId ?? null,
      })
      .onConflictDoNothing({ target: [invoicesTable.userId, invoicesTable.ksefNumber] })
      .returning();
    const inv = insertedRows[0];
    if (!inv) return false;
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
    return true;
  });
}

// Route a freshly fetched invoice: a KNOWN supplier (matched by NIP) with line items
// imports straight away (skips review); anything else lands in the pending queue.
async function ingestInvoiceXml(
  userId: string,
  ksefNumber: string,
  xml: string,
  now: Date,
  summary: SyncSummary,
): Promise<void> {
  const parsed = parseFA3Xml(xml, ksefNumber);
  const match = await tryMatch(userId, parsed);

  if (match.supplier && parsed.items.length > 0) {
    const created = await importMatchedInvoice(userId, parsed, xml, ksefNumber, match, now);
    if (created) summary.imported++;
    return;
  }

  const reasons: string[] = [];
  if (!match.supplier) {
    reasons.push(`nieznany dostawca${parsed.header.sellerNip ? ` (NIP ${parsed.header.sellerNip})` : ""}`);
  }
  if (match.missingProducts.length > 0) {
    const sample = match.missingProducts.slice(0, 3).join(", ");
    const extra = match.missingProducts.length > 3 ? ` i ${match.missingProducts.length - 3} innych` : "";
    reasons.push(`brak produktów: ${sample}${extra}`);
  }
  if (parsed.items.length === 0) reasons.push("brak pozycji w XML");

  await db
    .insert(ksefPendingInvoicesTable)
    .values({
      userId,
      ksefNumber,
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
}

// Bulk-export fast path: pull every invoice in [from, now] in one encrypted package
// and ingest each. Returns true if the export ran (caller then skips per-invoice
// fetching); throws to trigger the per-invoice fallback.
async function ingestViaExport(
  req: Request,
  userId: string,
  cfg: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  client: KsefClient,
  session: KsefSession,
  overallFrom: Date,
  now: Date,
  summary: SyncSummary,
  onProgress: (event: Record<string, unknown>) => void,
): Promise<boolean> {
  const exported = await client.exportInvoices(
    session,
    { subjectType: "buyer", dateFrom: isoDate(overallFrom), dateTo: isoDate(now) },
    (p) => {
      if (p.phase === "preparing") {
        onProgress({ type: "scanning", windowsDone: 0, windowsTotal: 1 });
      } else if (p.phase === "downloading") {
        onProgress({ type: "fetching", fetched: p.partsDone ?? 0, total: p.partsTotal ?? 0 });
      }
    },
  );

  const refNumbers = exported.map((e) => e.ksefReferenceNumber).filter(Boolean);
  if (refNumbers.length === 0) {
    onProgress({ type: "fetching", fetched: 0, total: 0 });
    return true;
  }

  const [existingImported, existingPending] = await Promise.all([
    db.select({ k: invoicesTable.ksefNumber }).from(invoicesTable)
      .where(and(eq(invoicesTable.userId, userId), inArray(invoicesTable.ksefNumber, refNumbers))),
    db.select({ k: ksefPendingInvoicesTable.ksefNumber }).from(ksefPendingInvoicesTable)
      .where(and(eq(ksefPendingInvoicesTable.userId, userId), inArray(ksefPendingInvoicesTable.ksefNumber, refNumbers))),
  ]);
  const seen = new Set<string>([
    ...existingImported.map((r) => r.k!).filter(Boolean),
    ...existingPending.map((r) => r.k),
  ]);
  const fresh = exported.filter((e) => !seen.has(e.ksefReferenceNumber));

  req.log.info({ exported: exported.length, fresh: fresh.length, nip: cfg.nip }, "KSeF bulk export downloaded");
  onProgress({ type: "fetching", fetched: 0, total: fresh.length });
  for (let i = 0; i < fresh.length; i++) {
    try {
      await ingestInvoiceXml(userId, fresh[i].ksefReferenceNumber, fresh[i].xml, now, summary);
    } catch (err) {
      summary.failed++;
      // Do klienta tylko generyk (bez wewnętrznych detali DB); pełny błąd ląduje w logach.
      const clientMsg = process.env.NODE_ENV === "development" ? describeDbErr(err) : "błąd zapisu faktury";
      summary.errors.push(`Faktura ${fresh[i].ksefReferenceNumber}: ${clientMsg}`);
      req.log.error({ ksefRef: fresh[i].ksefReferenceNumber, err: describeDbErr(err) }, "KSeF export ingest failed");
    }
    onProgress({ type: "fetching", fetched: i + 1, total: fresh.length });
  }
  return true;
}

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
              costCenterId: match.supplier!.defaultCostCenterId ?? null,
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

  // Fire-and-forget AI insight generation after sync completes.
  if (summary.imported > 0 || summary.pending > 0) {
    import("../services/insights-generator")
      .then(({ generateInsights }) => generateInsights(userId, req.log))
      .catch((err: unknown) => req.log.warn({ err: String(err) }, "AI CFO post-sync generation failed"));
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
              costCenterId: match.supplier!.defaultCostCenterId ?? null,
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
        costCenterId: supplier.defaultCostCenterId ?? null,
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

  res.json({
    id: created.inv.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    invoiceNumber: created.inv.invoiceNumber,
    invoiceDate: created.inv.invoiceDate,
    totalAmount: toNum(created.inv.totalAmount),
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
