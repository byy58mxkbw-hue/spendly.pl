import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireOpenAI } from "@workspace/integrations-openai-ai-server";
import { PostAiCfoChatBody } from "@workspace/api-zod";
import { AI_MONTHLY_LIMIT, normalizePlan, currentPeriod } from "../lib/ai-plan.js";
import { computeTriggeredAlerts } from "../services/alert-checker.js";
import { computeAllDishMargins } from "./food-cost.js";

const router: IRouter = Router();

// Zużycie AI bieżącego użytkownika w tym miesiącu (wspólna pula: czat + OCR).
// Do wyświetlenia licznika „X / Y" w UI. Sam endpoint nie jest limitowany.
router.get("/ai-cfo/usage", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const plan = normalizePlan(req.plan);
  const limit = AI_MONTHLY_LIMIT[plan];
  const period = currentPeriod();
  const r = await db.execute(
    sql`SELECT count FROM ai_usage WHERE user_id = ${userId} AND period = ${period}`,
  );
  const used = Number((r.rows[0] as { count: number } | undefined)?.count ?? 0);
  res.json({
    plan,
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    period,
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPln(n: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(Math.abs(n));
}

function since90Days(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

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

// Wspólny resolver: znajdź produkt użytkownika po nazwie z pytania. Tolerancja polskiej
// odmiany — dopasowanie 5-znakowego prefiksu tokenu na POCZĄTKU słowa w nazwie
// („cytryny"→„cytry"→„CYTRYNA…"; „chodz" NIE trafia w „poCHODZenia"). Zwraca null gdy brak.
async function resolveProductFromQuestion(
  userId: string,
  question: string,
): Promise<{ id: number; name: string } | null> {
  const lowerQ = question.toLowerCase();
  const STOP = new Set([
    "ostatnich", "ostatnie", "ostatniej", "faktur", "faktury", "fakturach", "fakturze",
    "porównanie", "porównaj", "porówna", "jednostkowa", "jednostkowej", "jednostkowe",
    "dostawcy", "dostawca", "dostawców", "produkt", "produktu", "produkty", "miesiąc",
    "miesiąca", "miesięcy", "wszystkie", "pokaż", "podaj", "zestawienie", "najtaniej",
    "najtańszy", "najtańszego", "najlepsza", "najlepszej", "kupić", "kupię", "gdzie",
    // Wypełniacze/fraza „chodzi mi o…" — inaczej „chodz" trafia w „poCHODZenia" z nazw.
    "chodzi", "właśnie", "znaczy", "między", "kwota", "kwoty",
  ]);
  const tokens = Array.from(new Set(
    lowerQ.split(/\s+/)
      .map((t) => t.replace(/[^a-ząćęłńóśźż0-9]/gi, ""))
      .filter((t) => t.length >= 5 && !STOP.has(t)),
  ));
  if (tokens.length === 0) return null;

  for (const t of tokens) {
    const pref = t.slice(0, 5); // po sanityzacji tylko [a-ząćęłńóśźż0-9] — bez metaznaków regex
    const res = await db.execute(sql`
      SELECT p.id, p.name, COUNT(ii.id)::int AS uses
      FROM products p
      LEFT JOIN invoice_items ii ON ii.product_id = p.id
      WHERE p.user_id = ${userId} AND lower(p.name) ~ ${"(^|[^a-ząćęłńóśźż])" + pref}
      GROUP BY p.id, p.name
      ORDER BY uses DESC, length(p.name) ASC
      LIMIT 1
    `);
    const row = res.rows[0] as { id: number; name: string } | undefined;
    if (row) return { id: row.id, name: row.name };
  }
  return null;
}

// „Gdzie kupię X najtaniej / u kogo taniej / oszczędności na X" — porównanie dostawców
// dla KONKRETNEGO produktu (śr./min cena jedn. per dostawca). Sedno wartości Spendly.
async function fetchCheapestSupplier(userId: string, question: string): Promise<string | null> {
  const lowerQ = question.toLowerCase();
  const hasIntent = [
    "najtaniej", "najtańsz", "gdzie kupić", "gdzie kupię", "u kogo", "gdzie najtaniej",
    "taniej kupić", "oszczęd", "najlepsza cena", "najlepszej cenie", "który dostawca tańsz",
  ].some((k) => lowerQ.includes(k));
  if (!hasIntent) return null;

  const product = await resolveProductFromQuestion(userId, question);
  if (!product) return null;

  const res = await db.execute(sql`
    SELECT s.name AS supplier,
      ROUND(AVG(ii.unit_price::numeric), 2)::text AS avg_price,
      ROUND(MIN(ii.unit_price::numeric), 2)::text AS min_price,
      COUNT(DISTINCT inv.id)::int AS purchases,
      MAX(inv.invoice_date) AS last_date
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    JOIN suppliers s ON inv.supplier_id = s.id
    WHERE ii.product_id = ${product.id} AND inv.user_id = ${userId} AND inv.excluded = false
      AND inv.parent_invoice_id IS NULL AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0 AND ii.unit_price::numeric > 0
    GROUP BY inv.supplier_id, s.name
    ORDER BY avg_price ASC
  `);
  const rows = res.rows as Array<{ supplier: string; avg_price: string; min_price: string; purchases: number; last_date: string }>;
  if (rows.length === 0) return null;

  const lines = rows.map(
    (r) => `  - ${r.supplier}: śr. ${parseFloat(r.avg_price).toFixed(2)} zł/jedn., min ${parseFloat(r.min_price).toFixed(2)} zł (${r.purchases} zak., ostatni ${r.last_date})`,
  );
  return `\nDANE: DOSTAWCY PRODUKTU WG CENY: ${product.name} [ID:${product.id}] (od najtańszego wg średniej ceny jedn.):\n${lines.join("\n")}`;
}

// Historia ceny jednostkowej KONKRETNEGO produktu w czasie (faktura po fakturze).
// Odpowiada na „cena/porównaj cenę/trend cytryny z ostatnich N faktur" — czego stary
// kod nie umiał (miał tylko porównanie DWÓCH całych faktur, stąd zmyślony widżet A/B).
async function fetchProductPriceHistory(userId: string, question: string): Promise<string | null> {
  const lowerQ = question.toLowerCase();

  // Intencja: pytanie o cenę / historię / trend produktu (bez wymogu słowa „porównaj").
  const hasPriceIntent = [
    "cena", "cenę", "ceny", "cenie", "kosztuje", "kosztował", "podroż", "potani",
    "drożej", "taniej", "historia cen", "historię cen", "trend", "po ile", "ile płac",
  ].some((k) => lowerQ.includes(k));
  if (!hasPriceIntent) return null;

  const product = await resolveProductFromQuestion(userId, question);
  if (!product) return null;

  // „ostatnich 5" / „5 faktur" → N; domyślnie 12, twardy zakres 2..24.
  const nMatch = lowerQ.match(/ostatnich?\s+(\d{1,2})|(\d{1,2})\s+faktur/);
  const limit = Math.min(24, Math.max(2, nMatch ? parseInt(nMatch[1] ?? nMatch[2], 10) : 12));

  const hist = await db.execute(sql`
    SELECT inv.invoice_date AS date,
           ii.unit_price::text AS price,
           inv.invoice_number AS invoice_number,
           s.name AS supplier_name
    FROM invoice_items ii
    JOIN invoices inv ON ii.invoice_id = inv.id
    JOIN suppliers s ON inv.supplier_id = s.id
    WHERE ii.product_id = ${product.id}
      AND inv.user_id = ${userId}
      AND inv.excluded = false
      AND inv.parent_invoice_id IS NULL
      AND (inv.invoice_type IS DISTINCT FROM 'KOR')
      AND ii.quantity::numeric > 0
      AND ii.unit_price::numeric > 0
    ORDER BY inv.invoice_date DESC, inv.id DESC
    LIMIT ${sql.raw(String(limit))}
  `);
  const rows = hist.rows as Array<{ date: string; price: string; invoice_number: string; supplier_name: string }>;
  if (rows.length === 0) return null;

  const lines = rows.map(
    (r) => `  - ${r.date} | ${r.invoice_number} | ${r.supplier_name} | ${parseFloat(r.price).toFixed(2)} zł/jedn.`,
  );
  return `\nDANE HISTORII CENY PRODUKTU: ${product.name} [ID:${product.id}] (ostatnie ${rows.length} zakupów, od najnowszych):\n${lines.join("\n")}`;
}

// „Co podrożało / największe podwyżki / co drożeje" — produkty z największym wzrostem
// ceny jednostkowej (ostatni zakup vs poprzedni). Globalne (bez konkretnego produktu).
// Wcześniej brak tych danych w kontekście → model by je zmyślał.
async function fetchPriceIncreases(userId: string, question: string): Promise<string | null> {
  const lowerQ = question.toLowerCase();
  const hasIntent = [
    "podrożał", "podrożec", "podwyżk", "drożej", "wzrost cen", "wzrosły ceny",
    "co zdrożało", "zdrożał", "rosną ceny", "największe podwyżki", "co poszło w górę",
  ].some((k) => lowerQ.includes(k));
  if (!hasIntent) return null;

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
    LIMIT 10
  `);
  const rows = res.rows as Array<{ name: string; latest: string; prev: string; change_pct: string }>;
  if (rows.length === 0) return null;

  const lines = rows.map(
    (r) => `  - ${r.name}: ${parseFloat(r.prev).toFixed(2)} → ${parseFloat(r.latest).toFixed(2)} zł/jedn. (+${r.change_pct}%)`,
  );
  return `\nDANE: NAJWIĘKSZE PODWYŻKI CEN (ostatni zakup vs poprzedni, od największej):\n${lines.join("\n")}`;
}

// „Jakie mam alerty / co przekroczyło próg" — aktywne alerty cenowe (przekroczone progi).
// Reużywa computeTriggeredAlerts (ten sam mechanizm co dashboard) — dane ugruntowane.
// Zwraca też jawny „brak alertów", żeby model nie zmyślał przy pustym wyniku.
async function fetchTriggeredAlerts(userId: string, question: string): Promise<string | null> {
  const lowerQ = question.toLowerCase();
  const hasIntent = [
    "alert", "alerty", "alertów", "próg", "progu", "progi", "przekroczył", "przekroczen",
    "monitoruj", "powiadomieni", "co się uruchomiło",
  ].some((k) => lowerQ.includes(k));
  if (!hasIntent) return null;

  const alerts = await computeTriggeredAlerts(userId);
  if (alerts.length === 0) {
    return "\nDANE: ALERTY CENOWE: brak aktywnych alertów — żaden monitorowany produkt nie przekroczył ustawionego progu.";
  }
  const lines = alerts.map(
    (a) => `  - ${a.productName}${a.supplierName ? ` (${a.supplierName})` : ""}: ${a.previousPrice.toFixed(2)} → ${a.currentPrice.toFixed(2)} zł/jedn. (+${a.changePercent.toFixed(1)}%, próg ${a.thresholdPercent}%)`,
  );
  return `\nDANE: AKTYWNE ALERTY CENOWE (przekroczony próg):\n${lines.join("\n")}`;
}

// „Food cost / marża dań — które dania mają najgorszą marżę" — reużywa computeAllDishMargins
// (ta sama kalkulacja co strona Food cost). Dane dań nie są w kontekście czatu → bez tego
// bloku model by zmyślał. Sortuje od najniższej marży.
async function fetchDishMargins(userId: string, question: string): Promise<string | null> {
  const lowerQ = question.toLowerCase();
  const hasIntent = [
    "food cost", "foodcost", "food-cost", "marża", "marże", "marży", "marżą", "rentown",
    "opłacaln", "które dania", "najgorsza marża", "najlepsza marża", "koszt dania", "koszt potrawy",
  ].some((k) => lowerQ.includes(k));
  if (!hasIntent) return null;

  const dishes = await computeAllDishMargins(userId);
  if (dishes.length === 0) {
    return "\nDANE: MARŻE DAŃ: brak zdefiniowanych dań (moduł Food cost jest pusty).";
  }
  const withMargin = dishes
    .filter((d) => d.marginPct != null)
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));
  if (withMargin.length === 0) {
    return "\nDANE: MARŻE DAŃ: dania istnieją, ale brak cen składników do wyliczenia marży.";
  }
  const lines = withMargin.slice(0, 12).map(
    (d) => `  - ${d.name}: cena ${d.sellPrice.toFixed(2)} zł, koszt porcji ${d.portionCost != null ? d.portionCost.toFixed(2) : "?"} zł, marża ${d.marginPct}% (pewność ${d.confidencePct}%)`,
  );
  return `\nDANE: MARŻE DAŃ (od najniższej marży):\n${lines.join("\n")}`;
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

router.post("/ai-cfo/chat", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsedBody = PostAiCfoChatBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Nieprawidłowe dane zapytania." });
    return;
  }
  const { question, history = [] } = parsedBody.data;

  if (question.trim().length === 0) {
    res.status(400).json({ error: "Brakuje pytania." });
    return;
  }

  const sinceStr = since90Days();
  const [context, cheapestBlock, productHistBlock, priceIncreasesBlock, alertsBlock, dishMarginsBlock, invoiceCompareRaw] = await Promise.all([
    buildChatContext(userId, sinceStr),
    fetchCheapestSupplier(userId, question.trim()),
    fetchProductPriceHistory(userId, question.trim()),
    fetchPriceIncreases(userId, question.trim()),
    fetchTriggeredAlerts(userId, question.trim()),
    fetchDishMargins(userId, question.trim()),
    fetchInvoiceCompareData(userId, question.trim()),
  ]);
  // Precedencja bloków: najtańszy dostawca > historia ceny > podwyżki > alerty > marże dań > porównanie faktur.
  // Wstrzykujemy DOKŁADNIE JEDEN blok, żeby model nie mieszał narzędzi ani nie zmyślał A/B.
  const dataBlock = cheapestBlock ?? productHistBlock ?? priceIncreasesBlock ?? alertsBlock ?? dishMarginsBlock ?? invoiceCompareRaw ?? "";

  const systemPrompt = `Jesteś AI CFO (Chief Financial Officer) dla restauracji w Polsce. Analizujesz dane kosztowe z faktur i dostarczasz precyzyjne rekomendacje finansowe.

${context}${dataBlock}

MOŻLIWOŚCI ANALIZY:
- Porównanie dostawców KWOTOWO: który dostawca generuje największe wydatki w PLN
- Porównanie dostawców ILOŚCIOWO: który dostawca dostarcza największe wolumeny (jednostki/kg)
- Analiza wg KATEGORII PRODUKTÓW: rozkład wydatków na Mięso, Nabiał, Warzywa itp.
- Analiza wg CENTRÓW KOSZTÓW: faktury przypisane do konkretnych obszarów restauracji
- Trendy miesięczne: jak zmieniają się wydatki miesiąc do miesiąca
- Raporty produktowe: które produkty kupujemy najczęściej i w największych ilościach

ZASADA NADRZĘDNA (anty-fabrykacja):
Używaj WYŁĄCZNIE liczb, faktur i pozycji obecnych w kontekście i blokach „DANE …".
NIGDY nie wymyślaj faktur, cen ani pozycji. Gdy brak danych do pytania — type: "general"
i napisz krótko, czego brakuje. NIE używaj type "invoice_comparison", jeśli w kontekście
NIE MA bloku „DANE FAKTUR DO PORÓWNANIA".

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

INSTRUKCJA DLA MARŻ DAŃ / FOOD COST (type: "cost_analysis"):
Gdy kontekst zawiera blok "DANE: MARŻE DAŃ":
- Użyj type: "cost_analysis"
- table.headers: ["Danie", "Cena", "Koszt porcji", "Marża %", "Pewność"]
- table.rows: KAŻDE danie z bloku (od najniższej marży). Wyłącznie liczby z bloku.
- summary: wskaż 2-3 dania z najniższą marżą (z %) i ryzyko rentowności, po polsku.
- recommendation: np. podnieść cenę lub obniżyć koszt składników w najmniej rentownych daniach.
- actions: [{"label":"Zobacz Food cost","href":"/food-cost"}]
Gdy blok mówi „brak…" — type: "general" i przekaż tę informację, bez tabeli.

INSTRUKCJA DLA ALERTÓW CENOWYCH (type: "product_analysis"):
Gdy kontekst zawiera blok "DANE: AKTYWNE ALERTY CENOWE":
- Użyj type: "product_analysis"
- table.headers: ["Produkt", "Dostawca", "Poprzednia", "Aktualna", "Zmiana %", "Próg"]
- table.rows: KAŻDY alert z bloku. Wyłącznie liczby z bloku.
- summary: ile alertów się uruchomiło i które produkty najmocniej przekroczyły próg.
- actions: [{"label":"Zobacz alerty cenowe","href":"/price-alerts"}]
Gdy blok mówi „brak aktywnych alertów" — type: "general", summary: brak przekroczeń progów, bez tabeli.

INSTRUKCJA DLA PODWYŻEK CEN (type: "product_analysis"):
Gdy kontekst zawiera blok "DANE: NAJWIĘKSZE PODWYŻKI CEN":
- Użyj type: "product_analysis"
- table.headers: ["Produkt", "Poprzednia", "Ostatnia", "Zmiana %"]
- table.rows: KAŻDY produkt z bloku (od największej podwyżki). Wyłącznie liczby z bloku.
- kpiCards: ["Produktów w górę", "Największa podwyżka", "Śr. wzrost"] — z danych bloku.
- summary: wskaż 2-3 produkty z największym wzrostem ceny jednostkowej (z %), po polsku.
- recommendation: np. sprawdzić alternatywnych dostawców dla najbardziej drożejących pozycji.
- actions: [{"label":"Zobacz alerty cenowe","href":"/price-alerts"}]

INSTRUKCJA DLA DOSTAWCÓW PRODUKTU WG CENY (type: "supplier_comparison"):
Gdy kontekst zawiera blok "DANE: DOSTAWCY PRODUKTU WG CENY":
- Użyj type: "supplier_comparison"
- table.headers: ["Dostawca", "Śr. cena jedn.", "Min", "Zakupy", "Ostatni zakup"]
- table.rows: KAŻDY dostawca z bloku (od najtańszego). Wyłącznie liczby z bloku.
- kpiCards: ["Najtańszy", "Najdroższy", "Różnica", "Potencjał oszczędności"] — różnicę i potencjał
  licz z danych bloku (najdroższa śr. − najtańsza śr.), bez wymyślania.
- summary: wskaż najtańszego dostawcę i o ile taniej od najdroższego (PLN i %), po polsku.
- recommendation: konkretna sugestia (np. „kupuj u {najtańszy} — oszczędność ~X zł/jedn.").
- actions: [{"label":"Zobacz produkt","href":"/products?id={ID z nagłówka bloku}"}]

INSTRUKCJA DLA HISTORII CENY PRODUKTU (type: "product_analysis"):
Gdy kontekst zawiera blok "DANE HISTORII CENY PRODUKTU":
- Użyj type: "product_analysis"
- table.headers: ["Data", "Faktura", "Dostawca", "Cena jedn.", "Zmiana %"]
- table.rows: KAŻDY zakup z bloku jako osobny wiersz (od najnowszego). "Zmiana %" liczona
  względem POPRZEDNIEGO (starszego) zakupu tego produktu: (cena_nowsza - cena_starsza)/cena_starsza*100;
  format "+X,X%" wzrost, "-X,X%" spadek, "0%" bez zmian, "—" dla najstarszego wiersza.
- kpiCards: ["Ostatnia cena", "Najniższa", "Najwyższa", "Trend"] — wyłącznie z liczb bloku.
- summary: ostatnia cena jednostkowa, zakres min–max i kierunek trendu (po polsku, z liczbami).
- actions: [{"label":"Zobacz produkt","href":"/products?id={ID z nagłówka bloku}"}]
- Używaj wyłącznie cen i faktur z bloku — nie dopisuj żadnych spoza niego.

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

  // Wywołanie AI w try/catch — brak klucza OpenAI lub błąd API ma dawać czytelny
  // komunikat 503 zamiast generycznego 500 z globalnego handlera.
  let raw = "";
  try {
    const resp = await requireOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 4000,
      messages,
    });
    raw = (resp.choices[0]?.message?.content ?? "").trim();
  } catch (err) {
    const notConfigured = err instanceof Error && err.message.includes("brak konfiguracji OpenAI");
    req.log.error({ err: String(err), notConfigured }, "ai-cfo chat OpenAI call failed");
    res.status(503).json({
      error: notConfigured
        ? "Asystent AI nie jest skonfigurowany na serwerze (brak klucza OpenAI)."
        : "Asystent AI jest chwilowo niedostępny. Spróbuj ponownie za chwilę.",
    });
    return;
  }

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

export default router;
