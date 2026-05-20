import { Router, type IRouter } from "express";
import { toNum } from "../lib/parse";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/reports/monthly", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthParam = req.query.month as string | undefined;

  const now = new Date();
  const isAllTime = monthParam === "all";
  const month = isAllTime ? "all" : (monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  if (!isAllTime && !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month format. Use YYYY-MM or 'all'" });
    return;
  }

  const monthPrefix = isAllTime ? "" : `${month}-`;

  const summaryResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT i.id)::int AS invoice_count,
      COUNT(DISTINCT ii.product_id)::int AS product_count,
      COALESCE(SUM(ii.total_price::numeric), 0)::float AS total_spend
    FROM invoices i
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.user_id = ${userId}
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
  `);
  const summary = summaryResult.rows[0] as {
    invoice_count: number;
    product_count: number;
    total_spend: number;
  };

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
    WHERE i.user_id = ${userId}
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
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
    productName: r.product_name ?? "Nieznany",
    unit: r.unit,
    totalQuantity: r.total_quantity,
    avgPrice: r.avg_price,
    totalCost: r.total_cost,
    supplierName: r.supplier_name,
  }));

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
    WHERE i.user_id = ${userId}
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
    GROUP BY s.id, s.name
    ORDER BY total_spend DESC
  `);

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
        WHERE i.user_id = ${userId}
          AND i.invoice_date LIKE ${monthPrefix + "%"}
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

router.get("/reports/predictive", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const horizonRaw = parseInt(String(req.query.horizonDays ?? "30"), 10);
  const horizonDays = Number.isFinite(horizonRaw)
    ? Math.min(180, Math.max(7, horizonRaw))
    : 30;

  const rows = await db.execute<{
    product_id: number | null;
    product_name: string;
    unit: string;
    supplier_name: string | null;
    invoice_date: string;
    unit_price: string;
    quantity: string;
  }>(sql`
    SELECT
      ii.product_id,
      COALESCE(p.name, ii.product_name) AS product_name,
      ii.unit,
      s.name AS supplier_name,
      i.invoice_date,
      ii.unit_price::text AS unit_price,
      ii.quantity::text AS quantity
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    INNER JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.user_id = ${userId}
      AND i.invoice_date >= to_char(current_date - interval '365 days', 'YYYY-MM-DD')
    ORDER BY ii.product_id NULLS LAST, p.name, s.name, i.invoice_date
  `);

  type Point = { day: number; price: number; qty: number; date: string };
  type Group = {
    productId: number | null;
    productName: string;
    unit: string;
    supplierName: string | null;
    points: Point[];
  };

  const groups = new Map<string, Group>();
  const today = new Date();
  const todayMs = today.getTime();
  const dayMs = 86400000;

  for (const r of rows.rows) {
    const key = `${r.product_id ?? "n:" + r.product_name.toLowerCase().trim()}|${r.supplier_name ?? ""}|${r.unit}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        productId: r.product_id,
        productName: r.product_name,
        unit: r.unit,
        supplierName: r.supplier_name,
        points: [],
      };
      groups.set(key, g);
    }
    const t = new Date(r.invoice_date).getTime();
    if (!Number.isFinite(t)) continue;
    const day = Math.round((t - todayMs) / dayMs);
    const price = toNum(r.unit_price);
    const qty = toNum(r.quantity);
    if (!Number.isFinite(price) || price <= 0) continue;
    g.points.push({ day, price, qty: Number.isFinite(qty) ? qty : 0, date: r.invoice_date });
  }

  const productRows: Array<{
    productId: number | null;
    productName: string;
    unit: string;
    supplierName: string | null;
    currentPrice: number;
    projectedPrice: number;
    priceChangePercent: number;
    recentMonthlyQuantity: number;
    projectedMonthlyCost: number;
    projectedMonthlyDelta: number;
    dataPoints: number;
    confidence: "low" | "medium" | "high";
  }> = [];

  let recentMonthlySpendTotal = 0;
  let projectedMonthlySpendTotal = 0;

  for (const g of groups.values()) {
    if (g.points.length < 2) continue;

    const n = g.points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of g.points) {
      sumX += p.day;
      sumY += p.price;
      sumXY += p.day * p.price;
      sumXX += p.day * p.day;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    const denom = sumXX - n * meanX * meanX;
    const slope = denom !== 0 ? (sumXY - n * meanX * meanY) / denom : 0;
    const intercept = meanY - slope * meanX;

    const sorted = [...g.points].sort((a, b) => a.day - b.day);
    const currentPrice = sorted[sorted.length - 1].price;
    const projectedRaw = intercept + slope * horizonDays;
    const projectedPrice = projectedRaw > 0 && Number.isFinite(projectedRaw)
      ? projectedRaw
      : currentPrice;

    const priceChangePercent = currentPrice > 0
      ? ((projectedPrice - currentPrice) / currentPrice) * 100
      : 0;

    const recentQty = g.points
      .filter((p) => p.day >= -90)
      .reduce((s, p) => s + p.qty, 0);
    const recentMonthlyQuantity = recentQty / 3;

    const recentMonthlyCost = recentMonthlyQuantity * currentPrice;
    const projectedMonthlyCost = recentMonthlyQuantity * projectedPrice;
    const projectedMonthlyDelta = projectedMonthlyCost - recentMonthlyCost;

    recentMonthlySpendTotal += recentMonthlyCost;
    projectedMonthlySpendTotal += projectedMonthlyCost;

    const spanDays = sorted[sorted.length - 1].day - sorted[0].day;
    let confidence: "low" | "medium" | "high" = "low";
    if (n >= 6 && spanDays <= -60) confidence = "high";
    else if (n >= 3 && spanDays <= -21) confidence = "medium";

    productRows.push({
      productId: g.productId,
      productName: g.productName,
      unit: g.unit,
      supplierName: g.supplierName,
      currentPrice,
      projectedPrice,
      priceChangePercent,
      recentMonthlyQuantity,
      projectedMonthlyCost,
      projectedMonthlyDelta,
      dataPoints: n,
      confidence,
    });
  }

  const meaningful = productRows.filter(
    (r) => Math.abs(r.priceChangePercent) >= 0.5 && r.recentMonthlyQuantity > 0,
  );

  const topIncreases = [...meaningful]
    .filter((r) => r.priceChangePercent > 0)
    .sort((a, b) => b.projectedMonthlyDelta - a.projectedMonthlyDelta)
    .slice(0, 15);

  const topDecreases = [...meaningful]
    .filter((r) => r.priceChangePercent < 0)
    .sort((a, b) => a.projectedMonthlyDelta - b.projectedMonthlyDelta)
    .slice(0, 15);

  const projectedDelta = projectedMonthlySpendTotal - recentMonthlySpendTotal;
  const projectedDeltaPercent = recentMonthlySpendTotal > 0
    ? (projectedDelta / recentMonthlySpendTotal) * 100
    : 0;

  res.json({
    horizonDays,
    generatedAt: new Date().toISOString(),
    recentMonthlySpend: recentMonthlySpendTotal,
    projectedMonthlySpend: projectedMonthlySpendTotal,
    projectedDelta,
    projectedDeltaPercent,
    productsAnalyzed: productRows.length,
    topIncreases,
    topDecreases,
  });
});

router.get("/reports/category-spend", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const result = await db.execute(sql`
    SELECT
      COALESCE(p.name, ii.product_name) AS product_name,
      p.category,
      SUM(ii.total_price::numeric)::float AS total_spend
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.user_id = ${userId}
    GROUP BY COALESCE(p.name, ii.product_name), p.category
    ORDER BY total_spend DESC
  `);

  const rows = result.rows as Array<{
    product_name: string;
    category: string | null;
    total_spend: number;
  }>;

  res.json(rows.map((r) => ({
    productName: r.product_name,
    category: r.category ?? null,
    totalSpend: toNum(r.total_spend),
  })));
});

export default router;
