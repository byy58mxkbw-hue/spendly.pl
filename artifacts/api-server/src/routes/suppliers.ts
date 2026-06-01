import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, costCentersTable } from "@workspace/db";
import {
  CreateSupplierBody,
  UpdateSupplierBody,
  GetSupplierParams,
  UpdateSupplierParams,
  DeleteSupplierParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/suppliers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const suppliers = await db
    .select({
      id: suppliersTable.id,
      name: suppliersTable.name,
      taxId: suppliersTable.taxId,
      email: suppliersTable.email,
      phone: suppliersTable.phone,
      isActive: suppliersTable.isActive,
      defaultCostCenterId: suppliersTable.defaultCostCenterId,
      defaultCostCenterName: costCentersTable.name,
      defaultCostCenterColor: costCentersTable.color,
      createdAt: suppliersTable.createdAt,
      invoiceCount: sql<number>`count(${invoicesTable.id})::int`,
      lastInvoiceDate: sql<string | null>`max(${invoicesTable.invoiceDate})`,
      totalSpend: sql<number | null>`(
        SELECT sum(${invoiceItemsTable.totalPrice}::numeric)
        FROM ${invoiceItemsTable}
        INNER JOIN ${invoicesTable} AS i2 ON i2.id = ${invoiceItemsTable.invoiceId}
        WHERE i2.supplier_id = ${suppliersTable.id} AND i2.user_id = ${userId}
      )`,
    })
    .from(suppliersTable)
    .leftJoin(
      invoicesTable,
      and(eq(invoicesTable.supplierId, suppliersTable.id), eq(invoicesTable.userId, userId)),
    )
    .leftJoin(costCentersTable, eq(suppliersTable.defaultCostCenterId, costCentersTable.id))
    .where(eq(suppliersTable.userId, userId))
    .groupBy(suppliersTable.id, costCentersTable.name, costCentersTable.color)
    .orderBy(suppliersTable.name);

  res.json(suppliers);
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [supplier] = await db.insert(suppliersTable).values({ ...parsed.data, userId }).returning();
  res.status(201).json({ ...supplier, invoiceCount: 0, lastInvoiceDate: null, totalSpend: null });
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [supplier] = await db
    .select({
      id: suppliersTable.id,
      name: suppliersTable.name,
      taxId: suppliersTable.taxId,
      email: suppliersTable.email,
      phone: suppliersTable.phone,
      isActive: suppliersTable.isActive,
      createdAt: suppliersTable.createdAt,
      invoiceCount: sql<number>`count(${invoicesTable.id})::int`,
      lastInvoiceDate: sql<string | null>`max(${invoicesTable.invoiceDate})`,
      totalSpend: sql<number | null>`(
        SELECT sum(${invoiceItemsTable.totalPrice}::numeric)
        FROM ${invoiceItemsTable}
        INNER JOIN ${invoicesTable} AS i2 ON i2.id = ${invoiceItemsTable.invoiceId}
        WHERE i2.supplier_id = ${suppliersTable.id} AND i2.user_id = ${userId}
      )`,
    })
    .from(suppliersTable)
    .leftJoin(
      invoicesTable,
      and(eq(invoicesTable.supplierId, suppliersTable.id), eq(invoicesTable.userId, userId)),
    )
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)))
    .groupBy(suppliersTable.id);

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  res.json(supplier);
});

router.put("/suppliers/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [supplier] = await db
    .update(suppliersTable)
    .set(parsed.data)
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)))
    .returning();

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  res.json({ ...supplier, invoiceCount: 0, lastInvoiceDate: null, totalSpend: null });
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(suppliersTable)
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
