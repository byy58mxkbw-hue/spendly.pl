import { Router, type IRouter } from "express";
import { db, posSalesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { toNum } from "../lib/parse";
import { periodFromQuery, previousPeriod, monthsInRange } from "../lib/period";

// Sprzedaż per pozycja menu z POS (pos_sales) dla wybranego okresu, z porównaniem
// do poprzedniego równego okresu — zasila podstronę „Sprzedaż" (ile sztuk czego,
// vs poprzedni miesiąc). Źródło danych wypełnia sync GoPOS (na razie tabela pusta,
// dopóki nie podłączymy API — endpoint zwraca wtedy pustą listę).
const router: IRouter = Router();

router.get("/sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const prev = previousPeriod(period);

  async function aggregate(periods: string[]): Promise<Map<string, { qty: number; net: number }>> {
    if (periods.length === 0) return new Map();
    const rows = await db
      .select({
        productName: posSalesTable.productName,
        qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
        net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
      })
      .from(posSalesTable)
      .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
      .groupBy(posSalesTable.productName);
    return new Map(rows.map((r) => [r.productName, { qty: toNum(r.qty), net: toNum(r.net) }]));
  }

  const [cur, prv] = await Promise.all([aggregate(monthsInRange(period)), aggregate(monthsInRange(prev))]);

  const names = new Set<string>([...cur.keys(), ...prv.keys()]);
  const items = [...names]
    .map((productName) => {
      const c = cur.get(productName) ?? { qty: 0, net: 0 };
      const p = prv.get(productName);
      const qtyChangePct = p && p.qty > 0 ? Math.round(((c.qty - p.qty) / p.qty) * 1000) / 10 : null;
      return { productName, qty: c.qty, netValue: c.net, prevQty: p?.qty ?? null, qtyChangePct };
    })
    .sort((a, b) => b.qty - a.qty);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalNet = items.reduce((s, i) => s + i.netValue, 0);
  res.json({ from: period.from, to: period.to, totalQty, totalNet, items });
});

export default router;
