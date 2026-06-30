import { Router, type IRouter } from "express";
import { toNum } from "../lib/parse";
import { eq, sql, desc, and, inArray, isNull, ne, ilike } from "drizzle-orm";
import { db, productsTable, invoiceItemsTable, invoicesTable, suppliersTable } from "@workspace/db";
import { userCategoriesTable } from "@workspace/db/schema";
import {
  ListProductsQueryParams,
  ListProductsPagedQueryParams,
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

  // Build optional SQL fragments for dynamic filters
  const ccSql = costCenterId != null
    ? costCenterId === 0
      ? sql` AND i.cost_center_id IS NULL`
      : sql` AND i.cost_center_id = ${costCenterId}`
    : sql``;
  const supplierSql = supplierId ? sql` AND i.supplier_id = ${supplierId}` : sql``;
  const daysSql = days ? sql` AND i.invoice_date >= to_char(now() - interval '1 day' * ${days}, 'YYYY-MM-DD')` : sql``;
  const categorySql = category ? sql` AND p.category = ${category}` : sql``;
  const needsReviewSql = needsReview ? sql` AND p.needs_review = true` : sql``;

  // Single CTE query replaces N×3 per-product round-trips
  type ProductRow = {
    id: number; name: string; unit: string; category: string | null; subcategory: string | null;
    classificationConfidence: number | null; canonicalName: string | null; needsReview: boolean;
    latestPrice: string | null; lastPurchaseDate: string | null;
    supplierId: string | null; supplierName: string | null;
    previousPrice: string | null; supplierCount: string | null; totalQuantity: string | null;
  };

  let rows: ProductRow[];

  if (month) {
    const mStart = monthStart(month);
    const mEnd = monthEnd(month);
    const result = await db.execute(sql`
      WITH
      latest_base AS (
        SELECT DISTINCT ON (ii.product_id)
          ii.product_id, ii.unit_price::numeric AS latest_price,
          i.invoice_date AS last_purchase_date, i.supplier_id, s.name AS supplier_name
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd}
          ${supplierSql}${ccSql}
        ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
      ),
      prev_base AS (
        SELECT DISTINCT ON (ii.product_id)
          ii.product_id, ii.unit_price::numeric AS previous_price
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          AND i.invoice_date < ${mStart}
          ${supplierSql}${ccSql}
        ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
      ),
      sup_counts AS (
        SELECT ii.product_id, COUNT(DISTINCT i.supplier_id)::int AS supplier_count
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.user_id = ${userId} AND i.excluded = false ${ccSql}
        GROUP BY ii.product_id
      ),
      qty_sums AS (
        SELECT ii.product_id, SUM(ii.quantity::numeric) AS total_quantity
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd} ${ccSql}
        GROUP BY ii.product_id
      )
      SELECT
        p.id, p.name, p.unit, p.category, p.subcategory,
        p.classification_confidence AS "classificationConfidence",
        p.canonical_name AS "canonicalName",
        p.needs_review AS "needsReview",
        lb.latest_price::text AS "latestPrice",
        lb.last_purchase_date AS "lastPurchaseDate",
        lb.supplier_id::text AS "supplierId",
        lb.supplier_name AS "supplierName",
        pb.previous_price::text AS "previousPrice",
        sc.supplier_count::text AS "supplierCount",
        qs.total_quantity::text AS "totalQuantity"
      FROM products p
      LEFT JOIN latest_base lb ON p.id = lb.product_id
      LEFT JOIN prev_base pb ON p.id = pb.product_id
      LEFT JOIN sup_counts sc ON p.id = sc.product_id
      LEFT JOIN qty_sums qs ON p.id = qs.product_id
      WHERE p.user_id = ${userId}${categorySql}${needsReviewSql}
      ORDER BY p.name
    `);
    rows = result.rows as ProductRow[];
  } else {
    const result = await db.execute(sql`
      WITH
      date_deduped AS (
        SELECT DISTINCT ON (ii.product_id, i.invoice_date)
          ii.product_id, ii.unit_price::numeric AS unit_price,
          i.invoice_date, i.id AS invoice_id, i.supplier_id, s.name AS supplier_name
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          ${daysSql}${supplierSql}${ccSql}
        ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY invoice_date DESC, invoice_id DESC) AS rn
        FROM date_deduped
      ),
      sup_counts AS (
        SELECT ii.product_id, COUNT(DISTINCT i.supplier_id)::int AS supplier_count
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.user_id = ${userId} AND i.excluded = false ${ccSql}
        GROUP BY ii.product_id
      ),
      qty_sums AS (
        SELECT ii.product_id, SUM(ii.quantity::numeric) AS total_quantity
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.user_id = ${userId} AND i.excluded = false ${daysSql}${ccSql}
        GROUP BY ii.product_id
      )
      SELECT
        p.id, p.name, p.unit, p.category, p.subcategory,
        p.classification_confidence AS "classificationConfidence",
        p.canonical_name AS "canonicalName",
        p.needs_review AS "needsReview",
        MAX(CASE WHEN r.rn = 1 THEN r.unit_price END)::text AS "latestPrice",
        MAX(CASE WHEN r.rn = 1 THEN r.invoice_date END) AS "lastPurchaseDate",
        MAX(CASE WHEN r.rn = 1 THEN r.supplier_id::text END) AS "supplierId",
        MAX(CASE WHEN r.rn = 1 THEN r.supplier_name END) AS "supplierName",
        MAX(CASE WHEN r.rn = 2 THEN r.unit_price END)::text AS "previousPrice",
        sc.supplier_count::text AS "supplierCount",
        qs.total_quantity::text AS "totalQuantity"
      FROM products p
      LEFT JOIN ranked r ON p.id = r.product_id AND r.rn <= 2
      LEFT JOIN sup_counts sc ON p.id = sc.product_id
      LEFT JOIN qty_sums qs ON p.id = qs.product_id
      WHERE p.user_id = ${userId}${categorySql}${needsReviewSql}
      GROUP BY p.id, p.name, p.unit, p.category, p.subcategory,
               p.classification_confidence, p.canonical_name, p.needs_review,
               sc.supplier_count, qs.total_quantity
      ORDER BY p.name
    `);
    rows = result.rows as ProductRow[];
  }

  const enriched = rows.map(row => {
    const latestPrice = row.latestPrice != null ? toNum(row.latestPrice) : null;
    const previousPrice = row.previousPrice != null ? toNum(row.previousPrice) : null;
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      category: row.category,
      subcategory: row.subcategory,
      classificationConfidence: row.classificationConfidence,
      canonicalName: row.canonicalName,
      needsReview: row.needsReview,
      latestPrice,
      previousPrice,
      priceChangePercent: latestPrice && previousPrice ? ((latestPrice - previousPrice) / previousPrice) * 100 : null,
      supplierId: row.supplierId != null ? Number(row.supplierId) : null,
      supplierName: row.supplierName ?? null,
      lastPurchaseDate: row.lastPurchaseDate ?? null,
      supplierCount: row.supplierCount != null ? toNum(row.supplierCount) : 0,
      totalQuantity: row.totalQuantity != null ? toNum(row.totalQuantity) : null,
    };
  });

  res.json(enriched.filter(p => p.supplierName != null));
});

// ─── Paginated products (server-side search / filter / sort) ──────────────────
router.get("/products/page", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = ListProductsPagedQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { supplierId, costCenterId, category, needsReview, search, sort } = parsed.data;
  const month = parsed.data.month ?? new Date().toISOString().slice(0, 7);
  const page = Math.max(1, parsed.data.page ?? 1);
  const limit = Math.min(200, Math.max(1, parsed.data.limit ?? 50));
  const offset = (page - 1) * limit;
  const mStart = monthStart(month);
  const mEnd = monthEnd(month);

  const supplierSql = supplierId ? sql` AND i.supplier_id = ${supplierId}` : sql``;
  const ccSql = costCenterId != null
    ? costCenterId === 0 ? sql` AND i.cost_center_id IS NULL` : sql` AND i.cost_center_id = ${costCenterId}`
    : sql``;
  const needsReviewSql = needsReview ? sql` AND p.needs_review = true` : sql``;
  const searchSql = search?.trim() ? sql` AND p.name ILIKE ${`%${search.trim()}%`}` : sql``;
  const categorySql = category
    ? category === "inne"
      ? sql` AND (p.category = 'inne' OR p.category IS NULL)`
      : sql` AND p.category = ${category}`
    : sql``;

  const orderSql = (() => {
    switch (sort) {
      case "name-desc": return sql`p.name DESC`;
      case "price-desc": return sql`lb.latest_price DESC NULLS LAST`;
      case "price-asc": return sql`lb.latest_price ASC NULLS LAST`;
      case "change-desc": return sql`ABS((lb.latest_price - pb.previous_price) / NULLIF(pb.previous_price, 0)) DESC NULLS LAST`;
      case "supplier-asc": return sql`lb.supplier_name ASC NULLS LAST`;
      case "quantity-desc": return sql`qs.total_quantity DESC NULLS LAST`;
      case "quantity-asc": return sql`qs.total_quantity ASC NULLS LAST`;
      default: return sql`p.name ASC`;
    }
  })();

  type Row = {
    id: number; name: string; unit: string; category: string | null; subcategory: string | null;
    classificationConfidence: number | null; canonicalName: string | null; needsReview: boolean;
    latestPrice: string | null; lastPurchaseDate: string | null;
    supplierId: string | null; supplierName: string | null;
    previousPrice: string | null; supplierCount: string | null; totalQuantity: string | null;
  };

  const itemsResult = await db.execute(sql`
    WITH
    latest_base AS (
      SELECT DISTINCT ON (ii.product_id)
        ii.product_id, ii.unit_price::numeric AS latest_price,
        i.invoice_date AS last_purchase_date, i.supplier_id, s.name AS supplier_name
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id = ${userId} AND i.excluded = false
        AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
        AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
        AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd}
        ${supplierSql}${ccSql}
      ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
    ),
    prev_base AS (
      SELECT DISTINCT ON (ii.product_id)
        ii.product_id, ii.unit_price::numeric AS previous_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId} AND i.excluded = false
        AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
        AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
        AND i.invoice_date < ${mStart}
        ${supplierSql}${ccSql}
      ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
    ),
    sup_counts AS (
      SELECT ii.product_id, COUNT(DISTINCT i.supplier_id)::int AS supplier_count
      FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId} AND i.excluded = false ${ccSql}
      GROUP BY ii.product_id
    ),
    qty_sums AS (
      SELECT ii.product_id, SUM(ii.quantity::numeric) AS total_quantity
      FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId} AND i.excluded = false
        AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd} ${ccSql}
      GROUP BY ii.product_id
    )
    SELECT
      p.id, p.name, p.unit, p.category, p.subcategory,
      p.classification_confidence AS "classificationConfidence",
      p.canonical_name AS "canonicalName",
      p.needs_review AS "needsReview",
      lb.latest_price::text AS "latestPrice",
      lb.last_purchase_date AS "lastPurchaseDate",
      lb.supplier_id::text AS "supplierId",
      lb.supplier_name AS "supplierName",
      pb.previous_price::text AS "previousPrice",
      sc.supplier_count::text AS "supplierCount",
      qs.total_quantity::text AS "totalQuantity"
    FROM products p
    JOIN latest_base lb ON p.id = lb.product_id
    LEFT JOIN prev_base pb ON p.id = pb.product_id
    LEFT JOIN sup_counts sc ON p.id = sc.product_id
    LEFT JOIN qty_sums qs ON p.id = qs.product_id
    WHERE p.user_id = ${userId}${categorySql}${needsReviewSql}${searchSql}
    ORDER BY ${orderSql}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const items = (itemsResult.rows as Row[]).map((row) => {
    const latestPrice = row.latestPrice != null ? toNum(row.latestPrice) : null;
    const previousPrice = row.previousPrice != null ? toNum(row.previousPrice) : null;
    return {
      id: row.id, name: row.name, unit: row.unit, category: row.category, subcategory: row.subcategory,
      classificationConfidence: row.classificationConfidence,
      canonicalName: row.canonicalName, needsReview: row.needsReview,
      latestPrice, previousPrice,
      priceChangePercent: latestPrice && previousPrice ? ((latestPrice - previousPrice) / previousPrice) * 100 : null,
      supplierId: row.supplierId != null ? Number(row.supplierId) : null,
      supplierName: row.supplierName ?? null,
      lastPurchaseDate: row.lastPurchaseDate ?? null,
      supplierCount: row.supplierCount != null ? toNum(row.supplierCount) : 0,
      totalQuantity: row.totalQuantity != null ? toNum(row.totalQuantity) : null,
    };
  });

  // Liczność per kategoria (ignoruje filtr kategorii) — produkty kupione w scope.
  const countsResult = await db.execute(sql`
    SELECT COALESCE(p.category, 'inne') AS category, COUNT(*)::int AS count
    FROM products p
    WHERE p.user_id = ${userId}${needsReviewSql}${searchSql}
      AND EXISTS (
        SELECT 1 FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.product_id = p.id AND i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd}
          ${supplierSql}${ccSql}
      )
    GROUP BY 1
  `);
  const categoryCounts = (countsResult.rows as { category: string; count: number }[]).map((r) => ({
    category: r.category, count: Number(r.count),
  }));
  const total = category
    ? (categoryCounts.find((c) => c.category === category)?.count ?? 0)
    : categoryCounts.reduce((s, c) => s + c.count, 0);

  // Liczba produktów do weryfikacji w scope (ignoruje search/kategorię) — do badge'a przycisku.
  const nrResult = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM products p
    WHERE p.user_id = ${userId} AND p.needs_review = true
      AND EXISTS (
        SELECT 1 FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.product_id = p.id AND i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd}
          ${supplierSql}${ccSql}
      )
  `);
  const needsReviewCount = Number((nrResult.rows[0] as { c: number } | undefined)?.c ?? 0);

  res.json({ items, total, categoryCounts, needsReviewCount });
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
  const ccSql = costCenterId != null
    ? costCenterId === 0
      ? sql` AND i.cost_center_id IS NULL`
      : sql` AND i.cost_center_id = ${costCenterId}`
    : sql``;

  type ChangeRow = {
    product_id: number; product_name: string; unit: string;
    current_price: string | null; previous_price: string | null;
    supplier_name: string | null; last_date: string | null;
  };

  let rows: ChangeRow[];

  if (topMonth) {
    const mStart = monthStart(topMonth);
    const mEnd = monthEnd(topMonth);
    const result = await db.execute(sql`
      WITH
      current_prices AS (
        SELECT DISTINCT ON (ii.product_id)
          ii.product_id, ii.unit_price::numeric AS current_price,
          i.invoice_date AS last_date, s.name AS supplier_name
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd}
          ${ccSql}
        ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
      ),
      previous_prices AS (
        SELECT DISTINCT ON (ii.product_id)
          ii.product_id, ii.unit_price::numeric AS previous_price
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          AND i.invoice_date < ${mStart}
          ${ccSql}
        ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
      )
      SELECT
        p.id AS product_id, p.name AS product_name, p.unit,
        cp.current_price::text, pp.previous_price::text,
        cp.supplier_name, cp.last_date
      FROM products p
      JOIN current_prices cp ON p.id = cp.product_id
      JOIN previous_prices pp ON p.id = pp.product_id
      WHERE p.user_id = ${userId}
    `);
    rows = result.rows as ChangeRow[];
  } else {
    const result = await db.execute(sql`
      WITH
      date_deduped AS (
        SELECT DISTINCT ON (ii.product_id, i.invoice_date)
          ii.product_id, ii.unit_price::numeric AS unit_price,
          i.invoice_date, i.id AS invoice_id, s.name AS supplier_name
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.parent_invoice_id IS NULL AND i.invoice_type IS DISTINCT FROM 'KOR'
          AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
          ${ccSql}
        ORDER BY ii.product_id, i.invoice_date DESC, i.id DESC
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY invoice_date DESC, invoice_id DESC) AS rn
        FROM date_deduped
      )
      SELECT
        p.id AS product_id, p.name AS product_name, p.unit,
        MAX(CASE WHEN r.rn = 1 THEN r.unit_price END)::text AS current_price,
        MAX(CASE WHEN r.rn = 2 THEN r.unit_price END)::text AS previous_price,
        MAX(CASE WHEN r.rn = 1 THEN r.supplier_name END) AS supplier_name,
        MAX(CASE WHEN r.rn = 1 THEN r.invoice_date END) AS last_date
      FROM products p
      JOIN ranked r ON p.id = r.product_id AND r.rn <= 2
      WHERE p.user_id = ${userId}
      GROUP BY p.id, p.name, p.unit
      HAVING COUNT(DISTINCT CASE WHEN r.rn <= 2 THEN r.rn END) = 2
    `);
    rows = result.rows as ChangeRow[];
  }

  const filtered = rows
    .map(row => {
      const current = toNum(row.current_price ?? "0");
      const previous = toNum(row.previous_price ?? "0");
      if (!current || !previous) return null;
      const changePercent = ((current - previous) / previous) * 100;
      return {
        productId: row.product_id,
        productName: row.product_name,
        unit: row.unit,
        currentPrice: current,
        previousPrice: previous,
        changePercent: Math.abs(changePercent),
        changeDirection: changePercent >= 0 ? "up" : "down",
        supplierName: row.supplier_name,
        lastDate: row.last_date,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && c.changePercent >= 0.05)
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
    .where(and(
      eq(invoiceItemsTable.productId, params.data.id),
      eq(invoicesTable.userId, userId),
      eq(invoicesTable.excluded, false),
      isNull(invoicesTable.parentInvoiceId),
      sql`${invoicesTable.invoiceType} IS DISTINCT FROM 'KOR'`,
      sql`${invoiceItemsTable.quantity}::numeric > 0`,
      sql`${invoiceItemsTable.unitPrice}::numeric > 0`,
    ))
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
            isNull(invoicesTable.parentInvoiceId),
            sql`${invoicesTable.invoiceType} IS DISTINCT FROM 'KOR'`,
            sql`${invoiceItemsTable.quantity}::numeric > 0`,
            sql`${invoiceItemsTable.unitPrice}::numeric > 0`,
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

  // Raw SQL: compute effective unit price = main unit_price + SUM of corrections
  // linked via parent_invoice_id (for the same product). Corrections with negative
  // quantities or 'KOR' invoice type are excluded from the main result set.
  const productId = params.data.id;
  const supplierFilter = supplierId ? `AND inv.supplier_id = ${supplierId}` : "";

  const { rows: history } = await db.execute<{
    date: string;
    price: string;
    invoice_id: number;
    invoice_number: string;
    supplier_id: number;
    supplier_name: string;
  }>(sql.raw(`
    SELECT
      inv.invoice_date                                  AS date,
      (
        ii.unit_price::numeric
        + COALESCE((
            SELECT SUM(ii2.unit_price::numeric)
            FROM invoice_items ii2
            JOIN invoices cor ON ii2.invoice_id = cor.id
            WHERE ii2.product_id = ${productId}
              AND cor.parent_invoice_id = inv.id
              AND cor.user_id = '${userId}'
              AND cor.excluded = false
          ), 0)
      )::text                                           AS price,
      inv.id                                            AS invoice_id,
      inv.invoice_number                                AS invoice_number,
      inv.supplier_id                                   AS supplier_id,
      s.name                                            AS supplier_name
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    JOIN suppliers s  ON inv.supplier_id = s.id
    WHERE ii.product_id = ${productId}
      AND inv.user_id   = '${userId}'
      AND inv.excluded  = false
      AND inv.parent_invoice_id IS NULL
      AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0
      AND ii.unit_price::numeric > 0
      ${supplierFilter}
    ORDER BY inv.invoice_date
  `));

  res.json(
    history.map((h) => ({
      date: h.date,
      price: toNum(h.price),
      invoiceId: h.invoice_id,
      invoiceNumber: h.invoice_number,
      supplierId: h.supplier_id,
      supplierName: h.supplier_name,
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
  res.set("Cache-Control", "private, max-age=3600");
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
