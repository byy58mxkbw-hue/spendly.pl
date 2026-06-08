import { db } from "@workspace/db";
import { aiInsightsTable, invoiceItemsTable, invoicesTable, productsTable, suppliersTable } from "@workspace/db/schema";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sql, eq, and, desc, gte, lt } from "drizzle-orm";
import type { Logger } from "pino";

interface PriceDataRow {
  productId: number;
  productName: string;
  supplierId: number;
  supplierName: string;
  unitPrice: number;
  invoiceDate: string;
}

interface ProductTrend {
  productId: number;
  productName: string;
  supplierId: number;
  supplierName: string;
  prices: { date: string; price: number }[];
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  maxPrice90d: number;
  minPrice90d: number;
  totalSpend90d: number;
  purchaseCount: number;
}

interface SupplierSummary {
  supplierId: number;
  supplierName: string;
  totalSpend: number;
  invoiceCount: number;
  productCount: number;
  sharePercent: number;
}

interface MonthlyTrend {
  month: string;
  total: number;
}

interface InsightRaw {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  body: string;
  riskScore: number;
  productId?: number | null;
  supplierId?: number | null;
  metadata?: Record<string, unknown>;
}

async function fetchPriceData(userId: string, since: Date): Promise<PriceDataRow[]> {
  const rows = await db
    .select({
      productId: productsTable.id,
      productName: productsTable.name,
      supplierId: suppliersTable.id,
      supplierName: suppliersTable.name,
      unitPrice: invoiceItemsTable.unitPrice,
      invoiceDate: invoicesTable.invoiceDate,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(productsTable, eq(invoiceItemsTable.productId, productsTable.id))
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        gte(invoicesTable.invoiceDate, since.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(invoicesTable.invoiceDate);

  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    unitPrice: parseFloat(String(r.unitPrice ?? 0)),
    invoiceDate: r.invoiceDate,
  }));
}

async function fetchSupplierSummaries(userId: string, since: Date): Promise<SupplierSummary[]> {
  const result = await db.execute(sql`
    SELECT
      s.id as supplier_id,
      s.name as supplier_name,
      ROUND(SUM(ii.total_price)::numeric, 2) as total_spend,
      COUNT(DISTINCT i.id) as invoice_count,
      COUNT(DISTINCT ii.product_id) as product_count
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.user_id = ${userId}
      AND i.invoice_date >= ${since.toISOString().slice(0, 10)}
    GROUP BY s.id, s.name
    ORDER BY total_spend DESC
    LIMIT 10
  `);

  const rows = result.rows as Array<{
    supplier_id: number; supplier_name: string;
    total_spend: string; invoice_count: string; product_count: string;
  }>;

  const grandTotal = rows.reduce((s, r) => s + parseFloat(r.total_spend ?? "0"), 0);
  return rows.map((r) => ({
    supplierId: Number(r.supplier_id),
    supplierName: r.supplier_name,
    totalSpend: parseFloat(r.total_spend ?? "0"),
    invoiceCount: Number(r.invoice_count),
    productCount: Number(r.product_count),
    sharePercent: grandTotal > 0 ? Math.round((parseFloat(r.total_spend ?? "0") / grandTotal) * 100) : 0,
  }));
}

async function fetchMonthlyTrends(userId: string): Promise<MonthlyTrend[]> {
  const result = await db.execute(sql`
    SELECT
      SUBSTRING(i.invoice_date, 1, 7) as month,
      ROUND(SUM(ii.total_price)::numeric, 2) as total
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.user_id = ${userId}
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 6
  `);

  return (result.rows as Array<{ month: string; total: string }>).map((r) => ({
    month: r.month,
    total: parseFloat(r.total ?? "0"),
  }));
}

function buildProductTrends(data: PriceDataRow[]): ProductTrend[] {
  const map = new Map<string, PriceDataRow[]>();
  for (const row of data) {
    const key = `${row.productId}:${row.supplierId}`;
    const arr = map.get(key) ?? [];
    arr.push(row);
    map.set(key, arr);
  }

  const trends: ProductTrend[] = [];
  for (const rows of map.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    const prices = sorted.map((r) => ({ date: r.invoiceDate, price: r.unitPrice }));
    const current = prices[prices.length - 1].price;
    const previous = prices[prices.length - 2].price;
    const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const allPrices = prices.map((p) => p.price);
    const totalSpend90d = sorted.reduce((s, r) => s + r.unitPrice, 0);

    trends.push({
      productId: rows[0].productId,
      productName: rows[0].productName,
      supplierId: rows[0].supplierId,
      supplierName: rows[0].supplierName,
      prices,
      currentPrice: current,
      previousPrice: previous,
      changePercent,
      maxPrice90d: Math.max(...allPrices),
      minPrice90d: Math.min(...allPrices),
      totalSpend90d,
      purchaseCount: rows.length,
    });
  }

  return trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

function buildPrompt(
  trends: ProductTrend[],
  suppliers: SupplierSummary[],
  monthly: MonthlyTrend[],
): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  const month = today.getMonth() + 1;

  const spikes = trends.filter((t) => t.changePercent > 5).slice(0, 10);
  const drops = trends.filter((t) => t.changePercent < -5).slice(0, 6);
  const stable = trends.filter((t) => Math.abs(t.changePercent) <= 5).slice(0, 5);

  const avgMonthly = monthly.length > 0 ? monthly.reduce((s, m) => s + m.total, 0) / monthly.length : 0;

  const fmtTrend = (t: ProductTrend) =>
    `${t.productName} | ${t.supplierName} | ${t.previousPrice.toFixed(2)}->${t.currentPrice.toFixed(2)} PLN (${t.changePercent > 0 ? "+" : ""}${t.changePercent.toFixed(1)}%) | wydatki90d: ${t.totalSpend90d.toFixed(0)} PLN | ${t.purchaseCount}x zakupów`;

  const fmtSupplier = (s: SupplierSummary) =>
    `${s.supplierName}: ${s.totalSpend.toFixed(0)} PLN (${s.sharePercent}% budżetu, ${s.productCount} prod., ${s.invoiceCount} fakt.)`;

  const fmtMonthly = (m: MonthlyTrend) => `${m.month}: ${m.total.toFixed(0)} PLN`;

  const allProductNames = [...new Set(trends.map((t) => t.productName))].slice(0, 40).join(", ");

  const sections: string[] = [];

  sections.push(`DATA ANALIZY: ${dateStr} (miesiąc ${month}/12)`);
  sections.push(`ŚREDNI MIESIĘCZNY BUDŻET: ${avgMonthly.toFixed(0)} PLN`);

  sections.push(`MIESIĘCZNE WYDATKI (ostatnie 6 mies.):
${monthly.map(fmtMonthly).join("\n") || "(brak)"}`);

  sections.push(`TOP DOSTAWCY wg wydatków (90 dni):
${suppliers.map(fmtSupplier).join("\n") || "(brak)"}`);

  sections.push(`PRODUKTY Z PODWYŻKĄ (>5%):
${spikes.map(fmtTrend).join("\n") || "(brak)"}`);

  if (drops.length) {
    sections.push(`PRODUKTY Z OBNIŻKĄ (<-5%):
${drops.map(fmtTrend).join("\n")}`);
  }

  if (stable.length) {
    sections.push(`PRODUKTY STABILNE (przykłady):
${stable.map(fmtTrend).join("\n")}`);
  }

  sections.push(`WSZYSTKIE ŚLEDZONE PRODUKTY (próbka):
${allProductNames}`);

  return `Jesteś AI CFO (Chief Financial Officer) dla restauracji w Polsce. Analizujesz dane kosztowe z faktur KSeF i dostarczasz precyzyjne rekomendacje finansowe z szacunkami PLN.

=== DANE PANELU RESTAURACJI ===
${sections.join("\n\n")}

=== TWOJE ZADANIE ===
Wygeneruj 8-12 insightów biznesowych. MUSISZ pokryć różne kategorie:

1. BIEŻĄCE ALERTY CENOWE — co drożeje/tanieje w tym momencie na podstawie faktur. Oblicz realny wpływ finansowy w PLN/miesiąc na podstawie totalSpend90d.
2. SEZONOWOŚĆ — wiedząc że dzisiaj jest ${dateStr} (miesiąc ${month}), które produkty z listy wejdą w sezon lub wyjdą z sezonu w ciągu najbliższych 4-8 tygodni? Co podrożeje przez sezon?
3. TRENDY GLOBALNE I RYNKOWE — na podstawie swojej aktualnej wiedzy o rynkach: co się dzieje z cenami mięsa, olejów, zbóż, nabiału, ryb w Polsce i Europie w ${dateStr}?
4. RYZYKO KONCENTRACJI DOSTAWCÓW — czy restauracja jest zbyt uzależniona od jednego dostawcy? Wylicz ryzyko finansowe.
5. REKOMENDACJE OSZCZĘDNOŚCI — konkretne działania: negocjować, zmienić dostawcę, zrobić zapasy przed podwyżką. Szacuj ile PLN/miesiąc można zaoszczędzić.

Dla KAŻDEGO insightu oblicz estimatedImpact w PLN/miesiąc:
- Ujemna liczba = koszt/strata (np. -1240 = tracisz 1240 zł/mies z powodu podwyżki)
- Dodatnia liczba = potencjalna oszczędność (np. +940 = możesz zaoszczędzić 940 zł/mies)

Każdy insight = jedna konkretna, actionable obserwacja z liczbami lub datami. Brak ogólników.

Odpowiedz TYLKO jako JSON array (bez żadnego tekstu przed/po nawiasem):
[{"type":"TYP","severity":"POZIOM","title":"Tytuł max 70 zn","body":"Treść max 200 zn z konkretnymi liczbami/datami","riskScore":75,"estimatedImpact":-1240,"category":"risk","productName":"nazwa lub null","supplierName":"nazwa lub null"}]

Dostępne typy: price_spike | price_drop | seasonal | market_outlook | supplier_risk | action_required | cost_forecast | record_high
severity: low | medium | high | critical
category: risk | opportunity | warning | info
estimatedImpact: liczba PLN/miesiąc (ujemna=strata, dodatnia=oszczędność, 0=neutralna)
riskScore: 0-100 (100=krytyczne ryzyko dla food cost)`;
}

async function callAI(prompt: string, logger?: Logger): Promise<InsightRaw[]> {
  logger?.info({ promptLen: prompt.length }, "AI CFO calling model");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 12000,
    messages: [{ role: "user", content: prompt }],
  });

  const choice = resp.choices[0];
  const text = (choice?.message?.content ?? "").trim();
  logger?.info({
    finishReason: choice?.finish_reason,
    aiResponseLen: text.length,
    aiResponsePreview: text.slice(0, 400),
    reasoning: (resp.usage as unknown as Record<string, unknown>)?.completion_tokens_details,
  }, "AI CFO raw response");

  if (!text) {
    logger?.warn("AI CFO returned empty response");
    return [];
  }

  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    let raw: Array<Record<string, unknown>> = [];

    if (Array.isArray(parsed)) {
      raw = parsed as Array<Record<string, unknown>>;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const arr = obj["insights"] ?? obj["data"] ?? obj["results"] ?? Object.values(obj)[0];
      if (Array.isArray(arr)) raw = arr as Array<Record<string, unknown>>;
    }

    logger?.info({ count: raw.length }, "AI CFO parsed insights count");

    return raw
      .filter((r) => r.title && r.body)
      .map((r) => ({
        type: String(r.type ?? "price_spike"),
        severity: (r.severity as InsightRaw["severity"]) ?? "medium",
        title: String(r.title).slice(0, 120),
        body: String(r.body).slice(0, 280),
        riskScore: Math.min(100, Math.max(0, Number(r.riskScore ?? 50))),
        productId: null,
        supplierId: null,
        metadata: {
          productName: r.productName ?? null,
          supplierName: r.supplierName ?? null,
          estimatedImpact: typeof r.estimatedImpact === "number" ? r.estimatedImpact : null,
          category: r.category ?? null,
        },
      }));
  } catch (e) {
    logger?.warn({ err: String(e), rawText: text.slice(0, 600) }, "AI CFO JSON parse failed");
    return [];
  }
}

function matchIds(
  insight: InsightRaw & { metadata?: { productName?: unknown; supplierName?: unknown } },
  trends: ProductTrend[],
  suppliers: SupplierSummary[],
): { productId: number | null; supplierId: number | null } {
  const pName = String(insight.metadata?.productName ?? "").toLowerCase();
  const sName = String(insight.metadata?.supplierName ?? "").toLowerCase();

  const trendMatch = trends.find(
    (t) =>
      (pName.length > 2 && t.productName.toLowerCase().includes(pName)) ||
      (sName.length > 2 && t.supplierName.toLowerCase().includes(sName)),
  );
  if (trendMatch) return { productId: trendMatch.productId, supplierId: trendMatch.supplierId };

  const supplierMatch = sName.length > 2
    ? suppliers.find((s) => s.supplierName.toLowerCase().includes(sName))
    : undefined;

  return {
    productId: null,
    supplierId: supplierMatch?.supplierId ?? null,
  };
}

export async function generateInsights(userId: string, logger?: Logger): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [data, suppliers, monthly] = await Promise.all([
    fetchPriceData(userId, since),
    fetchSupplierSummaries(userId, since),
    fetchMonthlyTrends(userId),
  ]);

  if (data.length === 0) return 0;

  const trends = buildProductTrends(data);
  if (trends.length === 0 && suppliers.length === 0) return 0;

  const prompt = buildPrompt(trends, suppliers, monthly);
  const insights = await callAI(prompt, logger);
  if (insights.length === 0) return 0;

  await db.delete(aiInsightsTable).where(eq(aiInsightsTable.userId, userId));

  const rows = insights.map((ins) => {
    const { productId, supplierId } = matchIds(ins, trends, suppliers);
    return {
      userId,
      type: ins.type,
      severity: ins.severity,
      title: ins.title,
      body: ins.body,
      riskScore: ins.riskScore,
      productId,
      supplierId,
      metadata: ins.metadata ?? null,
    };
  });

  await db.insert(aiInsightsTable).values(rows);
  return rows.length;
}
