import type { Logger } from "pino";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  db,
  priceAlertsTable,
  alertDismissalsTable,
  productsTable,
  invoiceItemsTable,
  invoicesTable,
  suppliersTable,
} from "@workspace/db";
import { toNum } from "../lib/parse";
import { normalizeUnit } from "../lib/units";

export interface TriggeredAlert {
  alertId: number;
  productId: number;
  productName: string;
  supplierId: number | null;
  supplierName: string | null;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  thresholdPercent: number;
  alertDate: string;
}

export async function computeTriggeredAlerts(userId: string): Promise<TriggeredAlert[]> {
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
            unit: invoiceItemsTable.unit,
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
          .limit(20);

        if (history.length < 2) return null;

        // Poprzednia cena musi być w TEJ SAMEJ znormalizowanej jednostce co najnowsza —
        // inaczej alert powstałby z rozjazdu jednostek (np. cena/kg vs cena/szt), nie z realnej podwyżki.
        const currentUnit = normalizeUnit(history[0].unit);
        const previousEntry = history.slice(1).find((h) => normalizeUnit(h.unit) === currentUnit);
        if (!previousEntry) return null;

        const current = toNum(history[0].unitPrice);
        const previous = toNum(previousEntry.unitPrice);
        const changePercent = ((current - previous) / previous) * 100;
        const threshold = toNum(alert.thresholdPercent);

        if (Math.abs(changePercent) < threshold) return null;

        const alertDate = history[0].invoiceDate;

        if (dismissedSet.has(`${alert.id}__${alertDate}`)) return null;

        return {
          alertId: alert.id,
          productId: product.id,
          productName: alert.productName,
          supplierId: alert.supplierId ?? null,
          supplierName: alert.supplierName ?? null,
          currentPrice: current,
          previousPrice: previous,
          changePercent: Math.round(changePercent * 10) / 10,
          thresholdPercent: threshold,
          alertDate,
        };
      }),
    )
  ).filter((a): a is TriggeredAlert => a !== null);

  return triggered;
}

// Po imporcie faktur przeliczamy progi — wynik trafia do logów, a aktywne
// przekroczenia widać na dashboardzie (sekcja „Alerty cenowe" liczy je na żywo
// przez computeTriggeredAlerts). Nie zapisujemy nic dodatkowego do bazy.
export async function checkAlertsAfterImport(userId: string, log: Logger): Promise<void> {
  try {
    const triggered = await computeTriggeredAlerts(userId);
    if (triggered.length === 0) return;
    log.info({ userId, triggeredCount: triggered.length }, "Price alerts triggered after invoice import");
  } catch (err) {
    log.warn({ err: String(err) }, "Alert check after invoice import failed");
  }
}
