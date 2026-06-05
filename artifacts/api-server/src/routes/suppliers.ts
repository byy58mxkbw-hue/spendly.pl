import { Router, type IRouter } from "express";
import { and, eq, sql, isNull } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable, costCentersTable } from "@workspace/db";
import {
  CreateSupplierBody,
  UpdateSupplierBody,
  GetSupplierParams,
  UpdateSupplierParams,
  DeleteSupplierParams,
  ListSuppliersQueryParams,
  RestoreSupplierParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/suppliers", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = ListSuppliersQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { costCenterId, includeInactive } = queryParams.data;

  const ccJoinCond =
    costCenterId != null
      ? costCenterId === 0
        ? and(eq(invoicesTable.supplierId, suppliersTable.id), eq(invoicesTable.userId, userId), isNull(invoicesTable.costCenterId))
        : and(eq(invoicesTable.supplierId, suppliersTable.id), eq(invoicesTable.userId, userId), eq(invoicesTable.costCenterId, costCenterId))
      : and(eq(invoicesTable.supplierId, suppliersTable.id), eq(invoicesTable.userId, userId));

  const ccSpendSql =
    costCenterId != null
      ? costCenterId === 0
        ? sql` AND i2.cost_center_id IS NULL`
        : sql` AND i2.cost_center_id = ${costCenterId}`
      : sql``;

  const whereConditions = includeInactive
    ? and(eq(suppliersTable.userId, userId), eq(suppliersTable.isActive, false))
    : and(eq(suppliersTable.userId, userId), eq(suppliersTable.isActive, true));

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
        SELECT sum(ii2.total_price::numeric)
        FROM invoice_items ii2
        INNER JOIN invoices i2 ON i2.id = ii2.invoice_id
        WHERE i2.supplier_id = ${suppliersTable.id} AND i2.user_id = ${userId}${ccSpendSql}
      )`,
    })
    .from(suppliersTable)
    .leftJoin(invoicesTable, ccJoinCond)
    .leftJoin(costCentersTable, eq(suppliersTable.defaultCostCenterId, costCentersTable.id))
    .where(whereConditions)
    .groupBy(suppliersTable.id, costCentersTable.name, costCentersTable.color)
    .orderBy(suppliersTable.name);

  res.json(costCenterId != null ? suppliers.filter((s) => s.invoiceCount > 0) : suppliers);
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

  const [supplier] = await db
    .update(suppliersTable)
    .set({ isActive: false })
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)))
    .returning({ id: suppliersTable.id });

  if (!supplier) {
    res.status(404).json({ error: "Nie znaleziono dostawcy." });
    return;
  }

  await db
    .update(invoicesTable)
    .set({ excluded: true })
    .where(and(eq(invoicesTable.supplierId, params.data.id), eq(invoicesTable.userId, userId)));

  res.json({ deleted: true });
});

router.post("/suppliers/:id/restore", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = RestoreSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [supplier] = await db
    .update(suppliersTable)
    .set({ isActive: true })
    .where(and(eq(suppliersTable.id, params.data.id), eq(suppliersTable.userId, userId)))
    .returning();

  if (!supplier) {
    res.status(404).json({ error: "Nie znaleziono dostawcy." });
    return;
  }

  await db
    .update(invoicesTable)
    .set({ excluded: false })
    .where(and(eq(invoicesTable.supplierId, params.data.id), eq(invoicesTable.userId, userId)));

  res.json({
    ...supplier,
    invoiceCount: 0,
    lastInvoiceDate: null,
    totalSpend: null,
    defaultCostCenterName: null,
    defaultCostCenterColor: null,
  });
});

export default router;
