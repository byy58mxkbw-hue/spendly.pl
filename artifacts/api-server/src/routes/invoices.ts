import { Router, type IRouter } from "express";
import { toNum, toNumOrNull } from "../lib/parse";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, suppliersTable, productsTable } from "@workspace/db";
import {
  ImportInvoiceBody,
  ScanReceiptBody,
  ListInvoicesQueryParams,
  GetInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";
import { categorizeProductWithAI } from "../lib/categorize-ai.js";
import { checkAlertsAfterImport } from "../services/alert-checker";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.get("/invoices", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = ListInvoicesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { supplierId, limit = 50, offset = 0 } = queryParams.data;

  const invoices = await db
    .select({
      id: invoicesTable.id,
      supplierId: invoicesTable.supplierId,
      supplierName: suppliersTable.name,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceDate: invoicesTable.invoiceDate,
      totalAmount: invoicesTable.totalAmount,
      importedAt: invoicesTable.importedAt,
    })
    .from(invoicesTable)
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
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
      };
    }),
  );

  res.json(enriched);
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

  return { items, invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, totalGross };
}

async function findOrCreateProduct(
  userId: string,
  name: string,
  unit: string,
  category: string | null,
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
    // Only update category when it's unset or "inne" — never overwrite a manual assignment
    const shouldUpdateCategory =
      category !== null &&
      category !== "inne" &&
      (existing.category === null || existing.category === "inne");
    await db
      .update(productsTable)
      .set({ unit, ...(shouldUpdateCategory ? { category } : {}) })
      .where(eq(productsTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(productsTable)
    .values({ userId, name: trimmed, unit, category })
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

Return ONLY a JSON object with this exact structure (all fields optional except items):
{
  "supplierNip": "string or null — NIP number (10 digits, may appear as 'NIP: XXXXXXXXXX' or similar)",
  "supplierName": "string or null — name of the seller/supplier (not the buyer)",
  "invoiceNumber": "string or null — invoice or receipt number",
  "invoiceDate": "string or null — date in YYYY-MM-DD format",
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
- invoiceDate must be YYYY-MM-DD format`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
      items?: Array<{ productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number }>;
    };
    try {
      extracted = JSON.parse(raw);
    } catch {
      extracted = {};
    }

    // Normalise NIP — strip spaces and dashes
    if (extracted.supplierNip) {
      extracted.supplierNip = extracted.supplierNip.replace(/[\s\-]/g, "");
    }

    res.json({
      supplierNip: extracted.supplierNip ?? null,
      supplierName: extracted.supplierName ?? null,
      invoiceNumber: extracted.invoiceNumber ?? null,
      invoiceDate: extracted.invoiceDate ?? null,
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

  const { supplierId, xmlContent, invoiceNumber, invoiceDate, force, items: manualItems } = parsed.data;

  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.userId, userId)));

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  const parsed2 = xmlContent ? parseKSeFXml(xmlContent) : null;
  // Manual items (from OCR scan) take precedence over XML-parsed items
  const parsedItems: Array<{ productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate?: number | null }> =
    manualItems && manualItems.length > 0
      ? manualItems
      : (parsed2?.items ?? []);

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
  const totalAmount = calculatedTotal > 0 ? calculatedTotal : (parsed2?.totalGross ?? 0);

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      userId,
      supplierId,
      invoiceNumber: finalInvoiceNumber,
      invoiceDate: finalInvoiceDate,
      totalAmount: totalAmount.toFixed(2),
      xmlContent: xmlContent ?? null,
    })
    .returning();

  const insertedItems: Array<{
    id: number; invoiceId: number; productId: number | null; productName: string;
    quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate: number | null;
  }> = [];

  for (const item of parsedItems) {
    const category = await categorizeProductWithAI(item.productName, userId, req.log);
    const productId = await findOrCreateProduct(userId, item.productName, item.unit, category);

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
    items: insertedItems,
  });

  // Fire-and-forget: recalculate price alert triggers after new invoice data arrives.
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
    items: items.map((item) => ({
      ...item,
      quantity: toNum(item.quantity),
      unitPrice: toNum(item.unitPrice),
      totalPrice: toNum(item.totalPrice),
      vatRate: toNumOrNull(item.vatRate),
    })),
  });
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
