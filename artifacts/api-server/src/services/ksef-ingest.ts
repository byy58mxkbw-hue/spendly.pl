// Pipeline ingestii faktur KSeF + pomocnicze (dopasowanie dostawcy/produktów,
// cache sesji, per-NIP rate limit, mapowanie błędów). Wydzielone z routes/ksef.ts —
// współdzielone przez runSync ORAZ routy kolejki „Do przeglądu" (accept/retry).
// Zachowanie identyczne jak przed wydzieleniem.
import type { Request } from "express";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
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
import { decryptSecret, encryptSecret } from "../lib/encryption";
import { categorizeProductWithAI } from "../lib/categorize-ai.js";

// Wiersz ksef_config (tenant-safe: zawsze filtrowany po userId/NIP u wywołującego).
type KsefConfigRow = typeof ksefConfigTable.$inferSelect;

export function encryptXml(xml: string | null | undefined): string | null {
  if (!xml) return null;
  try { return encryptSecret(xml); } catch { return null; }
}

export function describeDbErr(err: unknown): string {
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

export function mapKsefError(err: unknown): { status: number; message: string } {
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

export function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export interface MatchResult {
  supplier: { id: number; name: string; defaultCostCenterId: number | null } | null;
  itemProductIds: Array<number | null>;
  missingProducts: string[];
}

export async function findOrCreateProductByName(
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
        sql`regexp_replace(LOWER(${productsTable.name}), '\\s+', ' ', 'g') = regexp_replace(LOWER(${trimmed}), '\\s+', ' ', 'g')`,
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

export async function tryMatch(userId: string, parsed: ParsedFa3): Promise<MatchResult> {
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
          sql`regexp_replace(LOWER(${productsTable.name}), '\\s+', ' ', 'g') = regexp_replace(LOWER(${item.name}), '\\s+', ' ', 'g')`,
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
export async function nipRateLimitSecondsRemaining(nip: string): Promise<number> {
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
export async function markNipRateLimited(nip: string, retryAfterSeconds: number): Promise<void> {
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

export async function acquireSession(
  cfg: KsefConfigRow,
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

export async function clearCachedSession(cfgId: number): Promise<void> {
  await db
    .update(ksefConfigTable)
    .set({ sessionToken: null, sessionValidUntil: null })
    .where(eq(ksefConfigTable.id, cfgId))
    .catch(() => {});
}

// ─── Shared ingest (bulk export + per-invoice) ───────────────────────────────

export type SyncSummary = { imported: number; pending: number; failed: number; errors: string[] };

// Insert a matched invoice straight into `invoices` (+ items), creating any missing
// products by name. Returns true when a new invoice row was created. Does not touch
// the pending queue.
export async function importMatchedInvoice(
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
        costCenterId: null, // bez auto-przypisania — sugestię nada resuggestForUser po sync, user potwierdza
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
export async function ingestInvoiceXml(
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
export async function ingestViaExport(
  req: Request,
  userId: string,
  cfg: KsefConfigRow,
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
