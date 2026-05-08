import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/monthly", async (req, res): Promise<void> => {
  const monthParam = req.query.month as string | undefined;

  // Default to current month
  const now = new Date();
  const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Validate format
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month format. Use YYYY-MM" });
    return;
  }

  const monthPrefix = `${month}-`;

  // Overall summary for the month
  const summaryResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT i.id)::int AS invoice_count,
      COUNT(DISTINCT ii.product_id)::int AS product_count,
      COALESCE(SUM(ii.total_price::numeric), 0)::float AS total_spend
    FROM invoices i
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.invoice_date LIKE ${monthPrefix + "%"}
  `);
  const summary = summaryResult.rows[0] as {
    invoice_count: number;
    product_count: number;
    total_spend: number;
  };

  // Top products for the month (all suppliers combined)
  const topProductsResult = await db.execute(sql`
    SELECT
      p.name AS product_name,
      ii.unit,
      SUM(ii.quantity::numeric)::float AS total_quantity,
      AVG(ii.unit_price::numeric)::float AS avg_price,
      SUM(ii.total_price::numeric)::float AS total_cost,
      s.name AS supplier_name
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    INNER JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.invoice_date LIKE ${monthPrefix + "%"}
    GROUP BY p.name, ii.product_name, ii.unit, s.name
    ORDER BY total_cost DESC
    LIMIT 20
  `);

  const topProducts = (topProductsResult.rows as Array<{
    product_name: string | null;
    unit: string;
    total_quantity: number;
    avg_price: number;
    total_cost: number;
    supplier_name: string;
  }>).map((r) => ({
    productName: r.product_name ?? r.product_name ?? "Nieznany",
    unit: r.unit,
    totalQuantity: r.total_quantity,
    avgPrice: r.avg_price,
    totalCost: r.total_cost,
    supplierName: r.supplier_name,
  }));

  // Per-supplier summary
  const supplierSummaryResult = await db.execute(sql`
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      COUNT(DISTINCT i.id)::int AS invoice_count,
      COUNT(DISTINCT ii.product_id)::int AS product_count,
      SUM(ii.total_price::numeric)::float AS total_spend
    FROM invoices i
    INNER JOIN suppliers s ON i.supplier_id = s.id
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.invoice_date LIKE ${monthPrefix + "%"}
    GROUP BY s.id, s.name
    ORDER BY total_spend DESC
  `);

  // For each supplier, get top products
  const suppliers = await Promise.all(
    (supplierSummaryResult.rows as Array<{
      supplier_id: number;
      supplier_name: string;
      invoice_count: number;
      product_count: number;
      total_spend: number;
    }>).map(async (s) => {
      const productsResult = await db.execute(sql`
        SELECT
          COALESCE(p.name, ii.product_name) AS product_name,
          ii.unit,
          SUM(ii.quantity::numeric)::float AS total_quantity,
          AVG(ii.unit_price::numeric)::float AS avg_price,
          SUM(ii.total_price::numeric)::float AS total_cost
        FROM invoice_items ii
        INNER JOIN invoices i ON ii.invoice_id = i.id
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE i.invoice_date LIKE ${monthPrefix + "%"}
          AND i.supplier_id = ${s.supplier_id}
        GROUP BY p.name, ii.product_name, ii.unit
        ORDER BY total_cost DESC
        LIMIT 15
      `);

      return {
        supplierId: s.supplier_id,
        supplierName: s.supplier_name,
        totalSpend: s.total_spend,
        invoiceCount: s.invoice_count,
        productCount: s.product_count,
        topProducts: (productsResult.rows as Array<{
          product_name: string;
          unit: string;
          total_quantity: number;
          avg_price: number;
          total_cost: number;
        }>).map((r) => ({
          productName: r.product_name,
          unit: r.unit,
          totalQuantity: r.total_quantity,
          avgPrice: r.avg_price,
          totalCost: r.total_cost,
          supplierName: s.supplier_name,
        })),
      };
    })
  );

  res.json({
    month,
    totalSpend: summary.total_spend,
    invoiceCount: summary.invoice_count,
    productCount: summary.product_count,
    suppliers,
    topProducts,
  });
});

export default router;
