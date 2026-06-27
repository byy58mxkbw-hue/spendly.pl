import { Router, type IRouter } from "express";
import { db, aiCfoSessionsTable } from "@workspace/db";
import { sql, eq, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";
import { aiCostLimiter } from "../lib/rate-limiters";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPln(n: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(Math.abs(n));
}

function since90Days(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

// ─── Top-3 insights (pure SQL, no AI) ────────────────────────────────────────

async function getSpikeInsight(userId: string, sinceStr: string) {
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT
        p.id   AS product_id,
        p.name AS product_name,
        s.id   AS supplier_id,
        s.name AS supplier_name,
        ii.unit_price::numeric        AS unit_price,
        ii.quantity::numeric          AS quantity,
        i.invoice_date,
        ROW_NUMBER() OVER (PARTITION BY p.id, s.id ORDER BY i.invoice_date DESC) AS rn,
        SUM(ii.quantity::numeric)    OVER (PARTITION BY p.id, s.id) AS total_qty_90d
      FROM invoice_items ii
      JOIN invoices  i ON ii.invoice_id  = i.id
      JOIN products  p ON ii.product_id  = p.id
      JOIN suppliers s ON i.supplier_id  = s.id
      WHERE i.user_id     = ${userId}
        AND i.invoice_date >= ${sinceStr}
        AND s.is_active    = true
    ),
    latest AS (SELECT * FROM ranked WHERE rn = 1),
    prev   AS (SELECT * FROM ranked WHERE rn = 2)
    SELECT
      l.product_id, l.product_name,
      l.supplier_id, l.supplier_name,
      l.unit_price                                                   AS current_price,
      p.unit_price                                                   AS prev_price,
      ROUND((l.unit_price - p.unit_price) / NULLIF(p.unit_price,0) * 100, 1) AS change_pct,
      ROUND((l.unit_price - p.unit_price) * (l.total_qty_90d / 3.0), 0)      AS monthly_impact
    FROM latest l
    JOIN prev   p ON l.product_id = p.product_id AND l.supplier_id = p.supplier_id
    WHERE l.unit_price > p.unit_price
    ORDER BY monthly_impact DESC
    LIMIT 1
  `);

  const row = result.rows[0] as {
    product_id: number; product_name: string;
    supplier_id: number; supplier_name: string;
    current_price: string; prev_price: string;
    change_pct: string; monthly_impact: string;
  } | undefined;

  if (!row) return null;

  const impact = parseFloat(row.monthly_impact ?? "0");
  const pct = parseFloat(row.change_pct ?? "0");

  return {
    type: "price_spike" as const,
    title: `Podwyżka: ${row.product_name}`,
    description: `Cena u ${row.supplier_name} wzrosła o ${pct.toFixed(1)}% (z ${parseFloat(row.prev_price).toFixed(2)} na ${parseFloat(row.current_price).toFixed(2)} zł/j.). Szacowany dodatkowy koszt: ${fmtPln(impact)}/mies.`,
    impactAmount: -impact,
    impactLabel: `-${fmtPln(impact)}/mies.`,
    productId: Number(row.product_id),
    supplierId: Number(row.supplier_id),
    productName: row.product_name,
    supplierName: row.supplier_name,
    metadata: { changePct: pct, currentPrice: parseFloat(row.current_price), prevPrice: parseFloat(row.prev_price) },
  };
}

async function getQuantityAnomaly(userId: string, sinceStr: string) {
  const result = await db.execute(sql`
    WITH qty_data AS (
      SELECT
        p.id   AS product_id,
        p.name AS product_name,
        s.id   AS supplier_id,
        s.name AS supplier_name,
        ii.quantity::numeric                                       AS quantity,
        i.invoice_date,
        ROW_NUMBER() OVER (PARTITION BY p.id, s.id ORDER BY i.invoice_date DESC) AS rn,
        AVG(ii.quantity::numeric) OVER (PARTITION BY p.id, s.id)  AS avg_qty,
        COUNT(*)                  OVER (PARTITION BY p.id, s.id)  AS purchase_count
      FROM invoice_items ii
      JOIN invoices  i ON ii.invoice_id = i.id
      JOIN products  p ON ii.product_id = p.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id     = ${userId}
        AND i.invoice_date >= ${sinceStr}
        AND s.is_active    = true
    )
    SELECT
      product_id, product_name, supplier_id, supplier_name,
      quantity     AS latest_qty,
      ROUND(avg_qty, 2) AS avg_qty,
      purchase_count,
      ROUND(ABS(quantity - avg_qty) / NULLIF(avg_qty, 0) * 100, 1) AS anomaly_pct
    FROM qty_data
    WHERE rn = 1
      AND purchase_count >= 3
      AND ABS(quantity - avg_qty) / NULLIF(avg_qty, 0) > 0.25
    ORDER BY anomaly_pct DESC
    LIMIT 1
  `);

  const row = result.rows[0] as {
    product_id: number; product_name: string;
    supplier_id: number; supplier_name: string;
    latest_qty: string; avg_qty: string;
    purchase_count: string; anomaly_pct: string;
  } | undefined;

  if (!row) return null;

  const pct = parseFloat(row.anomaly_pct ?? "0");
  const latest = parseFloat(row.latest_qty ?? "0");
  const avg = parseFloat(row.avg_qty ?? "0");
  const dir = latest > avg ? "wzrost" : "spadek";

  return {
    type: "quantity_anomaly" as const,
    title: `Anomalia ilości: ${row.product_name}`,
    description: `Ostatni zakup: ${latest.toFixed(2)} j. vs. średnia ${avg.toFixed(2)} j. — ${dir} o ${pct.toFixed(1)}%. Może sygnalizować błąd zamówienia lub zmianę popytu.`,
    impactAmount: 0,
    impactLabel: `${pct.toFixed(1)}% vs. średnia`,
    productId: Number(row.product_id),
    supplierId: Number(row.supplier_id),
    productName: row.product_name,
    supplierName: row.supplier_name,
    metadata: { latestQty: latest, avgQty: avg, anomalyPct: pct },
  };
}

async function getSavingsInsight(userId: string, sinceStr: string) {
  const result = await db.execute(sql`
    WITH latest_prices AS (
      SELECT DISTINCT ON (ii.product_id, i.supplier_id)
        p.id   AS product_id,
        p.name AS product_name,
        s.id   AS supplier_id,
        s.name AS supplier_name,
        ii.unit_price::numeric AS unit_price
      FROM invoice_items ii
      JOIN invoices  i ON ii.invoice_id = i.id
      JOIN products  p ON ii.product_id = p.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id     = ${userId}
        AND i.invoice_date >= ${sinceStr}
        AND s.is_active    = true
      ORDER BY ii.product_id, i.supplier_id, i.invoice_date DESC
    ),
    qty_90d AS (
      SELECT ii.product_id, ROUND(SUM(ii.quantity::numeric) / 3.0, 2) AS monthly_qty
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id     = ${userId}
        AND i.invoice_date >= ${sinceStr}
      GROUP BY ii.product_id
    ),
    price_range AS (
      SELECT
        lp.product_id, lp.product_name,
        MIN(lp.unit_price) AS min_price,
        MAX(lp.unit_price) AS max_price,
        COUNT(*)           AS supplier_count,
        COALESCE((SELECT monthly_qty FROM qty_90d WHERE product_id = lp.product_id), 0) AS monthly_qty
      FROM latest_prices lp
      GROUP BY lp.product_id, lp.product_name
      HAVING COUNT(*) >= 2 AND MIN(lp.unit_price) < MAX(lp.unit_price)
    ),
    final AS (
      SELECT
        pr.*,
        (SELECT lp.supplier_name FROM latest_prices lp WHERE lp.product_id = pr.product_id AND lp.unit_price = pr.min_price LIMIT 1) AS cheapest_supplier,
        (SELECT lp.supplier_name FROM latest_prices lp WHERE lp.product_id = pr.product_id AND lp.unit_price = pr.max_price LIMIT 1) AS expensive_supplier,
        ROUND((pr.max_price - pr.min_price) * pr.monthly_qty, 0) AS monthly_savings
      FROM price_range pr
    )
    SELECT * FROM final
    ORDER BY monthly_savings DESC
    LIMIT 1
  `);

  const row = result.rows[0] as {
    product_id: number; product_name: string;
    min_price: string; max_price: string;
    cheapest_supplier: string; expensive_supplier: string;
    supplier_count: string; monthly_qty: string; monthly_savings: string;
  } | undefined;

  if (!row) return null;

  const savings = parseFloat(row.monthly_savings ?? "0");
  const minP = parseFloat(row.min_price ?? "0");
  const maxP = parseFloat(row.max_price ?? "0");

  return {
    type: "savings_opportunity" as const,
    title: `Oszczędność: ${row.product_name}`,
    description: `${row.expensive_supplier} oferuje ${maxP.toFixed(2)} zł/j., ${row.cheapest_supplier} tylko ${minP.toFixed(2)} zł/j. Przełączenie dostawcy = ${fmtPln(savings)}/mies. oszczędności.`,
    impactAmount: savings,
    impactLabel: `+${fmtPln(savings)}/mies.`,
    productId: Number(row.product_id),
    supplierId: null,
    productName: row.product_name,
    supplierName: row.cheapest_supplier,
    metadata: { minPrice: minP, maxPrice: maxP, cheapestSupplier: row.cheapest_supplier, expensiveSupplier: row.expensive_supplier },
  };
}

// ─── Route: GET /ai-cfo/insights ─────────────────────────────────────────────

router.get("/ai-cfo/insights", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const sinceStr = since90Days();

  const [spikeRes, anomalyRes, savingsRes] = await Promise.allSettled([
    getSpikeInsight(userId, sinceStr),
    getQuantityAnomaly(userId, sinceStr),
    getSavingsInsight(userId, sinceStr),
  ]);

  const cards = [
    spikeRes.status === "fulfilled" ? spikeRes.value : null,
    anomalyRes.status === "fulfilled" ? anomalyRes.value : null,
    savingsRes.status === "fulfilled" ? savingsRes.value : null,
  ].filter(Boolean);

  res.json(cards);
});

// ─── Entity enrichment for chat actions ──────────────────────────────────────

type RawAction = { label: string; href: string };
type EnrichedAction = { label: string; href: string; productId?: number; supplierId?: number };

async function enrichActions(
  actions: RawAction[],
  fullText: string,
  userId: string,
): Promise<EnrichedAction[]> {
  if (!actions.length) return [];

  const [productsRes, suppliersRes] = await Promise.allSettled([
    db.execute(sql`
      SELECT id, name FROM products WHERE user_id = ${userId} ORDER BY length(name) DESC
    `),
    db.execute(sql`
      SELECT id, name FROM suppliers WHERE user_id = ${userId} AND is_active = true ORDER BY length(name) DESC
    `),
  ]);

  const products = productsRes.status === "fulfilled"
    ? (productsRes.value.rows as Array<{ id: number; name: string }>)
    : [];
  const suppliers = suppliersRes.status === "fulfilled"
    ? (suppliersRes.value.rows as Array<{ id: number; name: string }>)
    : [];

  const lowerText = fullText.toLowerCase();

  function findProduct(): number | undefined {
    for (const p of products) {
      if (lowerText.includes(p.name.toLowerCase())) return p.id;
    }
    return undefined;
  }

  function findSupplier(): number | undefined {
    for (const s of suppliers) {
      if (lowerText.includes(s.name.toLowerCase())) return s.id;
    }
    return undefined;
  }

  let cachedProductId: number | undefined | null = null;
  let cachedSupplierId: number | undefined | null = null;

  function getProductId() {
    if (cachedProductId === null) cachedProductId = findProduct() ?? undefined;
    return cachedProductId;
  }

  function getSupplierId() {
    if (cachedSupplierId === null) cachedSupplierId = findSupplier() ?? undefined;
    return cachedSupplierId;
  }

  return actions.map((action): EnrichedAction => {
    const href = action.href;

    const productIdInHref = href.match(/^\/products\?id=(\d+)/);
    if (productIdInHref) {
      const pid = parseInt(productIdInHref[1], 10);
      const valid = products.some((p) => p.id === pid);
      return valid ? { ...action, productId: pid } : { ...action, href: "/products" };
    }

    const supplierIdInHref = href.match(/^\/suppliers\/(\d+)$/);
    if (supplierIdInHref) {
      const sid = parseInt(supplierIdInHref[1], 10);
      const valid = suppliers.some((s) => s.id === sid);
      return valid ? { ...action, supplierId: sid } : { ...action, href: "/suppliers" };
    }

    if (href === "/products") {
      const pid = getProductId();
      if (pid) return { ...action, href: `/products?id=${pid}`, productId: pid };
    }

    if (href === "/suppliers") {
      const sid = getSupplierId();
      if (sid) return { ...action, href: `/suppliers/${sid}`, supplierId: sid };
    }

    return action;
  });
}

// ─── Invoice compare: detect intent + fetch items ────────────────────────────

async function fetchInvoiceCompareData(userId: string, question: string): Promise<string | null> {
  const lowerQ = question.toLowerCase();

  // Detect comparison intent
  const hasIntent = ["porównaj", "porówna", "zestawien", "zestawie", "porównan"].some(k => lowerQ.includes(k));
  if (!hasIntent) return null;

  const tokens = question.split(/\s+/);
  let invoiceIds: number[] = [];

  // Strategy 1: explicit invoice numbers (tokens containing "/" or starting with FV/VAT)
  const invoiceTokens = tokens
    .map(t => t.replace(/[,;.:]/g, ""))
    .filter(t => t.includes("/") || /^[Ff][Vv]/i.test(t));

  if (invoiceTokens.length >= 1) {
    for (const token of invoiceTokens.slice(0, 4)) {
      if (invoiceIds.length >= 2) break;
      // Try exact match first, then LIKE — LIMIT 1 per token so each token adds at most one invoice
      const exactRes = await db.execute(sql`
        SELECT id FROM invoices
        WHERE user_id = ${userId} AND LOWER(invoice_number) = LOWER(${token})
        ORDER BY invoice_date DESC, id DESC LIMIT 1
      `);
      const exactRows = exactRes.rows as Array<{ id: number }>;
      if (exactRows.length > 0) {
        if (!invoiceIds.includes(exactRows[0].id)) invoiceIds.push(exactRows[0].id);
      } else {
        const likeRes = await db.execute(sql`
          SELECT id FROM invoices
          WHERE user_id = ${userId} AND LOWER(invoice_number) LIKE LOWER(${`%${token}%`})
          ORDER BY invoice_date DESC, id DESC LIMIT 1
        `);
        for (const r of (likeRes.rows as Array<{ id: number }>)) {
          if (!invoiceIds.includes(r.id)) invoiceIds.push(r.id);
        }
      }
    }
  }

  // Strategy 2: supplier name → last 2 invoices
  if (invoiceIds.length < 2) {
    const wordTokens = tokens.map(t => t.replace(/[,;.:]/g, "")).filter(t => t.length >= 3);
    let supplierId: number | null = null;

    // First pass: question token is substring of supplier name (standard)
    for (const token of wordTokens) {
      if (supplierId) break;
      const res = await db.execute(sql`
        SELECT id FROM suppliers
        WHERE user_id = ${userId} AND is_active = true
          AND LOWER(name) LIKE LOWER(${`%${token}%`})
        ORDER BY length(name) ASC LIMIT 1
      `);
      const rows = res.rows as Array<{ id: number }>;
      if (rows.length > 0) supplierId = rows[0].id;
    }

    // Second pass (reverse): supplier name word is substring of a question token
    // e.g. user types "Stelmach", supplier name contains "STELMA" → "stelma" ⊆ "stelmach"
    if (!supplierId) {
      const suppRes = await db.execute(sql`
        SELECT id, name FROM suppliers
        WHERE user_id = ${userId} AND is_active = true
        ORDER BY length(name) ASC
      `);
      const allSuppliers = suppRes.rows as Array<{ id: number; name: string }>;
      const lowerQuestion = question.toLowerCase();

      for (const s of allSuppliers) {
        if (supplierId) break;
        // Split supplier name into significant words (4+ chars, skip abbreviations)
        const nameWords = s.name
          .split(/[\s,./\\&]+/)
          .map(w => w.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/gi, ""))
          .filter(w => w.length >= 4 && !/^(sp|sc|zo|oo|ltd|inc|llc|spo|sta|han|dla|skl)$/i.test(w));

        for (const nw of nameWords) {
          // Supplier word is a substring of the question (covers typos like "stelmach" ⊃ "stelma")
          if (lowerQuestion.includes(nw)) {
            supplierId = s.id;
            break;
          }
        }
      }
    }

    if (supplierId) {
      const res = await db.execute(sql`
        SELECT id FROM invoices
        WHERE user_id = ${userId} AND supplier_id = ${supplierId} AND excluded = false
        ORDER BY invoice_date DESC, id DESC LIMIT 2
      `);
      invoiceIds = (res.rows as Array<{ id: number }>).map(r => r.id);
    }
  }

  if (invoiceIds.length < 2) return null;

  type InvItem = { name: string; qty: string; unit: string; unit_price: string; total: string };
  type InvRow = { id: number; invoice_number: string; invoice_date: string; total_amount: string; supplier_name: string; items: InvItem[] };

  const fetchInv = async (invId: number): Promise<InvRow | null> => {
    const res = await db.execute(sql`
      SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount::text,
             s.name AS supplier_name,
             json_agg(json_build_object(
               'name', COALESCE(p.name, ii.product_name),
               'qty', ii.quantity::text,
               'unit', ii.unit,
               'unit_price', ii.unit_price::text,
               'total', ii.total_price::text
             ) ORDER BY ii.id) AS items
      FROM invoices i
      JOIN suppliers s ON s.id = i.supplier_id
      JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN products p ON p.id = ii.product_id
      WHERE i.id = ${invId} AND i.user_id = ${userId}
      GROUP BY i.id, i.invoice_number, i.invoice_date, i.total_amount, s.name
    `);
    const row = res.rows[0] as InvRow | undefined;
    return row ?? null;
  };

  const [invA, invB] = await Promise.all([fetchInv(invoiceIds[0]), fetchInv(invoiceIds[1])]);
  if (!invA || !invB) return null;

  const fmtInv = (inv: InvRow, label: string): string => {
    const items = (typeof inv.items === "string" ? JSON.parse(inv.items) : inv.items) as InvItem[];
    const lines = items.map(it =>
      `  - ${it.name}: ${parseFloat(it.qty).toFixed(2)} ${it.unit} × ${parseFloat(it.unit_price).toFixed(2)} zł = ${parseFloat(it.total).toFixed(2)} zł`
    );
    return `FAKTURA ${label}: ${inv.invoice_number} — dostawca: ${inv.supplier_name} — data: ${inv.invoice_date} — łącznie: ${parseFloat(inv.total_amount).toFixed(2)} zł\nPozycje:\n${lines.join("\n")}`;
  };

  return `\nDANE FAKTUR DO PORÓWNANIA:\n${fmtInv(invA, "A")}\n\n${fmtInv(invB, "B")}`;
}

// ─── Route: POST /ai-cfo/chat ─────────────────────────────────────────────────

async function buildChatContext(userId: string, sinceStr: string): Promise<string> {
  const [spendRes, topProductsRes, monthlyRes, categoryRes, costCenterRes, supplierDetailRes] = await Promise.allSettled([
    // Top 8 suppliers by value (kwotowo)
    db.execute(sql`
      SELECT s.id AS supplier_id, s.name AS supplier_name,
        ROUND(SUM(ii.total_price::numeric), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} AND s.is_active = true
      GROUP BY s.id, s.name ORDER BY total_spend DESC LIMIT 8
    `),
    // Top 20 products with quantity info
    db.execute(sql`
      SELECT
        p.id AS product_id, p.name AS product_name,
        p.category, p.subcategory,
        s.id AS supplier_id, s.name AS supplier_name,
        ROUND(MIN(ii.unit_price::numeric), 2) AS min_price,
        ROUND(MAX(ii.unit_price::numeric), 2) AS max_price,
        ROUND(SUM(ii.total_price::numeric), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        ii.unit,
        COUNT(DISTINCT i.id) AS purchase_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr}
      GROUP BY p.id, p.name, p.category, p.subcategory, s.id, s.name, ii.unit
      ORDER BY total_spend DESC
      LIMIT 25
    `),
    // Monthly spend last 6 months
    db.execute(sql`
      SELECT SUBSTRING(i.invoice_date, 1, 7) AS month, ROUND(SUM(ii.total_price::numeric), 0) AS total
      FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 6
    `),
    // Spend by product category (from products.category field)
    db.execute(sql`
      SELECT
        COALESCE(p.category, 'Bez kategorii') AS category,
        ROUND(SUM(ii.total_price::numeric), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        COUNT(DISTINCT p.id) AS product_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} AND i.excluded = false
      GROUP BY 1 ORDER BY total_spend DESC LIMIT 15
    `),
    // Spend by cost center
    db.execute(sql`
      SELECT
        COALESCE(cc.name, 'Bez centrum kosztów') AS cost_center,
        ROUND(SUM(ii.total_price::numeric), 0) AS total_spend,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} AND i.excluded = false
      GROUP BY 1 ORDER BY total_spend DESC LIMIT 10
    `),
    // Supplier comparison: value vs quantity per supplier, with top products
    db.execute(sql`
      SELECT
        s.id AS supplier_id, s.name AS supplier_name,
        ROUND(SUM(ii.total_price::numeric), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        COUNT(DISTINCT p.id) AS unique_products,
        COUNT(DISTINCT i.id) AS invoice_count,
        ROUND(AVG(ii.unit_price::numeric), 2) AS avg_unit_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      JOIN products p ON ii.product_id = p.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr}
        AND s.is_active = true AND i.excluded = false
      GROUP BY s.id, s.name
      ORDER BY total_spend DESC LIMIT 10
    `),
  ]);

  // ── Suppliers (simple spend list) ──────────────────────────────────────────
  const supplierRows = spendRes.status === "fulfilled"
    ? (spendRes.value.rows as Array<{supplier_id: number; supplier_name: string; total_spend: string; total_qty: string; invoice_count: string}>)
    : [];
  const suppliers = supplierRows.length
    ? supplierRows.map(r => `[ID:${r.supplier_id}] ${r.supplier_name}: ${r.total_spend} zł (${r.total_qty} j., ${r.invoice_count} faktur)`).join(", ")
    : "(brak)";

  // ── Products ───────────────────────────────────────────────────────────────
  const productRows = topProductsRes.status === "fulfilled"
    ? (topProductsRes.value.rows as Array<{product_id: number; product_name: string; category: string | null; subcategory: string | null; supplier_id: number; supplier_name: string; min_price: string; max_price: string; total_spend: string; total_qty: string; unit: string; purchase_count: string}>)
    : [];
  const products = productRows.length
    ? productRows.map(r => {
        const cat = r.category ? ` [${r.category}${r.subcategory ? `/${r.subcategory}` : ""}]` : "";
        return `[ID:${r.product_id}] ${r.product_name}${cat} @ [ID:${r.supplier_id}] ${r.supplier_name}: ${r.min_price}–${r.max_price} zł/j., wydatki: ${r.total_spend} zł, ilość: ${r.total_qty} ${r.unit ?? "j."}, ${r.purchase_count}x`;
      }).join("\n")
    : "(brak)";

  // ── Monthly ────────────────────────────────────────────────────────────────
  const monthly = monthlyRes.status === "fulfilled"
    ? (monthlyRes.value.rows as Array<{month: string; total: string}>)
      .map(r => `${r.month}: ${r.total} zł`).join(", ")
    : "(brak)";

  // ── Category breakdown ─────────────────────────────────────────────────────
  const categoryRows = categoryRes.status === "fulfilled"
    ? (categoryRes.value.rows as Array<{category: string; total_spend: string; total_qty: string; product_count: string}>)
    : [];
  const categories = categoryRows.length
    ? categoryRows.map(r => `${r.category}: ${r.total_spend} zł, ${r.total_qty} j., ${r.product_count} produktów`).join("\n")
    : "(brak danych kategorii)";

  // ── Cost centers ───────────────────────────────────────────────────────────
  const costCenterRows = costCenterRes.status === "fulfilled"
    ? (costCenterRes.value.rows as Array<{cost_center: string; total_spend: string; invoice_count: string}>)
    : [];
  const costCenters = costCenterRows.length
    ? costCenterRows.map(r => `${r.cost_center}: ${r.total_spend} zł (${r.invoice_count} faktur)`).join(", ")
    : "(brak centrów kosztów)";

  // ── Supplier detail comparison (ilościowo + kwotowo) ──────────────────────
  const supplierDetailRows = supplierDetailRes.status === "fulfilled"
    ? (supplierDetailRes.value.rows as Array<{supplier_id: number; supplier_name: string; total_spend: string; total_qty: string; unique_products: string; invoice_count: string; avg_unit_price: string}>)
    : [];
  const supplierComparison = supplierDetailRows.length
    ? supplierDetailRows.map(r =>
        `[ID:${r.supplier_id}] ${r.supplier_name}: kwotowo ${r.total_spend} zł | ilościowo ${r.total_qty} j. | ${r.unique_products} produktów | ${r.invoice_count} faktur | śr. cena jedn. ${r.avg_unit_price} zł`
      ).join("\n")
    : "(brak)";

  return `DANE RESTAURACJI (ostatnie 90 dni):

DOSTAWCY — kwotowo i ilościowo:
${supplierComparison}

MIESIĘCZNE WYDATKI: ${monthly}

WYDATKI WG KATEGORII PRODUKTÓW:
${categories}

CENTRA KOSZTÓW:
${costCenters}

PRODUKTY I CENY SZCZEGÓŁOWO (format [ID:X] nazwa [kategoria] @ [ID:Y] dostawca):
${products}`;
}

router.post("/ai-cfo/chat", aiCostLimiter, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { question, history = [] } = req.body as {
    question: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    res.status(400).json({ error: "Brakuje pytania." });
    return;
  }

  const sinceStr = since90Days();
  const [context, invoiceCompareBlock] = await Promise.all([
    buildChatContext(userId, sinceStr),
    fetchInvoiceCompareData(userId, question.trim()),
  ]);

  const systemPrompt = `Jesteś AI CFO (Chief Financial Officer) dla restauracji w Polsce. Analizujesz dane kosztowe z faktur i dostarczasz precyzyjne rekomendacje finansowe.

${context}${invoiceCompareBlock ?? ""}

MOŻLIWOŚCI ANALIZY:
- Porównanie dostawców KWOTOWO: który dostawca generuje największe wydatki w PLN
- Porównanie dostawców ILOŚCIOWO: który dostawca dostarcza największe wolumeny (jednostki/kg)
- Analiza wg KATEGORII PRODUKTÓW: rozkład wydatków na Mięso, Nabiał, Warzywa itp.
- Analiza wg CENTRÓW KOSZTÓW: faktury przypisane do konkretnych obszarów restauracji
- Trendy miesięczne: jak zmieniają się wydatki miesiąc do miesiąca
- Raporty produktowe: które produkty kupujemy najczęściej i w największych ilościach

INSTRUKCJA ODPOWIEDZI:
Odpowiadaj ZAWSZE jako JSON (bez markdown, bez tekstu poza JSON):
{
  "type": "product_analysis|supplier_comparison|cost_analysis|quantity_anomaly|category_analysis|invoice_comparison|general",
  "summary": "Główny wniosek w 2-3 zdaniach z konkretnymi liczbami PLN i/lub jednostkami.",
  "kpiCards": [
    {"label": "Nazwa KPI", "value": "np. 4 280 zł", "delta": "np. +12%", "deltaPositive": true}
  ],
  "table": {
    "headers": ["Kolumna 1", "Kolumna 2", "Kolumna 3"],
    "rows": [["Wiersz 1 kol 1", "Wiersz 1 kol 2", "Wiersz 1 kol 3"]]
  },
  "recommendation": "Konkretna rekomendacja działania z szacowanym efektem PLN.",
  "actions": [
    {"label": "Etykieta przycisku", "href": "/products"}
  ]
}

ZASADY TABEL — dla porównania dostawców zawsze pokazuj obie kolumny:
- Porównanie kwotowe: kolumny "Dostawca", "Wydatki (PLN)", "Udział %", "Faktury"
- Porównanie ilościowe: kolumny "Dostawca", "Wolumen (j.)", "Produkty", "Śr. cena jedn."
- Kategorie: kolumny "Kategoria", "Wydatki (PLN)", "Wolumen (j.)", "Produkty"

INSTRUKCJA DLA PORÓWNANIA FAKTUR (type: "invoice_comparison"):
Gdy kontekst zawiera blok "DANE FAKTUR DO PORÓWNANIA":
- Użyj type: "invoice_comparison"
- OBOWIĄZKOWO pokazuj pełną tabelę pozycja po pozycji — NIE streszczaj do samych sum, nawet jeśli sumy są podobne lub równe
- table.headers: ["Produkt", "Ilość A ({nr_faktury_A} — {data_A})", "Cena jedn. A", "Ilość B ({nr_faktury_B} — {data_B})", "Cena jedn. B", "Zmiana ceny"]
- Zastąp {nr_faktury_A}/{nr_faktury_B} skróconymi numerami (max 15 znaków), {data_A}/{data_B} datą w formacie DD.MM.YYYY
- table.rows: KAŻDA pozycja z obu faktur jako osobny wiersz: ["nazwa produktu", "X,XX jed.", "X,XX zł/jed.", "Y,YY jed." lub "—", "Y,YY zł/jed." lub "—", "+X,X%" lub "-X,X%" lub "0%" lub "—"]
- Jeśli produkt jest tylko w jednej fakturze: ilość i cena drugiej = "—", zmiana = "—"
- Delta obliczana z cen jednostkowych: (cena_B - cena_A) / cena_A * 100, format z plusem dla wzrostu (np. "+5,2%"), minusem dla spadku (np. "-3,1%"), "0%" jeśli identyczna
- kpiCards: ["Faktura A (łącznie)", "Faktura B (łącznie)", "Różnica (B-A)", "Zmiana %"] — oblicz różnicę samodzielnie z danych (B_total - A_total), NIE zakładaj że są równe
- summary: podaj rzeczywiste kwoty obu faktur (np. "Faktura A: 9 303 zł, Faktura B: 8 750 zł, różnica: -553 zł")
- Jeśli danych faktur brak — type: "general" i poinformuj że nie znaleziono faktur

WAŻNE — zasady tworzenia href w actions:
- Gdy analizujesz KONKRETNY produkt (znasz jego ID z kontekstu [ID:X]): użyj "/products?id=X" (np. "/products?id=42")
- Gdy analizujesz KONKRETNEGO dostawcę (znasz jego ID z kontekstu [ID:X]): użyj "/suppliers/X" (np. "/suppliers/7")
- Lista wszystkich produktów: "/products"
- Lista wszystkich dostawców: "/suppliers"
- Faktury: "/invoices"
- Raporty: "/reports"
- Alerty cenowe: "/price-alerts"
Tabela i kpiCards mogą mieć null jeśli nieistotne dla pytania, ale recommendation zawsze musi być.
Odpowiadaj wyłącznie po polsku.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map(h => ({
      role: h.role as "user" | "assistant",
      content: String(h.content).slice(0, 1000),
    })),
    { role: "user", content: question.trim().slice(0, 500) },
  ];

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 4000,
    messages,
  });

  const raw = (resp.choices[0]?.message?.content ?? "").trim();
  req.log.info({ rawLen: raw.length }, "ai-cfo chat response");

  let parsed: Record<string, unknown>;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    req.log.warn({ raw: raw.slice(0, 300) }, "ai-cfo chat JSON parse failed");
    parsed = {
      type: "general",
      summary: raw.slice(0, 500),
      kpiCards: [],
      table: null,
      recommendation: "",
      actions: [],
    };
  }

  // Server-side enrichment: resolve product/supplier IDs in actions deterministically
  if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const recommendation = typeof parsed.recommendation === "string" ? parsed.recommendation : "";
    const fullText = `${question} ${summary} ${recommendation}`;
    try {
      parsed.actions = await enrichActions(
        parsed.actions as RawAction[],
        fullText,
        userId,
      );
    } catch (err) {
      req.log.warn({ err }, "ai-cfo enrichActions failed, using raw actions");
    }
  }

  res.json(parsed);
});

// ─── Route: POST /ai-cfo/food-cost ───────────────────────────────────────────

router.post("/ai-cfo/food-cost", aiCostLimiter, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { menuText, salesText } = req.body as { menuText: string; salesText: string };

  if (!menuText || typeof menuText !== "string") {
    res.status(400).json({ error: "Brakuje danych menu." });
    return;
  }

  // Fetch product prices with month-over-month change from DB
  let dbPrices = "";
  try {
    const priceResult = await db.execute(sql`
      WITH ranked AS (
        SELECT
          p.name AS product_name,
          s.name AS supplier_name,
          ii.unit_price::numeric AS price,
          ii.unit,
          ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY i.invoice_date DESC) AS rn
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        JOIN products p ON ii.product_id = p.id
        JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.user_id = ${userId} AND s.is_active = true
      )
      SELECT
        r1.product_name,
        r1.supplier_name,
        ROUND(r1.price, 2) AS current_price,
        r1.unit,
        CASE
          WHEN r2.price IS NOT NULL AND r2.price > 0
          THEN ROUND((r1.price - r2.price) / r2.price * 100, 1)
          ELSE NULL
        END AS price_change_pct
      FROM ranked r1
      LEFT JOIN ranked r2
        ON r1.product_name = r2.product_name AND r2.rn = 2
      WHERE r1.rn = 1
      ORDER BY r1.product_name
      LIMIT 80
    `);
    const rows = priceResult.rows as Array<{
      product_name: string;
      supplier_name: string;
      current_price: string;
      unit: string;
      price_change_pct: string | null;
    }>;
    if (rows.length > 0) {
      dbPrices = "\n\nPRODUKTY I CENY ZAKUPOWE Z SPENDLY:\n" +
        rows.map(r => {
          const change = r.price_change_pct != null
            ? ` [zmiana: ${parseFloat(r.price_change_pct) > 0 ? "+" : ""}${r.price_change_pct}%]`
            : "";
          return `${r.product_name}: ${r.current_price} zł/${r.unit || "j."} — ${r.supplier_name}${change}`;
        }).join("\n");
    }
  } catch {
    // ignore — proceed without DB prices
  }

  const prompt = `Jesteś AI CFO dla restauracji w Polsce. Analizujesz rentowność menu i szacujesz food cost.

WAŻNE ZASADY:
- NIE potrzebujesz gramatur ani receptur technologicznych
- Szacujesz typowe porcje na podstawie wiedzy kulinarnej i typu dania
- Używasz cen zakupowych z Spendly (poniżej) gdy dostępne; jeśli brak — typowe ceny rynkowe dla PL
- Wynik jest SZACUNKIEM, nie księgowym wyliczeniem
- confidencePct (0–100): wyższy gdy masz ceny zakupowe dla głównych składników dania
- priceImpactPct: o ile % zmieniła się marża przez zmiany cen zakupowych (null = brak danych o zmianach)
- spendlyProducts: lista produktów ze Spendly które zmapowałeś do składników tego dania
- alerts: generuj dla całego menu — low_margin gdy marża < 50%, high_margin gdy >= 65%, margin_drop gdy priceImpactPct <= -2%
${dbPrices}

MENU RESTAURACJI:
${menuText.slice(0, 3000)}

SPRZEDAŻ TYGODNIOWA:
${salesText ? salesText.slice(0, 1000) : "(nie podano)"}

Odpowiedz TYLKO jako JSON (bez żadnego tekstu poza JSON):
{
  "dishes": [
    {
      "name": "Filet z kurczaka",
      "salePrice": 54.00,
      "ingredientCost": 21.00,
      "marginPct": 61.1,
      "sales": 30,
      "grossProfit": 990.00,
      "confidencePct": 78,
      "mostExpensiveIngredient": "Kurczak",
      "priceImpactPct": -3.0,
      "suggestedPrice": 57,
      "recommendation": "Podniesienie ceny do 57 zł zwiększy marżę do ok. 65%",
      "spendlyProducts": [
        {"name": "FILET Z KURCZAKA POJEDYNCZY", "price": 22.50, "unit": "kg", "supplierName": "FARUTEX", "priceChangePct": 5.2}
      ]
    }
  ],
  "summary": "Ogólna ocena food cost restauracji (1-2 zdania).",
  "avgMarginPct": 63.5,
  "alerts": [
    {"type": "low_margin", "dishName": "Tatar", "value": "51%"},
    {"type": "margin_drop", "dishName": "Filet z kurczaka", "value": "-3%"},
    {"type": "high_margin", "dishName": "Burger BBQ", "value": "74%"}
  ]
}

Reguły obliczeń:
- marginPct = (salePrice - ingredientCost) / salePrice * 100
- grossProfit = (salePrice - ingredientCost) * sales (null gdy brak sprzedaży)
- suggestedPrice: nowa cena gdy marża < 65%, w przeciwnym razie null
- Sortuj dania od najgorszej do najlepszej marży (rosnąco po marginPct)
- Odpowiadaj po polsku`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (resp.choices[0]?.message?.content ?? "").trim();
  req.log.info({ rawLen: raw.length }, "ai-cfo food-cost response");

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    req.log.warn({ raw: raw.slice(0, 300) }, "ai-cfo food-cost JSON parse failed");
    res.status(422).json({ error: "Nie udało się przetworzyć danych. Sprawdź format menu i spróbuj ponownie." });
    return;
  }

  // Deterministic post-processing
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).dishes)) {
    const p = parsed as {
      dishes: Array<Record<string, unknown>>;
      summary?: string;
      avgMarginPct?: number;
      alerts?: Array<Record<string, unknown>>;
    };

    p.dishes = p.dishes
      .map((d): Record<string, unknown> => ({
        ...d,
        suggestedPrice: typeof d.marginPct === "number" && d.marginPct < 65
          ? (d.suggestedPrice ?? null)
          : null,
      }))
      .sort((a, b) => {
        const am = typeof a.marginPct === "number" ? a.marginPct : 999;
        const bm = typeof b.marginPct === "number" ? b.marginPct : 999;
        return am - bm;
      });

    // Generate alerts from data if AI didn't return them
    if (!Array.isArray(p.alerts) || p.alerts.length === 0) {
      const alerts: Array<Record<string, unknown>> = [];
      for (const d of p.dishes) {
        const name = String(d.name ?? "");
        const margin = typeof d.marginPct === "number" ? d.marginPct : null;
        const impact = typeof d.priceImpactPct === "number" ? d.priceImpactPct : null;
        if (margin !== null && margin < 50)
          alerts.push({ type: "low_margin", dishName: name, value: `${margin.toFixed(0)}%` });
        if (impact !== null && impact <= -2)
          alerts.push({ type: "margin_drop", dishName: name, value: `${impact.toFixed(1)}%` });
        if (margin !== null && margin >= 65)
          alerts.push({ type: "high_margin", dishName: name, value: `${margin.toFixed(0)}%` });
      }
      if (alerts.length > 0) p.alerts = alerts;
    }
  }

  res.json(parsed);
});

// ─── Route: POST /ai-cfo/extract-menu ────────────────────────────────────────

const MAX_MENU_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB aggregate across all files

const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MENU_UPLOAD_BYTES }, // per-file cap; aggregate enforced in handler
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Nieobsługiwany format. Użyj JPG, PNG, WEBP lub PDF."));
    }
  },
});

const MENU_EXTRACT_PROMPT = `Jesteś asystentem restauratora. Twoim zadaniem jest wyciągnięcie listy dań z karty menu.

Zwróć TYLKO tekst (nie JSON) w formacie gotowym do analizy food cost — dla każdego dania podaj:
- nazwę dania
- składniki z gramaturą (jeśli widoczne)
- cenę menu

Przykładowy format:
Makaron carbonara (2 porcje):
- 200g spaghetti
- 100g boczek wędzony
- 2 jajka
Cena menu: 32 zł

Burger wołowy:
- 180g wołowina
- bułka brioche
- sałata, pomidor
Cena menu: 42 zł

Jeśli receptury nie są widoczne — podaj tylko nazwy dań z cenami.
Odpowiadaj wyłącznie po polsku. Nie dodawaj żadnych komentarzy ani wyjaśnień — tylko listę dań.`;

async function extractViaVision(buffer: Buffer, mimeType: string): Promise<string> {
  const base64 = buffer.toString("base64");
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
          },
          { type: "text", text: MENU_EXTRACT_PROMPT },
        ],
      },
    ],
    max_tokens: 2000,
    temperature: 0.1,
  });
  return (response.choices[0]?.message?.content ?? "").trim();
}

// Process a single image buffer via vision — returns extracted text
async function processImageFile(buffer: Buffer, mimetype: string): Promise<string> {
  return extractViaVision(buffer, mimetype);
}

// Process a single PDF buffer — returns { text, pageCount }
async function processPdfFile(
  buffer: Buffer,
  log: { error: (obj: unknown, msg: string) => void },
): Promise<{ text: string; pageCount: number }> {
  // Try native text extraction (all pages)
  let pdfParse: (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string; numpages?: number }>;
  try {
    // @ts-ignore — sub-path has no type declarations
    const mod = await import("pdf-parse/lib/pdf-parse.js");
    pdfParse = (mod.default ?? mod) as typeof pdfParse;
  } catch {
    throw new Error("Nie można załadować biblioteki PDF.");
  }

  let rawText = "";
  let nativePageCount = 1;
  try {
    const extracted = await pdfParse(buffer); // no page limit — process all pages
    rawText = (extracted.text ?? "").trim();
    nativePageCount = extracted.numpages ?? 1;
  } catch {
    rawText = "";
  }

  if (rawText.length >= 30) {
    // Native text found — ask AI to clean and format all pages
    const cleanupResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Poniżej jest surowy tekst wyciągnięty z PDF karty menu (wszystkie strony). Sformatuj go jako czytelną listę dań z cenami — usuń nagłówki, stopki, numery stron, zbędne znaki. Zachowaj wszystkie dania i ceny ze wszystkich stron. Odpowiadaj po polsku, tylko sformatowaną listą dań, bez komentarzy.\n\nSUROWY TEKST:\n${rawText.slice(0, 8000)}`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.1,
    });
    const menuText = (cleanupResponse.choices[0]?.message?.content ?? "").trim();
    return { text: menuText || rawText.slice(0, 6000), pageCount: nativePageCount };
  }

  // Scanned PDF — convert pages to PNG and process with vision (capped to avoid runaway cost)
  const MAX_PDF_PAGES = 20;
  try {
    const { pdf: pdfToImg } = await import("pdf-to-img");
    const doc = await pdfToImg(buffer, { scale: 2 });
    const totalPages = doc.length;
    const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES);
    const pageTexts: string[] = [];
    for (let i = 1; i <= pagesToProcess; i++) {
      const pageBuffer = await doc.getPage(i);
      const pageText = await extractViaVision(pageBuffer, "image/png");
      if (pageText && pageText.length >= 5) {
        pageTexts.push(`--- Strona ${i} ---\n${pageText}`);
      }
    }
    await doc.destroy();
    const combined = pageTexts.join("\n\n");
    if (!combined || combined.length < 10) {
      throw new Error("Nie udało się odczytać menu ze skanu PDF.");
    }
    return { text: combined, pageCount: totalPages };
  } catch (err) {
    log.error({ err }, "ai-cfo extract-menu: pdf-to-img failed");
    throw new Error("PDF nie zawiera tekstu (prawdopodobnie skan) i nie udało się go przekonwertować. Zrób zdjęcie menu i wyślij jako obraz JPG lub PNG.");
  }
}

router.post("/ai-cfo/extract-menu", aiCostLimiter, menuUpload.array("files", 5), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: "Brakuje pliku. Prześlij obraz lub PDF jako pole 'files'." });
    return;
  }

  // Guard: max 5 files
  if (files.length > 5) {
    res.status(400).json({ error: "Można przesłać maksymalnie 5 plików naraz." });
    return;
  }

  // Guard: aggregate size must not exceed 15 MB
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_MENU_UPLOAD_BYTES) {
    res.status(413).json({ error: "Łączny rozmiar plików przekracza 15 MB. Zmniejsz liczbę plików lub ich rozmiar." });
    return;
  }

  try {
    const segments: string[] = [];
    let totalPageCount = 0;

    for (let idx = 0; idx < files.length; idx++) {
      const { buffer, mimetype } = files[idx];
      const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mimetype.toLowerCase());
      const isPdf = mimetype.toLowerCase() === "application/pdf";

      if (isImage) {
        const text = await processImageFile(buffer, mimetype);
        if (text && text.length >= 5) {
          const label = files.length > 1 ? `--- Zdjęcie ${idx + 1} ---\n` : "";
          segments.push(`${label}${text}`);
        }
        totalPageCount += 1;
      } else if (isPdf) {
        const { text, pageCount } = await processPdfFile(buffer, req.log);
        if (text && text.length >= 5) {
          const label = files.length > 1 ? `--- Plik PDF ${idx + 1} ---\n` : "";
          segments.push(`${label}${text}`);
        }
        totalPageCount += pageCount;
      }
    }

    const menuText = segments.join("\n\n");
    if (!menuText || menuText.length < 10) {
      res.status(422).json({ error: "Nie udało się odczytać menu z przesłanych plików. Upewnij się, że zdjęcia są ostre i dobrze oświetlone." });
      return;
    }

    res.json({ menuText, pageCount: totalPageCount });
  } catch (err) {
    req.log.error({ err }, "ai-cfo extract-menu error");
    const msg = err instanceof Error ? err.message : "Wystąpił błąd podczas ekstrakcji. Spróbuj ponownie.";
    res.status(422).json({ error: msg });
  }
});

// ─── Session helpers ──────────────────────────────────────────────────────────

function sessionExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d;
}

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text?: string | null;
  data?: unknown | null;
};

// ─── Route: GET /ai-cfo/sessions ─────────────────────────────────────────────

router.get("/ai-cfo/sessions", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();

  // Opportunistic cleanup: delete expired sessions for this user (fire-and-forget)
  db.delete(aiCfoSessionsTable)
    .where(sql`${aiCfoSessionsTable.expiresAt} <= ${now.toISOString()}`)
    .catch((err: unknown) => req.log.warn({ err }, "ai-cfo sessions cleanup failed"));

  const rows = await db
    .select()
    .from(aiCfoSessionsTable)
    .where(and(
      eq(aiCfoSessionsTable.userId, userId),
      sql`${aiCfoSessionsTable.expiresAt} > ${now.toISOString()}`
    ))
    .orderBy(desc(aiCfoSessionsTable.updatedAt))
    .limit(20);

  const summaries = rows.map((row) => {
    const msgs = (row.messages as StoredMessage[]) ?? [];
    return {
      id: row.id,
      title: row.title,
      messageCount: msgs.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  res.json(summaries);
});

// ─── Route: POST /ai-cfo/sessions ────────────────────────────────────────────

router.post("/ai-cfo/sessions", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { title, messages } = req.body as { title: string; messages: StoredMessage[] };

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "Brakuje tytułu sesji." });
    return;
  }

  const [row] = await db
    .insert(aiCfoSessionsTable)
    .values({
      userId,
      title: title.slice(0, 200),
      messages: messages ?? [],
      expiresAt: sessionExpiresAt(),
    })
    .returning();

  const msgs = (row.messages as StoredMessage[]) ?? [];
  res.status(201).json({
    id: row.id,
    title: row.title,
    messages: msgs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// ─── Route: GET /ai-cfo/sessions/:id ─────────────────────────────────────────

router.get("/ai-cfo/sessions/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Nieprawidłowe id." }); return; }

  const now = new Date();
  const [row] = await db
    .select()
    .from(aiCfoSessionsTable)
    .where(and(
      eq(aiCfoSessionsTable.id, id),
      eq(aiCfoSessionsTable.userId, userId),
      sql`${aiCfoSessionsTable.expiresAt} > ${now.toISOString()}`
    ));

  if (!row) { res.status(404).json({ error: "Nie znaleziono sesji." }); return; }

  const msgs = (row.messages as StoredMessage[]) ?? [];
  res.json({
    id: row.id,
    title: row.title,
    messages: msgs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// ─── Route: PUT /ai-cfo/sessions/:id ─────────────────────────────────────────

router.put("/ai-cfo/sessions/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Nieprawidłowe id." }); return; }

  const { messages } = req.body as { messages: StoredMessage[] };
  if (!Array.isArray(messages)) { res.status(400).json({ error: "Brakuje listy wiadomości." }); return; }

  const now2 = new Date();
  const [row] = await db
    .update(aiCfoSessionsTable)
    .set({ messages, updatedAt: new Date() })
    .where(and(
      eq(aiCfoSessionsTable.id, id),
      eq(aiCfoSessionsTable.userId, userId),
      sql`${aiCfoSessionsTable.expiresAt} > ${now2.toISOString()}`
    ))
    .returning();

  if (!row) { res.status(404).json({ error: "Nie znaleziono sesji." }); return; }

  const msgs = (row.messages as StoredMessage[]) ?? [];
  res.json({
    id: row.id,
    title: row.title,
    messages: msgs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

// ─── Route: DELETE /ai-cfo/sessions/:id ──────────────────────────────────────

router.delete("/ai-cfo/sessions/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Nieprawidłowe id." }); return; }

  await db
    .delete(aiCfoSessionsTable)
    .where(and(
      eq(aiCfoSessionsTable.id, id),
      eq(aiCfoSessionsTable.userId, userId)
    ));

  res.status(204).send();
});

export default router;
