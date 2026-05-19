import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, suppliersTable, productsTable } from "@workspace/db";
import {
  ImportInvoiceBody,
  ListInvoicesQueryParams,
  GetInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";
import { categorizeProduct } from "../lib/categorize";

const router: IRouter = Router();

router.get("/invoices", async (req, res): Promise<void> => {
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
    .where(supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined)
    .orderBy(desc(invoicesTable.invoiceDate))
    .limit(limit)
    .offset(offset);

  // Get item counts
  const enriched = await Promise.all(
    invoices.map(async (inv) => {
      const items = await db
        .select({ id: invoiceItemsTable.id })
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.invoiceId, inv.id));

      return {
        ...inv,
        totalAmount: parseFloat(inv.totalAmount as string),
        itemCount: items.length,
        importedAt: inv.importedAt.toISOString(),
      };
    }),
  );

  res.json(enriched);
});

function extractTag(xml: string, tag: string): string | null {
  // Match with or without namespace prefix, e.g. <P_7> or <ns1:P_7>
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseNum(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}

// Parse KSeF XML — supports FA(2) format (FaWiersz blocks) and legacy flat format
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

  // Strip namespace declarations for easier parsing
  const stripped = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "").replace(/<(\w+):/g, "<").replace(/<\/(\w+):/g, "</");

  // Extract invoice header
  const invoiceNumber = extractTag(stripped, "P_2") ?? extractTag(stripped, "NrFa");
  const rawDate = extractTag(stripped, "P_1") ?? extractTag(stripped, "DataWystawienia");
  // Normalize date: YYYY-MM-DD
  let invoiceDate: string | null = null;
  if (rawDate) {
    const d = rawDate.trim();
    // Accept YYYY-MM-DD or DD.MM.YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      invoiceDate = d;
    } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split(".");
      invoiceDate = `${yyyy}-${mm}-${dd}`;
    }
  }
  const totalGrossRaw = extractTag(stripped, "P_15") ?? extractTag(stripped, "WartoscBrutto");
  const totalGross = totalGrossRaw ? parseNum(totalGrossRaw) : null;

  // Try FA2 FaWiersz blocks first
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

    items.push({
      productName: name,
      quantity: qty || 1,
      unit,
      unitPrice,
      totalPrice: total || unitPrice * (qty || 1),
      vatRate,
    });
  }

  // Fallback: flat regex for older formats (P_7 … P_11 without FaWiersz)
  if (items.length === 0) {
    const pozRegex = /<P_7>([\s\S]*?)<\/P_7>[\s\S]*?<P_8A>([\s\S]*?)<\/P_8A>[\s\S]*?<P_8B>([\s\S]*?)<\/P_8B>[\s\S]*?<P_9A>([\s\S]*?)<\/P_9A>[\s\S]*?<P_11>([\s\S]*?)<\/P_11>/g;
    let m: RegExpExecArray | null;
    while ((m = pozRegex.exec(stripped)) !== null) {
      const qty = parseNum(m[3]);
      const unitPrice = parseNum(m[4]);
      const total = parseNum(m[5]);
      items.push({
        productName: m[1].trim(),
        quantity: qty || 1,
        unit: m[2].trim() || "szt",
        unitPrice,
        totalPrice: total || unitPrice * (qty || 1),
        vatRate: null,
      });
    }
  }

  return { items, invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, totalGross };
}

router.post("/invoices/import", async (req, res): Promise<void> => {
  const parsed = ImportInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { supplierId, xmlContent, invoiceNumber, invoiceDate, force } = parsed.data;

  // Check supplier exists
  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.id, supplierId));

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  // Parse items from XML if provided
  const parsed2 = xmlContent ? parseKSeFXml(xmlContent) : null;
  const parsedItems = parsed2?.items ?? [];

  // Use XML-extracted values as fallback when not provided by user
  const hasExplicitNumber = Boolean(invoiceNumber || parsed2?.invoiceNumber);
  const finalInvoiceNumber = invoiceNumber || parsed2?.invoiceNumber || `FV/${Date.now()}`;
  const finalInvoiceDate = invoiceDate || parsed2?.invoiceDate || new Date().toISOString().split("T")[0];

  // Duplicate detection: same supplier + same invoice number = already imported
  // Skipped when client explicitly forces import (user confirmed overwrite/duplicate)
  if (hasExplicitNumber && !force) {
    const [existing] = await db
      .select({ id: invoicesTable.id, importedAt: invoicesTable.importedAt })
      .from(invoicesTable)
      .where(
        and(
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

  // Use XML total if available and no items parsed (e.g. just header)
  const calculatedTotal = parsedItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = calculatedTotal > 0 ? calculatedTotal : (parsed2?.totalGross ?? 0);

  // Create invoice
  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      supplierId,
      invoiceNumber: finalInvoiceNumber,
      invoiceDate: finalInvoiceDate,
      totalAmount: totalAmount.toFixed(2),
      xmlContent: xmlContent ?? null,
    })
    .returning();

  // Create or find products and insert items — sequential to avoid race conditions
  const insertedItems: Array<{
    id: number; invoiceId: number; productId: number | null; productName: string;
    quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate: number | null;
  }> = [];

  for (const item of parsedItems) {
    // Upsert product: insert if not exists, assign category automatically
    const category = categorizeProduct(item.productName);
    const [product] = await db
      .insert(productsTable)
      .values({ name: item.productName, unit: item.unit, category })
      .onConflictDoUpdate({
        target: productsTable.name,
        set: { unit: item.unit, category },
      })
      .returning();

    const [invoiceItem] = await db
      .insert(invoiceItemsTable)
      .values({
        invoiceId: invoice.id,
        productId: product.id,
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
      quantity: parseFloat(invoiceItem.quantity),
      unitPrice: parseFloat(invoiceItem.unitPrice),
      totalPrice: parseFloat(invoiceItem.totalPrice),
      vatRate: invoiceItem.vatRate != null ? parseFloat(invoiceItem.vatRate) : null,
    });
  }

  res.status(201).json({
    ...invoice,
    supplierName: supplier.name,
    totalAmount: parseFloat(invoice.totalAmount as string),
    importedAt: invoice.importedAt.toISOString(),
    items: insertedItems,
  });
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
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
    .where(eq(invoicesTable.id, params.data.id));

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
    totalAmount: parseFloat(invoice.totalAmount as string),
    importedAt: invoice.importedAt.toISOString(),
    items: items.map((item) => ({
      ...item,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
      totalPrice: parseFloat(item.totalPrice),
      vatRate: item.vatRate != null ? parseFloat(item.vatRate) : null,
    })),
  });
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const params = DeleteInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
