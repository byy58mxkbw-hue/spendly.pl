import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, suppliersTable, productsTable } from "@workspace/db";
import {
  ImportInvoiceBody,
  ListInvoicesQueryParams,
  GetInvoiceParams,
  DeleteInvoiceParams,
} from "@workspace/api-zod";

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

// Parse XML to extract invoice items (simplified KSeF XML parser)
function parseKSeFXml(xml: string): Array<{
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  vatRate: number | null;
}> {
  const items: Array<{
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    vatRate: number | null;
  }> = [];

  // Try to parse KSeF FA2 format
  const pozRegex = /<P_7>(.*?)<\/P_7>[\s\S]*?<P_8A>(.*?)<\/P_8A>[\s\S]*?<P_8B>(.*?)<\/P_8B>[\s\S]*?<P_9A>(.*?)<\/P_9A>[\s\S]*?<P_11>(.*?)<\/P_11>/g;
  let match;
  while ((match = pozRegex.exec(xml)) !== null) {
    const qty = parseFloat(match[3].replace(",", "."));
    const unitPrice = parseFloat(match[4].replace(",", "."));
    const total = parseFloat(match[5].replace(",", "."));
    items.push({
      productName: match[1],
      quantity: isNaN(qty) ? 1 : qty,
      unit: match[2] || "szt",
      unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
      totalPrice: isNaN(total) ? 0 : total,
      vatRate: null,
    });
  }

  return items;
}

router.post("/invoices/import", async (req, res): Promise<void> => {
  const parsed = ImportInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { supplierId, xmlContent, invoiceNumber, invoiceDate } = parsed.data;

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
  let parsedItems = xmlContent ? parseKSeFXml(xmlContent) : [];

  // Calculate total
  const totalAmount = parsedItems.reduce((sum, item) => sum + item.totalPrice, 0);

  // Create invoice
  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      supplierId,
      invoiceNumber: invoiceNumber || `FV/${Date.now()}`,
      invoiceDate,
      totalAmount: totalAmount.toFixed(2),
      xmlContent: xmlContent ?? null,
    })
    .returning();

  // Create or find products and insert items
  const insertedItems = await Promise.all(
    parsedItems.map(async (item) => {
      // Try to find existing product
      let [product] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.name, item.productName))
        .limit(1);

      if (!product) {
        [product] = await db
          .insert(productsTable)
          .values({ name: item.productName, unit: item.unit })
          .returning();
      }

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

      return {
        ...invoiceItem,
        quantity: parseFloat(invoiceItem.quantity),
        unitPrice: parseFloat(invoiceItem.unitPrice),
        totalPrice: parseFloat(invoiceItem.totalPrice),
        vatRate: invoiceItem.vatRate != null ? parseFloat(invoiceItem.vatRate) : null,
      };
    }),
  );

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
