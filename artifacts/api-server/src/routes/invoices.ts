import { Router, type IRouter } from "express";
import { toNum, toNumOrNull } from "../lib/parse";
import { eq, desc, and, isNull, sql, gte, lte, lt } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, suppliersTable, productsTable, costCentersTable } from "@workspace/db";
import {
  ImportInvoiceBody,
  ScanReceiptBody,
  ListInvoicesQueryParams,
  GetInvoiceParams,
  DeleteInvoiceParams,
  SetInvoiceCostCenterBody,
} from "@workspace/api-zod";
import { categorizeProductWithAI, type ClassificationResult } from "../lib/categorize-ai.js";
import { checkAlertsAfterImport } from "../services/alert-checker";
import { openai } from "@workspace/integrations-openai-ai-server";
import { encryptSecret, decryptSecret } from "../lib/encryption";

const router: IRouter = Router();

router.get("/invoices", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = ListInvoicesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { supplierId, costCenterId, limit = 50, offset = 0 } = queryParams.data;

  const invoices = await db
    .select({
      id: invoicesTable.id,
      supplierId: invoicesTable.supplierId,
      supplierName: suppliersTable.name,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceDate: invoicesTable.invoiceDate,
      totalAmount: invoicesTable.totalAmount,
      importedAt: invoicesTable.importedAt,
      excluded: invoicesTable.excluded,
      paymentMethod: invoicesTable.paymentMethod,
      paymentDueDate: invoicesTable.paymentDueDate,
      isPaid: invoicesTable.isPaid,
      paidAt: invoicesTable.paidAt,
      costCenterId: invoicesTable.costCenterId,
      costCenterName: costCentersTable.name,
      costCenterColor: costCentersTable.color,
      invoiceType: invoicesTable.invoiceType,
      parentInvoiceId: invoicesTable.parentInvoiceId,
      correctedInvoiceNumber: invoicesTable.correctedInvoiceNumber,
    })
    .from(invoicesTable)
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .leftJoin(costCentersTable, eq(invoicesTable.costCenterId, costCentersTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
        costCenterId != null
          ? costCenterId === 0
            ? isNull(invoicesTable.costCenterId)
            : eq(invoicesTable.costCenterId, costCenterId)
          : undefined,
      ),
    )
    .orderBy(desc(invoicesTable.invoiceDate))
    .limit(limit)
    .offset(offset);

  const enriched = await Promise.all(
    invoices.map(async (inv) => {
      const items = await db
        .select({ id: invoiceItemsTable.id })
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.invoiceId, inv.id));

      return {
        ...inv,
        totalAmount: toNum(inv.totalAmount),
        itemCount: items.length,
        importedAt: inv.importedAt.toISOString(),
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
        costCenterId: inv.costCenterId ?? null,
        costCenterName: inv.costCenterName ?? null,
        costCenterColor: inv.costCenterColor ?? null,
        invoiceType: inv.invoiceType ?? null,
        parentInvoiceId: inv.parentInvoiceId ?? null,
        correctedInvoiceNumber: inv.correctedInvoiceNumber ?? null,
      };
    }),
  );

  res.json(enriched);
});

// ─── Timeline endpoint ───────────────────────────────────────────────────────

router.get("/invoices/timeline", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthParam = (req.query.month as string | undefined) ?? new Date().toISOString().slice(0, 7);
  const costCenterIdRaw = req.query.costCenterId !== undefined ? Number(req.query.costCenterId) : undefined;

  const [year, month] = monthParam.split("-").map(Number);
  const firstDay = `${monthParam}-01`;
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

  const ccFilter = costCenterIdRaw !== undefined
    ? costCenterIdRaw === 0
      ? isNull(invoicesTable.costCenterId)
      : eq(invoicesTable.costCenterId, costCenterIdRaw)
    : undefined;

  // Get all invoices for the month with supplier info
  const invoicesRaw = await db
    .select({
      id: invoicesTable.id,
      supplierId: invoicesTable.supplierId,
      supplierName: suppliersTable.name,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceDate: invoicesTable.invoiceDate,
      totalAmount: invoicesTable.totalAmount,
      importedAt: invoicesTable.importedAt,
      excluded: invoicesTable.excluded,
      paymentMethod: invoicesTable.paymentMethod,
      paymentDueDate: invoicesTable.paymentDueDate,
      isPaid: invoicesTable.isPaid,
      paidAt: invoicesTable.paidAt,
    })
    .from(invoicesTable)
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        gte(invoicesTable.invoiceDate, firstDay),
        lte(invoicesTable.invoiceDate, lastDay),
        eq(invoicesTable.excluded, false),
        ccFilter,
      ),
    )
    .orderBy(desc(invoicesTable.invoiceDate));

  const ccSqlFilter = costCenterIdRaw !== undefined
    ? costCenterIdRaw === 0
      ? sql`AND i.cost_center_id IS NULL`
      : sql`AND i.cost_center_id = ${costCenterIdRaw}`
    : sql``;

  // Get category breakdown via invoice items + products
  const itemsRaw = await db.execute(sql`
    SELECT
      i.invoice_date,
      p.category,
      SUM(ii.total_price::numeric) as cat_total
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN products p ON p.id = ii.product_id
    WHERE i.user_id = ${userId}
      AND i.invoice_date >= ${firstDay}
      AND i.invoice_date <= ${lastDay}
      AND i.excluded = false
      ${ccSqlFilter}
    GROUP BY 1, 2
  `);

  // Get previous month totals for comparison
  const prevMonth = new Date(year, month - 2, 1);
  const prevFirstDay = prevMonth.toISOString().slice(0, 10);
  const prevLastDay = new Date(year, month - 1, 0).toISOString().slice(0, 10);

  const prevTotalRaw = await db.execute(sql`
    SELECT COALESCE(SUM(total_amount::numeric), 0) as total
    FROM invoices i
    WHERE i.user_id = ${userId}
      AND i.invoice_date >= ${prevFirstDay}
      AND i.invoice_date <= ${prevLastDay}
      AND i.excluded = false
      ${ccSqlFilter}
  `);

  const prevMonthTotalAmount = Number((prevTotalRaw.rows[0] as { total: string }).total ?? 0);

  // Group by date
  type DayMap = Map<string, {
    invoices: typeof invoicesRaw;
    supplierMap: Map<number, { supplierId: number; supplierName: string; totalAmount: number; invoiceCount: number }>;
    catMap: Map<string, number>;
    totalAmount: number;
  }>;

  const dayMap: DayMap = new Map();

  for (const inv of invoicesRaw) {
    const d = inv.invoiceDate;
    if (!dayMap.has(d)) {
      dayMap.set(d, { invoices: [], supplierMap: new Map(), catMap: new Map(), totalAmount: 0 });
    }
    const day = dayMap.get(d)!;
    day.invoices.push(inv);
    day.totalAmount += toNum(inv.totalAmount);

    const existing = day.supplierMap.get(inv.supplierId);
    if (existing) {
      existing.totalAmount += toNum(inv.totalAmount);
      existing.invoiceCount += 1;
    } else {
      day.supplierMap.set(inv.supplierId, {
        supplierId: inv.supplierId,
        supplierName: inv.supplierName,
        totalAmount: toNum(inv.totalAmount),
        invoiceCount: 1,
      });
    }
  }

  for (const row of itemsRaw.rows as Array<{ invoice_date: string; category: string | null; cat_total: string }>) {
    const d = row.invoice_date;
    if (!dayMap.has(d)) continue;
    const day = dayMap.get(d)!;
    const cat = row.category ?? "inne";
    day.catMap.set(cat, (day.catMap.get(cat) ?? 0) + Number(row.cat_total));
  }

  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, day]) => {
      const total = day.totalAmount;
      const categories = Array.from(day.catMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([category, catTotal]) => ({
          category,
          totalAmount: catTotal,
          percent: total > 0 ? Math.round((catTotal / total) * 100) : 0,
        }));
      const suppliers = Array.from(day.supplierMap.values())
        .sort((a, b) => b.totalAmount - a.totalAmount);
      const invoices = day.invoices.map((inv) => ({
        ...inv,
        totalAmount: toNum(inv.totalAmount),
        itemCount: 0,
        importedAt: inv.importedAt.toISOString(),
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
      }));
      return {
        date,
        totalAmount: total,
        invoiceCount: day.invoices.length,
        supplierCount: day.supplierMap.size,
        categories,
        suppliers,
        invoices,
      };
    });

  const totalAmount = days.reduce((s, d) => s + d.totalAmount, 0);
  const invoiceCount = days.reduce((s, d) => s + d.invoiceCount, 0);
  const allSupplierIds = new Set(invoicesRaw.map((i) => i.supplierId));
  const activeDays = days.filter((d) => d.totalAmount > 0);
  const avgDailyAmount = activeDays.length > 0 ? totalAmount / activeDays.length : 0;
  const biggestDay = days.length > 0
    ? days.reduce((max, d) => d.totalAmount > max.totalAmount ? d : max, days[0])
    : null;

  res.json({
    days,
    totalAmount,
    invoiceCount,
    supplierCount: allSupplierIds.size,
    biggestDay: biggestDay ? {
      date: biggestDay.date,
      totalAmount: biggestDay.totalAmount,
      invoiceCount: biggestDay.invoiceCount,
      supplierCount: biggestDay.supplierCount,
    } : null,
    avgDailyAmount,
    prevMonthTotalAmount,
  });
});

// ─── Calendar endpoint ────────────────────────────────────────────────────────

router.get("/invoices/calendar", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthParam = (req.query.month as string | undefined) ?? new Date().toISOString().slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);
  const firstDay = `${monthParam}-01`;
  const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);
  const calCcIdRaw = req.query.costCenterId !== undefined ? Number(req.query.costCenterId) : undefined;
  const calCcFilter = calCcIdRaw !== undefined
    ? calCcIdRaw === 0
      ? sql`AND cost_center_id IS NULL`
      : sql`AND cost_center_id = ${calCcIdRaw}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      invoice_date as date,
      SUM(total_amount::numeric) as total_amount,
      COUNT(*) as invoice_count
    FROM invoices
    WHERE user_id = ${userId}
      AND invoice_date >= ${firstDay}
      AND invoice_date <= ${lastDay}
      AND excluded = false
      ${calCcFilter}
    GROUP BY 1
    ORDER BY 1
  `);

  const days = (rows.rows as Array<{ date: string; total_amount: string; invoice_count: string }>).map((r) => ({
    date: r.date,
    totalAmount: Number(r.total_amount),
    invoiceCount: Number(r.invoice_count),
  }));

  const maxAmount = days.length > 0 ? Math.max(...days.map((d) => d.totalAmount)) : 0;

  res.json({ days, maxAmount });
});

// ─── Payments endpoint ────────────────────────────────────────────────────────

router.get("/invoices/payments", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const payCcIdRaw = req.query.costCenterId !== undefined ? Number(req.query.costCenterId) : undefined;
  const payCcFilter = payCcIdRaw !== undefined
    ? payCcIdRaw === 0
      ? isNull(invoicesTable.costCenterId)
      : eq(invoicesTable.costCenterId, payCcIdRaw)
    : undefined;

  const unpaidTransfers = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      supplierName: suppliersTable.name,
      totalAmount: invoicesTable.totalAmount,
      paymentDueDate: invoicesTable.paymentDueDate,
      paymentMethod: invoicesTable.paymentMethod,
      isPaid: invoicesTable.isPaid,
    })
    .from(invoicesTable)
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        eq(invoicesTable.isPaid, false),
        eq(invoicesTable.paymentMethod, "przelew"),
        payCcFilter,
      ),
    )
    .orderBy(invoicesTable.paymentDueDate);

  const overdue: typeof unpaidTransfers = [];
  const dueToday: typeof unpaidTransfers = [];
  const dueIn7Days: typeof unpaidTransfers = [];
  const upcoming: typeof unpaidTransfers = [];
  const noDueDate: typeof unpaidTransfers = [];

  for (const inv of unpaidTransfers) {
    const due = inv.paymentDueDate;
    if (!due) { noDueDate.push(inv); continue; }
    if (due < today) overdue.push(inv);
    else if (due === today) dueToday.push(inv);
    else if (due <= in7Days) dueIn7Days.push(inv);
    else upcoming.push(inv);
  }

  const sum = (arr: typeof unpaidTransfers) => arr.reduce((s, i) => s + toNum(i.totalAmount), 0);

  const mapInv = (inv: (typeof unpaidTransfers)[0]) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierName: inv.supplierName,
    totalAmount: toNum(inv.totalAmount),
    paymentDueDate: inv.paymentDueDate,
    paymentMethod: inv.paymentMethod,
    isPaid: inv.isPaid,
    daysOverdue: inv.paymentDueDate && inv.paymentDueDate < today
      ? Math.floor((new Date(today).getTime() - new Date(inv.paymentDueDate).getTime()) / 86400000)
      : null,
  });

  res.json({
    overdueAmount: sum(overdue),
    overdueCount: overdue.length,
    dueTodayAmount: sum(dueToday),
    dueTodayCount: dueToday.length,
    dueIn7DaysAmount: sum(dueIn7Days),
    dueIn7DaysCount: dueIn7Days.length,
    upcomingAmount: sum(upcoming),
    upcomingCount: upcoming.length,
    noDueDateAmount: sum(noDueDate),
    noDueDateCount: noDueDate.length,
    overdue: overdue.map(mapInv),
    dueToday: dueToday.map(mapInv),
    dueIn7Days: dueIn7Days.map(mapInv),
    upcoming: upcoming.map(mapInv),
    noDueDate: noDueDate.map(mapInv),
  });
});

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseNum(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}

function parseKSeFXml(xml: string): {
  items: Array<{
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    vatRate: number | null;
  }>;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalGross: number | null;
  invoiceType: string | null;
  correctedInvoiceNumber: string | null;
} {
  const items: Array<{
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    vatRate: number | null;
  }> = [];

  const stripped = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "").replace(/<(\w+):/g, "<").replace(/<\/(\w+):/g, "</");

  const invoiceNumber = extractTag(stripped, "P_2") ?? extractTag(stripped, "NrFa");
  const rawDate = extractTag(stripped, "P_1") ?? extractTag(stripped, "DataWystawienia");
  let invoiceDate: string | null = null;
  if (rawDate) {
    const d = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      invoiceDate = d;
    } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split(".");
      invoiceDate = `${yyyy}-${mm}-${dd}`;
    }
  }
  const totalGrossRaw = extractTag(stripped, "P_15") ?? extractTag(stripped, "WartoscBrutto");
  const totalGross = totalGrossRaw ? parseNum(totalGrossRaw) : null;
  const totalNetRaw = extractTag(stripped, "P_13_1");
  const totalNet = totalNetRaw ? parseNum(totalNetRaw) : null;
  const invoiceType = extractTag(stripped, "RodzajFaktury")?.trim().toUpperCase() ?? null;

  // Extract corrected invoice number from KOR (correction) invoices.
  // In KSeF FA(3) XML the corrected invoice number lives inside <FaKorygowana>
  // as <NrFaKorygowanej> or as the P_3C field.
  const correctedInvoiceNumber =
    extractTag(stripped, "NrFaKorygowanej") ??
    extractTag(stripped, "P_3C") ??
    null;

  const headerIsNegative =
    invoiceType === "KOR" &&
    ((totalNet != null && totalNet < 0) || (totalGross != null && totalGross < 0));

  const wierszeRe = /<FaWiersz>([\s\S]*?)<\/FaWiersz>/g;
  let wiersz: RegExpExecArray | null;
  while ((wiersz = wierszeRe.exec(stripped)) !== null) {
    const block = wiersz[1];
    const name = extractTag(block, "P_7");
    if (!name) continue;
    const unit = extractTag(block, "P_8A") ?? "szt";
    const qty = parseNum(extractTag(block, "P_8B"));
    const unitPrice = parseNum(extractTag(block, "P_9A") ?? extractTag(block, "P_9B"));
    const total = parseNum(extractTag(block, "P_11") ?? extractTag(block, "P_11A"));
    const vatRaw = extractTag(block, "P_12");
    const vatRate = vatRaw && /^\d+$/.test(vatRaw.trim()) ? parseInt(vatRaw.trim(), 10) : null;

    const baseQty = qty || 1;
    const baseTotal = total || unitPrice * baseQty;
    items.push({
      productName: name,
      quantity: baseQty,
      unit,
      unitPrice,
      totalPrice: baseTotal,
      vatRate,
    });
  }

  if (items.length === 0) {
    const pozRegex = /<P_7>([\s\S]*?)<\/P_7>[\s\S]*?<P_8A>([\s\S]*?)<\/P_8A>[\s\S]*?<P_8B>([\s\S]*?)<\/P_8B>[\s\S]*?<P_9A>([\s\S]*?)<\/P_9A>[\s\S]*?<P_11>([\s\S]*?)<\/P_11>/g;
    let m: RegExpExecArray | null;
    while ((m = pozRegex.exec(stripped)) !== null) {
      const qty = parseNum(m[3]);
      const unitPrice = parseNum(m[4]);
      const total = parseNum(m[5]);
      const baseQty = qty || 1;
      const baseTotal = total || unitPrice * baseQty;
      items.push({
        productName: m[1].trim(),
        quantity: baseQty,
        unit: m[2].trim() || "szt",
        unitPrice,
        totalPrice: baseTotal,
        vatRate: null,
      });
    }
  }

  const linesAlreadyNegative = items.some((it) => it.totalPrice < 0 || it.quantity < 0);
  if (headerIsNegative && !linesAlreadyNegative) {
    for (const it of items) {
      it.quantity = -it.quantity;
      it.totalPrice = -it.totalPrice;
    }
  }

  return { items, invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, totalGross, invoiceType, correctedInvoiceNumber: correctedInvoiceNumber?.trim() ?? null };
}

async function findOrCreateProduct(
  userId: string,
  name: string,
  unit: string,
  classification: ClassificationResult,
): Promise<number> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: productsTable.id, category: productsTable.category })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.userId, userId),
        sql`regexp_replace(LOWER(${productsTable.name}), '\s+', ' ', 'g') = regexp_replace(LOWER(${trimmed}), '\s+', ' ', 'g')`,
      ),
    )
    .limit(1);
  if (existing) {
    const shouldUpdateClassification =
      classification.category !== "inne" &&
      (existing.category === null || existing.category === "inne");
    await db
      .update(productsTable)
      .set({
        unit,
        ...(shouldUpdateClassification ? {
          category: classification.category,
          subcategory: classification.subcategory,
          classificationConfidence: classification.confidence,
          canonicalName: classification.canonicalName,
          needsReview: classification.confidence < 0.75,
        } : {}),
      })
      .where(eq(productsTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(productsTable)
    .values({
      userId,
      name: trimmed,
      unit,
      category: classification.category,
      subcategory: classification.subcategory,
      classificationConfidence: classification.confidence,
      canonicalName: classification.canonicalName,
      needsReview: classification.confidence < 0.75,
    })
    .returning({ id: productsTable.id });
  return created.id;
}

router.post("/invoices/scan-receipt", async (req, res): Promise<void> => {
  const parsed = ScanReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, mimeType } = parsed.data;

  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  if (!allowedMimeTypes.includes(mimeType)) {
    res.status(400).json({ error: "Nieobsługiwany format obrazu. Użyj JPEG, PNG, WebP lub GIF." });
    return;
  }

  const prompt = `Analyze this receipt or invoice image and extract the data as JSON. Be precise with numbers.

Return ONLY a JSON object with this exact structure (all fields optional except items and isCorrection):
{
  "supplierNip": "string or null — NIP number (10 digits, may appear as 'NIP: XXXXXXXXXX' or similar)",
  "supplierName": "string or null — name of the seller/supplier (not the buyer)",
  "invoiceNumber": "string or null — invoice or receipt number",
  "invoiceDate": "string or null — date in YYYY-MM-DD format",
  "isCorrection": boolean — true if this is a correction/corrective invoice (faktura korygująca, KOR, or similar),
  "correctedInvoiceNumber": "string or null — the invoice number being corrected (only when isCorrection is true)",
  "items": [
    {
      "productName": "exact product name",
      "quantity": number,
      "unit": "unit (szt, kg, l, etc.)",
      "unitPrice": number (net price per unit),
      "totalPrice": number (net total for this line)
    }
  ]
}

Important:
- NIP is a 10-digit Polish tax ID, often preceded by 'NIP' label
- For prices, use NET values (without VAT) when both are shown
- If only gross prices are visible, use those
- quantity should be a number (e.g. 1, 2.5, 0.5)
- Return empty items array if no line items are visible
- invoiceDate must be YYYY-MM-DD format
- isCorrection must always be present (true or false)
- Correction invoices often have words like "KOREKTA", "KOR", "korygująca", "KORYGUJACA" in the title or number
- correctedInvoiceNumber is the original invoice number this correction refers to (look for "do faktury", "koryguje fakturę", "Nr faktury korygowanej" labels)`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let extracted: {
      supplierNip?: string | null;
      supplierName?: string | null;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      isCorrection?: boolean;
      correctedInvoiceNumber?: string | null;
      items?: Array<{ productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number }>;
    };
    try {
      extracted = JSON.parse(raw);
    } catch {
      extracted = {};
    }

    if (extracted.supplierNip) {
      extracted.supplierNip = extracted.supplierNip.replace(/[\s\-]/g, "");
    }

    res.json({
      supplierNip: extracted.supplierNip ?? null,
      supplierName: extracted.supplierName ?? null,
      invoiceNumber: extracted.invoiceNumber ?? null,
      invoiceDate: extracted.invoiceDate ?? null,
      isCorrection: extracted.isCorrection === true,
      correctedInvoiceNumber: extracted.correctedInvoiceNumber ?? null,
      items: Array.isArray(extracted.items) ? extracted.items : [],
    });
  } catch (err) {
    req.log.error({ err }, "scan-receipt: OpenAI Vision error");
    res.status(500).json({ error: "Nie udało się przetworzyć zdjęcia. Sprawdź jakość obrazu i spróbuj ponownie." });
  }
});

router.post("/invoices/import", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = ImportInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { supplierId, xmlContent, invoiceNumber, invoiceDate, force, items: manualItems, paymentMethod, paymentDueDate, correctedInvoiceNumber: manualCorrectedNumber } = parsed.data;

  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.userId, userId)));

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  const parsed2 = xmlContent ? parseKSeFXml(xmlContent) : null;
  const MAX_INVOICE_ITEMS = 200;

  const parsedItems: Array<{ productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate?: number | null }> =
    manualItems && manualItems.length > 0
      ? manualItems
      : (parsed2?.items ?? []);

  if (parsedItems.length > MAX_INVOICE_ITEMS) {
    res.status(400).json({ error: `Faktura zawiera zbyt wiele pozycji (${parsedItems.length}). Maksymalnie dozwolone: ${MAX_INVOICE_ITEMS}.` });
    return;
  }

  const hasExplicitNumber = Boolean(invoiceNumber || parsed2?.invoiceNumber);
  const finalInvoiceNumber = invoiceNumber || parsed2?.invoiceNumber || `FV/${Date.now()}`;
  const finalInvoiceDate = invoiceDate || parsed2?.invoiceDate || new Date().toISOString().split("T")[0];

  if (hasExplicitNumber && !force) {
    const [existing] = await db
      .select({ id: invoicesTable.id, importedAt: invoicesTable.importedAt })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.userId, userId),
          eq(invoicesTable.supplierId, supplierId),
          eq(invoicesTable.invoiceNumber, finalInvoiceNumber),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({
        error: `Faktura "${finalInvoiceNumber}" od dostawcy ${supplier.name} została już zaimportowana ${new Date(existing.importedAt).toLocaleString("pl-PL")}.`,
        existingInvoiceId: existing.id,
      });
      return;
    }
  }

  const calculatedTotal = parsedItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = calculatedTotal !== 0 ? calculatedTotal : (parsed2?.totalGross ?? 0);

  // Determine invoice type and corrected invoice number
  const finalInvoiceType = parsed2?.invoiceType ?? null;
  const finalCorrectedNumber = (parsed2?.correctedInvoiceNumber ?? manualCorrectedNumber ?? null)?.trim() || null;

  // For correction invoices (KOR), find and link the parent invoice
  let parentInvoiceId: number | null = null;
  if (finalCorrectedNumber) {
    const [parent] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.userId, userId),
          eq(invoicesTable.invoiceNumber, finalCorrectedNumber),
        ),
      )
      .limit(1);
    if (parent) parentInvoiceId = parent.id;
  }

  // Cash/card payments are auto-marked as paid
  const isImmediatePayment = paymentMethod === "gotowka" || paymentMethod === "karta";

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      userId,
      supplierId,
      invoiceNumber: finalInvoiceNumber,
      invoiceDate: finalInvoiceDate,
      totalAmount: totalAmount.toFixed(2),
      xmlContent: xmlContent ? encryptSecret(xmlContent) : null,
      paymentMethod: paymentMethod ?? null,
      paymentDueDate: paymentMethod === "przelew" ? (paymentDueDate ?? null) : null,
      isPaid: isImmediatePayment,
      paidAt: isImmediatePayment ? new Date() : null,
      costCenterId: supplier.defaultCostCenterId ?? null,
      invoiceType: finalInvoiceType,
      parentInvoiceId,
      correctedInvoiceNumber: finalCorrectedNumber,
    })
    .returning();

  const insertedItems: Array<{
    id: number; invoiceId: number; productId: number | null; productName: string;
    quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate: number | null;
  }> = [];

  for (const item of parsedItems) {
    const classification = await categorizeProductWithAI(item.productName, userId, req.log, supplier.defaultCategory ?? undefined);
    const productId = await findOrCreateProduct(userId, item.productName, item.unit, classification);

    const [invoiceItem] = await db
      .insert(invoiceItemsTable)
      .values({
        invoiceId: invoice.id,
        productId,
        productName: item.productName,
        quantity: item.quantity.toString(),
        unit: item.unit,
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
        vatRate: item.vatRate != null ? item.vatRate.toString() : null,
      })
      .returning();

    insertedItems.push({
      ...invoiceItem,
      quantity: toNum(invoiceItem.quantity),
      unitPrice: toNum(invoiceItem.unitPrice),
      totalPrice: toNum(invoiceItem.totalPrice),
      vatRate: toNumOrNull(invoiceItem.vatRate),
    });
  }

  res.status(201).json({
    ...invoice,
    supplierName: supplier.name,
    totalAmount: toNum(invoice.totalAmount),
    importedAt: invoice.importedAt.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    items: insertedItems,
  });

  if (parsedItems.length > 0) {
    checkAlertsAfterImport(userId, req.log).catch(() => {});
  }
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [invoice] = await db
    .select({
      id: invoicesTable.id,
      supplierId: invoicesTable.supplierId,
      supplierName: suppliersTable.name,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceDate: invoicesTable.invoiceDate,
      totalAmount: invoicesTable.totalAmount,
      importedAt: invoicesTable.importedAt,
      excluded: invoicesTable.excluded,
      paymentMethod: invoicesTable.paymentMethod,
      paymentDueDate: invoicesTable.paymentDueDate,
      isPaid: invoicesTable.isPaid,
      paidAt: invoicesTable.paidAt,
      invoiceType: invoicesTable.invoiceType,
      parentInvoiceId: invoicesTable.parentInvoiceId,
      correctedInvoiceNumber: invoicesTable.correctedInvoiceNumber,
    })
    .from(invoicesTable)
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.userId, userId)));

  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoice.id));

  res.json({
    ...invoice,
    totalAmount: toNum(invoice.totalAmount),
    importedAt: invoice.importedAt.toISOString(),
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    items: items.map((item) => ({
      ...item,
      quantity: toNum(item.quantity),
      unitPrice: toNum(item.unitPrice),
      totalPrice: toNum(item.totalPrice),
      vatRate: toNumOrNull(item.vatRate),
    })),
  });
});

router.patch("/invoices/:id/mark-paid", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }
  const { isPaid } = req.body as { isPaid: boolean };
  if (typeof isPaid !== "boolean") {
    res.status(400).json({ error: "isPaid must be a boolean" });
    return;
  }

  const [updated] = await db
    .update(invoicesTable)
    .set({
      isPaid,
      paidAt: isPaid ? new Date() : null,
    })
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId)))
    .returning({ id: invoicesTable.id, isPaid: invoicesTable.isPaid, paidAt: invoicesTable.paidAt });

  if (!updated) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  res.json({
    id: updated.id,
    isPaid: updated.isPaid,
    paidAt: updated.paidAt ? updated.paidAt.toISOString() : null,
  });
});

router.patch("/invoices/:id/exclude", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }
  const { excluded } = req.body as { excluded: boolean };
  if (typeof excluded !== "boolean") {
    res.status(400).json({ error: "excluded must be a boolean" });
    return;
  }

  const [updated] = await db
    .update(invoicesTable)
    .set({ excluded })
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, userId)))
    .returning({ id: invoicesTable.id, excluded: invoicesTable.excluded });

  if (!updated) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  res.json(updated);
});

router.patch("/invoices/bulk-assign-cost-center", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = SetInvoiceCostCenterBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { costCenterId } = body.data;
  if (costCenterId !== null) {
    const owned = await db
      .select({ id: costCentersTable.id })
      .from(costCentersTable)
      .where(and(eq(costCentersTable.id, costCenterId), eq(costCentersTable.userId, userId)))
      .limit(1);
    if (!owned.length) {
      res.status(403).json({ error: "Cost center not found" });
      return;
    }
  }
  const result = await db
    .update(invoicesTable)
    .set({ costCenterId: costCenterId ?? null })
    .where(eq(invoicesTable.userId, userId))
    .returning({ id: invoicesTable.id });
  res.json({ updated: result.length });
});

router.delete("/invoices/:invoiceId/items/:itemId", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const invoiceId = Number(req.params.invoiceId);
  const itemId = Number(req.params.itemId);
  if (!invoiceId || !itemId) { res.status(400).json({ error: "Nieprawidłowe parametry" }); return; }

  // Verify the invoice belongs to this user
  const [invoice] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.userId, userId)));
  if (!invoice) { res.status(404).json({ error: "Faktura nie znaleziona" }); return; }

  // Verify the item belongs to this invoice
  const [item] = await db
    .select({ id: invoiceItemsTable.id, totalPrice: invoiceItemsTable.totalPrice })
    .from(invoiceItemsTable)
    .where(and(eq(invoiceItemsTable.id, itemId), eq(invoiceItemsTable.invoiceId, invoiceId)));
  if (!item) { res.status(404).json({ error: "Pozycja nie znaleziona" }); return; }

  // Delete the item and update invoice total
  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.id, itemId));

  const remaining = await db
    .select({ totalPrice: invoiceItemsTable.totalPrice })
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoiceId));
  const newTotal = remaining.reduce((s, r) => s + toNum(r.totalPrice), 0);

  await db
    .update(invoicesTable)
    .set({ totalAmount: String(newTotal) })
    .where(eq(invoicesTable.id, invoiceId));

  res.json({ deleted: true, newTotal });
});

router.delete("/invoices/delete-all", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const result = await db
    .delete(invoicesTable)
    .where(eq(invoicesTable.userId, userId))
    .returning({ id: invoicesTable.id });
  res.json({ deleted: result.length });
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(invoicesTable)
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
