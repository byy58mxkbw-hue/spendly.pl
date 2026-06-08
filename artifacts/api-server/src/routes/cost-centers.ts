import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
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
  SetSupplierDefaultCategoryBody,
  SetSupplierDefaultCategoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── List ─────────────────────────────────────────────────────────────────────
router.get("/cost-centers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select({
      id: costCentersTable.id,
      userId: costCentersTable.userId,
      name: costCentersTable.name,
      color: costCentersTable.color,
      invoiceCount: sql<number>`count(${invoicesTable.id})::int`,
      supplierCount: sql<number>`count(distinct ${invoicesTable.supplierId})::int`,
    })
    .from(costCentersTable)
    .leftJoin(
      invoicesTable,
      and(eq(invoicesTable.costCenterId, costCentersTable.id), eq(invoicesTable.userId, userId)),
    )
    .where(eq(costCentersTable.userId, userId))
    .groupBy(costCentersTable.id, costCentersTable.userId, costCentersTable.name, costCentersTable.color)
    .orderBy(costCentersTable.name);
  res.json(rows);
});

// ─── Supplier cost center suggestion ─────────────────────────────────────────
router.get("/suppliers/:id/cost-center-suggestion", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [supplier] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, id), eq(suppliersTable.userId, userId)));
  if (!supplier) { res.status(404).json({ error: "Not found" }); return; }

  const topResult = await db.execute(sql`
    SELECT cost_center_id, COUNT(*)::int AS invoice_count
    FROM invoices
    WHERE user_id = ${userId} AND supplier_id = ${id} AND cost_center_id IS NOT NULL
    GROUP BY cost_center_id ORDER BY invoice_count DESC LIMIT 1
  `);
  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total FROM invoices WHERE user_id = ${userId} AND supplier_id = ${id}
  `);

  const total = Number((totalResult.rows[0] as { total: number })?.total ?? 0);
  const topRow = topResult.rows[0] as { cost_center_id: number; invoice_count: number } | undefined;

  if (!topRow || !topRow.cost_center_id) {
    res.json({ suggestedCostCenterId: null, suggestedCostCenterName: null, confidence: 0, invoiceCount: total });
    return;
  }

  const confidence = total > 0 ? Math.round((Number(topRow.invoice_count) / total) * 100) / 100 : 0;
  const [cc] = await db
    .select({ name: costCentersTable.name })
    .from(costCentersTable)
    .where(eq(costCentersTable.id, topRow.cost_center_id));

  res.json({
    suggestedCostCenterId: topRow.cost_center_id,
    suggestedCostCenterName: cc?.name ?? null,
    confidence,
    invoiceCount: total,
  });
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

// ─── Set supplier default category ───────────────────────────────────────────
router.patch("/suppliers/:id/default-category", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = SetSupplierDefaultCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = SetSupplierDefaultCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(suppliersTable)
    .set({ defaultCategory: parsed.data.defaultCategory })
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Supplier not found" }); return; }
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
