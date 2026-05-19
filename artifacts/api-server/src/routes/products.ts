import { Router, type IRouter } from "express";
import { eq, sql, desc, and, min, max, avg, count } from "drizzle-orm";
import { db, productsTable, invoiceItemsTable, invoicesTable, suppliersTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  GetProductPriceHistoryParams,
  GetProductPriceHistoryQueryParams,
  GetTopPriceChangesQueryParams,
  GetProductSupplierComparisonParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const queryParams = ListProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { supplierId, category } = queryParams.data;

  // Get products with latest price info
  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      unit: productsTable.unit,
      category: productsTable.category,
    })
    .from(productsTable)
    .orderBy(productsTable.name);

  // Enrich each product with latest price
  const enriched = await Promise.all(
    products.map(async (product) => {
      const priceHistory = await db
        .select({
          unitPrice: invoiceItemsTable.unitPrice,
          invoiceDate: invoicesTable.invoiceDate,
          supplierId: invoicesTable.supplierId,
          supplierName: suppliersTable.name,
        })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
        .where(
          and(
            eq(invoiceItemsTable.productId, product.id),
            supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
          ),
        )
        .orderBy(desc(invoicesTable.invoiceDate))
        .limit(2);

      // Count distinct suppliers for this product
      const supplierCountResult = await db
        .select({ cnt: sql<number>`count(distinct ${invoicesTable.supplierId})` })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(eq(invoiceItemsTable.productId, product.id));

      const latest = priceHistory[0];
      const previous = priceHistory[1];
      const latestPrice = latest ? parseFloat(latest.unitPrice) : null;
      const previousPrice = previous ? parseFloat(previous.unitPrice) : null;
      const changePercent =
        latestPrice && previousPrice
          ? ((latestPrice - previousPrice) / previousPrice) * 100
          : null;

      return {
        ...product,
        latestPrice,
        previousPrice,
        priceChangePercent: changePercent,
        supplierId: latest?.supplierId ?? null,
        supplierName: latest?.supplierName ?? null,
        lastPurchaseDate: latest?.invoiceDate ?? null,
        supplierCount: Number(supplierCountResult[0]?.cnt ?? 0),
      };
    }),
  );

  // Only return products that have at least one purchase (have a supplier linked)
  res.json(
    enriched.filter((p) => p.supplierName != null && (!category || p.category === category))
  );
});

router.get("/products/top-price-changes", async (req, res): Promise<void> => {
  const queryParams = GetTopPriceChangesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const limit = queryParams.data.limit ?? 10;
  const days = queryParams.data.days ?? 30;

  // Get all products with at least 2 price data points
  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable);

  const changes = await Promise.all(
    products.map(async (product) => {
      const history = await db
        .select({
          unitPrice: invoiceItemsTable.unitPrice,
          invoiceDate: invoicesTable.invoiceDate,
          supplierName: suppliersTable.name,
        })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
        .where(eq(invoiceItemsTable.productId, product.id))
        .orderBy(desc(invoicesTable.invoiceDate))
        .limit(2);

      if (history.length < 2) return null;

      const current = parseFloat(history[0].unitPrice);
      const previous = parseFloat(history[1].unitPrice);
      const changePercent = ((current - previous) / previous) * 100;

      return {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        currentPrice: current,
        previousPrice: previous,
        changePercent: Math.abs(changePercent),
        changeDirection: changePercent >= 0 ? "up" : "down",
        supplierName: history[0].supplierName,
        lastDate: history[0].invoiceDate,
      };
    }),
  );

  const filtered = changes
    .filter((c): c is NonNullable<typeof c> => c !== null && c.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);

  res.json(filtered);
});

router.get("/products/:id/supplier-comparison", async (req, res): Promise<void> => {
  const params = GetProductSupplierComparisonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const product = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);

  if (!product.length) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Get all distinct suppliers for this product with aggregated stats
  const supplierStats = await db
    .select({
      supplierId: invoicesTable.supplierId,
      supplierName: suppliersTable.name,
      avgPrice: sql<string>`avg(${invoiceItemsTable.unitPrice}::numeric)`,
      minPrice: sql<string>`min(${invoiceItemsTable.unitPrice}::numeric)`,
      maxPrice: sql<string>`max(${invoiceItemsTable.unitPrice}::numeric)`,
      purchaseCount: sql<number>`count(*)`,
      lastPurchaseDate: sql<string>`max(${invoicesTable.invoiceDate})`,
      latestPrice: sql<string>`(
        SELECT unit_price::numeric FROM invoice_items ii2
        JOIN invoices inv2 ON ii2.invoice_id = inv2.id
        WHERE ii2.product_id = ${params.data.id}
          AND inv2.supplier_id = ${invoicesTable.supplierId}
        ORDER BY inv2.invoice_date DESC
        LIMIT 1
      )`,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(eq(invoiceItemsTable.productId, params.data.id))
    .groupBy(invoicesTable.supplierId, suppliersTable.name)
    .orderBy(sql`max(${invoicesTable.invoiceDate}) desc`);

  // For each supplier, get full price history
  const suppliers = await Promise.all(
    supplierStats.map(async (s) => {
      const history = await db
        .select({
          date: invoicesTable.invoiceDate,
          price: invoiceItemsTable.unitPrice,
        })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(
          and(
            eq(invoiceItemsTable.productId, params.data.id),
            eq(invoicesTable.supplierId, s.supplierId),
          ),
        )
        .orderBy(invoicesTable.invoiceDate);

      return {
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        latestPrice: parseFloat(s.latestPrice),
        avgPrice: parseFloat(s.avgPrice),
        minPrice: parseFloat(s.minPrice),
        maxPrice: parseFloat(s.maxPrice),
        purchaseCount: Number(s.purchaseCount),
        lastPurchaseDate: s.lastPurchaseDate,
        priceHistory: history.map((h) => ({
          date: h.date,
          price: parseFloat(h.price),
        })),
      };
    }),
  );

  res.json({
    productId: product[0].id,
    productName: product[0].name,
    unit: product[0].unit,
    supplierCount: suppliers.length,
    suppliers,
  });
});

router.get("/products/:id/price-history", async (req, res): Promise<void> => {
  const params = GetProductPriceHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const queryParams = GetProductPriceHistoryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { supplierId } = queryParams.data;

  const history = await db
    .select({
      date: invoicesTable.invoiceDate,
      price: invoiceItemsTable.unitPrice,
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      supplierId: invoicesTable.supplierId,
      supplierName: suppliersTable.name,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(
      and(
        eq(invoiceItemsTable.productId, params.data.id),
        supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
      ),
    )
    .orderBy(invoicesTable.invoiceDate);

  res.json(
    history.map((h) => ({
      date: h.date,
      price: parseFloat(h.price),
      invoiceId: h.invoiceId,
      invoiceNumber: h.invoiceNumber,
      supplierId: h.supplierId,
      supplierName: h.supplierName,
    })),
  );
});

export default router;
