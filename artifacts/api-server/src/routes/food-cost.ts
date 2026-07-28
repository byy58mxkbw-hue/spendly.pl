import { Router, type IRouter } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, dishesTable, dishIngredientsTable, productsTable, invoiceItemsTable, invoicesTable, posSalesTable, restaurantRevenueTable } from "@workspace/db";
import { CreateDishBody, UpdateDishBody, GetDishParams, UpdateDishParams, DeleteDishParams, ImportMenuBody, SaveMenuDishesBody } from "@workspace/api-zod";
import { requireOpenAI } from "@workspace/integrations-openai-ai-server";
import { findOrCreateProductByName } from "../services/ksef-ingest";
import { normalizeProductName } from "../lib/categorize-ai";
import { periodFromQuery, monthsInRange } from "../lib/period";

const router: IRouter = Router();

// Unit conversion to a common base (grams / millilitres / pieces)
function toBase(qty: number, unit: string): { value: number; base: string } {
  const u = unit.toLowerCase().trim();
  if (u === "kg") return { value: qty * 1000, base: "g" };
  if (u === "g") return { value: qty, base: "g" };
  if (u === "dag") return { value: qty * 10, base: "g" };
  if (u === "l" || u === "litr") return { value: qty * 1000, base: "ml" };
  if (u === "ml") return { value: qty, base: "ml" };
  return { value: qty, base: u }; // szt, opak, etc. — keep as-is
}

// Parse package size from product name, e.g. "Monin Vanilla 0.7l" → { valueInBase: 700, base: "ml" }
// Supports: 0.7l / 700ml / 1kg / 500g / 0.5kg / 250dag etc.
function parsePackageSize(productName: string): { valueInBase: number; base: string } | null {
  const re = /(\d+[.,]\d+|\d+)\s*(ml|l|litr|g|kg|dag)\b/gi;
  let best: { valueInBase: number; base: string } | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(productName)) !== null) {
    const num = parseFloat(match[1].replace(",", "."));
    const converted = toBase(num, match[2]);
    // prefer the largest sensible value (skip single-digit grams that are just specs)
    if (!best || converted.value > best.valueInBase) {
      best = { valueInBase: converted.value, base: converted.base };
    }
  }
  return best;
}

// Zwraca koszt składnika LUB null, gdy nie da się rzetelnie przeliczyć jednostek
// (np. faktura „za szt" bez znanej gramatury opakowania). null → caller użyje szacunku AI.
function convertIngredientCost(
  qty: number,
  recipeUnit: string,
  invoiceUnit: string,
  unitPrice: number,
  productName: string,
  pkgOverride?: { valueInBase: number; base: string } | null,
): number | null {
  const recipe = toBase(qty, recipeUnit);
  const invoice = toBase(1, invoiceUnit);
  const massVol = (b: string) => b === "g" || b === "ml";

  // Ta sama baza (g-g / ml-ml) LUB masa↔objętość wymiennie (gęstość ~1 g/ml).
  if (recipe.base === invoice.base || (massVol(recipe.base) && massVol(invoice.base))) {
    return (recipe.value / invoice.value) * unitPrice;
  }

  // Faktura za sztukę/opakowanie, a receptura w g/ml → gramatura z ustawienia produktu (override) lub z nazwy.
  if (!massVol(invoice.base) && massVol(recipe.base)) {
    const pkg = (pkgOverride && massVol(pkgOverride.base)) ? pkgOverride : parsePackageSize(productName);
    if (pkg && massVol(pkg.base)) {
      // np. receptura 10 g, opakowanie 5 l (=5000 ml≈5000 g), cena 69,90 zł/szt
      // koszt = (10 / 5000) * 69,90 = 0,14 zł
      return (recipe.value / pkg.valueInBase) * unitPrice;
    }
    // Nieznana gramatura opakowania — NIE mnóż gramów × cena/szt (dawało absurdy 699 zł).
    return null;
  }

  // Receptura w sztukach, a faktura za kg/l → bez wagi sztuki nie przeliczymy.
  if (massVol(invoice.base) && !massVol(recipe.base)) {
    return null;
  }

  // Oba w sztukach/opakowaniach — potraktuj jak tę samą jednostkę.
  return qty * unitPrice;
}

type PriceInfo = { unitPrice: number; unit: string; productName: string; pkgOverride: { valueInBase: number; base: string } | null };

async function getLatestPrices(userId: string, productIds: number[]): Promise<Map<number, PriceInfo>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      productId: invoiceItemsTable.productId,
      unitPrice: invoiceItemsTable.unitPrice,
      unit: invoiceItemsTable.unit,
      productName: productsTable.name,
      packageQty: productsTable.packageQty,
      packageUnit: productsTable.packageUnit,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(productsTable, eq(invoiceItemsTable.productId, productsTable.id))
    .where(
      and(
        eq(invoicesTable.userId, userId),
        eq(invoicesTable.excluded, false),
        sql`${invoicesTable.parentInvoiceId} IS NULL`,
        sql`(${invoicesTable.invoiceType}) IS DISTINCT FROM 'KOR'`,
        sql`${invoiceItemsTable.quantity}::numeric > 0`,
        sql`${invoiceItemsTable.unitPrice}::numeric > 0`,
        inArray(invoiceItemsTable.productId, productIds),
      ),
    )
    .orderBy(desc(invoicesTable.invoiceDate), desc(invoicesTable.id));

  const map = new Map<number, PriceInfo>();
  for (const row of rows) {
    if (!map.has(row.productId!)) {
      const pq = row.packageQty != null ? parseFloat(row.packageQty as string) : null;
      const pkgOverride = pq != null && pq > 0
        ? (() => { const b = toBase(pq, row.packageUnit || "g"); return { valueInBase: b.value, base: b.base }; })()
        : null;
      map.set(row.productId!, {
        unitPrice: parseFloat(row.unitPrice as string),
        unit: row.unit ?? "szt",
        productName: row.productName ?? "",
        pkgOverride,
      });
    }
  }
  return map;
}

type CostSource = "invoice" | "manual" | "estimate" | null;

function computeDishCost(
  ingredients: Array<{ productId: number; quantity: number; unit: string; estUnitPrice?: number | null; estUnit?: string | null; manualPrice?: number | null; manualUnit?: string | null }>,
  prices: Map<number, PriceInfo>,
): {
  portionCost: number | null;
  marginPct: number | null;
  confidencePct: number;
  invoiceCostPct: number | null;
  ingredientCosts: Map<number, number | null>;
  ingredientSources: Map<number, CostSource>;
} {
  let totalCost = 0;
  let invoiceCost = 0;  // część kosztu pochodząca z realnych faktur
  let known = 0;        // składniki z JAKĄKOLWIEK ceną (faktura lub szacunek AI)
  const ingredientCosts = new Map<number, number | null>();
  const ingredientSources = new Map<number, CostSource>();

  for (const ing of ingredients) {
    const price = prices.get(ing.productId);
    // Faktura KSeF ma priorytet — ale tylko gdy da się rzetelnie przeliczyć jednostki.
    let cost: number | null = null;
    let source: CostSource = null;
    if (price) {
      const c = convertIngredientCost(ing.quantity, ing.unit, price.unit, price.unitPrice, price.productName, price.pkgOverride);
      if (c != null) { cost = c; source = "invoice"; }
    }
    // Cena ręcznie przypisana (np. wyrób własny) — wyżej niż prognoza AI.
    if (cost == null && ing.manualPrice != null && ing.manualPrice > 0) {
      const c = convertIngredientCost(ing.quantity, ing.unit, ing.manualUnit || "kg", ing.manualPrice, "");
      if (c != null) { cost = c; source = "manual"; }
    }
    // Fallback: szacowana cena rynkowa AI (za jednostkę estUnit, domyślnie kg).
    if (cost == null && ing.estUnitPrice != null && ing.estUnitPrice > 0) {
      const c = convertIngredientCost(ing.quantity, ing.unit, ing.estUnit || "kg", ing.estUnitPrice, "");
      if (c != null) { cost = c; source = "estimate"; }
    }

    ingredientCosts.set(ing.productId, cost);
    ingredientSources.set(ing.productId, source);
    if (cost != null) {
      totalCost += cost;
      if (source === "invoice") invoiceCost += cost;
      known++;
    }
  }

  const confidencePct = ingredients.length > 0 ? Math.round((known / ingredients.length) * 100) : 100;
  const portionCost = known > 0 ? totalCost : null;
  // Wiarygodność wyceny: jaki % kosztu porcji opiera się na realnych fakturach (reszta = prognoza AI).
  const invoiceCostPct = portionCost != null && totalCost > 0 ? Math.round((invoiceCost / totalCost) * 100) : null;
  return { portionCost, marginPct: null, confidencePct, invoiceCostPct, ingredientCosts, ingredientSources };
}

// ─── Marże wszystkich dań (reużywane przez trasę listy ORAZ AI CFO) ────────────
export interface DishMargin {
  id: number;
  name: string;
  sellPrice: number;
  category: string | null;
  portionCost: number | null;
  marginPct: number | null;
  confidencePct: number;
  invoiceCostPct: number | null;
  ingredientCount: number;
}

export async function computeAllDishMargins(userId: string): Promise<DishMargin[]> {
  const dishes = await db
    .select()
    .from(dishesTable)
    .where(eq(dishesTable.userId, userId))
    .orderBy(dishesTable.name);

  const ingredients = await db
    .select({
      dishId: dishIngredientsTable.dishId,
      productId: dishIngredientsTable.productId,
      quantity: dishIngredientsTable.quantity,
      unit: dishIngredientsTable.unit,
      estUnitPrice: dishIngredientsTable.estUnitPrice,
      estUnit: dishIngredientsTable.estUnit,
      manualPrice: productsTable.manualPrice,
      manualUnit: productsTable.manualUnit,
    })
    .from(dishIngredientsTable)
    .innerJoin(dishesTable, eq(dishIngredientsTable.dishId, dishesTable.id))
    .innerJoin(productsTable, eq(dishIngredientsTable.productId, productsTable.id))
    .where(eq(dishesTable.userId, userId));

  const allProductIds = [...new Set(ingredients.map((i) => i.productId))];
  const prices = await getLatestPrices(userId, allProductIds);

  return dishes.map((dish) => {
    const ings = ingredients.filter((i) => i.dishId === dish.id).map((i) => ({
      productId: i.productId,
      quantity: parseFloat(i.quantity as string),
      unit: i.unit,
      estUnitPrice: i.estUnitPrice != null ? parseFloat(i.estUnitPrice as string) : null,
      estUnit: i.estUnit,
      manualPrice: i.manualPrice != null ? parseFloat(i.manualPrice as string) : null,
      manualUnit: i.manualUnit,
    }));
    const { portionCost, confidencePct, invoiceCostPct } = computeDishCost(ings, prices);
    const sellPrice = parseFloat(dish.sellPrice as string);
    const marginPct = portionCost != null && sellPrice > 0 ? ((sellPrice - portionCost) / sellPrice) * 100 : null;
    return {
      id: dish.id,
      name: dish.name,
      sellPrice,
      category: dish.category,
      portionCost,
      marginPct: marginPct != null ? Math.round(marginPct * 10) / 10 : null,
      confidencePct,
      invoiceCostPct,
      ingredientCount: ings.length,
    };
  });
}

// ─── List dishes ──────────────────────────────────────────────────────────────
router.get("/food-cost/dishes", async (req, res): Promise<void> => {
  res.json(await computeAllDishMargins(req.userId!));
});

// Pozycje sprzedaży GoPOS (do ręcznego powiązania dania) — nazwy + ilość w okresie.
router.get("/food-cost/pos-items", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query as { from?: unknown; to?: unknown; month?: unknown });
  const keys = monthsInRange(period);
  const rows = await db
    .select({
      name: posSalesTable.productName,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, keys)))
    .groupBy(posSalesTable.productName)
    .orderBy(desc(sql`SUM(${posSalesTable.qty}::numeric)`));
  res.json({ items: rows.map((r) => ({ name: r.name, qty: Math.round((Number(r.qty) || 0) * 100) / 100 })) });
});

// ─── Dania × sprzedaż GoPOS: realny food cost ważony sprzedażą ──────────────────
// Dopasowuje danie do pozycji sprzedaży GoPOS (po nazwie), liczy koszt miesięczny
// (koszt porcji × ilość sprzedana) i „prawdziwy food cost %" = Σkoszt / przychód.
router.get("/food-cost/dishes-sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query as { from?: unknown; to?: unknown; month?: unknown });
  const keys = monthsInRange(period);

  const [margins, salesRows, revRows, posLinks] = await Promise.all([
    computeAllDishMargins(userId),
    db
      .select({
        productName: posSalesTable.productName,
        qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
        net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
      })
      .from(posSalesTable)
      .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, keys)))
      .groupBy(posSalesTable.productName),
    db
      .select({ amountNet: restaurantRevenueTable.amountNet })
      .from(restaurantRevenueTable)
      .where(and(eq(restaurantRevenueTable.userId, userId), inArray(restaurantRevenueTable.period, keys))),
    db
      .select({ id: dishesTable.id, posProductName: dishesTable.posProductName })
      .from(dishesTable)
      .where(eq(dishesTable.userId, userId)),
  ]);
  const posLinkById = new Map(posLinks.map((d) => [d.id, d.posProductName]));

  // Indeks sprzedaży po znormalizowanej nazwie pozycji GoPOS
  const salesByNorm = new Map<string, { qty: number; net: number }>();
  for (const r of salesRows) {
    const key = normalizeName(r.productName);
    const cur = salesByNorm.get(key) ?? { qty: 0, net: 0 };
    cur.qty += Number(r.qty) || 0;
    cur.net += Number(r.net) || 0;
    salesByNorm.set(key, cur);
  }
  const salesEntries = [...salesByNorm.entries()];
  // Dopasowanie danie→sprzedaż: ręczne powiązanie (dokładne) → auto exact → zawieranie nazwy.
  function findSales(dishName: string, override: string | null): { qty: number; net: number } | null {
    if (override) return salesByNorm.get(normalizeName(override)) ?? { qty: 0, net: 0 };
    const n = normalizeName(dishName);
    if (!n) return null;
    const exact = salesByNorm.get(n);
    if (exact) return exact;
    for (const [k, v] of salesEntries) {
      if (k.length >= 4 && n.length >= 4 && (k.includes(n) || n.includes(k))) return v;
    }
    return null;
  }

  const revenue = revRows.reduce((s, r) => s + (Number(r.amountNet) || 0), 0);

  let costTotal = 0;
  let costKnown = false;
  let dishesSold = 0;
  const dishes = margins.map((m) => {
    const override = posLinkById.get(m.id) ?? null;
    const s = findSales(m.name, override);
    const soldQty = s?.qty ?? 0;
    const salesNet = s?.net ?? null;
    const monthlyCost = m.portionCost != null && soldQty > 0 ? Math.round(m.portionCost * soldQty * 100) / 100 : null;
    if (monthlyCost != null) { costTotal += monthlyCost; costKnown = true; }
    if (soldQty > 0) dishesSold++;
    const foodCostPct = m.portionCost != null && m.sellPrice > 0 ? Math.round((m.portionCost / m.sellPrice) * 1000) / 10 : null;
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      sellPrice: m.sellPrice,
      portionCost: m.portionCost != null ? Math.round(m.portionCost * 100) / 100 : null,
      foodCostPct,
      soldQty: Math.round(soldQty * 100) / 100,
      salesNet: salesNet != null ? Math.round(salesNet * 100) / 100 : null,
      monthlyCost,
      matched: soldQty > 0,
      posProductName: override,
    };
  });

  const weightedPct = costKnown && revenue > 0 ? Math.round((costTotal / revenue) * 1000) / 10 : null;
  res.json({
    from: period.from,
    to: period.to,
    weighted: {
      costTotal: costKnown ? Math.round(costTotal * 100) / 100 : null,
      revenue: Math.round(revenue * 100) / 100,
      foodCostPct: weightedPct,
      dishesSold,
    },
    dishes,
  });
});

// ─── Get dish detail ──────────────────────────────────────────────────────────
router.get("/food-cost/dishes/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = GetDishParams.safeParse({ id: parseInt(req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [dish] = await db
    .select()
    .from(dishesTable)
    .where(and(eq(dishesTable.id, params.data.id), eq(dishesTable.userId, userId)))
    .limit(1);

  if (!dish) { res.status(404).json({ error: "Dish not found" }); return; }

  const ingredients = await db
    .select({
      id: dishIngredientsTable.id,
      productId: dishIngredientsTable.productId,
      productName: productsTable.name,
      productUnit: productsTable.unit,
      quantity: dishIngredientsTable.quantity,
      unit: dishIngredientsTable.unit,
      estUnitPrice: dishIngredientsTable.estUnitPrice,
      estUnit: dishIngredientsTable.estUnit,
      packageQty: productsTable.packageQty,
      packageUnit: productsTable.packageUnit,
      manualPrice: productsTable.manualPrice,
      manualUnit: productsTable.manualUnit,
    })
    .from(dishIngredientsTable)
    .innerJoin(
      productsTable,
      and(eq(dishIngredientsTable.productId, productsTable.id), eq(productsTable.userId, userId)),
    )
    .where(eq(dishIngredientsTable.dishId, dish.id))
    .orderBy(productsTable.name);

  const productIds = ingredients.map((i) => i.productId);
  const prices = await getLatestPrices(userId, productIds);

  const ingsForCalc = ingredients.map((i) => ({
    productId: i.productId,
    quantity: parseFloat(i.quantity as string),
    unit: i.unit,
    estUnitPrice: i.estUnitPrice != null ? parseFloat(i.estUnitPrice as string) : null,
    estUnit: i.estUnit,
    manualPrice: i.manualPrice != null ? parseFloat(i.manualPrice as string) : null,
    manualUnit: i.manualUnit,
  }));
  const { portionCost, confidencePct, invoiceCostPct, ingredientCosts, ingredientSources } = computeDishCost(ingsForCalc, prices);

  const sellPrice = parseFloat(dish.sellPrice as string);
  const marginPct = portionCost != null && sellPrice > 0 ? Math.round(((sellPrice - portionCost) / sellPrice) * 1000) / 10 : null;

  res.json({
    id: dish.id,
    name: dish.name,
    sellPrice,
    category: dish.category,
    createdAt: dish.createdAt,
    portionCost: portionCost != null ? Math.round(portionCost * 100) / 100 : null,
    marginPct,
    confidencePct,
    invoiceCostPct,
    posProductName: dish.posProductName ?? null,
    ingredients: ingredients.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      productUnit: i.productUnit,
      quantity: parseFloat(i.quantity as string),
      unit: i.unit,
      unitPrice: prices.get(i.productId)?.unitPrice ?? null,
      ingredientCost: ingredientCosts.get(i.productId) ?? null,
      priceSource: ingredientSources.get(i.productId) ?? null,
      estUnitPrice: i.estUnitPrice != null ? parseFloat(i.estUnitPrice as string) : null,
      invoiceUnit: prices.get(i.productId)?.unit ?? null,
      packageQty: i.packageQty != null ? parseFloat(i.packageQty as string) : null,
      manualPrice: i.manualPrice != null ? parseFloat(i.manualPrice as string) : null,
      // UI może zaproponować ustawienie wagi opakowania: jest cena z faktury (na szt/opak),
      // ale nie dało się jej użyć (priceSource ≠ invoice) → brakuje gramatury opakowania.
      needsPackage: prices.has(i.productId) && ingredientSources.get(i.productId) !== "invoice",
      // UI może pozwolić przypisać cenę ręczną, gdy nie ma ceny z faktury (wyrób własny).
      canSetPrice: !prices.has(i.productId),
    })),
  });
});

// ─── Create dish ──────────────────────────────────────────────────────────────
router.post("/food-cost/dishes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = CreateDishBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  if (body.data.ingredients.length > 0) {
    const requestedIds = body.data.ingredients.map((ing) => ing.productId);
    const ownedProducts = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(inArray(productsTable.id, requestedIds), eq(productsTable.userId, userId)));
    if (ownedProducts.length !== requestedIds.length) {
      res.status(400).json({ error: "One or more products not found" });
      return;
    }
  }

  const [dish] = await db
    .insert(dishesTable)
    .values({
      userId,
      name: body.data.name,
      sellPrice: String(body.data.sellPrice),
      category: body.data.category ?? null,
    })
    .returning();

  if (body.data.ingredients.length > 0) {
    await db.insert(dishIngredientsTable).values(
      body.data.ingredients.map((ing) => ({
        dishId: dish.id,
        productId: ing.productId,
        quantity: String(ing.quantity),
        unit: ing.unit,
      })),
    );
  }

  res.status(201).json({ id: dish.id });
});

// ─── Update dish ──────────────────────────────────────────────────────────────
router.put("/food-cost/dishes/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateDishParams.safeParse({ id: parseInt(req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = UpdateDishBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [existing] = await db
    .select({ id: dishesTable.id })
    .from(dishesTable)
    .where(and(eq(dishesTable.id, params.data.id), eq(dishesTable.userId, userId)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Dish not found" }); return; }

  await db
    .update(dishesTable)
    .set({
      name: body.data.name ?? undefined,
      sellPrice: body.data.sellPrice != null ? String(body.data.sellPrice) : undefined,
      category: body.data.category !== undefined ? (body.data.category ?? null) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(dishesTable.id, params.data.id));

  if (body.data.ingredients !== undefined) {
    if (body.data.ingredients.length > 0) {
      const requestedIds = body.data.ingredients.map((ing) => ing.productId);
      const ownedProducts = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(inArray(productsTable.id, requestedIds), eq(productsTable.userId, userId)));
      if (ownedProducts.length !== requestedIds.length) {
        res.status(400).json({ error: "One or more products not found" });
        return;
      }
    }
    await db.delete(dishIngredientsTable).where(eq(dishIngredientsTable.dishId, params.data.id));
    if (body.data.ingredients.length > 0) {
      await db.insert(dishIngredientsTable).values(
        body.data.ingredients.map((ing) => ({
          dishId: params.data.id,
          productId: ing.productId,
          quantity: String(ing.quantity),
          unit: ing.unit,
        })),
      );
    }
  }

  res.status(204).end();
});

// ─── Delete dish ──────────────────────────────────────────────────────────────
router.delete("/food-cost/dishes/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteDishParams.safeParse({ id: parseInt(req.params.id, 10) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select({ id: dishesTable.id })
    .from(dishesTable)
    .where(and(eq(dishesTable.id, params.data.id), eq(dishesTable.userId, userId)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Dish not found" }); return; }

  await db.delete(dishesTable).where(eq(dishesTable.id, params.data.id));
  res.status(204).end();
});

// ─── Import karty menu: AI odczytuje dania + szacowane gramatury ────────────────
// Normalizacja nazwy jak w SQL matchu (regexp_replace(LOWER(name),'\s+',' ')) — do
// dopasowania składników AI do istniejących produktów usera, po stronie JS (1 query).
function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Tokeny znaczące do dopasowania fuzzy składnik→produkt. Dzielimy na całe słowa
// (granica słowa — rule 27), odrzucamy krótkie i szumowe, żeby "masło" trafiało
// w "masło extra", ale nie w środek innego wyrazu.
const ING_STOPWORDS = new Set([
  "z", "ze", "do", "na", "w", "we", "i", "oraz", "bez", "typ", "typu", "kg", "szt",
  "świeży", "świeża", "świeże", "mrożony", "mrożona", "mrożone", "luz", "extra", "premium",
]);
function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-ząćęłńóśźż0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !ING_STOPWORDS.has(t));
}

type ProdIdx = { id: number; name: string; unit: string; tokens: Set<string> };

// exact (nazwa/canonical) → najlepsze pokrycie tokenów (najwięcej wspólnych słów,
// przy remisie produkt bardziej generyczny = mniej tokenów).
function matchProduct(ingName: string, exact: Map<string, ProdIdx>, prods: ProdIdx[]): ProdIdx | null {
  const normIng = normalizeName(ingName);
  const exactHit = exact.get(normIng);
  if (exactHit) return exactHit;
  const ingTokens = significantTokens(normIng);
  if (ingTokens.length === 0) return null;
  let best: ProdIdx | null = null;
  let bestScore = 0;
  let bestLen = Infinity;
  for (const p of prods) {
    let score = 0;
    for (const t of ingTokens) if (p.tokens.has(t)) score++;
    if (score === 0) continue;
    if (score > bestScore || (score === bestScore && p.tokens.size < bestLen)) {
      best = p;
      bestScore = score;
      bestLen = p.tokens.size;
    }
  }
  return best;
}

const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024; // łącznie wszystkie strony menu

const MENU_PROMPT = `Jesteś doświadczonym szefem kuchni i kalkulantem food cost. Na obrazach jest karta menu restauracji. Odczytaj dania i oszacuj ich skład.

Zwróć WYŁĄCZNIE obiekt JSON o strukturze:
{
  "dishes": [
    {
      "name": "nazwa dania z karty",
      "sellPrice": number lub null (cena sprzedaży brutto jeśli widoczna, inaczej null),
      "category": "sekcja menu jeśli jest (np. Zupy, Dania główne, Desery) lub null",
      "ingredients": [
        {
          "name": "surowcowa nazwa składnika",
          "grams": number (szacowana gramatura na 1 porcję w gramach lub ml),
          "estPricePerKg": number (Twoja PROGNOZA typowej ceny zakupu tego surowca na polskim rynku hurtowym/detalicznym, w PLN za 1 kg; dla płynów przyjmij ~1 kg = 1 l; dla jaj/sztuk przelicz na cenę za kg masy)
        }
      ]
    }
  ]
}

Zasady:
- Używaj generycznych, surowcowych nazw składników po polsku (np. "pierś z kurczaka", "ser mozzarella", "mąka pszenna", "pomidory", "ryż") — łatwiejsze dopasowanie do faktur zakupowych.
- Szacuj realistyczne gramatury na JEDNĄ porcję. To przybliżenie — nie musi być dokładne.
- estPricePerKg podawaj ZAWSZE i realistycznie wg swojej wiedzy o cenach w Polsce (np. polędwica wołowa ~60 zł/kg, masło ~25 zł/kg, cebula ~3 zł/kg, majonez ~12 zł/kg, sardynki ~40 zł/kg). To Twoja prognoza — użyjemy jej, gdy dany surowiec nie ma jeszcze ceny z faktury.
- Pomijaj przyprawy o pomijalnym koszcie (sól, pieprz) albo zgrupuj jako jeden składnik "przyprawy" z małą gramaturą i estPricePerKg ~20.
- NIE wymyślaj dań, których nie ma na karcie. Jeśli czegoś nie widać wyraźnie — pomiń.
- Zwróć poprawny JSON, bez komentarzy.`;

type ExtractedMenuIngredient = { name: string; grams: number; estPricePerKg?: number | null };
type ExtractedMenuDish = { name: string; sellPrice: number | null; category: string | null; ingredients: ExtractedMenuIngredient[] };

// Krok 2 — ekstrakcja z obrazów + read-only dopasowanie do produktów + wstępna wycena (bez zapisu)
router.post("/food-cost/import-menu", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = ImportMenuBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const images = body.data.images;
  if (images.length === 0) { res.status(400).json({ error: "Brak obrazów do analizy." }); return; }
  if (images.length > 8) { res.status(400).json({ error: "Za dużo stron (max 8). Zmniejsz liczbę stron menu." }); return; }

  let totalBytes = 0;
  for (const img of images) {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(img);
    if (!m || !ALLOWED_IMAGE_MIME.includes(m[1].toLowerCase())) {
      res.status(400).json({ error: "Nieobsługiwany format obrazu. Użyj JPEG, PNG, WebP lub GIF." });
      return;
    }
    totalBytes += Math.floor((m[2].length * 3) / 4);
  }
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
    res.status(400).json({ error: "Obrazy są za duże (max 20 MB łącznie). Zmniejsz pliki i spróbuj ponownie." });
    return;
  }

  let dishes: ExtractedMenuDish[];
  try {
    const response = await requireOpenAI().chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
            { type: "text" as const, text: MENU_PROMPT },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0,
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { dishes?: unknown };
    dishes = Array.isArray(parsed.dishes) ? (parsed.dishes as ExtractedMenuDish[]) : [];
  } catch (err) {
    req.log.error({ err }, "import-menu: OpenAI Vision error");
    res.status(500).json({ error: "Nie udało się odczytać karty menu. Sprawdź jakość zdjęcia i spróbuj ponownie." });
    return;
  }

  // Sanityzacja + zebranie znormalizowanych nazw składników
  const cleanDishes = dishes
    .filter((d) => d && typeof d.name === "string" && d.name.trim())
    .map((d) => ({
      name: String(d.name).trim(),
      sellPrice: typeof d.sellPrice === "number" && d.sellPrice > 0 ? d.sellPrice : null,
      category: typeof d.category === "string" && d.category.trim() ? d.category.trim() : null,
      ingredients: (Array.isArray(d.ingredients) ? d.ingredients : [])
        .filter((i) => i && typeof i.name === "string" && i.name.trim())
        .map((i) => ({
          name: String(i.name).trim(),
          grams: typeof i.grams === "number" && i.grams > 0 ? i.grams : 0,
          estPricePerKg: typeof i.estPricePerKg === "number" && i.estPricePerKg > 0 ? i.estPricePerKg : null,
        })),
    }));

  // Read-only match: wczytaj wszystkie produkty usera raz i zbuduj indeks (exact + tokeny)
  const userProducts = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit, canonicalName: productsTable.canonicalName })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));
  const exactByNorm = new Map<string, ProdIdx>();
  const prodIndex: ProdIdx[] = [];
  for (const p of userProducts) {
    const canon = p.canonicalName?.trim() || normalizeProductName(p.name);
    const idx: ProdIdx = { id: p.id, name: p.name, unit: p.unit ?? "szt", tokens: new Set(significantTokens(canon)) };
    prodIndex.push(idx);
    for (const key of [normalizeName(p.name), normalizeName(canon)]) {
      if (key && !exactByNorm.has(key)) exactByNorm.set(key, idx);
    }
  }
  const matchCache = new Map<string, ProdIdx | null>();
  const matchFor = (name: string): ProdIdx | null => {
    const key = name.toLowerCase();
    if (matchCache.has(key)) return matchCache.get(key) ?? null;
    const m = matchProduct(name, exactByNorm, prodIndex);
    matchCache.set(key, m);
    return m;
  };

  // Ceny dla dopasowanych produktów (jedno zapytanie)
  const matchedIds = new Set<number>();
  for (const d of cleanDishes) for (const ing of d.ingredients) {
    const p = matchFor(ing.name);
    if (p) matchedIds.add(p.id);
  }
  const prices = await getLatestPrices(userId, [...matchedIds]);

  // Zbuduj podgląd z wstępną wyceną per danie (gramy → unit "g")
  const preview = cleanDishes.map((d) => {
    const ingredients = d.ingredients.map((ing) => {
      const p = matchFor(ing.name);
      const price = p ? prices.get(p.id) : undefined;
      // Faktura ma priorytet (o ile jednostki się przeliczają); brak → szacunek AI (cena za kg).
      let ingredientCost: number | null = null;
      let priceSource: "invoice" | "estimate" | null = null;
      if (p && price) {
        const c = convertIngredientCost(ing.grams, "g", price.unit, price.unitPrice, price.productName, price.pkgOverride);
        if (c != null) { ingredientCost = c; priceSource = "invoice"; }
      }
      if (ingredientCost == null && ing.estPricePerKg != null && ing.estPricePerKg > 0) {
        ingredientCost = convertIngredientCost(ing.grams, "g", "kg", ing.estPricePerKg, "");
        priceSource = "estimate";
      }
      return {
        name: ing.name,
        grams: ing.grams,
        matchedProductId: p?.id ?? null,
        matchedName: p?.name ?? null,
        unitPrice: price?.unitPrice ?? null,
        estPricePerKg: ing.estPricePerKg ?? null,
        priceSource,
        ingredientCost,
      };
    });
    const known = ingredients.filter((i) => i.ingredientCost != null);
    const portionCost = known.length > 0 ? known.reduce((s, i) => s + (i.ingredientCost ?? 0), 0) : null;
    const confidencePct = ingredients.length > 0 ? Math.round((known.length / ingredients.length) * 100) : 0;
    const foodCostPct = portionCost != null && d.sellPrice ? Math.round((portionCost / d.sellPrice) * 1000) / 10 : null;
    return { name: d.name, sellPrice: d.sellPrice, category: d.category, portionCost, foodCostPct, confidencePct, ingredients };
  });

  res.json({ dishes: preview });
});

// Krok 3 — zapis zaakceptowanych dań: tworzy brakujące produkty + wstawia dania i składniki (unit "g")
router.post("/food-cost/dishes/from-menu", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = SaveMenuDishesBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (body.data.dishes.length === 0) { res.status(400).json({ error: "Brak dań do zapisania." }); return; }

  const createdIds: number[] = [];
  for (const d of body.data.dishes) {
    // Rozwiąż productId dla każdego składnika (istniejący lub utwórz z kategoryzacją AI)
    const ingredientRows: Array<{ productId: number; grams: number; estPricePerKg: number | null }> = [];
    for (const ing of d.ingredients) {
      if (!ing.name?.trim() || !(ing.grams > 0)) continue;
      let productId = ing.productId ?? null;
      if (productId != null) {
        // zweryfikuj własność produktu
        const [owned] = await db
          .select({ id: productsTable.id })
          .from(productsTable)
          .where(and(eq(productsTable.id, productId), eq(productsTable.userId, userId)))
          .limit(1);
        if (!owned) productId = null;
      }
      if (productId == null) productId = await findOrCreateProductByName(userId, ing.name, "g");
      const est = typeof ing.estPricePerKg === "number" && ing.estPricePerKg > 0 ? ing.estPricePerKg : null;
      ingredientRows.push({ productId, grams: ing.grams, estPricePerKg: est });
    }

    const [dish] = await db
      .insert(dishesTable)
      .values({
        userId,
        name: d.name.trim(),
        sellPrice: String(d.sellPrice ?? 0),
        category: d.category?.trim() || null,
      })
      .returning();

    if (ingredientRows.length > 0) {
      await db.insert(dishIngredientsTable).values(
        ingredientRows.map((r) => ({
          dishId: dish.id,
          productId: r.productId,
          quantity: String(r.grams),
          unit: "g",
          // Zapisz szacunek AI jako fallback (cena za kg) — przetrwa i będzie użyty,
          // dopóki składnik nie dostanie realnej ceny z faktury.
          estUnitPrice: r.estPricePerKg != null ? String(r.estPricePerKg) : null,
          estUnit: r.estPricePerKg != null ? "kg" : null,
        })),
      );
    }
    createdIds.push(dish.id);
  }

  res.status(201).json({ createdIds });
});

// Przelicz danie z aktualnych faktur: re-dopasuj składniki (bez ceny z faktury)
// do realnie kupionych produktów z ceną — szacunki AI ustępują cenom z KSeF.
router.post("/food-cost/dishes/:id/reprice", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [dish] = await db
    .select({ id: dishesTable.id })
    .from(dishesTable)
    .where(and(eq(dishesTable.id, id), eq(dishesTable.userId, userId)))
    .limit(1);
  if (!dish) { res.status(404).json({ error: "Dish not found" }); return; }

  const ings = await db
    .select({ id: dishIngredientsTable.id, productId: dishIngredientsTable.productId, productName: productsTable.name })
    .from(dishIngredientsTable)
    .innerJoin(productsTable, and(eq(dishIngredientsTable.productId, productsTable.id), eq(productsTable.userId, userId)))
    .where(eq(dishIngredientsTable.dishId, id));

  const allProducts = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit, canonicalName: productsTable.canonicalName })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));
  const prices = await getLatestPrices(userId, allProducts.map((p) => p.id));

  // Indeks WYŁĄCZNIE z produktów mających cenę z faktury — cel przepięcia.
  const exactByNorm = new Map<string, ProdIdx>();
  const pricedIndex: ProdIdx[] = [];
  for (const p of allProducts) {
    if (!prices.has(p.id)) continue;
    const canon = p.canonicalName?.trim() || normalizeProductName(p.name);
    const idx: ProdIdx = { id: p.id, name: p.name, unit: p.unit ?? "szt", tokens: new Set(significantTokens(canon)) };
    pricedIndex.push(idx);
    for (const key of [normalizeName(p.name), normalizeName(canon)]) {
      if (key && !exactByNorm.has(key)) exactByNorm.set(key, idx);
    }
  }

  let repriced = 0;
  for (const ing of ings) {
    if (prices.has(ing.productId)) continue; // już ma realną cenę
    const m = matchProduct(ing.productName, exactByNorm, pricedIndex);
    if (m && m.id !== ing.productId) {
      await db.update(dishIngredientsTable).set({ productId: m.id }).where(eq(dishIngredientsTable.id, ing.id));
      repriced++;
    }
  }

  res.json({ repriced });
});

// Ręczne powiązanie dania z pozycją sprzedaży GoPOS (albo wyczyszczenie = auto po nazwie).
router.patch("/food-cost/dishes/:id/pos-link", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const raw = (req.body as { posProductName?: unknown }).posProductName;
  const posProductName = raw == null || raw === "" ? null : String(raw).trim();

  const [updated] = await db
    .update(dishesTable)
    .set({ posProductName })
    .where(and(eq(dishesTable.id, id), eq(dishesTable.userId, userId)))
    .returning({ id: dishesTable.id });
  if (!updated) { res.status(404).json({ error: "Dish not found" }); return; }
  res.status(204).end();
});

export default router;
