import { Router, type IRouter, type Request, type Response } from "express";
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

interface ClerkUserRaw {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: { id: string; email_address: string }[];
  primary_email_address_id: string | null;
  created_at: number;
  last_sign_in_at: number | null;
  public_metadata: Record<string, unknown>;
}

interface ClerkUserListResponse {
  data: ClerkUserRaw[];
  total_count: number;
}

async function clerkApiFetch(path: string): Promise<Response> {
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  return fetch(`https://api.clerk.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Cache-Control": "no-cache, no-store",
    },
  });
}

async function fetchAllClerkUsers() {
  const PAGE = 500;
  const allUsers: ClerkUserRaw[] = [];
  let offset = 0;
  let total = Infinity;

  while (allUsers.length < total) {
    const res = await clerkApiFetch(
      `/users?limit=${PAGE}&offset=${offset}&order_by=-created_at`,
    );
    if (!res.ok) {
      throw new Error(`Clerk API error: ${res.status}`);
    }
    const body = (await res.json()) as ClerkUserListResponse;
    total = body.total_count;
    allUsers.push(...body.data);
    offset += body.data.length;
    if (body.data.length < PAGE) break;
  }

  return { data: allUsers, totalCount: total };
}

router.get("/admin/check", (req, res): void => {
  req.log.info({ userId: req.userId, isAdmin: isAdmin(req) }, "admin check");
  if (!isAdmin(req)) {
    res.status(403).json({ admin: false, userId: req.userId });
    return;
  }
  res.json({ admin: true, userId: req.userId });
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const [clerkResult, invoiceCounts, supplierCounts, productCounts] = await Promise.all([
    fetchAllClerkUsers(),
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
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    email:
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)
        ?.email_address ??
      u.email_addresses[0]?.email_address ??
      null,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    blocked: (u.public_metadata?.["blocked"] as boolean | undefined) === true,
    invoiceCount: invoiceMap.get(u.id) ?? 0,
    supplierCount: supplierMap.get(u.id) ?? 0,
    productCount: productMap.get(u.id) ?? 0,
  }));

  res.json({ users, total: clerkResult.totalCount });
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const [clerkResult, invoiceCount, supplierCount, productCount] = await Promise.all([
    fetchAllClerkUsers(),
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
    const d = new Date(u.created_at);
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

  const r = await clerkApiFetch(`/users/${userId}`);
  if (!r.ok) { res.status(502).json({ error: "Błąd Clerk API" }); return; }
  const user = (await r.json()) as ClerkUserRaw;
  const currentMeta = user.public_metadata ?? {};

  const patchRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ public_metadata: { ...currentMeta, blocked } }),
  });
  if (!patchRes.ok) { res.status(502).json({ error: "Błąd aktualizacji Clerk" }); return; }

  res.json({ ok: true, blocked });
});

router.delete("/admin/users/:userId", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { denyAdmin(res); return; }

  const { userId } = req.params;

  const delRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY ?? ""}`,
    },
  });
  if (!delRes.ok) { res.status(502).json({ error: "Błąd usuwania w Clerk" }); return; }

  res.status(204).end();
});

export default router;
