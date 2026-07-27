import { Router, type IRouter } from "express";
import { db, restaurantRevenueTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { toNum } from "../lib/parse";
import { periodFromQuery, previousPeriod, monthsInRange, type Period } from "../lib/period";

const router: IRouter = Router();

const PERIOD_RE = /^\d{4}-\d{2}$/;

// ─── Przychód: odczyt dla zakresu ───────────────────────────────────────────
router.get("/revenue", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const keys = monthsInRange(period);
  const rows = await db
    .select({ period: restaurantRevenueTable.period, amountNet: restaurantRevenueTable.amountNet })
    .from(restaurantRevenueTable)
    .where(and(eq(restaurantRevenueTable.userId, userId), inArray(restaurantRevenueTable.period, keys)));
  const byPeriod = new Map(rows.map((r) => [r.period, toNum(r.amountNet)]));
  // Zwróć wpis dla KAŻDEGO miesiąca zakresu (brak = 0), by front miał komplet do formularza.
  res.json(keys.map((period) => ({ period, amountNet: byPeriod.get(period) ?? 0 })));
});

// ─── Przychód: zapis (upsert) jednego miesiąca ──────────────────────────────
router.put("/revenue", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = String((req.body as { period?: unknown }).period ?? "");
  const amountRaw = (req.body as { amountNet?: unknown }).amountNet;
  if (!PERIOD_RE.test(period)) {
    res.status(400).json({ error: "period musi być w formacie YYYY-MM." });
    return;
  }
  const amountNet = Number(amountRaw);
  if (!Number.isFinite(amountNet) || amountNet < 0) {
    res.status(400).json({ error: "amountNet musi być liczbą ≥ 0." });
    return;
  }
  await db
    .insert(restaurantRevenueTable)
    .values({ userId, period, amountNet: amountNet.toFixed(2) })
    .onConflictDoUpdate({
      target: [restaurantRevenueTable.userId, restaurantRevenueTable.period],
      set: { amountNet: amountNet.toFixed(2), updatedAt: new Date() },
    });
  res.json({ period, amountNet });
});

// ─── Realny food cost % = koszt składników / przychód, per okres ────────────
router.get("/reports/food-cost-ratio", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const prev = previousPeriod(period);

  // Koszt składników (netto) per miesiąc w zakresie — suma invoice_items.total_price.
  async function spendByMonth(p: Period): Promise<Map<string, number>> {
    const rows = await db.execute<{ mo: string; spend: number }>(sql`
      SELECT substring(i.invoice_date, 1, 7) AS mo,
             COALESCE(SUM(ii.total_price::numeric), 0)::float AS spend
      FROM invoices i
      INNER JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.user_id = ${userId} AND i.excluded = false
        AND i.invoice_date >= ${p.from} AND i.invoice_date <= ${p.to}
      GROUP BY 1
    `);
    return new Map((rows.rows as { mo: string; spend: number }[]).map((r) => [r.mo, toNum(r.spend)]));
  }

  async function revenueByMonth(keys: string[]): Promise<Map<string, number>> {
    if (keys.length === 0) return new Map();
    const rows = await db
      .select({ period: restaurantRevenueTable.period, amountNet: restaurantRevenueTable.amountNet })
      .from(restaurantRevenueTable)
      .where(and(eq(restaurantRevenueTable.userId, userId), inArray(restaurantRevenueTable.period, keys)));
    return new Map(rows.map((r) => [r.period, toNum(r.amountNet)]));
  }

  const keys = monthsInRange(period);
  const [spendCur, revCur] = await Promise.all([spendByMonth(period), revenueByMonth(keys)]);

  const months = keys.map((month) => {
    const spend = spendCur.get(month) ?? 0;
    const revenue = revCur.get(month) ?? 0;
    const foodCostPct = revenue > 0 ? Math.round((spend / revenue) * 1000) / 10 : null;
    return { month, spend, revenue, foodCostPct };
  });

  const totalSpend = months.reduce((s, m) => s + m.spend, 0);
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const foodCostPct = totalRevenue > 0 ? Math.round((totalSpend / totalRevenue) * 1000) / 10 : null;

  // Poprzedni równy okres — do porównania.
  const prevKeys = monthsInRange(prev);
  const [spendPrev, revPrev] = await Promise.all([spendByMonth(prev), revenueByMonth(prevKeys)]);
  const prevTotalSpend = prevKeys.reduce((s, k) => s + (spendPrev.get(k) ?? 0), 0);
  const prevTotalRevenue = prevKeys.reduce((s, k) => s + (revPrev.get(k) ?? 0), 0);
  const prevFoodCostPct = prevTotalRevenue > 0 ? Math.round((prevTotalSpend / prevTotalRevenue) * 1000) / 10 : null;

  res.json({
    from: period.from,
    to: period.to,
    totalSpend,
    totalRevenue,
    foodCostPct,
    prevFoodCostPct,
    months,
  });
});

export default router;
