import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, priceAlertsTable, suppliersTable, productGroupsTable } from "@workspace/db";
import {
  CreatePriceAlertBody,
  DeletePriceAlertParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/price-alerts", async (req, res): Promise<void> => {
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
      isActive: priceAlertsTable.isActive,
      createdAt: priceAlertsTable.createdAt,
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
    .where(eq(priceAlertsTable.userId, userId))
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
  const userId = req.userId!;
  const parsed = CreatePriceAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!parsed.data.productName && !parsed.data.groupId) {
    res.status(400).json({ error: "Wymagana nazwa produktu lub identyfikator grupy" });
    return;
  }

  let groupName: string | null = null;
  if (parsed.data.groupId) {
    const [group] = await db
      .select({ id: productGroupsTable.id, name: productGroupsTable.name })
      .from(productGroupsTable)
      .where(and(eq(productGroupsTable.id, parsed.data.groupId), eq(productGroupsTable.userId, userId)))
      .limit(1);
    if (!group) {
      res.status(404).json({ error: "Grupa nie znaleziona" });
      return;
    }
    groupName = group.name;
  }

  if (parsed.data.supplierId) {
    const [supplier] = await db
      .select({ id: suppliersTable.id })
      .from(suppliersTable)
      .where(and(eq(suppliersTable.id, parsed.data.supplierId), eq(suppliersTable.userId, userId)))
      .limit(1);
    if (!supplier) {
      res.status(404).json({ error: "Dostawca nie znaleziony" });
      return;
    }
  }

  const [alert] = await db
    .insert(priceAlertsTable)
    .values({
      userId,
      productName: parsed.data.productName ?? null,
      groupId: parsed.data.groupId ?? null,
      supplierId: parsed.data.supplierId ?? null,
      thresholdPercent: parsed.data.thresholdPercent.toString(),
    })
    .returning();

  res.status(201).json({
    ...alert,
    supplierName: null,
    groupName,
    thresholdPercent: parseFloat(alert.thresholdPercent),
    createdAt: alert.createdAt.toISOString(),
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
