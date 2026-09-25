import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { computeTriggeredAlerts } from "../services/alert-checker.js";
import { computeAllDishMargins } from "../routes/food-cost.js";
import { normalizedUnitSql } from "./units.js";
import { excludeNonSpendInvoiceTypes, spendOnly, realQuantityOnly } from "./invoice-line-classify.js";

// Wykluczenie KOR/ROZ ze zsumowanych WYDATKÓW w get_spend_summary — NIE stosowane
// w narzędziach o CENIE/ILOŚCI JEDNOSTKOWEJ (get_product_price_history,
// get_price_increases, get_quantity/price_anomalies), gdzie dane z faktur
// rozliczeniowych są realne i wartościowe. Patrz lib/invoice-line-classify.ts.
//
// UWAGA: gdy kwerenda w TYM SAMYM wierszu liczy też total_qty — NIE dawaj tego
// filtra w WHERE (wytnie realną ilość dostawy), tylko owiń spendOnly() samo
// SUM(total_price) dla total_spend.
const notSpendDistorting = excludeNonSpendInvoiceTypes("i");
const moneyExpr = sql`ii.total_price::numeric`;

// Narzędzia function-calling dla AI CFO (routes/ai-cfo.ts). Model SAM decyduje,
// którego narzędzia użyć i z jakimi argumentami BIZNESOWYMI (nazwa produktu, ID,
// zakres dat) — nigdy nie zna i nie kontroluje userId. `userId` jest wstrzykiwany
// z req.userId do KAŻDEGO wywołania tutaj, w tym pliku, nigdy z argumentów modelu.
// Żaden schemat poniżej nie ma pola user_id/tenant_id — to jedyna gwarancja izolacji
// tenantów przy tej architekturze (patrz brief + CLAUDE.md reguła #36).

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function asObject(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

// invoice_date jest TEXT w formacie YYYY-MM-DD (reguła #3) — walidujemy format,
// nie parsujemy jako Date.
function asDateStr(v: unknown): string | undefined {
  const s = asString(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function asInt(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function clampInt(v: number | undefined, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, v ?? fallback));
}

// ─── search_products ──────────────────────────────────────────────────────────

async function toolSearchProducts(userId: string, args: Record<string, unknown>) {
  const query = asString(args.query);
  if (!query) return { error: "Podaj query (fragment nazwy produktu)." };

  const res = await db.execute(sql`
    SELECT id, name, category, similarity(lower(name), lower(${query})) AS sim
    FROM products
    WHERE user_id = ${userId}
      AND (lower(name) LIKE '%' || lower(${query}) || '%' OR similarity(lower(name), lower(${query})) > 0.25)
    ORDER BY sim DESC, length(name) ASC
    LIMIT 10
  `);
  const rows = res.rows as Array<{ id: number; name: string; category: string | null }>;
  if (rows.length === 0) return { products: [], message: "Brak produktów pasujących do zapytania." };
  return { products: rows.map((r) => ({ id: r.id, name: r.name, category: r.category })) };
}

// ─── search_suppliers ─────────────────────────────────────────────────────────

async function toolSearchSuppliers(userId: string, args: Record<string, unknown>) {
  const query = asString(args.query);
  if (!query) return { error: "Podaj query (fragment nazwy dostawcy LUB NIP-u)." };

  // Dopasowanie po nazwie (fuzzy, pg_trgm) LUB po NIP-ie (dokładny substring —
  // NIP to ciąg cyfr, fuzzy similarity nie ma tu sensu). Faktury KSeF naturalnie
  // kojarzą się z NIP-em, nie samą nazwą — użytkownik pyta "6811970907" równie
  // często jak o nazwę.
  const res = await db.execute(sql`
    SELECT id, name, tax_id, similarity(lower(name), lower(${query})) AS sim
    FROM suppliers
    WHERE user_id = ${userId} AND is_active = true
      AND (
        lower(name) LIKE '%' || lower(${query}) || '%'
        OR similarity(lower(name), lower(${query})) > 0.3
        OR tax_id LIKE '%' || ${query} || '%'
      )
    ORDER BY (tax_id LIKE '%' || ${query} || '%') DESC, sim DESC, length(name) ASC
    LIMIT 10
  `);
  const rows = res.rows as Array<{ id: number; name: string; tax_id: string }>;
  if (rows.length === 0) return { suppliers: [], message: "Brak dostawców pasujących do zapytania (nazwa ani NIP nie pasują)." };
  return { suppliers: rows.map((r) => ({ id: r.id, name: r.name, taxId: r.tax_id })) };
}

// ─── get_product_price_history ────────────────────────────────────────────────

async function toolProductPriceHistory(userId: string, args: Record<string, unknown>) {
  const productId = asInt(args.product_id);
  if (!productId) return { error: "Podaj product_id (liczba, użyj search_products, aby go znaleźć)." };
  const limit = clampInt(asInt(args.limit), 2, 24, 12);

  const prodRes = await db.execute(sql`SELECT id, name FROM products WHERE id = ${productId} AND user_id = ${userId}`);
  const product = prodRes.rows[0] as { id: number; name: string } | undefined;
  if (!product) return { error: "Produkt nie znaleziony (nieprawidłowe product_id)." };

  const hist = await db.execute(sql`
    SELECT inv.invoice_date AS date, ii.unit_price::text AS unit_price,
           inv.invoice_number AS invoice_number, s.name AS supplier_name
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    JOIN suppliers s ON inv.supplier_id = s.id
    WHERE ii.product_id = ${productId}
      AND inv.user_id = ${userId}
      AND inv.excluded = false
      AND inv.parent_invoice_id IS NULL
      AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0
      AND ii.unit_price::numeric > 0
    ORDER BY inv.invoice_date DESC, inv.id DESC
    LIMIT ${sql.raw(String(limit))}
  `);
  if (hist.rows.length === 0) {
    return { product, history: [], message: "Brak historii zakupów tego produktu." };
  }
  return { product, history: hist.rows };
}

// ─── get_cheapest_supplier_for_product ────────────────────────────────────────

async function toolCheapestSupplierForProduct(userId: string, args: Record<string, unknown>) {
  const productId = asInt(args.product_id);
  if (!productId) return { error: "Podaj product_id (liczba, użyj search_products, aby go znaleźć)." };

  const prodRes = await db.execute(sql`SELECT id, name FROM products WHERE id = ${productId} AND user_id = ${userId}`);
  const product = prodRes.rows[0] as { id: number; name: string } | undefined;
  if (!product) return { error: "Produkt nie znaleziony (nieprawidłowe product_id)." };

  const res = await db.execute(sql`
    SELECT s.name AS supplier,
      ROUND(AVG(ii.unit_price::numeric), 2)::text AS avg_price,
      ROUND(MIN(ii.unit_price::numeric), 2)::text AS min_price,
      COUNT(DISTINCT inv.id)::int AS purchases,
      MAX(inv.invoice_date) AS last_date
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    JOIN suppliers s ON inv.supplier_id = s.id
    WHERE ii.product_id = ${productId} AND inv.user_id = ${userId} AND inv.excluded = false
      AND inv.parent_invoice_id IS NULL AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
    GROUP BY inv.supplier_id, s.name
    ORDER BY avg_price ASC
  `);
  if (res.rows.length === 0) {
    return { product, suppliers: [], message: "Brak zakupów tego produktu u żadnego dostawcy." };
  }
  return { product, suppliers: res.rows };
}

// ─── get_products_by_supplier ─────────────────────────────────────────────────
// Odwrotność search_products: model często dostaje supplier_id (z search_suppliers)
// i pyta "co u niego kupuję / które produkty zmieniają cenę", a nie zna nazwy
// PRODUKTU po której działa search_products. Bez tego narzędzia model próbował
// search_products z nazwą DOSTAWCY jako query i oczywiście nic nie znajdował
// (realny raport użytkownika 2026-09-25 — "Stelma"/"Stelma Fresh" istnieją i mają
// faktury, ale search_products("Stelma") zawsze zwracał pustkę). Przyjmuje LISTĘ
// supplier_ids na raz — pokrywa też przypadek dwóch różnych firm o podobnej nazwie
// (np. "F.H.STELMA S.C." i "STELMA FRESH SP. Z O.O." — obie z search_suppliers).

async function toolProductsBySupplier(userId: string, args: Record<string, unknown>) {
  const rawIds = Array.isArray(args.supplier_ids) ? args.supplier_ids : [args.supplier_id];
  const supplierIds = Array.from(new Set(rawIds.map(asInt).filter((n): n is number => n != null))).slice(0, 10);
  if (supplierIds.length === 0) {
    return { error: "Podaj supplier_ids (lista ID dostawców z search_suppliers)." };
  }
  const onlyPriceChanged = args.only_price_changed === true;

  const res = await db.execute(sql`
    SELECT p.id AS product_id, p.name AS product_name, s.id AS supplier_id, s.name AS supplier_name,
      ii.unit,
      ROUND(MIN(ii.unit_price::numeric), 2)::text AS min_price,
      ROUND(MAX(ii.unit_price::numeric), 2)::text AS max_price,
      ROUND(AVG(ii.unit_price::numeric), 2)::text AS avg_price,
      COUNT(*)::int AS purchases,
      MAX(inv.invoice_date) AS last_date
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    JOIN suppliers s ON inv.supplier_id = s.id
    JOIN products p ON ii.product_id = p.id
    WHERE inv.user_id = ${userId}
      AND inv.supplier_id IN (${sql.join(supplierIds.map((id) => sql`${id}`), sql`, `)})
      AND inv.excluded = false AND inv.parent_invoice_id IS NULL
      AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
    GROUP BY p.id, p.name, s.id, s.name, ii.unit
    ORDER BY s.name, p.name
    LIMIT 100
  `);
  let rows = res.rows as Array<{ min_price: string; max_price: string }>;
  if (onlyPriceChanged) rows = rows.filter((r) => r.min_price !== r.max_price);

  if (rows.length === 0) {
    return {
      products: [],
      message: onlyPriceChanged
        ? "Brak produktów od tego dostawcy/dostawców, których cena jednostkowa się zmieniała — wszystkie mają stałą cenę (albo brak zakupów w ogóle)."
        : "Brak zakupionych produktów od tego dostawcy/dostawców.",
    };
  }
  return { products: rows };
}

// ─── get_supplier_price_changes ───────────────────────────────────────────────
// Indeks cenowy na STAŁYM KOSZYKU (Laspeyres) — patrz komentarz w git history
// starej fetchSupplierPriceChanges. Okno domyślnie 30 dni (vs poprzednie 30).

async function toolSupplierPriceChanges(userId: string, args: Record<string, unknown>) {
  const windowDays = clampInt(asInt(args.window_days), 7, 180, 30);
  const curFrom = daysAgo(windowDays);
  const prevFrom = daysAgo(windowDays * 2);

  const res = await db.execute(sql`
    WITH win AS (
      SELECT
        inv.supplier_id AS supplier_id,
        ii.product_id AS product_id,
        ii.unit AS unit,
        CASE WHEN inv.invoice_date >= ${curFrom} THEN 'now' ELSE 'prev' END AS bucket,
        SUM(ii.quantity::numeric) AS qty,
        SUM(ii.total_price::numeric) / NULLIF(SUM(ii.quantity::numeric), 0) AS avg_price
      FROM invoice_items ii
      JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE inv.user_id = ${userId}
        AND inv.excluded = false
        AND inv.parent_invoice_id IS NULL
        AND (inv.invoice_type IS DISTINCT FROM 'KOR')
        AND ii.quantity::numeric > 0
        AND ii.unit_price::numeric > 0
        AND inv.invoice_date >= ${prevFrom}
      GROUP BY 1, 2, 3, 4
    ),
    paired AS (
      SELECT n.supplier_id AS supplier_id, n.qty AS qty_now, n.avg_price AS price_now, p.avg_price AS price_prev
      FROM win n
      JOIN win p
        ON p.supplier_id = n.supplier_id
       AND p.product_id = n.product_id
       AND p.unit IS NOT DISTINCT FROM n.unit
       AND p.bucket = 'prev'
      WHERE n.bucket = 'now' AND p.avg_price > 0
    )
    SELECT s.name AS supplier_name,
           COUNT(*)::int AS products,
           ROUND(SUM(pd.qty_now * pd.price_now), 0)::text AS cost_now,
           ROUND(SUM(pd.qty_now * pd.price_prev), 0)::text AS cost_old,
           ROUND(
             (SUM(pd.qty_now * pd.price_now) - SUM(pd.qty_now * pd.price_prev))
             / NULLIF(SUM(pd.qty_now * pd.price_prev), 0) * 100, 1
           )::text AS change_pct
    FROM paired pd
    JOIN suppliers s ON s.id = pd.supplier_id
    GROUP BY s.id, s.name
    HAVING SUM(pd.qty_now * pd.price_prev) > 0
    ORDER BY (SUM(pd.qty_now * pd.price_now) - SUM(pd.qty_now * pd.price_prev))
             / NULLIF(SUM(pd.qty_now * pd.price_prev), 0) DESC
    LIMIT 10
  `);
  if (res.rows.length === 0) {
    return {
      windowDays,
      changes: [],
      message:
        "Żaden dostawca nie ma tego samego produktu (w tej samej jednostce) kupionego w obu oknach — nie da się oddzielić zmiany ceny od zmiany asortymentu. Zaproponuj pytanie o konkretny produkt albo dłuższy okres.",
    };
  }
  return { windowDays, changes: res.rows };
}

// ─── get_price_increases ──────────────────────────────────────────────────────

async function toolPriceIncreases(userId: string, args: Record<string, unknown>) {
  const limit = clampInt(asInt(args.limit), 1, 30, 10);

  const res = await db.execute(sql`
    WITH ranked AS (
      SELECT p.id AS product_id, p.name, ii.unit_price::numeric AS price,
             ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY inv.invoice_date DESC, inv.id DESC) AS rn
      FROM invoice_items ii
      JOIN invoices inv ON ii.invoice_id = inv.id
      JOIN products p ON ii.product_id = p.id
      WHERE inv.user_id = ${userId} AND inv.excluded = false AND inv.parent_invoice_id IS NULL
        AND (inv.invoice_type IS DISTINCT FROM 'KOR')
        AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
    ),
    pairs AS (
      SELECT product_id, name,
             MAX(price) FILTER (WHERE rn = 1) AS latest,
             MAX(price) FILTER (WHERE rn = 2) AS prev
      FROM ranked WHERE rn <= 2
      GROUP BY product_id, name
      HAVING COUNT(*) = 2
    )
    SELECT name, latest::text AS latest, prev::text AS prev,
           ROUND((latest - prev) / prev * 100, 1)::text AS change_pct
    FROM pairs
    WHERE latest > prev
    ORDER BY (latest - prev) / prev DESC
    LIMIT ${sql.raw(String(limit))}
  `);
  if (res.rows.length === 0) return { increases: [], message: "Brak produktów z podwyżką ceny między dwoma ostatnimi zakupami." };
  return { increases: res.rows };
}

// ─── get_quantity_anomalies ────────────────────────────────────────────────────
// Wypełnia typ "quantity_anomaly" z kontraktu JSON (był zdefiniowany w odpowiedzi
// od początku, ale żadne narzędzie go dotąd nie zasilało). Baseline = średnia
// ilość z HISTORII BEZ najnowszego zakupu (rn > 1), żeby anomalia nie ciągnęła
// sama siebie w dół — porównywana z ostatnim zakupem (rn = 1). Minimum 3 wcześniejsze
// zakupy, żeby średnia miała sens (inaczej 2 zakupy = zawsze "anomalia" przy zmianie).
async function toolQuantityAnomalies(userId: string, args: Record<string, unknown>) {
  const thresholdPct = clampInt(asInt(args.threshold_pct), 20, 200, 50);
  const threshold = thresholdPct / 100;

  const res = await db.execute(sql`
    WITH ranked AS (
      SELECT ii.product_id, p.name, ii.quantity::numeric AS qty, ii.unit,
             inv.invoice_date, inv.invoice_number, s.name AS supplier_name,
             ROW_NUMBER() OVER (PARTITION BY ii.product_id ORDER BY inv.invoice_date DESC, inv.id DESC) AS rn
      FROM invoice_items ii
      JOIN invoices inv ON ii.invoice_id = inv.id
      JOIN products p ON ii.product_id = p.id
      JOIN suppliers s ON inv.supplier_id = s.id
      WHERE inv.user_id = ${userId} AND inv.excluded = false AND inv.parent_invoice_id IS NULL
        AND (inv.invoice_type IS DISTINCT FROM 'KOR')
        AND ii.quantity::numeric > 0
    ),
    baseline AS (
      SELECT product_id, AVG(qty) AS avg_qty, COUNT(*)::int AS history_count
      FROM ranked WHERE rn > 1
      GROUP BY product_id
      HAVING COUNT(*) >= 3
    )
    SELECT r.name AS product_name, r.qty::text AS latest_qty, r.unit,
           ROUND(b.avg_qty, 2)::text AS avg_qty,
           ROUND((r.qty - b.avg_qty) / NULLIF(b.avg_qty, 0) * 100, 1)::text AS deviation_pct,
           r.invoice_date, r.invoice_number, r.supplier_name, b.history_count
    FROM ranked r
    JOIN baseline b ON b.product_id = r.product_id
    WHERE r.rn = 1
      AND ABS((r.qty - b.avg_qty) / NULLIF(b.avg_qty, 0)) >= ${threshold}
    ORDER BY ABS((r.qty - b.avg_qty) / NULLIF(b.avg_qty, 0)) DESC
    LIMIT 15
  `);
  if (res.rows.length === 0) {
    return { anomalies: [], message: `Brak produktów, których ostatnia zakupiona ilość odbiega od własnej historii o ${thresholdPct}% lub więcej.` };
  }
  return { anomalies: res.rows };
}

// ─── get_price_anomalies ───────────────────────────────────────────────────────
// Ta sama logika baseline co get_quantity_anomalies, ale dla ceny jednostkowej —
// na wyraźną prośbę: "tak samo price za szt/kg anomalię". Partycja PO (product_id,
// znormalizowana jednostka) — normalizedUnitSql (lib/units.ts) jest tu KRYTYCZNE,
// inaczej "kg"/"Kg"/"KG" tego samego produktu liczyłyby się jako różne baseline'y
// (patrz reguła 34 / lekcja z benchmarku rynkowego) i cena za szt nigdy nie
// wymieszałaby się z ceną za kg, bo to fizycznie różne wielkości.
async function toolPriceAnomalies(userId: string, args: Record<string, unknown>) {
  const thresholdPct = clampInt(asInt(args.threshold_pct), 10, 200, 30);
  const threshold = thresholdPct / 100;

  const res = await db.execute(sql`
    WITH ranked AS (
      SELECT ii.product_id, p.name, ii.unit_price::numeric AS price,
             ${normalizedUnitSql(sql`ii.unit`)} AS unit,
             inv.invoice_date, inv.invoice_number, s.name AS supplier_name,
             ROW_NUMBER() OVER (
               PARTITION BY ii.product_id, ${normalizedUnitSql(sql`ii.unit`)}
               ORDER BY inv.invoice_date DESC, inv.id DESC
             ) AS rn
      FROM invoice_items ii
      JOIN invoices inv ON ii.invoice_id = inv.id
      JOIN products p ON ii.product_id = p.id
      JOIN suppliers s ON inv.supplier_id = s.id
      WHERE inv.user_id = ${userId} AND inv.excluded = false AND inv.parent_invoice_id IS NULL
        AND (inv.invoice_type IS DISTINCT FROM 'KOR')
        AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
    ),
    baseline AS (
      SELECT product_id, unit, AVG(price) AS avg_price, COUNT(*)::int AS history_count
      FROM ranked WHERE rn > 1
      GROUP BY 1, 2
      HAVING COUNT(*) >= 3
    )
    SELECT r.name AS product_name, r.unit, r.price::text AS latest_price,
           ROUND(b.avg_price, 2)::text AS avg_price,
           ROUND((r.price - b.avg_price) / NULLIF(b.avg_price, 0) * 100, 1)::text AS deviation_pct,
           r.invoice_date, r.invoice_number, r.supplier_name, b.history_count
    FROM ranked r
    JOIN baseline b ON b.product_id = r.product_id AND b.unit = r.unit
    WHERE r.rn = 1
      AND ABS((r.price - b.avg_price) / NULLIF(b.avg_price, 0)) >= ${threshold}
    ORDER BY ABS((r.price - b.avg_price) / NULLIF(b.avg_price, 0)) DESC
    LIMIT 15
  `);
  if (res.rows.length === 0) {
    return { anomalies: [], message: `Brak produktów, których ostatnia cena jednostkowa odbiega od własnej historii (w tej samej jednostce) o ${thresholdPct}% lub więcej.` };
  }
  return { anomalies: res.rows };
}

// ─── get_price_alerts ──────────────────────────────────────────────────────────

async function toolPriceAlerts(userId: string) {
  const alerts = await computeTriggeredAlerts(userId);
  if (alerts.length === 0) return { alerts: [], message: "Brak aktywnych alertów — żaden monitorowany produkt nie przekroczył progu." };
  return { alerts };
}

// ─── get_dish_margins ──────────────────────────────────────────────────────────

async function toolDishMargins(userId: string) {
  const dishes = await computeAllDishMargins(userId);
  if (dishes.length === 0) return { dishes: [], message: "Brak zdefiniowanych dań (moduł Food cost jest pusty)." };
  const withMargin = dishes.filter((d) => d.marginPct != null).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));
  if (withMargin.length === 0) return { dishes: [], message: "Dania istnieją, ale brak cen składników do wyliczenia marży." };
  return { dishes: withMargin.slice(0, 20) };
}

// ─── search_invoices ────────────────────────────────────────────────────────────

async function toolSearchInvoices(userId: string, args: Record<string, unknown>) {
  const supplierId = asInt(args.supplier_id);
  const supplierName = asString(args.supplier_name);
  const invoiceNumber = asString(args.invoice_number);
  const dateFrom = asDateStr(args.date_from);
  const dateTo = asDateStr(args.date_to);
  const limit = clampInt(asInt(args.limit), 1, 50, 20);

  const conditions = [sql`i.user_id = ${userId}`, sql`i.excluded = false`];
  // supplier_id (z search_suppliers) jest precyzyjniejszy niż dopasowanie po nazwie —
  // preferuj go, gdy model go poda (np. po wyszukaniu dostawcy po NIP-ie).
  if (supplierId) conditions.push(sql`i.supplier_id = ${supplierId}`);
  else if (supplierName) conditions.push(sql`s.name ILIKE ${"%" + supplierName + "%"}`);
  if (invoiceNumber) conditions.push(sql`i.invoice_number ILIKE ${"%" + invoiceNumber + "%"}`);
  if (dateFrom) conditions.push(sql`i.invoice_date >= ${dateFrom}`);
  if (dateTo) conditions.push(sql`i.invoice_date <= ${dateTo}`);

  const res = await db.execute(sql`
    SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount::text AS total_amount, s.name AS supplier_name
    FROM invoices i
    JOIN suppliers s ON s.id = i.supplier_id
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY i.invoice_date DESC, i.id DESC
    LIMIT ${sql.raw(String(limit))}
  `);
  if (res.rows.length === 0) return { invoices: [], message: "Brak faktur spełniających kryteria." };
  return { invoices: res.rows };
}

// ─── get_invoice_detail / compare_invoices ─────────────────────────────────────

type InvItem = { name: string; qty: string; unit: string; unit_price: string; total: string };
type InvRow = { id: number; invoice_number: string; invoice_date: string; total_amount: string; supplier_name: string; items: InvItem[] };

async function fetchInvoiceWithItems(userId: string, invoiceId: number): Promise<InvRow | null> {
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
    WHERE i.id = ${invoiceId} AND i.user_id = ${userId}
    GROUP BY i.id, i.invoice_number, i.invoice_date, i.total_amount, s.name
  `);
  const row = res.rows[0] as InvRow | undefined;
  if (!row) return null;
  return { ...row, items: typeof row.items === "string" ? (JSON.parse(row.items) as InvItem[]) : row.items };
}

async function toolInvoiceDetail(userId: string, args: Record<string, unknown>) {
  const invoiceId = asInt(args.invoice_id);
  if (!invoiceId) return { error: "Podaj invoice_id (liczba, użyj search_invoices, aby go znaleźć)." };
  const invoice = await fetchInvoiceWithItems(userId, invoiceId);
  if (!invoice) return { error: "Faktura nie znaleziona (nieprawidłowe invoice_id)." };
  return { invoice };
}

async function toolCompareInvoices(userId: string, args: Record<string, unknown>) {
  const invoiceIdA = asInt(args.invoice_id_a);
  const invoiceIdB = asInt(args.invoice_id_b);
  if (!invoiceIdA || !invoiceIdB) return { error: "Podaj invoice_id_a i invoice_id_b (użyj search_invoices, aby je znaleźć)." };

  const [invoiceA, invoiceB] = await Promise.all([
    fetchInvoiceWithItems(userId, invoiceIdA),
    fetchInvoiceWithItems(userId, invoiceIdB),
  ]);
  if (!invoiceA || !invoiceB) return { error: "Jedna lub obie faktury nie zostały znalezione." };
  return { invoiceA, invoiceB };
}

// ─── get_spend_summary ──────────────────────────────────────────────────────────
// Bazuje na dawnym buildChatContext, ale z opcjonalnym zakresem dat (model może
// poprosić o inny okres niż domyślne 90 dni) — to zdejmuje główne ograniczenie
// starego kodu (zawsze sztywne 90 dni, zero elastyczności).

export async function toolSpendSummary(userId: string, args: Record<string, unknown>) {
  const sinceStr = asDateStr(args.date_from) ?? daysAgo(90);
  const untilStr = asDateStr(args.date_to);
  const untilCond = untilStr ? sql`AND i.invoice_date <= ${untilStr}` : sql``;

  const [spendRes, topProductsRes, monthlyRes, categoryRes, costCenterRes, supplierDetailRes] = await Promise.allSettled([
    db.execute(sql`
      SELECT s.id AS supplier_id, s.name AS supplier_name,
        ROUND(SUM(${spendOnly("i", moneyExpr)}), 0) AS total_spend,
        ROUND(SUM(${realQuantityOnly("ii", sql`ii.quantity::numeric`)}), 2) AS total_qty,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} ${untilCond} AND s.is_active = true
      GROUP BY s.id, s.name ORDER BY total_spend DESC LIMIT 8
    `),
    db.execute(sql`
      SELECT
        p.id AS product_id, p.name AS product_name, p.category, p.subcategory,
        s.id AS supplier_id, s.name AS supplier_name,
        ROUND(MIN(ii.unit_price::numeric), 2) AS min_price,
        ROUND(MAX(ii.unit_price::numeric), 2) AS max_price,
        ROUND(SUM(${spendOnly("i", moneyExpr)}), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        ii.unit,
        COUNT(DISTINCT i.id) AS purchase_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} ${untilCond}
      GROUP BY p.id, p.name, p.category, p.subcategory, s.id, s.name, ii.unit
      ORDER BY total_spend DESC LIMIT 25
    `),
    db.execute(sql`
      SELECT SUBSTRING(i.invoice_date, 1, 7) AS month, ROUND(SUM(ii.total_price::numeric), 0) AS total
      FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId}
        ${notSpendDistorting}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 6
    `),
    db.execute(sql`
      SELECT COALESCE(p.category, 'Bez kategorii') AS category,
        ROUND(SUM(${spendOnly("i", moneyExpr)}), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        COUNT(DISTINCT p.id) AS product_count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} ${untilCond} AND i.excluded = false
      GROUP BY 1 ORDER BY total_spend DESC LIMIT 15
    `),
    db.execute(sql`
      SELECT COALESCE(cc.name, 'Bez centrum kosztów') AS cost_center,
        ROUND(SUM(ii.total_price::numeric), 0) AS total_spend,
        COUNT(DISTINCT i.id) AS invoice_count
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} ${untilCond} AND i.excluded = false
        ${notSpendDistorting}
      GROUP BY 1 ORDER BY total_spend DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT s.id AS supplier_id, s.name AS supplier_name,
        ROUND(SUM(${spendOnly("i", moneyExpr)}), 0) AS total_spend,
        ROUND(SUM(ii.quantity::numeric), 2) AS total_qty,
        COUNT(DISTINCT p.id) AS unique_products,
        COUNT(DISTINCT i.id) AS invoice_count,
        ROUND(AVG(ii.unit_price::numeric), 2) AS avg_unit_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      JOIN products p ON ii.product_id = p.id
      WHERE i.user_id = ${userId} AND i.invoice_date >= ${sinceStr} ${untilCond}
        AND s.is_active = true AND i.excluded = false
      GROUP BY s.id, s.name
      ORDER BY total_spend DESC LIMIT 10
    `),
  ]);

  const rowsOf = <T>(r: PromiseSettledResult<{ rows: unknown[] }>): T[] => (r.status === "fulfilled" ? (r.value.rows as T[]) : []);

  return {
    period: { from: sinceStr, to: untilStr ?? "dziś" },
    suppliers: rowsOf(spendRes),
    products: rowsOf(topProductsRes),
    monthly: rowsOf(monthlyRes),
    categories: rowsOf(categoryRes),
    costCenters: rowsOf(costCenterRes),
    supplierComparison: rowsOf(supplierDetailRes),
  };
}

// ─── Dispatcher + tool schemas ──────────────────────────────────────────────────

export async function executeToolCall(name: string, rawArgs: unknown, userId: string): Promise<string> {
  const args = asObject(rawArgs);
  try {
    switch (name) {
      case "search_products": return JSON.stringify(await toolSearchProducts(userId, args));
      case "search_suppliers": return JSON.stringify(await toolSearchSuppliers(userId, args));
      case "get_product_price_history": return JSON.stringify(await toolProductPriceHistory(userId, args));
      case "get_cheapest_supplier_for_product": return JSON.stringify(await toolCheapestSupplierForProduct(userId, args));
      case "get_products_by_supplier": return JSON.stringify(await toolProductsBySupplier(userId, args));
      case "get_supplier_price_changes": return JSON.stringify(await toolSupplierPriceChanges(userId, args));
      case "get_price_increases": return JSON.stringify(await toolPriceIncreases(userId, args));
      case "get_quantity_anomalies": return JSON.stringify(await toolQuantityAnomalies(userId, args));
      case "get_price_anomalies": return JSON.stringify(await toolPriceAnomalies(userId, args));
      case "get_price_alerts": return JSON.stringify(await toolPriceAlerts(userId));
      case "get_dish_margins": return JSON.stringify(await toolDishMargins(userId));
      case "search_invoices": return JSON.stringify(await toolSearchInvoices(userId, args));
      case "get_invoice_detail": return JSON.stringify(await toolInvoiceDetail(userId, args));
      case "compare_invoices": return JSON.stringify(await toolCompareInvoices(userId, args));
      case "get_spend_summary": return JSON.stringify(await toolSpendSummary(userId, args));
      default: return JSON.stringify({ error: `Nieznane narzędzie: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Błąd wykonania narzędzia." });
  }
}

export const AI_CFO_TOOL_SCHEMAS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Znajdź produkty użytkownika po fragmencie nazwy (dopasowanie rozmyte, tolerancyjne na odmianę/literówki). Zwraca listę {id, name, category} — użyj ID w innych narzędziach.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Fragment nazwy produktu, np. 'cytryna', 'masło'." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_suppliers",
      description: "Znajdź dostawców użytkownika po fragmencie nazwy ALBO po numerze NIP (częste pytanie przy fakturach KSeF). Zwraca listę {id, name, taxId} — użyj id w search_invoices.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Fragment nazwy dostawcy lub NIP (ciąg cyfr)." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_price_history",
      description: "Historia ceny jednostkowej KONKRETNEGO produktu, faktura po fakturze, od najnowszej. Wymaga product_id z search_products.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "integer", description: "ID produktu z search_products." },
          limit: { type: "integer", description: "Liczba ostatnich zakupów (2-24, domyślnie 12)." },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cheapest_supplier_for_product",
      description: "Porównanie dostawców dla JEDNEGO produktu wg średniej/minimalnej ceny jednostkowej — do pytań 'gdzie kupić X najtaniej'.",
      parameters: {
        type: "object",
        properties: { product_id: { type: "integer", description: "ID produktu z search_products." } },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_products_by_supplier",
      description: "Lista WSZYSTKICH produktów kupowanych od jednego lub kilku dostawców, z zakresem cen (min/max/śr.) — użyj do pytań 'co kupuję u X', 'jak zachowują się ceny u X', 'które produkty u X zmieniły cenę'. NIE używaj search_products do szukania po nazwie DOSTAWCY — najpierw search_suppliers, potem to narzędzie z jego/ich ID (gdy wynik wyszukiwania dostawcy jest dwuznaczny — kilka firm — podaj WSZYSTKIE pasujące ID naraz w supplier_ids).",
      parameters: {
        type: "object",
        properties: {
          supplier_ids: { type: "array", items: { type: "integer" }, description: "ID dostawców z search_suppliers (1-10)." },
          only_price_changed: { type: "boolean", description: "true = pokaż tylko produkty, których cena jednostkowa różniła się między zakupami (pomiń te o stałej cenie)." },
        },
        required: ["supplier_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_supplier_price_changes",
      description: "Zmiana cen W ROZBICIU NA DOSTAWCĘ na stałym koszyku produktów (czysty efekt cenowy, bez wpływu zmiany wolumenu/asortymentu) — okno vs poprzednie okno tej samej długości.",
      parameters: {
        type: "object",
        properties: { window_days: { type: "integer", description: "Długość okna w dniach (7-180, domyślnie 30)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_price_increases",
      description: "Produkty z największą podwyżką ceny jednostkowej (ostatni zakup vs poprzedni), globalnie, bez wskazania konkretnego produktu.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", description: "Liczba wyników (1-30, domyślnie 10)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quantity_anomalies",
      description: "Produkty, których OSTATNIA zakupiona ilość mocno odbiega od własnej historii (np. nagle dużo więcej/mniej niż zwykle) — do pytań 'czy jakieś zamówienie wygląda dziwnie', 'anomalie ilościowe', 'czy nie kupiliśmy przypadkiem za dużo/za mało'. Wymaga min. 3 wcześniejszych zakupów danego produktu, żeby było z czym porównać.",
      parameters: {
        type: "object",
        properties: { threshold_pct: { type: "integer", description: "Próg odchylenia w % od średniej historycznej (20-200, domyślnie 50)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_price_anomalies",
      description: "Produkty, których OSTATNIA cena jednostkowa mocno odbiega od własnej historii — porównanie ZAWSZE w tej samej jednostce (kg z kg, szt z szt, nigdy między nimi). Do pytań 'anomalie cenowe', 'czy jakaś cena wygląda podejrzanie'. Wymaga min. 3 wcześniejszych zakupów w tej samej jednostce.",
      parameters: {
        type: "object",
        properties: { threshold_pct: { type: "integer", description: "Próg odchylenia w % od średniej historycznej (10-200, domyślnie 30)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_price_alerts",
      description: "Aktywne alerty cenowe (produkty, które przekroczyły ustawiony próg zmiany ceny).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dish_margins",
      description: "Marże dań z modułu Food cost (cena sprzedaży, koszt porcji, marża %), od najniższej marży.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_invoices",
      description: "Wyszukaj/wylistuj faktury użytkownika po dostawcy, numerze i/lub zakresie dat — np. 'faktury od Makro w marcu'. Gdy pytanie zawiera NIP, najpierw użyj search_suppliers, aby dostać supplier_id (precyzyjniejsze niż dopasowanie po nazwie).",
      parameters: {
        type: "object",
        properties: {
          supplier_id: { type: "integer", description: "ID dostawcy z search_suppliers — preferowane, gdy je znasz." },
          supplier_name: { type: "string", description: "Fragment nazwy dostawcy (użyj, gdy nie masz supplier_id)." },
          invoice_number: { type: "string", description: "Fragment numeru faktury." },
          date_from: { type: "string", description: "Data od, format YYYY-MM-DD." },
          date_to: { type: "string", description: "Data do, format YYYY-MM-DD." },
          limit: { type: "integer", description: "Liczba wyników (1-50, domyślnie 20)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_detail",
      description: "Pełne pozycje jednej faktury (produkty, ilości, ceny). Wymaga invoice_id z search_invoices.",
      parameters: {
        type: "object",
        properties: { invoice_id: { type: "integer", description: "ID faktury z search_invoices." } },
        required: ["invoice_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_invoices",
      description: "Porównanie DWÓCH faktur pozycja po pozycji. Najpierw użyj search_invoices/get_invoice_detail, aby ustalić ID obu faktur.",
      parameters: {
        type: "object",
        properties: {
          invoice_id_a: { type: "integer", description: "ID pierwszej faktury." },
          invoice_id_b: { type: "integer", description: "ID drugiej faktury." },
        },
        required: ["invoice_id_a", "invoice_id_b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spend_summary",
      description: "Ogólne podsumowanie wydatków: top dostawcy, top produkty, wydatki miesięczne, kategorie, centra kosztów. Domyślnie ostatnie 90 dni — podaj date_from/date_to dla innego zakresu.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Data od, format YYYY-MM-DD (domyślnie 90 dni temu)." },
          date_to: { type: "string", description: "Data do, format YYYY-MM-DD (domyślnie dziś)." },
        },
      },
    },
  },
];
