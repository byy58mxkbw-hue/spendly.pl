import { Router, type IRouter } from "express";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import {
  db,
  suppliersTable,
  invoicesTable,
  invoiceItemsTable,
  productsTable,
  priceAlertsTable,
  alertDismissalsTable,
} from "@workspace/db";
import { GetFoodCostMonthlyQueryParams, GetRecentPurchasesQueryParams, GetDashboardSummaryQueryParams } from "@workspace/api-zod";
import { toNum } from "../lib/parse";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const days = queryParams.data.days;

  const now = new Date();

  // Period boundaries — either last N days or calendar month
  let periodStart: string;
  let prevPeriodStart: string;
  let prevPeriodEnd: string;

  if (days) {
    const start = new Date(now.getTime() - days * 86400000);
    const prevStart = new Date(start.getTime() - days * 86400000);
    periodStart = start.toISOString().split("T")[0];
    prevPeriodStart = prevStart.toISOString().split("T")[0];
    prevPeriodEnd = start.toISOString().split("T")[0];
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    prevPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
    prevPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
  }

  const [supplierStats] = await db
    .select({
      totalSuppliers: sql<number>`count(*)::int`,
      activeSuppliers: sql<number>`count(*) filter (where ${suppliersTable.isActive})::int`,
    })
    .from(suppliersTable)
    .where(eq(suppliersTable.userId, userId));

  const [invoiceStats] = await db
    .select({ totalInvoices: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .where(eq(invoicesTable.userId, userId));

  const [thisPeriodSpend] = await db
    .select({ total: sql<number>`coalesce(sum(${invoiceItemsTable.totalPrice}::numeric), 0)` })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .where(and(eq(invoicesTable.userId, userId), gte(invoicesTable.invoiceDate, periodStart)));

  const [prevPeriodSpend] = await db
    .select({ total: sql<number>`coalesce(sum(${invoiceItemsTable.totalPrice}::numeric), 0)` })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        gte(invoicesTable.invoiceDate, prevPeriodStart),
        sql`${invoicesTable.invoiceDate} < ${prevPeriodEnd}`,
      ),
    );

  const [productCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));

  const [alertCount] = await db
    .select({ count: sql<number>`count(*) filter (where ${priceAlertsTable.isActive})::int` })
    .from(priceAlertsTable)
    .where(eq(priceAlertsTable.userId, userId));

  const thisPeriod = toNum(thisPeriodSpend.total);
  const prevPeriod = toNum(prevPeriodSpend.total);
  const spendChange = prevPeriod > 0 ? ((thisPeriod - prevPeriod) / prevPeriod) * 100 : 0;

  res.json({
    totalSuppliers: supplierStats.totalSuppliers,
    activeSuppliers: supplierStats.activeSuppliers,
    totalInvoices: invoiceStats.totalInvoices,
    totalSpendThisMonth: thisPeriod,
    totalSpendLastMonth: prevPeriod,
    spendChangePercent: Math.round(spendChange * 10) / 10,
    trackedProducts: productCount.count,
    activeAlerts: alertCount.count,
    avgPriceChange: 0,
  });
});

router.get("/dashboard/food-cost-monthly", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = GetFoodCostMonthlyQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const months = queryParams.data.months ?? 12;

  const rows = await db.execute<{
    month_key: string;
    month: string;
    year: number;
    label: string;
    total_amount: string;
    invoice_count: number;
  }>(sql`
    SELECT
      substring(i.invoice_date, 1, 7) as month_key,
      substring(i.invoice_date, 6, 2) as month,
      substring(i.invoice_date, 1, 4)::int as year,
      to_char(to_date(substring(i.invoice_date, 1, 7), 'YYYY-MM'), 'Mon YYYY') as label,
      coalesce(sum(ii.total_price::numeric), 0)::text as total_amount,
      count(DISTINCT i.id)::int as invoice_count
    FROM invoices i
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE i.user_id = ${userId}
    GROUP BY 1, 2, 3, 4
    ORDER BY 1
    LIMIT ${sql.raw(String(months))}
  `);

  res.json(
    rows.rows.map((r) => ({
      month: r.month,
      year: r.year,
      label: r.label,
      totalAmount: toNum(r.total_amount),
      invoiceCount: r.invoice_count,
    })),
  );
});

router.get("/dashboard/recent-purchases", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = GetRecentPurchasesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const limit = queryParams.data.limit ?? 10;
  const days = queryParams.data.days;

  const dateFilter = days
    ? sql`${invoicesTable.invoiceDate} >= to_char(current_date - ${sql.raw(String(days))} * interval '1 day', 'YYYY-MM-DD')`
    : sql`1=1`;

  const recentItems = await db
    .select({
      productName: invoiceItemsTable.productName,
      unit: invoiceItemsTable.unit,
      unitPrice: invoiceItemsTable.unitPrice,
      supplierName: suppliersTable.name,
      invoiceDate: invoicesTable.invoiceDate,
      productId: invoiceItemsTable.productId,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(and(eq(invoicesTable.userId, userId), dateFilter))
    .orderBy(desc(invoicesTable.invoiceDate))
    .limit(limit * 2);

  const seen = new Set<string>();
  const unique = recentItems.filter((item) => {
    if (seen.has(item.productName)) return false;
    seen.add(item.productName);
    return true;
  });

  const enriched = await Promise.all(
    unique.slice(0, limit).map(async (item) => {
      let previousPrice: number | null = null;
      let changePercent: number | null = null;

      if (item.productId) {
        const prevItems = await db
          .select({ unitPrice: invoiceItemsTable.unitPrice })
          .from(invoiceItemsTable)
          .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
          .where(
            and(
              eq(invoiceItemsTable.productId, item.productId),
              eq(invoicesTable.userId, userId),
              sql`${invoicesTable.invoiceDate} < ${item.invoiceDate}`,
            ),
          )
          .orderBy(desc(invoicesTable.invoiceDate))
          .limit(1);

        if (prevItems.length > 0) {
          previousPrice = toNum(prevItems[0].unitPrice);
          const current = toNum(item.unitPrice);
          changePercent = ((current - previousPrice) / previousPrice) * 100;
        }
      }

      return {
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        currentPrice: toNum(item.unitPrice),
        previousPrice,
        changePercent,
        supplierName: item.supplierName,
        purchaseDate: item.invoiceDate,
      };
    }),
  );

  res.json(enriched);
});

router.get("/dashboard/active-alerts", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const alerts = await db
    .select({
      id: priceAlertsTable.id,
      productName: priceAlertsTable.productName,
      supplierId: priceAlertsTable.supplierId,
      supplierName: suppliersTable.name,
      thresholdPercent: priceAlertsTable.thresholdPercent,
    })
    .from(priceAlertsTable)
    .leftJoin(suppliersTable, eq(priceAlertsTable.supplierId, suppliersTable.id))
    .where(and(eq(priceAlertsTable.userId, userId), eq(priceAlertsTable.isActive, true)));

  // Load all dismissals for this user to filter already-confirmed triggers
  const dismissals = await db
    .select({ alertId: alertDismissalsTable.alertId, alertDate: alertDismissalsTable.alertDate })
    .from(alertDismissalsTable)
    .where(eq(alertDismissalsTable.userId, userId));

  const dismissedSet = new Set(dismissals.map((d) => `${d.alertId}__${d.alertDate}`));

  const triggered = (
    await Promise.all(
      alerts.map(async (alert) => {
        const [product] = await db
          .select()
          .from(productsTable)
          .where(and(eq(productsTable.name, alert.productName), eq(productsTable.userId, userId)))
          .limit(1);

        if (!product) return null;

        const history = await db
          .select({
            unitPrice: invoiceItemsTable.unitPrice,
            invoiceDate: invoicesTable.invoiceDate,
          })
          .from(invoiceItemsTable)
          .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
          .where(
            and(
              eq(invoiceItemsTable.productId, product.id),
              eq(invoicesTable.userId, userId),
              alert.supplierId ? eq(invoicesTable.supplierId, alert.supplierId) : undefined,
            ),
          )
          .orderBy(desc(invoicesTable.invoiceDate))
          .limit(2);

        if (history.length < 2) return null;

        const current = toNum(history[0].unitPrice);
        const previous = toNum(history[1].unitPrice);
        const changePercent = ((current - previous) / previous) * 100;
        const threshold = toNum(alert.thresholdPercent);

        if (Math.abs(changePercent) < threshold) return null;

        const alertDate = history[0].invoiceDate;

        // Skip if this specific trigger was already dismissed
        if (dismissedSet.has(`${alert.id}__${alertDate}`)) return null;

        return {
          alertId: alert.id,
          productName: alert.productName,
          supplierName: alert.supplierName ?? null,
          currentPrice: current,
          previousPrice: previous,
          changePercent: Math.round(changePercent * 10) / 10,
          thresholdPercent: threshold,
          alertDate,
        };
      }),
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  res.json(triggered);
});

export default router;
