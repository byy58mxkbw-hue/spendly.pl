import { Router, type IRouter } from "express";
import { and, eq, or, ilike, desc } from "drizzle-orm";
import { db, suppliersTable, productsTable, invoicesTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Global search ─────────────────────────────────────────────────────────────
// Przeszukuje jednocześnie dostawców (nazwa/NIP), produkty (nazwa) i faktury
// (numer). Maks. 5 wyników z każdej kategorii. Wszystko scope'owane do userId.
router.get("/search", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const q = String(req.query.q ?? "").trim();

  if (q.length < 2) {
    res.json({ suppliers: [], products: [], invoices: [] });
    return;
  }

  const pattern = `%${q}%`;

  const [suppliers, products, invoices] = await Promise.all([
    db
      .select({ id: suppliersTable.id, name: suppliersTable.name, taxId: suppliersTable.taxId })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.userId, userId),
          or(ilike(suppliersTable.name, pattern), ilike(suppliersTable.taxId, pattern)),
        ),
      )
      .limit(5),
    db
      .select({ id: productsTable.id, name: productsTable.name, category: productsTable.category })
      .from(productsTable)
      .where(and(eq(productsTable.userId, userId), ilike(productsTable.name, pattern)))
      .limit(5),
    db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        supplierName: suppliersTable.name,
        invoiceDate: invoicesTable.invoiceDate,
      })
      .from(invoicesTable)
      .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
      .where(and(eq(invoicesTable.userId, userId), ilike(invoicesTable.invoiceNumber, pattern)))
      .orderBy(desc(invoicesTable.invoiceDate))
      .limit(5),
  ]);

  res.json({
    suppliers: suppliers.map((s) => ({ ...s, taxId: s.taxId ?? null })),
    products: products.map((p) => ({ ...p, category: p.category ?? null })),
    invoices: invoices.map((i) => ({ ...i, supplierName: i.supplierName ?? null })),
  });
});

export default router;
