import { Router, type IRouter } from "express";
import { and, eq, sql, isNull, isNotNull } from "drizzle-orm";
import { db, costCentersTable, invoicesTable, suppliersTable } from "@workspace/db";
import { suggestCostCenterId } from "../lib/cost-center-suggest.js";
import { decryptSecret } from "../lib/encryption.js";
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
      aliases: costCentersTable.aliases,
    })
    .from(costCentersTable)
    .where(eq(costCentersTable.userId, userId))
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
    .values({ userId, name: parsed.data.name, color: parsed.data.color ?? "#14B8A6", aliases: parsed.data.aliases ?? [] })
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

  const updates: Partial<{ name: string; color: string; aliases: string[] }> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.aliases !== undefined) {
    // Normalizuj: trim, bez pustych, bez duplikatów.
    updates.aliases = Array.from(new Set(parsed.data.aliases.map((a) => a.trim()).filter(Boolean)));
  }

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

// ─── Recompute cost-center suggestions from XML (backfill) ────────────────────
router.post("/cost-centers/resuggest", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const centers = await db
    .select({ id: costCentersTable.id, aliases: costCentersTable.aliases })
    .from(costCentersTable)
    .where(eq(costCentersTable.userId, userId));

  // Nic do dopasowania, jeśli żadne centrum nie ma aliasów.
  if (centers.every((c) => (c.aliases ?? []).length === 0)) {
    res.json({ suggested: 0 });
    return;
  }

  const invoices = await db
    .select({ id: invoicesTable.id, xmlContent: invoicesTable.xmlContent })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.userId, userId), isNotNull(invoicesTable.xmlContent)));

  let suggested = 0;
  for (const inv of invoices) {
    let xml: string | null = null;
    if (inv.xmlContent) {
      try { xml = decryptSecret(inv.xmlContent); } catch { xml = null; }
    }
    const ccId = xml ? suggestCostCenterId(xml, centers) : null;
    await db
      .update(invoicesTable)
      .set({ suggestedCostCenterId: ccId })
      .where(eq(invoicesTable.id, inv.id));
    if (ccId != null) suggested++;
  }

  res.json({ suggested });
});

// ─── Accept all pending suggestions for unassigned invoices ───────────────────
router.post("/invoices/apply-cost-center-suggestions", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const result = await db
    .update(invoicesTable)
    .set({ costCenterId: sql`${invoicesTable.suggestedCostCenterId}` })
    .where(and(
      eq(invoicesTable.userId, userId),
      isNull(invoicesTable.costCenterId),
      isNotNull(invoicesTable.suggestedCostCenterId),
    ))
    .returning({ id: invoicesTable.id });
  res.json({ applied: result.length });
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

  // Note: setting a supplier's default cost center applies only to FUTURE imports.
  // Existing invoices are left untouched so the user keeps full manual control over
  // which cost center each invoice belongs to.
  res.json(updated);
});

export default router;
