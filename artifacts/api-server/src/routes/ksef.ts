import { Router, type IRouter } from "express";
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
  const dateFrom = cfg.lastSyncedAt
    ? isoDate(cfg.lastSyncedAt)
    : isoDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const dateTo = isoDate(now);

  let pageOffset = 0;
  const allRefs: Array<{ ksefReferenceNumber: string }> = [];
  while (true) {
    let page;
    try {
      page = await client.listInvoices(session, {
        subjectType: "buyer",
        nip: cfg.nip,
        dateFrom,
        dateTo,
        pageOffset,
      });
    } catch (err) {
      const m = mapKsefError(err);
      req.log.warn({ err: String(err) }, "KSeF listInvoices failed");
      res.status(m.status).json({ error: m.message });
      return;
    }

    allRefs.push(...page.invoices);
    if (!page.hasMore || page.invoices.length === 0) break;
    pageOffset = page.nextOffset;
    if (pageOffset > 5000) break; // safety cap
  }

  if (allRefs.length === 0) {
    await db
      .update(ksefConfigTable)
      .set({ lastSyncedAt: now })
      .where(eq(ksefConfigTable.id, cfg.id));
    res.json({ ...summary, lastSyncedAt: now.toISOString() });
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
      const allProductsMatched =
        match.supplier !== null &&
        parsed.items.length > 0 &&
        match.itemProductIds.every((id) => id != null);

      if (allProductsMatched && match.supplier) {
        await db.transaction(async (tx) => {
          const totalAmount =
            parsed.header.totalGross ??
            parsed.items.reduce((s, i) => s + i.gross, 0);

          const [inv] = await tx
            .insert(invoicesTable)
            .values({
              supplierId: match.supplier!.id,
              invoiceNumber:
                parsed.header.invoiceNumber ?? ref.ksefReferenceNumber,
              invoiceDate: parsed.header.invoiceDate ?? isoDate(now),
              totalAmount: totalAmount.toFixed(2),
              xmlContent: xml,
              ksefNumber: ref.ksefReferenceNumber,
            })
            .returning();

          for (let i = 0; i < parsed.items.length; i++) {
            const item = parsed.items[i];
            const productId = match.itemProductIds[i]!;
            await tx.insert(invoiceItemsTable).values({
              invoiceId: inv.id,
              productId,
              productName: item.name,
              quantity: item.quantity.toString(),
              unit: item.unit,
              unitPrice: item.unitPrice.toString(),
              totalPrice: item.net.toString(),
              vatRate: item.vatRate != null ? item.vatRate.toString() : null,
            });
          }
        });
        summary.imported++;
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

        await db.insert(ksefPendingInvoicesTable).values({
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
        });
        summary.pending++;
      }
    } catch (err) {
      summary.failed++;
      const m = mapKsefError(err);
      const msg = `Faktura ${ref.ksefReferenceNumber}: ${m.message}`;
      summary.errors.push(msg);
      req.log.error({ ksefRef: ref.ksefReferenceNumber, err: String(err) }, "KSeF per-invoice fetch failed");
    }
  }

  // Only advance the watermark when no per-invoice failures occurred,
  // so failed refs aren't skipped on the next sync.
  let updatedLastSyncedAt: Date | null = cfg.lastSyncedAt;
  if (summary.failed === 0) {
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
});

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
