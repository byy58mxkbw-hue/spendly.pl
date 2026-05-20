import { Router, type IRouter } from "express";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import {
  db,
  suppliersTable,
  invoicesTable,
  invoiceItemsTable,
  productsTable,
  priceAlertsTable,
  productGroupsTable,
} from "@workspace/db";
import { GetFoodCostMonthlyQueryParams, GetRecentPurchasesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

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

  const [thisMonthSpend] = await db
    .select({ total: sql<number>`coalesce(sum(${invoiceItemsTable.totalPrice}::numeric), 0)` })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .where(and(eq(invoicesTable.userId, userId), gte(invoicesTable.invoiceDate, thisMonthStart)));

  const [lastMonthSpend] = await db
    .select({ total: sql<number>`coalesce(sum(${invoiceItemsTable.totalPrice}::numeric), 0)` })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        gte(invoicesTable.invoiceDate, lastMonthStart),
        sql`${invoicesTable.invoiceDate} <= ${lastMonthEnd}`,
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

  const thisMonth = parseFloat(String(thisMonthSpend.total));
  const lastMonth = parseFloat(String(lastMonthSpend.total));
  const spendChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

  res.json({
    totalSuppliers: supplierStats.totalSuppliers,
    activeSuppliers: supplierStats.activeSuppliers,
    totalInvoices: invoiceStats.totalInvoices,
    totalSpendThisMonth: thisMonth,
    totalSpendLastMonth: lastMonth,
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
      totalAmount: parseFloat(r.total_amount),
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
    .where(eq(invoicesTable.userId, userId))
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
          previousPrice = parseFloat(prevItems[0].unitPrice);
          const current = parseFloat(item.unitPrice);
          changePercent = ((current - previousPrice) / previousPrice) * 100;
        }
      }

      return {
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        currentPrice: parseFloat(item.unitPrice),
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
      groupId: priceAlertsTable.groupId,
      groupName: productGroupsTable.name,
      supplierId: priceAlertsTable.supplierId,
      supplierName: suppliersTable.name,
      thresholdPercent: priceAlertsTable.thresholdPercent,
    })
    .from(priceAlertsTable)
    .leftJoin(
      suppliersTable,
      and(eq(priceAlertsTable.supplierId, suppliersTable.id), eq(suppliersTable.userId, userId)),
    )
    .leftJoin(
      productGroupsTable,
      and(eq(priceAlertsTable.groupId, productGroupsTable.id), eq(productGroupsTable.userId, userId)),
    )
    .where(and(eq(priceAlertsTable.userId, userId), eq(priceAlertsTable.isActive, true)));

  const triggered = (
    await Promise.all(
      alerts.map(async (alert) => {
        const threshold = parseFloat(alert.thresholdPercent);

        if (alert.groupId) {
          const members = await db
            .select({ id: productsTable.id, unit: productsTable.unit })
            .from(productsTable)
            .where(and(eq(productsTable.userId, userId), eq(productsTable.groupId, alert.groupId)));
          if (members.length === 0) return null;

          // Pick primary (most common) unit to keep aggregation unit-consistent
          const unitCounts: Record<string, number> = {};
          for (const m of members) unitCounts[m.unit] = (unitCounts[m.unit] ?? 0) + 1;
          const primaryUnit = Object.entries(unitCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
          const filteredMembers = primaryUnit
            ? members.filter((m) => m.unit === primaryUnit)
            : members;

          const latest: number[] = [];
          const previous: number[] = [];
          let alertDate: string | null = null;
          for (const m of filteredMembers) {
            const history = await db
              .select({ unitPrice: invoiceItemsTable.unitPrice, invoiceDate: invoicesTable.invoiceDate })
              .from(invoiceItemsTable)
              .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
              .where(
                and(
                  eq(invoiceItemsTable.productId, m.id),
                  eq(invoicesTable.userId, userId),
                  alert.supplierId ? eq(invoicesTable.supplierId, alert.supplierId) : undefined,
                ),
              )
              .orderBy(desc(invoicesTable.invoiceDate))
              .limit(2);
            // Only include products that have BOTH a current and previous price to keep
            // the baseline aligned with the same product set across periods
            if (history[0] && history[1]) {
              latest.push(parseFloat(history[0].unitPrice));
              previous.push(parseFloat(history[1].unitPrice));
              if (!alertDate || history[0].invoiceDate > alertDate) alertDate = history[0].invoiceDate;
            }
          }
          if (!latest.length || !previous.length) return null;
          const current = latest.reduce((a, b) => a + b, 0) / latest.length;
          const prev = previous.reduce((a, b) => a + b, 0) / previous.length;
          if (!isFinite(prev) || prev === 0) return null;
          const changePercent = ((current - prev) / prev) * 100;
          if (!isFinite(changePercent) || Math.abs(changePercent) < threshold) return null;
          return {
            productName: alert.groupName ?? "Grupa",
            supplierName: alert.supplierName ?? null,
            currentPrice: current,
            previousPrice: prev,
            changePercent: Math.round(changePercent * 10) / 10,
            thresholdPercent: threshold,
            alertDate: alertDate ?? "",
          };
        }

        if (!alert.productName) return null;
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

        const current = parseFloat(history[0].unitPrice);
        const previous = parseFloat(history[1].unitPrice);
        if (!isFinite(previous) || previous === 0) return null;
        const changePercent = ((current - previous) / previous) * 100;

        if (!isFinite(changePercent) || Math.abs(changePercent) < threshold) return null;

        return {
          productName: alert.productName,
          supplierName: alert.supplierName ?? null,
          currentPrice: current,
          previousPrice: previous,
          changePercent: Math.round(changePercent * 10) / 10,
          thresholdPercent: threshold,
          alertDate: history[0].invoiceDate,
        };
      }),
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  res.json(triggered);
});

export default router;
