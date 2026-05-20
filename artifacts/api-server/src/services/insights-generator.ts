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
  consecutiveWeeksUp: number;
}

interface InsightRaw {
  type: "price_spike" | "price_trend" | "supplier_pattern" | "cost_forecast" | "weekly_trend" | "record_high";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  body: string;
  riskScore: number;
  productId?: number | null;
  supplierId?: number | null;
  metadata?: Record<string, unknown>;
}

function computeConsecutiveWeeksUp(prices: { date: string; price: number }[]): number {
  if (prices.length < 2) return 0;
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const weeklyMap = new Map<string, number>();
  for (const p of sorted) {
    const d = new Date(p.date);
    const year = d.getFullYear();
    const week = Math.floor((d.getTime() - new Date(year, 0, 1).getTime()) / (7 * 86400000));
    const key = `${year}-${week}`;
    weeklyMap.set(key, p.price);
  }
  const weekly = Array.from(weeklyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let consecutive = 0;
  for (let i = weekly.length - 1; i > 0; i--) {
    if (weekly[i][1] > weekly[i - 1][1]) consecutive++;
    else break;
  }
  return consecutive;
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
    const maxPrice90d = Math.max(...allPrices);
    const minPrice90d = Math.min(...allPrices);
    const consecutiveWeeksUp = computeConsecutiveWeeksUp(prices);

    trends.push({
      productId: rows[0].productId,
      productName: rows[0].productName,
      supplierId: rows[0].supplierId,
      supplierName: rows[0].supplierName,
      prices,
      currentPrice: current,
      previousPrice: previous,
      changePercent,
      maxPrice90d,
      minPrice90d,
      consecutiveWeeksUp,
    });
  }

  return trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

function buildPrompt(trends: ProductTrend[]): string {
  const spikes = trends.filter((t) => t.changePercent > 5).slice(0, 8);
  const drops = trends.filter((t) => t.changePercent < -5).slice(0, 4);
  const recordHighs = trends.filter((t) => t.currentPrice >= t.maxPrice90d * 0.99 && t.changePercent > 0).slice(0, 4);

  const fmt = (t: ProductTrend) =>
    `${t.productName} | ${t.supplierName} | ${t.previousPrice.toFixed(2)}->${t.currentPrice.toFixed(2)} PLN (${t.changePercent > 0 ? "+" : ""}${t.changePercent.toFixed(1)}%)`;

  const lines: string[] = [];
  if (spikes.length) lines.push("PODWYZKI:\n" + spikes.map(fmt).join("\n"));
  if (drops.length) lines.push("OBNIZKI:\n" + drops.map(fmt).join("\n"));
  if (recordHighs.length) lines.push("REKORDY:\n" + recordHighs.map(fmt).join("\n"));

  return `Dane cenowe restauracji (90 dni):
${lines.join("\n\n")}

Wygeneruj do 6 insightów biznesowych po polsku. Odpowiedz TYLKO jako JSON array (bez żadnego tekstu przed/po):
[{"type":"price_spike","severity":"high","title":"Krótki nagłówek max 60 zn","body":"Kontekst z liczbami max 120 zn","riskScore":75,"productName":"nazwa","supplierName":"nazwa"}]

severity: low/medium/high/critical. riskScore: 0-100. type: price_spike/price_trend/record_high/supplier_pattern.`;
}

async function callAI(prompt: string, logger?: Logger): Promise<InsightRaw[]> {
  logger?.info({ promptLen: prompt.length }, "AI CFO calling model");

  const resp = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 10000,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const choice = resp.choices[0];
  const text = (choice?.message?.content ?? "").trim();
  logger?.info({
    finishReason: choice?.finish_reason,
    aiResponseLen: text.length,
    aiResponsePreview: text.slice(0, 300),
    usageTotal: resp.usage?.total_tokens,
    usageReasoning: (resp.usage as Record<string, unknown>)?.completion_tokens_details,
  }, "AI CFO raw response");

  if (!text) {
    logger?.warn("AI CFO returned empty response");
    return [];
  }

  try {
    let raw: Array<Record<string, unknown>> = [];

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    const parsed: unknown = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      raw = parsed as Array<Record<string, unknown>>;
    } else if (parsed && typeof parsed === "object") {
      // Wrapped: {"insights": [...]} or similar
      const obj = parsed as Record<string, unknown>;
      const arr = obj["insights"] ?? obj["data"] ?? obj["results"] ?? Object.values(obj)[0];
      if (Array.isArray(arr)) raw = arr as Array<Record<string, unknown>>;
    }

    logger?.info({ count: raw.length }, "AI CFO parsed insights count");

    return raw
      .filter((r) => r.title && r.body)
      .map((r) => ({
        type: (r.type as InsightRaw["type"]) ?? "price_spike",
        severity: (r.severity as InsightRaw["severity"]) ?? "medium",
        title: String(r.title).slice(0, 120),
        body: String(r.body).slice(0, 240),
        riskScore: Math.min(100, Math.max(0, Number(r.riskScore ?? 50))),
        productId: null,
        supplierId: null,
        metadata: { productName: r.productName ?? null, supplierName: r.supplierName ?? null },
      }));
  } catch (e) {
    logger?.warn({ err: String(e), rawText: text.slice(0, 500) }, "AI CFO JSON parse failed");
    return [];
  }
}

function matchIds(
  insight: InsightRaw & { metadata?: { productName?: unknown; supplierName?: unknown } },
  trends: ProductTrend[],
): { productId: number | null; supplierId: number | null } {
  const pName = String(insight.metadata?.productName ?? "").toLowerCase();
  const sName = String(insight.metadata?.supplierName ?? "").toLowerCase();

  const match = trends.find(
    (t) =>
      (pName && t.productName.toLowerCase().includes(pName)) ||
      (sName && t.supplierName.toLowerCase().includes(sName)),
  );

  return {
    productId: match?.productId ?? null,
    supplierId: match?.supplierId ?? null,
  };
}

export async function generateInsights(userId: string, logger?: Logger): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const data = await fetchPriceData(userId, since);
  if (data.length === 0) return 0;

  const trends = buildProductTrends(data);
  if (trends.length === 0) return 0;

  const prompt = buildPrompt(trends);
  const insights = await callAI(prompt, logger);
  if (insights.length === 0) return 0;

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 12);

  await db
    .delete(aiInsightsTable)
    .where(
      and(
        eq(aiInsightsTable.userId, userId),
        lt(aiInsightsTable.createdAt, cutoff),
      ),
    );

  const rows = insights.map((ins) => {
    const { productId, supplierId } = matchIds(ins, trends);
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
