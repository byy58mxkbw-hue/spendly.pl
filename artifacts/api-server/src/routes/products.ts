import { Router, type IRouter } from "express";
import { toNum } from "../lib/parse";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { db, productsTable, invoiceItemsTable, invoicesTable, suppliersTable } from "@workspace/db";
import { userCategoriesTable } from "@workspace/db/schema";
import {
  ListProductsQueryParams,
  GetProductPriceHistoryParams,
  GetProductPriceHistoryQueryParams,
  GetTopPriceChangesQueryParams,
  GetProductSupplierComparisonParams,
  UpdateProductParams,
  UpdateProductBody,
  CreateProductBody,
  CreateCategoryBody,
  UpdateCategoryBody,
  CorrectProductCategoryParams,
  CorrectProductCategoryBody,
} from "@workspace/api-zod";
import { getUserCategories, ensureCustomCategory, saveProductCorrection } from "../lib/categorize-ai.js";
import { BUILTIN_CATEGORY_DEFS } from "../lib/categorize.js";

const router: IRouter = Router();

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 1).toISOString().split("T")[0];
}

function monthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toISOString().split("T")[0];
}

router.get("/products", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = ListProductsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { supplierId, category, days, month, needsReview, costCenterId } = queryParams.data;
  const ccFilter = costCenterId != null
    ? costCenterId === 0
      ? sql`${invoicesTable.costCenterId} IS NULL`
      : eq(invoicesTable.costCenterId, costCenterId)
    : undefined;

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      unit: productsTable.unit,
      category: productsTable.category,
      subcategory: productsTable.subcategory,
      classificationConfidence: productsTable.classificationConfidence,
      canonicalName: productsTable.canonicalName,
      needsReview: productsTable.needsReview,
    })
    .from(productsTable)
    .where(eq(productsTable.userId, userId))
    .orderBy(productsTable.name);

  const enriched = await Promise.all(
    products.map(async (product) => {
      // Fetch enough rows to find 2 distinct invoices after deduplication.
      // IMPORTANT: limit(2) is NOT sufficient — a product can appear multiple times
      // on the same invoice (multiple line items), which would cause us to compare
      // two prices from the same purchase instead of two different time periods.
      const priceHistoryRaw = await db
        .select({
          unitPrice: invoiceItemsTable.unitPrice,
          invoiceDate: invoicesTable.invoiceDate,
          invoiceId: invoicesTable.id,
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
            eq(invoicesTable.excluded, false),
            ccFilter,
            supplierId ? eq(invoicesTable.supplierId, supplierId) : undefined,
            month
              ? sql`${invoicesTable.invoiceDate} >= ${month + "-01"} AND ${invoicesTable.invoiceDate} < ${(() => { const [y, m2] = month.split("-").map(Number); return new Date(y, m2, 1).toISOString().split("T")[0]; })()}`
              : days
              ? sql`${invoicesTable.invoiceDate} >= to_char(now() - interval '1 day' * ${days}, 'YYYY-MM-DD')`
              : undefined,
          ),
        )
        .orderBy(desc(invoicesTable.invoiceDate), desc(invoicesTable.id))
        .limit(50);

      // Deduplicate: one entry per invoice_id (keep first = highest-id item per invoice)
      const seenInvoices = new Set<number>();
      const priceHistory: typeof priceHistoryRaw = [];
      for (const row of priceHistoryRaw) {
        if (!seenInvoices.has(row.invoiceId)) {
          seenInvoices.add(row.invoiceId);
          priceHistory.push(row);
          if (priceHistory.length === 2) break;
        }
      }

      const supplierCountResult = await db
        .select({ cnt: sql<number>`count(distinct ${invoicesTable.supplierId})` })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(and(eq(invoiceItemsTable.productId, product.id), eq(invoicesTable.userId, userId), eq(invoicesTable.excluded, false), ccFilter));

      const quantityResult = await db
        .select({ total: sql<string>`sum(${invoiceItemsTable.quantity})` })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(
          and(
            eq(invoiceItemsTable.productId, product.id),
            eq(invoicesTable.userId, userId),
            eq(invoicesTable.excluded, false),
            ccFilter,
            month
              ? sql`${invoicesTable.invoiceDate} >= ${month + "-01"} AND ${invoicesTable.invoiceDate} < ${(() => { const [y, m2] = month.split("-").map(Number); return new Date(y, m2, 1).toISOString().split("T")[0]; })()}`
              : days
              ? sql`${invoicesTable.invoiceDate} >= to_char(now() - interval '1 day' * ${days}, 'YYYY-MM-DD')`
              : undefined,
          ),
        );

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
        totalQuantity: toNum(quantityResult[0]?.total ?? null),
      };
    }),
  );

  res.json(
    enriched.filter((p) =>
      p.supplierName != null &&
      (!category || p.category === category) &&
      (!needsReview || p.needsReview === true)
    )
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
  const topMonth = queryParams.data.month;
  const costCenterId = queryParams.data.costCenterId;
  const ccFilter = costCenterId != null ? eq(invoicesTable.costCenterId, costCenterId) : undefined;

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));

  const mStart = topMonth ? monthStart(topMonth) : null;
  const mEnd = topMonth ? monthEnd(topMonth) : null;

  const changes = await Promise.all(
    products.map(async (product) => {
      const baseWhere = and(
        eq(invoiceItemsTable.productId, product.id),
        eq(invoicesTable.userId, userId),
        eq(invoicesTable.excluded, false),
        ccFilter,
      );

      if (mStart && mEnd) {
        // "current" = latest entry within the selected month
        const currentRows = await db
          .select({
            unitPrice: invoiceItemsTable.unitPrice,
            invoiceDate: invoicesTable.invoiceDate,
            supplierName: suppliersTable.name,
          })
          .from(invoiceItemsTable)
          .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
          .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
          .where(and(baseWhere, sql`${invoicesTable.invoiceDate} >= ${mStart} AND ${invoicesTable.invoiceDate} < ${mEnd}`))
          .orderBy(desc(invoicesTable.invoiceDate))
          .limit(1);

        if (!currentRows.length) return null;

        // "previous" = latest entry BEFORE the selected month
        const previousRows = await db
          .select({
            unitPrice: invoiceItemsTable.unitPrice,
            invoiceDate: invoicesTable.invoiceDate,
            supplierName: suppliersTable.name,
          })
          .from(invoiceItemsTable)
          .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
          .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
          .where(and(baseWhere, sql`${invoicesTable.invoiceDate} < ${mStart}`))
          .orderBy(desc(invoicesTable.invoiceDate))
          .limit(1);

        if (!previousRows.length) return null;

        const current = toNum(currentRows[0].unitPrice);
        const previous = toNum(previousRows[0].unitPrice);
        const changePercent = ((current - previous) / previous) * 100;

        return {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          currentPrice: current,
          previousPrice: previous,
          changePercent: Math.abs(changePercent),
          changeDirection: changePercent >= 0 ? "up" : "down",
          supplierName: currentRows[0].supplierName,
          lastDate: currentRows[0].invoiceDate,
        };
      } else {
        // No month filter — compare last 2 distinct invoices globally
        const historyRaw = await db
          .select({
            unitPrice: invoiceItemsTable.unitPrice,
            invoiceDate: invoicesTable.invoiceDate,
            invoiceId: invoicesTable.id,
            supplierName: suppliersTable.name,
          })
          .from(invoiceItemsTable)
          .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
          .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
          .where(baseWhere)
          .orderBy(desc(invoicesTable.invoiceDate), desc(invoicesTable.id))
          .limit(50);

        // Deduplicate by invoice_id so same-invoice multi-line items don't skew the comparison
        const seenIds = new Set<number>();
        const history: typeof historyRaw = [];
        for (const row of historyRaw) {
          if (!seenIds.has(row.invoiceId)) {
            seenIds.add(row.invoiceId);
            history.push(row);
            if (history.length === 2) break;
          }
        }

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
      }
    }),
  );

  const filtered = changes
    .filter((c): c is NonNullable<typeof c> => c !== null && c.changePercent != null && !isNaN(c.changePercent) && c.changePercent >= 0.05)
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
    .where(and(eq(invoiceItemsTable.productId, params.data.id), eq(invoicesTable.userId, userId), eq(invoicesTable.excluded, false)))
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
            eq(invoicesTable.excluded, false),
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
        eq(invoicesTable.excluded, false),
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

router.post("/products", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = CreateProductBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [created] = await db
    .insert(productsTable)
    .values({
      userId,
      name: body.data.name,
      unit: body.data.unit ?? "",
    })
    .returning({
      id: productsTable.id,
      name: productsTable.name,
      unit: productsTable.unit,
      category: productsTable.category,
    });

  res.status(201).json(created);
});

router.post("/products/bulk-verify", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body?.ids) || body.ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array" });
    return;
  }
  const ids = (body.ids as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ error: "No valid ids provided" });
    return;
  }

  const owned = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), inArray(productsTable.id, ids)));

  const ownedIds = owned.map((p) => p.id);
  if (ownedIds.length > 0) {
    await db
      .update(productsTable)
      .set({ needsReview: false })
      .where(inArray(productsTable.id, ownedIds));
  }

  res.json({ verifiedCount: ownedIds.length });
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

router.patch("/products/:id/correct-category", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = CorrectProductCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CorrectProductCategoryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { category, subcategory } = body.data;

  const [product] = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.userId, userId)))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Produkt nie znaleziony" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({
      category,
      subcategory: subcategory ?? null,
      classificationConfidence: 1.0,
      needsReview: false,
    })
    .where(eq(productsTable.id, params.data.id))
    .returning();

  await saveProductCorrection(userId, params.data.id, product.name, category, subcategory ?? null);

  res.json(updated);
});

router.get("/categories", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const categories = await getUserCategories(userId);
  res.json(categories);
});

router.post("/categories", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = CreateCategoryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const label = body.data.label.trim();
  if (label.length < 2) {
    res.status(400).json({ error: "Nazwa kategorii musi mieć co najmniej 2 znaki." });
    return;
  }

  // Slugify the label into a categoryId
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  // Reject labels that produce an empty slug (e.g. pure emoji/punctuation)
  if (slug.length === 0) {
    res.status(400).json({ error: "Nazwa kategorii musi zawierać co najmniej jedną literę lub cyfrę." });
    return;
  }

  // Ensure it doesn't conflict with built-in categories
  if (BUILTIN_CATEGORY_DEFS[slug]) {
    res.status(400).json({ error: "Kategoria o tej nazwie już istnieje jako wbudowana kategoria." });
    return;
  }

  // Check if a custom category with this slug already exists for this user
  const existing = await db
    .select()
    .from(userCategoriesTable)
    .where(and(eq(userCategoriesTable.userId, userId), eq(userCategoriesTable.categoryId, slug)))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "Kategoria o tej nazwie już istnieje." });
    return;
  }

  // Use a unique slug if there's a collision
  let finalSlug = slug;
  if (BUILTIN_CATEGORY_DEFS[slug]) {
    finalSlug = `${slug}_custom`;
  }

  await ensureCustomCategory(userId, finalSlug, label);

  res.status(201).json({
    id: finalSlug,
    label,
    emoji: "🏷️",
    isCustom: true,
  });
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const categoryId = req.params.id;

  if (BUILTIN_CATEGORY_DEFS[categoryId]) {
    res.status(403).json({ error: "Nie można zmienić nazwy wbudowanej kategorii." });
    return;
  }

  const body = UpdateCategoryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const newLabel = body.data.label.trim();
  if (newLabel.length < 2) {
    res.status(400).json({ error: "Nazwa kategorii musi mieć co najmniej 2 znaki." });
    return;
  }

  const [updated] = await db
    .update(userCategoriesTable)
    .set({ label: newLabel })
    .where(and(eq(userCategoriesTable.userId, userId), eq(userCategoriesTable.categoryId, categoryId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Kategoria nie istnieje lub nie masz uprawnień do jej edycji." });
    return;
  }

  res.json({
    id: updated.categoryId,
    label: updated.label,
    emoji: "🏷️",
    isCustom: true,
  });
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const categoryId = req.params.id;

  // Prevent deleting built-in categories
  if (BUILTIN_CATEGORY_DEFS[categoryId]) {
    res.status(403).json({ error: "Nie można usunąć wbudowanej kategorii." });
    return;
  }

  const deleted = await db
    .delete(userCategoriesTable)
    .where(and(eq(userCategoriesTable.userId, userId), eq(userCategoriesTable.categoryId, categoryId)))
    .returning({ id: userCategoriesTable.categoryId });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Kategoria nie istnieje lub nie masz uprawnień do jej usunięcia." });
    return;
  }

  res.status(204).end();
});

export default router;
