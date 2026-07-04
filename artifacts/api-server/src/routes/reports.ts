import { Router, type IRouter } from "express";
import { toNum } from "../lib/parse";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function calcPrevMonthPrefix(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// YYYY-MM przesunięte o n miesięcy wstecz.
function monthMinus(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

router.get("/reports/monthly", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthParam = req.query.month as string | undefined;
  const costCenterIdRaw = req.query.costCenterId;
  const costCenterId = costCenterIdRaw != null && costCenterIdRaw !== "" ? parseInt(String(costCenterIdRaw), 10) : null;
  const ccSql = costCenterId != null && !isNaN(costCenterId)
    ? sql`AND i.cost_center_id = ${costCenterId}`
    : sql.raw("");

  const now = new Date();
  const isAllTime = monthParam === "all";
  const month = isAllTime ? "all" : (monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  if (!isAllTime && !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month format. Use YYYY-MM or 'all'" });
    return;
  }

  const monthPrefix = isAllTime ? "" : `${month}-`;
  const prevMonthPrefix = isAllTime ? "" : `${calcPrevMonthPrefix(month)}-`;

  const summaryResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT i.id)::int AS invoice_count,
      COUNT(DISTINCT ii.product_id)::int AS product_count,
      COALESCE(SUM(ii.total_price::numeric), 0)::float AS total_spend
    FROM invoices i
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
      ${ccSql}
  `);
  const summary = summaryResult.rows[0] as {
    invoice_count: number;
    product_count: number;
    total_spend: number;
  };

  // Previous month avg prices + total quantities: keyed by "productName|unit|supplierName"
  type PrevRow = { product_name: string; unit: string; supplier_name: string; avg_price: number; total_quantity: number };
  const prevMap = new Map<string, number>();
  const prevQtyMap = new Map<string, number>();
  if (!isAllTime) {
    const prevResult = await db.execute(sql`
      SELECT
        COALESCE(p.name, ii.product_name) AS product_name,
        ii.unit,
        s.name AS supplier_name,
        AVG(ii.unit_price::numeric)::float AS avg_price,
        SUM(ii.quantity::numeric)::float AS total_quantity
      FROM invoice_items ii
      INNER JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      INNER JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id = ${userId}
        AND i.excluded = false
        AND i.invoice_date LIKE ${prevMonthPrefix + "%"}
        ${ccSql}
      GROUP BY COALESCE(p.name, ii.product_name), ii.unit, s.name
    `);
    for (const r of prevResult.rows as PrevRow[]) {
      prevMap.set(`${r.product_name}|${r.unit}|${r.supplier_name}`, r.avg_price);
      prevQtyMap.set(`${r.product_name}|${r.unit}|${r.supplier_name}`, r.total_quantity);
    }
  }

  const topProductsResult = await db.execute(sql`
    SELECT
      COALESCE(p.name, ii.product_name) AS product_name,
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
      AND i.excluded = false
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
      ${ccSql}
    GROUP BY COALESCE(p.name, ii.product_name), ii.unit, s.name
    ORDER BY total_cost DESC
    LIMIT 100
  `);

  // „vs zwykle" — średnia z miesięcznych średnich ceny (ostatnie 12 mies.) per produkt+jednostka+dostawca.
  // „Taniej u innego dostawcy" — najtańszy dostawca dla tego produktu w bieżącym miesiącu.
  const overallMap = new Map<string, number>();
  const cheapest = new Map<string, { supplier: string; price: number }>();
  if (!isAllTime) {
    const overallFrom = `${monthMinus(month, 11)}-01`;
    const overallEndExcl = `${monthMinus(month, -1)}-01`;
    const [overallRes, cheapRes] = await Promise.all([
      db.execute(sql`
        SELECT name, unit, supplier, AVG(mavg)::float AS overall_avg FROM (
          SELECT COALESCE(p.name, ii.product_name) AS name, ii.unit AS unit, s.name AS supplier,
            SUBSTRING(i.invoice_date, 1, 7) AS mo, AVG(ii.unit_price::numeric)::float AS mavg
          FROM invoice_items ii
          INNER JOIN invoices i ON ii.invoice_id = i.id
          INNER JOIN suppliers s ON i.supplier_id = s.id
          LEFT JOIN products p ON ii.product_id = p.id
          WHERE i.user_id = ${userId} AND i.excluded = false
            AND i.invoice_date >= ${overallFrom} AND i.invoice_date < ${overallEndExcl} ${ccSql}
          GROUP BY COALESCE(p.name, ii.product_name), ii.unit, s.name, SUBSTRING(i.invoice_date, 1, 7)
        ) m
        GROUP BY name, unit, supplier
      `),
      db.execute(sql`
        SELECT DISTINCT ON (name, unit) name, unit, supplier, price FROM (
          SELECT COALESCE(p.name, ii.product_name) AS name, ii.unit AS unit, s.name AS supplier,
            AVG(ii.unit_price::numeric)::float AS price
          FROM invoice_items ii
          INNER JOIN invoices i ON ii.invoice_id = i.id
          INNER JOIN suppliers s ON i.supplier_id = s.id
          LEFT JOIN products p ON ii.product_id = p.id
          WHERE i.user_id = ${userId} AND i.excluded = false
            AND i.invoice_date LIKE ${monthPrefix + "%"} ${ccSql}
          GROUP BY COALESCE(p.name, ii.product_name), ii.unit, s.name
        ) x
        ORDER BY name, unit, price ASC
      `),
    ]);
    for (const r of overallRes.rows as { name: string; unit: string; supplier: string; overall_avg: number }[]) {
      overallMap.set(`${r.name}|${r.unit}|${r.supplier}`, toNum(r.overall_avg));
    }
    for (const r of cheapRes.rows as { name: string; unit: string; supplier: string; price: number }[]) {
      cheapest.set(`${r.name}|${r.unit}`, { supplier: r.supplier, price: toNum(r.price) });
    }
  }

  const topProducts = (topProductsResult.rows as Array<{
    product_name: string | null;
    unit: string;
    total_quantity: number;
    avg_price: number;
    total_cost: number;
    supplier_name: string;
  }>).map((r) => {
    const name = r.product_name ?? "Nieznany";
    const avgPrice = toNum(r.avg_price);
    const cheap = cheapest.get(`${name}|${r.unit}`);
    // Flaguj tylko realną oszczędność u INNEGO dostawcy (>2% taniej).
    const hasCheaper = cheap && cheap.supplier !== r.supplier_name && cheap.price < avgPrice * 0.98;
    return {
      productName: name,
      unit: r.unit,
      totalQuantity: r.total_quantity,
      avgPrice: r.avg_price,
      totalCost: r.total_cost,
      supplierName: r.supplier_name,
      prevMonthAvgPrice: prevMap.get(`${name}|${r.unit}|${r.supplier_name}`) ?? null,
      prevMonthTotalQuantity: prevQtyMap.get(`${name}|${r.unit}|${r.supplier_name}`) ?? null,
      overallAvgPrice: overallMap.get(`${name}|${r.unit}|${r.supplier_name}`) ?? null,
      cheaperSupplierName: hasCheaper ? cheap!.supplier : null,
      cheaperPct: hasCheaper ? ((avgPrice - cheap!.price) / avgPrice) * 100 : null,
    };
  });

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
      AND i.excluded = false
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
      ${ccSql}
    GROUP BY s.id, s.name
    ORDER BY total_spend DESC
  `);

  const supplierRows = supplierSummaryResult.rows as Array<{
    supplier_id: number;
    supplier_name: string;
    invoice_count: number;
    product_count: number;
    total_spend: number;
  }>;

  const supplierProductsResult = await db.execute(sql`
    SELECT
      i.supplier_id,
      COALESCE(p.name, ii.product_name) AS product_name,
      ii.unit,
      SUM(ii.quantity::numeric)::float AS total_quantity,
      AVG(ii.unit_price::numeric)::float AS avg_price,
      SUM(ii.total_price::numeric)::float AS total_cost,
      ROW_NUMBER() OVER (
        PARTITION BY i.supplier_id
        ORDER BY SUM(ii.total_price::numeric) DESC
      ) AS rn
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      ${isAllTime ? sql.raw("") : sql`AND i.invoice_date LIKE ${monthPrefix + "%"}`}
      ${ccSql}
    GROUP BY i.supplier_id, COALESCE(p.name, ii.product_name), ii.unit
  `);

  type SupplierProductRow = {
    supplier_id: number;
    product_name: string;
    unit: string;
    total_quantity: number;
    avg_price: number;
    total_cost: number;
    rn: number;
  };

  const supplierProductsMap = new Map<number, SupplierProductRow[]>();
  for (const r of supplierProductsResult.rows as SupplierProductRow[]) {
    if (r.rn > 15) continue;
    let arr = supplierProductsMap.get(r.supplier_id);
    if (!arr) {
      arr = [];
      supplierProductsMap.set(r.supplier_id, arr);
    }
    arr.push(r);
  }

  const suppliers = supplierRows.map((s) => ({
    supplierId: s.supplier_id,
    supplierName: s.supplier_name,
    totalSpend: s.total_spend,
    invoiceCount: s.invoice_count,
    productCount: s.product_count,
    topProducts: (supplierProductsMap.get(s.supplier_id) ?? []).map((r) => ({
      productName: r.product_name,
      unit: r.unit,
      totalQuantity: r.total_quantity,
      avgPrice: r.avg_price,
      totalCost: r.total_cost,
      supplierName: s.supplier_name,
      prevMonthAvgPrice: prevMap.get(`${r.product_name}|${r.unit}|${s.supplier_name}`) ?? null,
      prevMonthTotalQuantity: prevQtyMap.get(`${r.product_name}|${r.unit}|${s.supplier_name}`) ?? null,
    })),
  }));

  res.json({
    month,
    totalSpend: summary.total_spend,
    invoiceCount: summary.invoice_count,
    productCount: summary.product_count,
    suppliers,
    topProducts,
  });
});

// ─── Spend bridge: odpowiedzi „answer-first" dla restauratora ─────────────────
// Ile wydałem vs poprzedni miesiąc i vs średnia miesięczna; rozbicie różnicy na
// wpływ CEN vs ILOŚCI (dokładnie, po WSZYSTKICH produktach); benchmark cen
// produktów (teraz vs poprzedni vs średnia ogólna) oraz ruchy ilościowe.
router.get("/reports/spend-bridge", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();
  const monthParam = req.query.month as string | undefined;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? monthParam
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "Invalid month. Use YYYY-MM." }); return; }

  const ccIdRaw = req.query.costCenterId;
  const ccId = ccIdRaw != null && ccIdRaw !== "" ? parseInt(String(ccIdRaw), 10) : null;
  const ccSql = ccId != null && !isNaN(ccId) ? sql`AND i.cost_center_id = ${ccId}` : sql.raw("");

  const prev = calcPrevMonthPrefix(month);

  type NU = { name: string; unit: string; qty: number; price: number; cost: number };
  const perProduct = (likePrefix: string) => db.execute(sql`
    SELECT COALESCE(p.name, ii.product_name) AS name, ii.unit AS unit,
      SUM(ii.quantity::numeric)::float AS qty,
      AVG(ii.unit_price::numeric)::float AS price,
      SUM(ii.total_price::numeric)::float AS cost
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.user_id = ${userId} AND i.excluded = false
      AND i.invoice_date LIKE ${likePrefix} ${ccSql}
    GROUP BY COALESCE(p.name, ii.product_name), ii.unit
  `);

  // Średnia ogólna ceny produktu = średnia z miesięcznych średnich (ostatnie 12 mies.).
  const overallFrom = `${monthMinus(month, 11)}-01`;
  const overallEndExcl = `${monthMinus(month, -1)}-01`; // < początek następnego miesiąca
  const [curRes, prevRes, overallRes, trendRes] = await Promise.all([
    perProduct(`${month}-%`),
    perProduct(`${prev}-%`),
    db.execute(sql`
      SELECT name, unit, AVG(mavg)::float AS overall_avg FROM (
        SELECT COALESCE(p.name, ii.product_name) AS name, ii.unit AS unit,
          SUBSTRING(i.invoice_date, 1, 7) AS mo, AVG(ii.unit_price::numeric)::float AS mavg
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE i.user_id = ${userId} AND i.excluded = false
          AND i.invoice_date >= ${overallFrom} AND i.invoice_date < ${overallEndExcl} ${ccSql}
        GROUP BY COALESCE(p.name, ii.product_name), ii.unit, SUBSTRING(i.invoice_date, 1, 7)
      ) monthly
      GROUP BY name, unit
    `),
    // Średnia miesięczna wydatków — ostatnie 6 pełnych miesięcy PRZED bieżącym.
    db.execute(sql`
      SELECT SUBSTRING(i.invoice_date, 1, 7) AS mo, SUM(ii.total_price::numeric)::float AS spend
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId} AND i.excluded = false
        AND i.invoice_date >= ${`${monthMinus(month, 6)}-01`} AND i.invoice_date < ${`${month}-01`} ${ccSql}
      GROUP BY SUBSTRING(i.invoice_date, 1, 7)
    `),
  ]);

  const curMap = new Map<string, NU>();
  let currentSpend = 0;
  for (const r of curRes.rows as NU[]) { const k = `${r.name}|${r.unit}`; curMap.set(k, r); currentSpend += toNum(r.cost); }
  const prevMap = new Map<string, NU>();
  let prevSpend = 0;
  for (const r of prevRes.rows as NU[]) { const k = `${r.name}|${r.unit}`; prevMap.set(k, r); prevSpend += toNum(r.cost); }
  const overallMap = new Map<string, number>();
  for (const r of overallRes.rows as { name: string; unit: string; overall_avg: number }[]) {
    overallMap.set(`${r.name}|${r.unit}`, toNum(r.overall_avg));
  }

  let priceEffect = 0, volumeEffect = 0, newEffect = 0, droppedEffect = 0;
  const priceDrivers: { productName: string; unit: string; amount: number; pricePct: number }[] = [];
  const volumeDrivers: { productName: string; unit: string; amount: number; qtyPct: number }[] = [];
  const newProducts: { productName: string; unit: string; amount: number }[] = [];
  const droppedProducts: { productName: string; unit: string; amount: number }[] = [];

  for (const [k, c] of curMap) {
    const p = prevMap.get(k);
    if (p) {
      const pe = (toNum(c.price) - toNum(p.price)) * toNum(c.qty);
      const ve = (toNum(c.qty) - toNum(p.qty)) * toNum(p.price);
      priceEffect += pe;
      volumeEffect += ve;
      priceDrivers.push({ productName: c.name, unit: c.unit, amount: pe, pricePct: toNum(p.price) > 0 ? ((toNum(c.price) - toNum(p.price)) / toNum(p.price)) * 100 : 0 });
      volumeDrivers.push({ productName: c.name, unit: c.unit, amount: ve, qtyPct: toNum(p.qty) > 0 ? ((toNum(c.qty) - toNum(p.qty)) / toNum(p.qty)) * 100 : 0 });
    } else {
      newEffect += toNum(c.cost);
      newProducts.push({ productName: c.name, unit: c.unit, amount: toNum(c.cost) });
    }
  }
  for (const [k, p] of prevMap) {
    if (!curMap.has(k)) {
      droppedEffect -= toNum(p.cost);
      droppedProducts.push({ productName: p.name, unit: p.unit, amount: toNum(p.cost) });
    }
  }
  newProducts.sort((a, b) => b.amount - a.amount);
  droppedProducts.sort((a, b) => b.amount - a.amount);

  const deltaSpend = currentSpend - prevSpend;
  const otherEffect = deltaSpend - priceEffect - volumeEffect - newEffect - droppedEffect;

  priceDrivers.sort((a, b) => b.amount - a.amount);
  volumeDrivers.sort((a, b) => b.amount - a.amount);

  // Benchmark cen — top produkty wg kosztu bieżącego, z ceną teraz/poprzednio/średnia ogólna.
  const priceBenchmark = [...curMap.values()]
    .sort((a, b) => toNum(b.cost) - toNum(a.cost))
    .slice(0, 15)
    .map((c) => {
      const k = `${c.name}|${c.unit}`;
      const prevPrice = prevMap.has(k) ? toNum(prevMap.get(k)!.price) : null;
      const overallPrice = overallMap.get(k) ?? null;
      const curPrice = toNum(c.price);
      return {
        productName: c.name,
        unit: c.unit,
        avgPrice: curPrice,
        prevMonthAvgPrice: prevPrice,
        overallAvgPrice: overallPrice,
        pctVsPrev: prevPrice && prevPrice > 0 ? ((curPrice - prevPrice) / prevPrice) * 100 : null,
        pctVsOverall: overallPrice && overallPrice > 0 ? ((curPrice - overallPrice) / overallPrice) * 100 : null,
      };
    });

  // Ruchy ilościowe — top produkty wg kosztu, z ilością teraz vs poprzednio.
  const quantityMovers = [...curMap.values()]
    .sort((a, b) => toNum(b.cost) - toNum(a.cost))
    .slice(0, 10)
    .map((c) => {
      const k = `${c.name}|${c.unit}`;
      const prevQty = prevMap.has(k) ? toNum(prevMap.get(k)!.qty) : null;
      const curQty = toNum(c.qty);
      return {
        productName: c.name,
        unit: c.unit,
        currentQty: curQty,
        prevQty,
        qtyPct: prevQty && prevQty > 0 ? ((curQty - prevQty) / prevQty) * 100 : null,
      };
    });

  const monthlySpends = (trendRes.rows as { mo: string; spend: number }[]).map((r) => toNum(r.spend));
  const avgMonthlySpend = monthlySpends.length > 0
    ? monthlySpends.reduce((s, v) => s + v, 0) / monthlySpends.length
    : null;

  res.json({
    month,
    prevMonth: prev,
    currentSpend,
    prevSpend,
    deltaSpend,
    avgMonthlySpend,
    avgMonthsCount: monthlySpends.length,
    priceEffect,
    volumeEffect,
    newEffect,
    droppedEffect,
    otherEffect,
    topPriceDrivers: priceDrivers.filter((d) => d.amount > 0).slice(0, 8),
    topVolumeDrivers: volumeDrivers.filter((d) => d.amount > 0).slice(0, 8),
    newProducts: newProducts.slice(0, 15),
    droppedProducts: droppedProducts.slice(0, 15),
    priceBenchmark,
    quantityMovers,
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
      AND i.excluded = false
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
  const daysRaw = parseInt(String(req.query.days ?? ""), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : null;
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : null;
  const costCenterIdRaw = req.query.costCenterId;
  const costCenterId = costCenterIdRaw != null && costCenterIdRaw !== "" ? parseInt(String(costCenterIdRaw), 10) : null;
  const ccCondition = costCenterId != null && !isNaN(costCenterId)
    ? sql`AND i.cost_center_id = ${costCenterId}`
    : sql.raw("");

  let dateCondition;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const mStart = new Date(y, m - 1, 1).toISOString().split("T")[0];
    const mEnd = new Date(y, m, 1).toISOString().split("T")[0];
    dateCondition = sql`AND i.invoice_date >= ${mStart} AND i.invoice_date < ${mEnd}`;
  } else if (days) {
    dateCondition = sql`AND i.invoice_date >= to_char(now() - interval '1 day' * ${days}, 'YYYY-MM-DD')`;
  } else {
    dateCondition = sql.raw("");
  }

  const result = await db.execute(sql`
    SELECT
      COALESCE(p.name, ii.product_name) AS product_name,
      p.category,
      s.name AS supplier_name,
      SUM(ii.quantity::numeric)::float AS total_quantity,
      MAX(ii.unit) AS unit,
      (SUM(ii.total_price::numeric) / NULLIF(SUM(ii.quantity::numeric), 0))::float AS avg_unit_price,
      SUM(ii.total_price::numeric)::float AS total_spend
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN products p ON ii.product_id = p.id
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      ${dateCondition}
      ${ccCondition}
    GROUP BY COALESCE(p.name, ii.product_name), p.category, s.name
    ORDER BY total_spend DESC
  `);

  const rows = result.rows as Array<{
    product_name: string;
    category: string | null;
    supplier_name: string | null;
    total_quantity: number | null;
    unit: string | null;
    avg_unit_price: number | null;
    total_spend: number;
  }>;

  res.json(rows.map((r) => ({
    productName: r.product_name,
    category: r.category ?? null,
    supplierName: r.supplier_name ?? null,
    totalQuantity: r.total_quantity != null ? toNum(r.total_quantity) : null,
    unit: r.unit ?? null,
    avgUnitPrice: r.avg_unit_price != null ? toNum(r.avg_unit_price) : null,
    totalSpend: toNum(r.total_spend),
  })));
});

router.get("/reports/category-spend-trend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthsRaw = parseInt(String(req.query.months ?? ""), 10);
  const monthCount = Number.isFinite(monthsRaw) && monthsRaw >= 2 && monthsRaw <= 12 ? monthsRaw : 6;
  const costCenterIdRaw = req.query.costCenterId;
  const costCenterId = costCenterIdRaw != null && costCenterIdRaw !== "" ? parseInt(String(costCenterIdRaw), 10) : null;
  const ccTrendSql = costCenterId != null && !isNaN(costCenterId)
    ? sql`AND i.cost_center_id = ${costCenterId}`
    : sql.raw("");

  // Build list of YYYY-MM month strings going back monthCount months from current
  const now = new Date();
  const monthList: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const earliest = monthList[0];
  const latest = monthList[monthList.length - 1];

  // Compute date range: from start of earliest month to end of latest month
  const [ey, em] = earliest.split("-").map(Number);
  const [ly, lm] = latest.split("-").map(Number);
  const rangeStart = new Date(ey, em - 1, 1).toISOString().split("T")[0];
  const rangeEnd = new Date(ly, lm, 1).toISOString().split("T")[0]; // exclusive

  const result = await db.execute(sql`
    SELECT
      substring(i.invoice_date, 1, 7) AS month,
      p.category,
      SUM(ii.total_price::numeric)::float AS total_spend
    FROM invoice_items ii
    INNER JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      AND i.invoice_date >= ${rangeStart}
      AND i.invoice_date < ${rangeEnd}
      ${ccTrendSql}
    GROUP BY 1, 2
    ORDER BY 1, total_spend DESC
  `);

  const rows = result.rows as Array<{
    month: string;
    category: string | null;
    total_spend: number;
  }>;

  res.json(rows.map((r) => ({
    month: r.month,
    category: r.category ?? null,
    totalSpend: toNum(r.total_spend),
  })));
});

// ─── Cost center spend report ─────────────────────────────────────────────────
router.get("/reports/cost-centers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { month } = req.query as { month?: string };
  const now = new Date();
  const currentMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = currentMonth.split("-").map(Number);
  const startDate = `${currentMonth}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const endDate = `${currentMonth}-${String(daysInMonth).padStart(2, "0")}`;

  const prevDate = new Date(y, m - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const prevStart = `${prevMonth}-01`;
  const prevDays = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
  const prevEnd = `${prevMonth}-${String(prevDays).padStart(2, "0")}`;

  const current = await db.execute(sql`
    SELECT i.cost_center_id, cc.name AS cost_center_name, cc.color AS cost_center_color,
           COUNT(i.id)::int AS invoice_count, COUNT(DISTINCT i.supplier_id)::int AS supplier_count,
           SUM(CAST(i.total_amount AS numeric)) AS total_amount
    FROM invoices i
    LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
    WHERE i.user_id = ${userId} AND i.invoice_date >= ${startDate} AND i.invoice_date <= ${endDate}
      AND (i.excluded IS NULL OR i.excluded = false)
    GROUP BY i.cost_center_id, cc.name, cc.color
    ORDER BY total_amount DESC
  `);

  const prev = await db.execute(sql`
    SELECT cost_center_id, SUM(CAST(total_amount AS numeric)) AS total_amount
    FROM invoices
    WHERE user_id = ${userId} AND invoice_date >= ${prevStart} AND invoice_date <= ${prevEnd}
      AND (excluded IS NULL OR excluded = false)
    GROUP BY cost_center_id
  `);

  const prevMap = new Map(
    (prev.rows as Array<{ cost_center_id: number | null; total_amount: string }>)
      .map((r) => [r.cost_center_id ?? null, Number(r.total_amount)])
  );

  const rows = current.rows as Array<{
    cost_center_id: number | null;
    cost_center_name: string | null;
    cost_center_color: string | null;
    invoice_count: number;
    supplier_count: number;
    total_amount: string;
  }>;

  res.json(rows.map((r) => {
    const totalAmount = Number(r.total_amount);
    const prevAmount = prevMap.get(r.cost_center_id ?? null) ?? 0;
    const changePercent = prevAmount > 0 ? Math.round(((totalAmount - prevAmount) / prevAmount) * 100) : null;
    return {
      costCenterId: r.cost_center_id ?? null,
      costCenterName: r.cost_center_name ?? null,
      costCenterColor: r.cost_center_color ?? null,
      totalAmount,
      invoiceCount: r.invoice_count,
      supplierCount: r.supplier_count,
      prevMonthAmount: prevAmount,
      changePercent,
    };
  }));
});

export default router;
