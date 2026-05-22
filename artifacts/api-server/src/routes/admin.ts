import { Router, type IRouter, type Request, type Response } from "express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAdmin(req: Request): boolean {
  return ADMIN_IDS.length > 0 && ADMIN_IDS.includes(req.userId!);
}

function denyAdmin(res: Response): void {
  res.status(403).json({ error: "Brak dostępu." });
}

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const [clerkResult, invoiceCounts, supplierCounts, productCounts] = await Promise.all([
    clerkClient.users.getUserList({ limit: 200, orderBy: "-created_at" }),
    db.execute(sql`SELECT user_id, COUNT(*)::int AS cnt FROM invoices GROUP BY user_id`),
    db.execute(sql`SELECT user_id, COUNT(*)::int AS cnt FROM suppliers GROUP BY user_id`),
    db.execute(sql`SELECT user_id, COUNT(*)::int AS cnt FROM products GROUP BY user_id`),
  ]);

  const invoiceMap = new Map<string, number>(
    invoiceCounts.rows.map((r: Record<string, unknown>) => [r["user_id"] as string, r["cnt"] as number])
  );
  const supplierMap = new Map<string, number>(
    supplierCounts.rows.map((r: Record<string, unknown>) => [r["user_id"] as string, r["cnt"] as number])
  );
  const productMap = new Map<string, number>(
    productCounts.rows.map((r: Record<string, unknown>) => [r["user_id"] as string, r["cnt"] as number])
  );

  const users = clerkResult.data.map((u) => ({
    id: u.id,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    email:
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
        ?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null,
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt ?? null,
    blocked: (u.publicMetadata?.["blocked"] as boolean | undefined) === true,
    invoiceCount: invoiceMap.get(u.id) ?? 0,
    supplierCount: supplierMap.get(u.id) ?? 0,
    productCount: productMap.get(u.id) ?? 0,
  }));

  res.json({ users, total: clerkResult.totalCount });
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const [clerkResult, invoiceCount, supplierCount, productCount] = await Promise.all([
    clerkClient.users.getUserList({ limit: 500, orderBy: "-created_at" }),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM invoices`),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM suppliers`),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM products`),
  ]);

  const now = new Date();
  const registrationsByMonth: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    registrationsByMonth[key] = 0;
  }
  for (const u of clerkResult.data) {
    const d = new Date(u.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in registrationsByMonth) {
      registrationsByMonth[key]++;
    }
  }

  const registrationsChart = Object.entries(registrationsByMonth).map(([month, count]) => ({
    month,
    count,
  }));

  res.json({
    totalUsers: clerkResult.totalCount,
    totalInvoices: (invoiceCount.rows[0] as Record<string, unknown>)?.["cnt"] ?? 0,
    totalSuppliers: (supplierCount.rows[0] as Record<string, unknown>)?.["cnt"] ?? 0,
    totalProducts: (productCount.rows[0] as Record<string, unknown>)?.["cnt"] ?? 0,
    registrationsChart,
  });
});

router.get("/admin/users/:userId/details", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const { userId } = req.params;

  const [suppliers, recentInvoices, topProducts] = await Promise.all([
    db.execute(sql`
      SELECT id, name, tax_id AS "taxId", is_active AS "isActive"
      FROM suppliers
      WHERE user_id = ${userId}
      ORDER BY name ASC
    `),
    db.execute(sql`
      SELECT i.id, i.invoice_number AS "invoiceNumber", i.invoice_date AS "invoiceDate",
             i.total_amount AS "totalAmount", s.name AS "supplierName"
      FROM invoices i
      JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.user_id = ${userId}
      ORDER BY i.invoice_date DESC, i.imported_at DESC
      LIMIT 5
    `),
    db.execute(sql`
      SELECT ii.product_name AS "productName",
             SUM(ii.total_price)::numeric AS "totalSpend"
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.user_id = ${userId}
      GROUP BY ii.product_name
      ORDER BY "totalSpend" DESC
      LIMIT 5
    `),
  ]);

  res.json({
    suppliers: suppliers.rows,
    recentInvoices: recentInvoices.rows,
    topProducts: topProducts.rows,
  });
});

router.patch("/admin/users/:userId/block", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const { userId } = req.params;
  const blocked = (req.body as Record<string, unknown>)?.["blocked"] === true;

  await clerkClient.users.updateUser(userId, {
    publicMetadata: { blocked },
  });

  res.json({ ok: true, blocked });
});

router.delete("/admin/users/:userId", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const { userId } = req.params;

  await clerkClient.users.deleteUser(userId);

  res.status(204).end();
});

export default router;
