import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, dishesTable, dishIngredientsTable, productsTable, invoiceItemsTable, invoicesTable } from "@workspace/db";
import { CreateDishBody, UpdateDishBody, GetDishParams, UpdateDishParams, DeleteDishParams } from "@workspace/api-zod";

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

function convertIngredientCost(qty: number, recipeUnit: string, productUnit: string, unitPrice: number): number {
  const recipe = toBase(qty, recipeUnit);
  const product = toBase(1, productUnit);

  if (recipe.base === product.base) {
    // same family — safe ratio
    return (recipe.value / product.value) * unitPrice;
  }
  // incompatible units — assume 1:1 (e.g. szt <-> szt)
  return qty * unitPrice;
}

async function getLatestPrices(userId: string, productIds: number[]): Promise<Map<number, { unitPrice: number; unit: string }>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      productId: invoiceItemsTable.productId,
      unitPrice: invoiceItemsTable.unitPrice,
      unit: productsTable.unit,
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
      ),
    )
    .orderBy(desc(invoicesTable.invoiceDate), desc(invoicesTable.id));

  const map = new Map<number, { unitPrice: number; unit: string }>();
  for (const row of rows) {
    if (!map.has(row.productId!)) {
      map.set(row.productId!, { unitPrice: parseFloat(row.unitPrice as string), unit: row.unit });
    }
    if (map.size === productIds.length) break;
  }
  return map;
}

function computeDishCost(
  ingredients: Array<{ productId: number; quantity: number; unit: string }>,
  prices: Map<number, { unitPrice: number; unit: string }>,
): { portionCost: number | null; marginPct: number | null; confidencePct: number; ingredientCosts: Map<number, number | null> } {
  let totalCost = 0;
  let known = 0;
  const ingredientCosts = new Map<number, number | null>();

  for (const ing of ingredients) {
    const price = prices.get(ing.productId);
    if (price) {
      const cost = convertIngredientCost(ing.quantity, ing.unit, price.unit, price.unitPrice);
      ingredientCosts.set(ing.productId, cost);
      totalCost += cost;
      known++;
    } else {
      ingredientCosts.set(ing.productId, null);
    }
  }

  const confidencePct = ingredients.length > 0 ? Math.round((known / ingredients.length) * 100) : 100;
  const portionCost = known > 0 ? totalCost : null;
  return { portionCost, marginPct: null, confidencePct, ingredientCosts };
}

// ─── List dishes ──────────────────────────────────────────────────────────────
router.get("/food-cost/dishes", async (req, res): Promise<void> => {
  const userId = req.userId!;

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
    })
    .from(dishIngredientsTable)
    .innerJoin(dishesTable, eq(dishIngredientsTable.dishId, dishesTable.id))
    .where(eq(dishesTable.userId, userId));

  const allProductIds = [...new Set(ingredients.map((i) => i.productId))];
  const prices = await getLatestPrices(userId, allProductIds);

  const result = dishes.map((dish) => {
    const ings = ingredients.filter((i) => i.dishId === dish.id).map((i) => ({
      productId: i.productId,
      quantity: parseFloat(i.quantity as string),
      unit: i.unit,
    }));
    const { portionCost, confidencePct } = computeDishCost(ings, prices);
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
      ingredientCount: ings.length,
    };
  });

  res.json(result);
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
    })
    .from(dishIngredientsTable)
    .innerJoin(productsTable, eq(dishIngredientsTable.productId, productsTable.id))
    .where(eq(dishIngredientsTable.dishId, dish.id))
    .orderBy(productsTable.name);

  const productIds = ingredients.map((i) => i.productId);
  const prices = await getLatestPrices(userId, productIds);

  const ingsForCalc = ingredients.map((i) => ({
    productId: i.productId,
    quantity: parseFloat(i.quantity as string),
    unit: i.unit,
  }));
  const { portionCost, confidencePct, ingredientCosts } = computeDishCost(ingsForCalc, prices);

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
    ingredients: ingredients.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      productUnit: i.productUnit,
      quantity: parseFloat(i.quantity as string),
      unit: i.unit,
      unitPrice: prices.get(i.productId)?.unitPrice ?? null,
      ingredientCost: ingredientCosts.get(i.productId) ?? null,
    })),
  });
});

// ─── Create dish ──────────────────────────────────────────────────────────────
router.post("/food-cost/dishes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = CreateDishBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

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

export default router;
