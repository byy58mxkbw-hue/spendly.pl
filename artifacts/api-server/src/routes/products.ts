import { Router, type IRouter } from "express";
import { toNum } from "../lib/parse";
import { eq, sql, desc, and } from "drizzle-orm";
import { db, productsTable, invoiceItemsTable, invoicesTable, suppliersTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  GetProductPriceHistoryParams,
  GetProductPriceHistoryQueryParams,
  GetTopPriceChangesQueryParams,
  GetProductSupplierComparisonParams,
  UpdateProductParams,
  UpdateProductBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = ListProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { supplierId, category } = queryParams.data;

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      unit: productsTable.unit,
      category: productsTable.category,
    })
    .from(productsTable)
    .where(eq(productsTable.userId, userId))
    .orderBy(productsTable.name);

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
            eq(invoicesTable.userId, userId),
            supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
          ),
        )
        .orderBy(desc(invoicesTable.invoiceDate))
        .limit(2);

      const supplierCountResult = await db
        .select({ cnt: sql<number>`count(distinct ${invoicesTable.supplierId})` })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(and(eq(invoiceItemsTable.productId, product.id), eq(invoicesTable.userId, userId)));

      const latest = priceHistory[0];
      const previous = priceHistory[1];
      const latestPrice = latest ? toNum(latest.unitPrice) : null;
      const previousPrice = previous ? toNum(previous.unitPrice) : null;
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
        supplierCount: toNum(supplierCountResult[0]?.cnt ?? 0),
      };
    }),
  );

  res.json(
    enriched.filter((p) => p.supplierName != null && (!category || p.category === category))
  );
});

router.get("/products/top-price-changes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = GetTopPriceChangesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const limit = queryParams.data.limit ?? 10;

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));

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
        .where(and(eq(invoiceItemsTable.productId, product.id), eq(invoicesTable.userId, userId)))
        .orderBy(desc(invoicesTable.invoiceDate))
        .limit(2);

      if (history.length < 2) return null;

      const current = toNum(history[0].unitPrice);
      const previous = toNum(history[1].unitPrice);
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
  const userId = req.userId!;
  const params = GetProductSupplierComparisonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const product = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.userId, userId)))
    .limit(1);

  if (!product.length) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

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
          AND inv2.user_id = ${userId}
        ORDER BY inv2.invoice_date DESC
        LIMIT 1
      )`,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(and(eq(invoiceItemsTable.productId, params.data.id), eq(invoicesTable.userId, userId)))
    .groupBy(invoicesTable.supplierId, suppliersTable.name)
    .orderBy(sql`max(${invoicesTable.invoiceDate}) desc`);

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
            eq(invoicesTable.userId, userId),
          ),
        )
        .orderBy(invoicesTable.invoiceDate);

      return {
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        latestPrice: toNum(s.latestPrice),
        avgPrice: toNum(s.avgPrice),
        minPrice: toNum(s.minPrice),
        maxPrice: toNum(s.maxPrice),
        purchaseCount: toNum(s.purchaseCount),
        lastPurchaseDate: s.lastPurchaseDate,
        priceHistory: history.map((h) => ({
          date: h.date,
          price: toNum(h.price),
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
  const userId = req.userId!;
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

  // Verify product belongs to user
  const [productOwn] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.userId, userId)))
    .limit(1);
  if (!productOwn) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

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
        eq(invoicesTable.userId, userId),
        supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
      ),
    )
    .orderBy(invoicesTable.invoiceDate);

  res.json(
    history.map((h) => ({
      date: h.date,
      price: toNum(h.price),
      invoiceId: h.invoiceId,
      invoiceNumber: h.invoiceNumber,
      supplierId: h.supplierId,
      supplierName: h.supplierName,
    })),
  );
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProductBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set(body.data)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.userId, userId)))
    .returning({ id: productsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.status(204).end();
});

export default router;
