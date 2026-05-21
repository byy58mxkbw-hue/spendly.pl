import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, priceAlertsTable, suppliersTable, alertDismissalsTable } from "@workspace/db";
import { toNum } from "../lib/parse";
import {
  CreatePriceAlertBody,
  DeletePriceAlertParams,
  UpdatePriceAlertBody,
  UpdatePriceAlertParams,
  DismissPriceAlertBody,
  DismissPriceAlertParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/price-alerts", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const alerts = await db
    .select({
      id: priceAlertsTable.id,
      productName: priceAlertsTable.productName,
      supplierId: priceAlertsTable.supplierId,
      supplierName: suppliersTable.name,
      thresholdPercent: priceAlertsTable.thresholdPercent,
      isActive: priceAlertsTable.isActive,
      createdAt: priceAlertsTable.createdAt,
    })
    .from(priceAlertsTable)
    .leftJoin(
      suppliersTable,
      and(eq(priceAlertsTable.supplierId, suppliersTable.id), eq(suppliersTable.userId, userId)),
    )
    .where(eq(priceAlertsTable.userId, userId))
    .orderBy(priceAlertsTable.createdAt);

  res.json(
    alerts.map((a) => ({
      ...a,
      thresholdPercent: toNum(a.thresholdPercent),
      createdAt: a.createdAt.toISOString(),
    })),
  );
});

router.post("/price-alerts", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreatePriceAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [alert] = await db
    .insert(priceAlertsTable)
    .values({
      userId,
      productName: parsed.data.productName,
      supplierId: parsed.data.supplierId ?? null,
      thresholdPercent: parsed.data.thresholdPercent.toString(),
    })
    .returning();

  res.status(201).json({
    ...alert,
    supplierName: null,
    thresholdPercent: toNum(alert.thresholdPercent),
    createdAt: alert.createdAt.toISOString(),
  });
});

// GET /price-alerts/history must be defined BEFORE /:id to avoid route conflict
router.get("/price-alerts/history", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const dismissals = await db
    .select()
    .from(alertDismissalsTable)
    .where(eq(alertDismissalsTable.userId, userId))
    .orderBy(desc(alertDismissalsTable.dismissedAt));

  res.json(
    dismissals.map((d) => ({
      id: d.id,
      alertId: d.alertId,
      productName: d.productName,
      supplierName: d.supplierName ?? null,
      alertDate: d.alertDate,
      currentPrice: toNum(d.currentPrice),
      previousPrice: toNum(d.previousPrice),
      changePercent: toNum(d.changePercent),
      thresholdPercent: toNum(d.thresholdPercent),
      dismissedAt: d.dismissedAt.toISOString(),
    })),
  );
});

router.patch("/price-alerts/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdatePriceAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePriceAlertBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Partial<{
    isActive: boolean;
    thresholdPercent: string;
    supplierId: number | null;
  }> = {};

  if (body.data.isActive !== undefined) updates.isActive = body.data.isActive;
  if (body.data.thresholdPercent !== undefined) updates.thresholdPercent = body.data.thresholdPercent.toString();
  if ("supplierId" in body.data) updates.supplierId = body.data.supplierId ?? null;

  const [updated] = await db
    .update(priceAlertsTable)
    .set(updates)
    .where(and(eq(priceAlertsTable.id, params.data.id), eq(priceAlertsTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const [withSupplier] = await db
    .select({
      id: priceAlertsTable.id,
      productName: priceAlertsTable.productName,
      supplierId: priceAlertsTable.supplierId,
      supplierName: suppliersTable.name,
      thresholdPercent: priceAlertsTable.thresholdPercent,
      isActive: priceAlertsTable.isActive,
      createdAt: priceAlertsTable.createdAt,
    })
    .from(priceAlertsTable)
    .leftJoin(suppliersTable, and(eq(priceAlertsTable.supplierId, suppliersTable.id), eq(suppliersTable.userId, userId)))
    .where(eq(priceAlertsTable.id, params.data.id));

  res.json({
    ...withSupplier,
    thresholdPercent: toNum(withSupplier.thresholdPercent),
    createdAt: withSupplier.createdAt.toISOString(),
  });
});

router.post("/price-alerts/:id/dismiss", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DismissPriceAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = DismissPriceAlertBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [dismissal] = await db
    .insert(alertDismissalsTable)
    .values({
      userId,
      alertId: params.data.id,
      alertDate: body.data.alertDate,
      productName: body.data.productName,
      supplierName: body.data.supplierName ?? null,
      currentPrice: body.data.currentPrice.toString(),
      previousPrice: body.data.previousPrice.toString(),
      changePercent: body.data.changePercent.toString(),
      thresholdPercent: body.data.thresholdPercent.toString(),
    })
    .returning();

  res.status(201).json({
    id: dismissal.id,
    alertId: dismissal.alertId,
    productName: dismissal.productName,
    supplierName: dismissal.supplierName ?? null,
    alertDate: dismissal.alertDate,
    currentPrice: toNum(dismissal.currentPrice),
    previousPrice: toNum(dismissal.previousPrice),
    changePercent: toNum(dismissal.changePercent),
    thresholdPercent: toNum(dismissal.thresholdPercent),
    dismissedAt: dismissal.dismissedAt.toISOString(),
  });
});

router.delete("/price-alerts/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeletePriceAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(priceAlertsTable)
    .where(and(eq(priceAlertsTable.id, params.data.id), eq(priceAlertsTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
