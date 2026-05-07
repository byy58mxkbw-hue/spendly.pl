import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, priceAlertsTable, suppliersTable } from "@workspace/db";
import {
  CreatePriceAlertBody,
  DeletePriceAlertParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/price-alerts", async (req, res): Promise<void> => {
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
    .leftJoin(suppliersTable, eq(priceAlertsTable.supplierId, suppliersTable.id))
    .orderBy(priceAlertsTable.createdAt);

  res.json(
    alerts.map((a) => ({
      ...a,
      thresholdPercent: parseFloat(a.thresholdPercent),
      createdAt: a.createdAt.toISOString(),
    })),
  );
});

router.post("/price-alerts", async (req, res): Promise<void> => {
  const parsed = CreatePriceAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [alert] = await db
    .insert(priceAlertsTable)
    .values({
      productName: parsed.data.productName,
      supplierId: parsed.data.supplierId ?? null,
      thresholdPercent: parsed.data.thresholdPercent.toString(),
    })
    .returning();

  res.status(201).json({
    ...alert,
    supplierName: null,
    thresholdPercent: parseFloat(alert.thresholdPercent),
    createdAt: alert.createdAt.toISOString(),
  });
});

router.delete("/price-alerts/:id", async (req, res): Promise<void> => {
  const params = DeletePriceAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(priceAlertsTable).where(eq(priceAlertsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
