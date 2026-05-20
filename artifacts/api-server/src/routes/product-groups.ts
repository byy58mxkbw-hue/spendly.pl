import { Router, type IRouter } from "express";
import { and, eq, inArray, sql, desc, isNull } from "drizzle-orm";
import {
  db,
  productsTable,
  productGroupsTable,
  productGroupRejectionsTable,
  invoiceItemsTable,
  invoicesTable,
  suppliersTable,
} from "@workspace/db";
import {
  CreateProductGroupBody,
  AcceptProductGroupSuggestionBody,
  RejectProductGroupSuggestionBody,
  GetProductGroupDetailParams,
  UpdateProductGroupParams,
  UpdateProductGroupBody,
  DeleteProductGroupParams,
  AddProductsToGroupParams,
  AddProductsToGroupBody,
  RemoveProductFromGroupParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function normalizeKey(rawName: string): string {
  const stripped = rawName
    .replace(/^[#\s]+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  const tokens = stripped.split(" ");
  if (tokens.length === 1) return tokens[0];
  if (tokens[0].length <= 3) return `${tokens[0]} ${tokens[1]}`;
  return tokens[0];
}

function suggestedNameFromKey(key: string): string {
  return key
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type VariantInfo = {
  productId: number;
  productName: string;
  unit: string;
  supplierId: number | null;
  supplierName: string | null;
  latestPrice: number | null;
  previousPrice: number | null;
  priceChangePercent: number | null;
  lastPurchaseDate: string | null;
};

async function loadVariantsForProducts(userId: string, productIds: number[]): Promise<VariantInfo[]> {
  if (productIds.length === 0) return [];

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), inArray(productsTable.id, productIds)));

  return Promise.all(
    products.map(async (p) => {
      const history = await db
        .select({
          unitPrice: invoiceItemsTable.unitPrice,
          invoiceDate: invoicesTable.invoiceDate,
          supplierId: invoicesTable.supplierId,
          supplierName: suppliersTable.name,
        })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .innerJoin(suppliersTable, eq(invoicesTable.supplierId, suppliersTable.id))
        .where(and(eq(invoiceItemsTable.productId, p.id), eq(invoicesTable.userId, userId)))
        .orderBy(desc(invoicesTable.invoiceDate))
        .limit(2);

      const latest = history[0];
      const previous = history[1];
      const latestPrice = latest ? parseFloat(latest.unitPrice) : null;
      const previousPrice = previous ? parseFloat(previous.unitPrice) : null;
      const changePercent =
        latestPrice != null && previousPrice != null && previousPrice !== 0
          ? ((latestPrice - previousPrice) / previousPrice) * 100
          : null;

      return {
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        supplierId: latest?.supplierId ?? null,
        supplierName: latest?.supplierName ?? null,
        latestPrice,
        previousPrice,
        priceChangePercent: changePercent,
        lastPurchaseDate: latest?.invoiceDate ?? null,
      };
    }),
  );
}

function aggregateGroup(variants: VariantInfo[]) {
  const units = new Set(variants.map((v) => v.unit));
  const unitsMixed = units.size > 1;
  const primaryUnit = (() => {
    const counts: Record<string, number> = {};
    for (const v of variants) counts[v.unit] = (counts[v.unit] ?? 0) + 1;
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] ?? null;
  })();

  const latestPrices = variants
    .filter((v) => !unitsMixed || v.unit === primaryUnit)
    .map((v) => v.latestPrice)
    .filter((p): p is number => p != null);
  const previousPrices = variants
    .filter((v) => !unitsMixed || v.unit === primaryUnit)
    .map((v) => v.previousPrice)
    .filter((p): p is number => p != null);

  const avgLatestPrice = latestPrices.length
    ? latestPrices.reduce((s, p) => s + p, 0) / latestPrices.length
    : null;
  const avgPreviousPrice = previousPrices.length
    ? previousPrices.reduce((s, p) => s + p, 0) / previousPrices.length
    : null;
  const priceChangePercent =
    avgLatestPrice != null && avgPreviousPrice != null && avgPreviousPrice !== 0
      ? ((avgLatestPrice - avgPreviousPrice) / avgPreviousPrice) * 100
      : null;

  const lastPurchaseDate = variants
    .map((v) => v.lastPurchaseDate)
    .filter((d): d is string => d != null)
    .sort()
    .at(-1) ?? null;

  return { unitsMixed, primaryUnit, avgLatestPrice, avgPreviousPrice, priceChangePercent, lastPurchaseDate };
}

// GET /product-groups
router.get("/product-groups", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const groups = await db
    .select()
    .from(productGroupsTable)
    .where(eq(productGroupsTable.userId, userId))
    .orderBy(productGroupsTable.name);

  const out = await Promise.all(
    groups.map(async (g) => {
      const memberProducts = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(eq(productsTable.userId, userId), eq(productsTable.groupId, g.id)));
      const variants = await loadVariantsForProducts(userId, memberProducts.map((m) => m.id));
      const agg = aggregateGroup(variants);
      return {
        id: g.id,
        name: g.name,
        normalizedKey: g.normalizedKey,
        variantCount: variants.length,
        avgLatestPrice: agg.avgLatestPrice,
        avgPreviousPrice: agg.avgPreviousPrice,
        priceChangePercent: agg.priceChangePercent,
        primaryUnit: agg.primaryUnit,
        unitsMixed: agg.unitsMixed,
        lastPurchaseDate: agg.lastPurchaseDate,
        createdAt: g.createdAt.toISOString(),
      };
    }),
  );

  res.json(out);
});

// GET /product-groups/suggestions
router.get("/product-groups/suggestions", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const ungrouped = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), isNull(productsTable.groupId)));

  const rejected = await db
    .select({ key: productGroupRejectionsTable.normalizedKey })
    .from(productGroupRejectionsTable)
    .where(eq(productGroupRejectionsTable.userId, userId));
  const rejectedSet = new Set(rejected.map((r) => r.key));

  // Only suggest keys that have actual purchase history (otherwise junk products pollute suggestions)
  const productsWithPurchases = ungrouped.length
    ? await db
        .select({ productId: invoiceItemsTable.productId })
        .from(invoiceItemsTable)
        .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
        .where(and(eq(invoicesTable.userId, userId), inArray(invoiceItemsTable.productId, ungrouped.map((p) => p.id))))
    : [];
  const purchasedIds = new Set(productsWithPurchases.map((r) => r.productId));

  type Cluster = { key: string; productIds: number[]; productNames: string[]; units: string[] };
  const clusters: Record<string, Cluster> = {};
  for (const p of ungrouped) {
    if (!purchasedIds.has(p.id)) continue;
    const key = normalizeKey(p.name);
    if (!key || key.length < 3 || rejectedSet.has(key)) continue;
    if (!clusters[key]) clusters[key] = { key, productIds: [], productNames: [], units: [] };
    clusters[key].productIds.push(p.id);
    clusters[key].productNames.push(p.name);
    clusters[key].units.push(p.unit);
  }

  const suggestions = Object.values(clusters)
    .filter((c) => c.productIds.length >= 2)
    .map((c) => {
      const counts: Record<string, number> = {};
      for (const u of c.units) counts[u] = (counts[u] ?? 0) + 1;
      const primaryUnit = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
      return {
        normalizedKey: c.key,
        suggestedName: suggestedNameFromKey(c.key),
        productIds: c.productIds,
        productNames: c.productNames,
        primaryUnit,
      };
    })
    .sort((a, b) => b.productIds.length - a.productIds.length);

  res.json(suggestions);
});

// POST /product-groups/suggestions/accept
router.post("/product-groups/suggestions/accept", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = AcceptProductGroupSuggestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const created = await createGroupWithProducts(userId, parsed.data.name, parsed.data.normalizedKey, parsed.data.productIds);
  res.status(201).json(created);
});

// POST /product-groups/suggestions/reject
router.post("/product-groups/suggestions/reject", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = RejectProductGroupSuggestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .insert(productGroupRejectionsTable)
    .values({ userId, normalizedKey: parsed.data.normalizedKey })
    .onConflictDoNothing();
  res.sendStatus(204);
});

// POST /product-groups
router.post("/product-groups", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateProductGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const key = normalizeKey(parsed.data.name);
  const created = await createGroupWithProducts(userId, parsed.data.name, key, parsed.data.productIds ?? []);
  res.status(201).json(created);
});

async function createGroupWithProducts(userId: string, name: string, normalizedKey: string, productIds: number[]) {
  const inserted = await db
    .insert(productGroupsTable)
    .values({ userId, name, normalizedKey })
    .onConflictDoNothing({ target: [productGroupsTable.userId, productGroupsTable.normalizedKey] })
    .returning();
  let group = inserted[0];
  if (!group) {
    // Conflict: a group with this normalized key already exists for this user
    const existing = await db
      .select()
      .from(productGroupsTable)
      .where(and(eq(productGroupsTable.userId, userId), eq(productGroupsTable.normalizedKey, normalizedKey)))
      .limit(1);
    group = existing[0];
    if (!group) throw new Error("Failed to create or locate product group");
  }

  if (productIds.length) {
    await db
      .update(productsTable)
      .set({ groupId: group.id })
      .where(and(eq(productsTable.userId, userId), inArray(productsTable.id, productIds)));
  }

  const variants = await loadVariantsForProducts(userId, productIds);
  const agg = aggregateGroup(variants);
  return {
    id: group.id,
    name: group.name,
    normalizedKey: group.normalizedKey,
    variantCount: variants.length,
    avgLatestPrice: agg.avgLatestPrice,
    avgPreviousPrice: agg.avgPreviousPrice,
    priceChangePercent: agg.priceChangePercent,
    primaryUnit: agg.primaryUnit,
    unitsMixed: agg.unitsMixed,
    lastPurchaseDate: agg.lastPurchaseDate,
    createdAt: group.createdAt.toISOString(),
  };
}

// GET /product-groups/:id
router.get("/product-groups/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = GetProductGroupDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [group] = await db
    .select()
    .from(productGroupsTable)
    .where(and(eq(productGroupsTable.id, params.data.id), eq(productGroupsTable.userId, userId)))
    .limit(1);

  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  const memberProducts = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.groupId, group.id)));
  const variants = await loadVariantsForProducts(userId, memberProducts.map((m) => m.id));
  const agg = aggregateGroup(variants);

  // Monthly average price history across variants (filtered to primaryUnit if mixed)
  let avgPriceHistory: { date: string; avgPrice: number }[] = [];
  if (memberProducts.length) {
    const rows = await db.execute(sql`
      SELECT substring(${invoicesTable.invoiceDate}, 1, 7) AS month,
             AVG(${invoiceItemsTable.unitPrice}::numeric) AS avg_price
      FROM ${invoiceItemsTable}
      JOIN ${invoicesTable} ON ${invoiceItemsTable.invoiceId} = ${invoicesTable.id}
      JOIN ${productsTable} ON ${invoiceItemsTable.productId} = ${productsTable.id}
      WHERE ${invoicesTable.userId} = ${userId}
        AND ${invoiceItemsTable.productId} IN (${sql.join(memberProducts.map((m) => sql`${m.id}`), sql`, `)})
        ${agg.unitsMixed && agg.primaryUnit ? sql`AND ${productsTable.unit} = ${agg.primaryUnit}` : sql``}
      GROUP BY 1
      ORDER BY 1
    `);
    avgPriceHistory = (rows.rows as Array<{ month: string; avg_price: string }>).map((r) => ({
      date: `${r.month}-01`,
      avgPrice: parseFloat(r.avg_price),
    }));
  }

  res.json({
    id: group.id,
    name: group.name,
    normalizedKey: group.normalizedKey,
    primaryUnit: agg.primaryUnit,
    unitsMixed: agg.unitsMixed,
    variants,
    avgPriceHistory,
  });
});

// PATCH /product-groups/:id
router.patch("/product-groups/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateProductGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProductGroupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await db
    .update(productGroupsTable)
    .set({ name: body.data.name })
    .where(and(eq(productGroupsTable.id, params.data.id), eq(productGroupsTable.userId, userId)));

  res.sendStatus(204);
});

// DELETE /product-groups/:id
router.delete("/product-groups/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteProductGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(productGroupsTable)
    .where(and(eq(productGroupsTable.id, params.data.id), eq(productGroupsTable.userId, userId)));

  res.sendStatus(204);
});

// POST /product-groups/:id/products
router.post("/product-groups/:id/products", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = AddProductsToGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddProductsToGroupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [group] = await db
    .select({ id: productGroupsTable.id })
    .from(productGroupsTable)
    .where(and(eq(productGroupsTable.id, params.data.id), eq(productGroupsTable.userId, userId)))
    .limit(1);
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  if (body.data.productIds.length) {
    await db
      .update(productsTable)
      .set({ groupId: group.id })
      .where(and(eq(productsTable.userId, userId), inArray(productsTable.id, body.data.productIds)));
  }

  res.sendStatus(204);
});

// DELETE /product-groups/:id/products/:productId
router.delete("/product-groups/:id/products/:productId", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = RemoveProductFromGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .update(productsTable)
    .set({ groupId: null })
    .where(
      and(
        eq(productsTable.userId, userId),
        eq(productsTable.id, params.data.productId),
        eq(productsTable.groupId, params.data.id),
      ),
    );

  res.sendStatus(204);
});

export default router;
