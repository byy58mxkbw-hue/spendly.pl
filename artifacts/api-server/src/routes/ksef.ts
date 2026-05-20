import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  parseFA3Xml,
  type ParsedFa3,
} from "@workspace/ksef-client";
import { decryptSecret, encryptSecret, maskToken } from "../lib/encryption";

const router: IRouter = Router();

// Per-process lock to prevent two parallel syncs from racing on KSeF rate limits
// and tripping our own UNIQUE(ksef_number) constraints.
const syncInFlight = new Set<number>();

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

async function loadConfig() {
  const [cfg] = await db.select().from(ksefConfigTable).limit(1);
  return cfg ?? null;
}

function viewConfig(
  cfg: Awaited<ReturnType<typeof loadConfig>>,
): { nip: string; tokenMasked: string; environment: string; lastSyncedAt: string | null } | null {
  if (!cfg) return null;
  return {
    nip: cfg.nip,
    tokenMasked: `••••••${cfg.tokenLast4}`,
    environment: cfg.environment,
    lastSyncedAt: cfg.lastSyncedAt ? cfg.lastSyncedAt.toISOString() : null,
  };
}

router.get("/ksef/config", async (_req, res): Promise<void> => {
  const cfg = await loadConfig();
  res.json(viewConfig(cfg));
});

router.put("/ksef/config", async (req, res): Promise<void> => {
  const parsed = UpdateKsefConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const nip = parsed.data.nip.replace(/\D/g, "");
  if (nip.length !== 10) {
    res.status(400).json({ error: "NIP musi składać się z 10 cyfr." });
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

  const existing = await loadConfig();
  let saved;
  if (existing) {
    [saved] = await db
      .update(ksefConfigTable)
      .set({ nip, encryptedToken: encrypted, tokenLast4: last4, environment: "production" })
      .where(eq(ksefConfigTable.id, existing.id))
      .returning();
  } else {
    [saved] = await db
      .insert(ksefConfigTable)
      .values({ nip, encryptedToken: encrypted, tokenLast4: last4, environment: "production" })
      .returning();
  }

  req.log.info({ nip, tokenMasked: maskToken(token) }, "KSeF config updated");
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
    return {
      status: 429,
      message: "KSeF chwilowo ogranicza liczbę zapytań. Spróbuj ponownie za kilka minut.",
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
  supplier: { id: number; name: string } | null;
  itemProductIds: Array<number | null>;
  missingProducts: string[];
}

async function findOrCreateProductByName(
  name: string,
  unit: string,
): Promise<number> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(sql`LOWER(${productsTable.name}) = LOWER(${trimmed})`)
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(productsTable)
    .values({ name: trimmed, unit: unit?.trim() || "szt" })
    .returning({ id: productsTable.id });
  return created.id;
}

async function tryMatch(parsed: ParsedFa3): Promise<MatchResult> {
  const sellerNip = parsed.header.sellerNip ?? "";
  let supplier: { id: number; name: string } | null = null;
  if (sellerNip) {
    const cleaned = sellerNip.replace(/\D/g, "");
    const [s] = await db
      .select({ id: suppliersTable.id, name: suppliersTable.name })
      .from(suppliersTable)
      .where(sql`regexp_replace(${suppliersTable.taxId}, '[^0-9]', '', 'g') = ${cleaned}`)
      .limit(1);
    if (s) supplier = s;
  }

  const itemProductIds: Array<number | null> = [];
  const missing: string[] = [];
  for (const item of parsed.items) {
    const [prod] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(sql`LOWER(${productsTable.name}) = LOWER(${item.name})`)
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

// ─── Sync ────────────────────────────────────────────────────────────────────

router.post("/ksef/sync", async (req, res): Promise<void> => {
  const cfg = await loadConfig();
  if (!cfg) {
    res.status(400).json({
      error: "Brak konfiguracji KSeF. Przejdź do Ustawień KSeF i zapisz NIP oraz token.",
    });
    return;
  }
  if (syncInFlight.has(cfg.id)) {
    res.status(409).json({
      error: "Synchronizacja KSeF już trwa. Poczekaj na jej zakończenie.",
    });
    return;
  }
  syncInFlight.add(cfg.id);
  // Safety net: also release on socket close in case the handler is killed
  // before finally{} runs (e.g. process abort).
  res.on("close", () => syncInFlight.delete(cfg.id));
  try {
    await runSync(req, res, cfg);
  } finally {
    syncInFlight.delete(cfg.id);
  }
});

async function runSync(
  req: Request,
  res: Response,
  cfg: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
): Promise<void> {
  let token: string;
  try {
    token = decryptSecret(cfg.encryptedToken);
  } catch (err) {
    req.log.error({ err }, "Failed to decrypt KSeF token");
    res.status(500).json({
      error: "Nie udało się odszyfrować zapisanego tokena KSeF. Zapisz go ponownie w Ustawieniach.",
    });
    return;
  }

  const client = new KsefClient({ logger: req.log });
  const summary = {
    imported: 0,
    pending: 0,
    failed: 0,
    errors: [] as string[],
  };

  let session;
  try {
    session = await client.authenticate(cfg.nip, token);
  } catch (err) {
    const m = mapKsefError(err);
    req.log.warn({ err: String(err) }, "KSeF authenticate failed");
    res.status(m.status).json({ error: m.message });
    return;
  }

  const now = new Date();
  const overallFrom = cfg.lastSyncedAt
    ? cfg.lastSyncedAt
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // KSeF refuses queries whose paginated result exceeds 10 000. To stay safe
  // for high-volume buyers, we walk the date range in 7-day windows and cap
  // pagination at 9 900 per window (pageSize 100 × 99 pages).
  const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const PAGE_SIZE = 100;
  const MAX_PAGE_OFFSET = 9900;

  const allRefsMap = new Map<string, { ksefReferenceNumber: string }>();
  let truncatedWindow = false;
  for (let winStart = new Date(overallFrom); winStart < now; winStart = new Date(winStart.getTime() + WINDOW_MS)) {
    const winEndMs = Math.min(winStart.getTime() + WINDOW_MS - 1, now.getTime());
    const winEnd = new Date(winEndMs);
    // Pass full ISO datetimes to avoid day-boundary overlap between adjacent windows.
    const dateFrom = winStart.toISOString();
    const dateTo = winEnd.toISOString();

    let pageOffset = 0;
    while (true) {
      let page;
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
        const m = mapKsefError(err);
        req.log.warn({ err: String(err), dateFrom, dateTo, pageOffset }, "KSeF listInvoices failed");
        res.status(m.status).json({ error: m.message });
        return;
      }

      for (const inv of page.invoices) {
        if (inv.ksefReferenceNumber) {
          allRefsMap.set(inv.ksefReferenceNumber, inv);
        }
      }
      if (page.isTruncated) {
        truncatedWindow = true;
        summary.errors.push(
          `Okno ${dateFrom.slice(0, 10)}…${dateTo.slice(0, 10)} przekroczyło limit KSeF — część faktur pominięta.`,
        );
        break;
      }
      if (!page.hasMore || page.invoices.length === 0) break;
      pageOffset = page.nextOffset;
      if (pageOffset > MAX_PAGE_OFFSET) {
        truncatedWindow = true;
        summary.errors.push(
          `Okno ${dateFrom.slice(0, 10)}…${dateTo.slice(0, 10)} przekroczyło ${MAX_PAGE_OFFSET} wyników — część faktur pominięta.`,
        );
        break;
      }
    }
  }
  const allRefs = Array.from(allRefsMap.values());

  if (allRefs.length === 0) {
    let updatedLastSyncedAt: Date | null = cfg.lastSyncedAt;
    if (!truncatedWindow) {
      await db
        .update(ksefConfigTable)
        .set({ lastSyncedAt: now })
        .where(eq(ksefConfigTable.id, cfg.id));
      updatedLastSyncedAt = now;
    }
    res.json({
      ...summary,
      lastSyncedAt: updatedLastSyncedAt ? updatedLastSyncedAt.toISOString() : null,
    });
    return;
  }

  // Filter out invoices we already have (either persisted or pending)
  const refNumbers = allRefs.map((r) => r.ksefReferenceNumber);
  const [existingImported, existingPending] = await Promise.all([
    db
      .select({ k: invoicesTable.ksefNumber })
      .from(invoicesTable)
      .where(inArray(invoicesTable.ksefNumber, refNumbers)),
    db
      .select({ k: ksefPendingInvoicesTable.ksefNumber })
      .from(ksefPendingInvoicesTable)
      .where(inArray(ksefPendingInvoicesTable.ksefNumber, refNumbers)),
  ]);
  const seen = new Set<string>([
    ...existingImported.map((r) => r.k!).filter(Boolean),
    ...existingPending.map((r) => r.k),
  ]);
  const newRefs = allRefs.filter((r) => !seen.has(r.ksefReferenceNumber));

  for (const ref of newRefs) {
    try {
      const xml = await client.getInvoiceXml(session, ref.ksefReferenceNumber);
      const parsed = parseFA3Xml(xml, ref.ksefReferenceNumber);

      const match = await tryMatch(parsed);
      const canAutoImport =
        match.supplier !== null && parsed.items.length > 0;

      if (canAutoImport && match.supplier) {
        // Auto-create any missing products so we don't block import on them.
        const resolvedProductIds: number[] = [];
        for (let i = 0; i < parsed.items.length; i++) {
          let pid = match.itemProductIds[i];
          if (pid == null) {
            pid = await findOrCreateProductByName(
              parsed.items[i].name,
              parsed.items[i].unit,
            );
          }
          resolvedProductIds.push(pid);
        }

        const totalAmount =
          parsed.header.totalGross ??
          parsed.items.reduce((s, i) => s + i.gross, 0);
        const invNum =
          parsed.header.invoiceNumber ?? ref.ksefReferenceNumber;
        const invDate = parsed.header.invoiceDate ?? isoDate(now);

        const wasImported = await db.transaction(async (tx) => {
          // If the same invoice was already imported manually (no ksef_number),
          // attach ksef metadata to it instead of inserting a duplicate.
          const [existing] = await tx
            .select({ id: invoicesTable.id })
            .from(invoicesTable)
            .where(
              and(
                eq(invoicesTable.supplierId, match.supplier!.id),
                eq(invoicesTable.invoiceNumber, invNum),
              ),
            )
            .limit(1);
          if (existing) {
            await tx
              .update(invoicesTable)
              .set({
                ksefNumber: ref.ksefReferenceNumber,
                xmlContent: xml,
                totalAmount: totalAmount.toFixed(2),
                invoiceDate: invDate,
              })
              .where(eq(invoicesTable.id, existing.id));
            return false;
          }

          const inserted = await tx
            .insert(invoicesTable)
            .values({
              supplierId: match.supplier!.id,
              invoiceNumber: invNum,
              invoiceDate: invDate,
              totalAmount: totalAmount.toFixed(2),
              xmlContent: xml,
              ksefNumber: ref.ksefReferenceNumber,
            })
            .onConflictDoNothing({ target: invoicesTable.ksefNumber })
            .returning();
          const inv = inserted[0];
          if (!inv) return false; // already imported in a concurrent run

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
        if (wasImported) summary.imported++;
      } else {
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
          .onConflictDoNothing({ target: ksefPendingInvoicesTable.ksefNumber });
        summary.pending++;
      }
    } catch (err) {
      summary.failed++;
      const m = mapKsefError(err);
      const msg = `Faktura ${ref.ksefReferenceNumber}: ${m.message}`;
      summary.errors.push(msg);
      req.log.error({ ksefRef: ref.ksefReferenceNumber, err: describeDbErr(err) }, "KSeF per-invoice fetch failed");
    }
  }

  // Retry existing pending invoices: if a supplier was added in the meantime,
  // auto-create any missing products and import them now. Failures here are
  // tracked separately so a bad legacy pending row cannot stall the watermark.
  let pendingRetryFailed = 0;
  const stillPending = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(inArray(ksefPendingInvoicesTable.status, ["pending", "rejected"]));
  for (const row of stillPending) {
    try {
      const parsed = row.parsedJson as ParsedFa3;
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) continue;
      const match = await tryMatch(parsed);
      if (!match.supplier) continue;

      const resolvedProductIds: number[] = [];
      for (let i = 0; i < parsed.items.length; i++) {
        let pid = match.itemProductIds[i];
        if (pid == null) {
          pid = await findOrCreateProductByName(parsed.items[i].name, parsed.items[i].unit);
        }
        resolvedProductIds.push(pid);
      }

      const totalAmount =
        parsed.header.totalGross ?? parsed.items.reduce((s, i) => s + i.gross, 0);
      const invNum = parsed.header.invoiceNumber ?? row.ksefNumber;
      const invDate = parsed.header.invoiceDate ?? isoDate(now);

      const wasNewlyImported = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: invoicesTable.id })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.supplierId, match.supplier!.id),
              eq(invoicesTable.invoiceNumber, invNum),
            ),
          )
          .limit(1);
        let inserted = false;
        if (existing) {
          // Attach ksef metadata to the manually-imported invoice; do not duplicate items.
          await tx
            .update(invoicesTable)
            .set({
              ksefNumber: row.ksefNumber,
              xmlContent: row.rawXml,
              totalAmount: totalAmount.toFixed(2),
              invoiceDate: invDate,
            })
            .where(eq(invoicesTable.id, existing.id));
        } else {
          const insertedRows = await tx
            .insert(invoicesTable)
            .values({
              supplierId: match.supplier!.id,
              invoiceNumber: invNum,
              invoiceDate: invDate,
              totalAmount: totalAmount.toFixed(2),
              xmlContent: row.rawXml,
              ksefNumber: row.ksefNumber,
            })
            .onConflictDoNothing({ target: invoicesTable.ksefNumber })
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
      pendingRetryFailed++;
      summary.errors.push(`Pending ${row.ksefNumber}: ${mapKsefError(err).message}`);
      req.log.error({ pendingId: row.id, err: describeDbErr(err) }, "KSeF pending retry failed");
    }
  }

  // Only advance the watermark when no per-invoice failures occurred and no
  // window was truncated, so skipped refs aren't lost on the next sync.
  let updatedLastSyncedAt: Date | null = cfg.lastSyncedAt;
  if (summary.failed === 0 && !truncatedWindow) {
    await db
      .update(ksefConfigTable)
      .set({ lastSyncedAt: now })
      .where(eq(ksefConfigTable.id, cfg.id));
    updatedLastSyncedAt = now;
  }

  res.json({
    ...summary,
    lastSyncedAt: updatedLastSyncedAt ? updatedLastSyncedAt.toISOString() : null,
  });
}

// ─── Pending review ──────────────────────────────────────────────────────────

router.get("/ksef/pending", async (req, res): Promise<void> => {
  const q = ListKsefPendingQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const status = q.data.status ?? "pending";

  const rows = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(eq(ksefPendingInvoicesTable.status, status))
    .orderBy(desc(ksefPendingInvoicesTable.createdAt));

  res.json(
    rows.map((r) => ({
      id: r.id,
      ksefNumber: r.ksefNumber,
      sellerNip: r.sellerNip,
      sellerName: r.sellerName,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      totalGross: r.totalGross != null ? parseFloat(r.totalGross) : null,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.get("/ksef/pending/:id", async (req, res): Promise<void> => {
  const p = GetKsefPendingParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(ksefPendingInvoicesTable)
    .where(eq(ksefPendingInvoicesTable.id, p.data.id));

  if (!row) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }

  const parsed = row.parsedJson as ParsedFa3;
  const match = await tryMatch(parsed);

  res.json({
    id: row.id,
    ksefNumber: row.ksefNumber,
    sellerNip: row.sellerNip,
    sellerName: row.sellerName,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    totalGross: row.totalGross != null ? parseFloat(row.totalGross) : null,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    suggestedSupplierId: match.supplier?.id ?? null,
    items: parsed.items.map((it, i) => ({
      ...it,
      suggestedProductId: match.itemProductIds[i] ?? null,
    })),
    rawXml: row.rawXml,
  });
});

router.post("/ksef/pending/:id/accept", async (req, res): Promise<void> => {
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
    .where(eq(ksefPendingInvoicesTable.id, p.data.id));

  if (!row) {
    res.status(404).json({ error: "Nie znaleziono faktury." });
    return;
  }
  if (row.status !== "pending") {
    res.status(409).json({ error: "Ta faktura została już rozpatrzona." });
    return;
  }

  // Already imported under this KSeF number?
  const [dup] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(eq(invoicesTable.ksefNumber, row.ksefNumber))
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
    .where(eq(suppliersTable.id, body.data.supplierId));
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
  for (let i = 0; i < parsed.items.length; i++) {
    if (!mappingByIndex.has(i)) {
      res.status(400).json({ error: `Brak dopasowania produktu dla pozycji #${i + 1}.` });
      return;
    }
  }

  const productIds = Array.from(new Set(mappingByIndex.values()));
  const products = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  if (products.length !== productIds.length) {
    res.status(400).json({ error: "Jeden z wybranych produktów nie istnieje." });
    return;
  }

  const totalAmount = parsed.header.totalGross ?? parsed.items.reduce((s, i) => s + i.gross, 0);

  const created = await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoicesTable)
      .values({
        supplierId: supplier.id,
        invoiceNumber: parsed.header.invoiceNumber ?? row.ksefNumber,
        invoiceDate: parsed.header.invoiceDate ?? isoDate(new Date()),
        totalAmount: totalAmount.toFixed(2),
        xmlContent: row.rawXml,
        ksefNumber: row.ksefNumber,
      })
      .returning();

    const items: Array<typeof invoiceItemsTable.$inferSelect> = [];
    for (let i = 0; i < parsed.items.length; i++) {
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
    totalAmount: parseFloat(created.inv.totalAmount as string),
    importedAt: created.inv.importedAt.toISOString(),
    items: created.items.map((it) => ({
      ...it,
      quantity: parseFloat(it.quantity),
      unitPrice: parseFloat(it.unitPrice),
      totalPrice: parseFloat(it.totalPrice),
      vatRate: it.vatRate != null ? parseFloat(it.vatRate) : null,
    })),
  });
});

router.post("/ksef/pending/:id/reject", async (req, res): Promise<void> => {
  const p = RejectKsefPendingParams.safeParse(req.params);
  if (!p.success) {
    res.status(400).json({ error: p.error.message });
    return;
  }
  await db
    .update(ksefPendingInvoicesTable)
    .set({ status: "rejected" })
    .where(and(eq(ksefPendingInvoicesTable.id, p.data.id), eq(ksefPendingInvoicesTable.status, "pending")));
  res.sendStatus(204);
});

export default router;
