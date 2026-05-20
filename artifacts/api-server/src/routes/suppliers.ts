import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, suppliersTable, invoicesTable, invoiceItemsTable } from "@workspace/db";
import {
  CreateSupplierBody,
  UpdateSupplierBody,
  GetSupplierParams,
  UpdateSupplierParams,
  DeleteSupplierParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/suppliers", async (req, res): Promise<void> => {
  const suppliers = await db
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
        WHERE i2.supplier_id = ${suppliersTable.id}
      )`,
    })
    .from(suppliersTable)
    .leftJoin(invoicesTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .groupBy(suppliersTable.id)
    .orderBy(suppliersTable.name);

  res.json(suppliers);
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [supplier] = await db.insert(suppliersTable).values(parsed.data).returning();
  res.status(201).json({ ...supplier, invoiceCount: 0, lastInvoiceDate: null, totalSpend: null });
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
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
        WHERE i2.supplier_id = ${suppliersTable.id}
      )`,
    })
    .from(suppliersTable)
    .leftJoin(invoicesTable, eq(invoicesTable.supplierId, suppliersTable.id))
    .where(eq(suppliersTable.id, params.data.id))
    .groupBy(suppliersTable.id);

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  res.json(supplier);
});

router.put("/suppliers/:id", async (req, res): Promise<void> => {
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
    .where(eq(suppliersTable.id, params.data.id))
    .returning();

  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }

  res.json({ ...supplier, invoiceCount: 0, lastInvoiceDate: null, totalSpend: null });
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
