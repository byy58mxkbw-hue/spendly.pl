import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, costCentersTable, invoicesTable, suppliersTable } from "@workspace/db";
import {
  CreateCostCenterBody,
  UpdateCostCenterBody,
  UpdateCostCenterParams,
  DeleteCostCenterParams,
  SetInvoiceCostCenterBody,
  SetInvoiceCostCenterParams,
  SetSupplierDefaultCostCenterBody,
  SetSupplierDefaultCostCenterParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── List ─────────────────────────────────────────────────────────────────────
router.get("/cost-centers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(costCentersTable)
    .where(eq(costCentersTable.userId, userId))
    .orderBy(costCentersTable.name);
  res.json(rows);
});

// ─── Create ───────────────────────────────────────────────────────────────────
router.post("/cost-centers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateCostCenterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(costCentersTable)
    .values({ userId, name: parsed.data.name, color: parsed.data.color ?? "#14B8A6" })
    .returning();
  res.status(201).json(row);
});

// ─── Update ───────────────────────────────────────────────────────────────────
router.patch("/cost-centers/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateCostCenterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateCostCenterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Partial<{ name: string; color: string }> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;

  const [row] = await db
    .update(costCentersTable)
    .set(updates)
    .where(and(eq(costCentersTable.id, params.data.id), eq(costCentersTable.userId, userId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/cost-centers/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteCostCenterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .delete(costCentersTable)
    .where(and(eq(costCentersTable.id, params.data.id), eq(costCentersTable.userId, userId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ deleted: true });
});

// ─── Assign cost center to invoice ────────────────────────────────────────────
router.patch("/invoices/:id/cost-center", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = SetInvoiceCostCenterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = SetInvoiceCostCenterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.costCenterId !== null) {
    const [cc] = await db
      .select({ id: costCentersTable.id })
      .from(costCentersTable)
      .where(and(eq(costCentersTable.id, parsed.data.costCenterId!), eq(costCentersTable.userId, userId)));
    if (!cc) { res.status(404).json({ error: "Cost center not found" }); return; }
  }

  const [updated] = await db
    .update(invoicesTable)
    .set({ costCenterId: parsed.data.costCenterId })
    .where(and(eq(invoicesTable.id, params.data.id), eq(invoicesTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(updated);
});

// ─── Set supplier default cost center ────────────────────────────────────────
router.patch("/suppliers/:id/default-cost-center", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = SetSupplierDefaultCostCenterParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = SetSupplierDefaultCostCenterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.defaultCostCenterId !== null) {
    const [cc] = await db
      .select({ id: costCentersTable.id })
      .from(costCentersTable)
      .where(and(eq(costCentersTable.id, parsed.data.defaultCostCenterId!), eq(costCentersTable.userId, userId)));
    if (!cc) { res.status(404).json({ error: "Cost center not found" }); return; }
  }

  const [updated] = await db
    .update(suppliersTable)
    .set({ defaultCostCenterId: parsed.data.defaultCostCenterId })
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json(updated);
});

export default router;
