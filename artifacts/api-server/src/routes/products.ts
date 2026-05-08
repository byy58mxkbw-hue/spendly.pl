import { Router, type IRouter } from "express";
import { eq, sql, desc, and, isNotNull } from "drizzle-orm";
import { db, productsTable, invoiceItemsTable, invoicesTable, suppliersTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  GetProductPriceHistoryParams,
  GetProductPriceHistoryQueryParams,
  GetTopPriceChangesQueryParams,
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
