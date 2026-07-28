import { Router, type IRouter } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, dishesTable, dishIngredientsTable, productsTable, invoiceItemsTable, invoicesTable } from "@workspace/db";
import { CreateDishBody, UpdateDishBody, GetDishParams, UpdateDishParams, DeleteDishParams, ImportMenuBody, SaveMenuDishesBody } from "@workspace/api-zod";
import { requireOpenAI } from "@workspace/integrations-openai-ai-server";
import { findOrCreateProductByName } from "../services/ksef-ingest";

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

function convertIngredientCost(
  qty: number,
  recipeUnit: string,
  invoiceUnit: string,
  unitPrice: number,
  productName: string,
): number {
  const recipe = toBase(qty, recipeUnit);
  const invoice = toBase(1, invoiceUnit);

  if (recipe.base === invoice.base) {
    // same family (g/ml) — direct ratio
    return (recipe.value / invoice.value) * unitPrice;
  }

  // Invoice is per-piece (szt/opak) but recipe is in g/ml —
  // try to extract package size from product name to bridge the gap.
  const isPiece = invoice.base !== "g" && invoice.base !== "ml";
  const isWeightOrVolume = recipe.base === "g" || recipe.base === "ml";
  if (isPiece && isWeightOrVolume) {
    const pkg = parsePackageSize(productName);
    if (pkg && pkg.base === recipe.base) {
      // e.g. recipe: 50ml, package: 700ml, price: 25 zł/szt
      // cost = (50 / 700) * 25 = 1.79 zł
      return (recipe.value / pkg.valueInBase) * unitPrice;
    }
  }

  // incompatible and no parse fallback — use qty directly (szt <-> szt)
  return qty * unitPrice;
}

async function getLatestPrices(userId: string, productIds: number[]): Promise<Map<number, { unitPrice: number; unit: string; productName: string }>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({
      productId: invoiceItemsTable.productId,
      unitPrice: invoiceItemsTable.unitPrice,
      unit: invoiceItemsTable.unit,
      productName: productsTable.name,
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

  const map = new Map<number, { unitPrice: number; unit: string; productName: string }>();
  for (const row of rows) {
    if (!map.has(row.productId!)) {
      map.set(row.productId!, {
        unitPrice: parseFloat(row.unitPrice as string),
        unit: row.unit ?? "szt",
        productName: row.productName ?? "",
      });
    }
  }
  return map;
}

function computeDishCost(
  ingredients: Array<{ productId: number; quantity: number; unit: string }>,
  prices: Map<number, { unitPrice: number; unit: string; productName: string }>,
): { portionCost: number | null; marginPct: number | null; confidencePct: number; ingredientCosts: Map<number, number | null> } {
  let totalCost = 0;
  let known = 0;
  const ingredientCosts = new Map<number, number | null>();

  for (const ing of ingredients) {
    const price = prices.get(ing.productId);
    if (price) {
      const cost = convertIngredientCost(ing.quantity, ing.unit, price.unit, price.unitPrice, price.productName);
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

// ─── Marże wszystkich dań (reużywane przez trasę listy ORAZ AI CFO) ────────────
export interface DishMargin {
  id: number;
  name: string;
  sellPrice: number;
  category: string | null;
  portionCost: number | null;
  marginPct: number | null;
  confidencePct: number;
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
    })
    .from(dishIngredientsTable)
    .innerJoin(dishesTable, eq(dishIngredientsTable.dishId, dishesTable.id))
    .where(eq(dishesTable.userId, userId));

  const allProductIds = [...new Set(ingredients.map((i) => i.productId))];
  const prices = await getLatestPrices(userId, allProductIds);

  return dishes.map((dish) => {
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
}

// ─── List dishes ──────────────────────────────────────────────────────────────
router.get("/food-cost/dishes", async (req, res): Promise<void> => {
  res.json(await computeAllDishMargins(req.userId!));
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
        { "name": "surowcowa nazwa składnika", "grams": number (szacowana gramatura na 1 porcję w gramach lub ml) }
      ]
    }
  ]
}

Zasady:
- Używaj generycznych, surowcowych nazw składników po polsku (np. "pierś z kurczaka", "ser mozzarella", "mąka pszenna", "pomidory", "ryż") — łatwiejsze dopasowanie do faktur zakupowych.
- Szacuj realistyczne gramatury na JEDNĄ porcję. To przybliżenie — nie musi być dokładne.
- Pomijaj przyprawy i dodatki o pomijalnym koszcie (sól, pieprz) albo zgrupuj jako jeden składnik "przyprawy" z małą gramaturą.
- NIE wymyślaj dań, których nie ma na karcie. Jeśli czegoś nie widać wyraźnie — pomiń.
- Zwróć poprawny JSON, bez komentarzy.`;

type ExtractedMenuIngredient = { name: string; grams: number };
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
        .map((i) => ({ name: String(i.name).trim(), grams: typeof i.grams === "number" && i.grams > 0 ? i.grams : 0 })),
    }));

  // Read-only match: wczytaj wszystkie produkty usera raz, dopasuj po znormalizowanej nazwie
  const userProducts = await db
    .select({ id: productsTable.id, name: productsTable.name, unit: productsTable.unit })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));
  const productByNorm = new Map<string, { id: number; name: string; unit: string }>();
  for (const p of userProducts) {
    const key = normalizeName(p.name);
    if (!productByNorm.has(key)) productByNorm.set(key, { id: p.id, name: p.name, unit: p.unit ?? "szt" });
  }

  // Ceny dla dopasowanych produktów (jedno zapytanie)
  const matchedIds = new Set<number>();
  for (const d of cleanDishes) for (const ing of d.ingredients) {
    const p = productByNorm.get(normalizeName(ing.name));
    if (p) matchedIds.add(p.id);
  }
  const prices = await getLatestPrices(userId, [...matchedIds]);

  // Zbuduj podgląd z wstępną wyceną per danie (gramy → unit "g")
  const preview = cleanDishes.map((d) => {
    const ingredients = d.ingredients.map((ing) => {
      const p = productByNorm.get(normalizeName(ing.name));
      const price = p ? prices.get(p.id) : undefined;
      const ingredientCost = p && price ? convertIngredientCost(ing.grams, "g", price.unit, price.unitPrice, price.productName) : null;
      return {
        name: ing.name,
        grams: ing.grams,
        matchedProductId: p?.id ?? null,
        matchedName: p?.name ?? null,
        unitPrice: price?.unitPrice ?? null,
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
    const ingredientRows: Array<{ productId: number; grams: number }> = [];
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
      ingredientRows.push({ productId, grams: ing.grams });
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
        ingredientRows.map((r) => ({ dishId: dish.id, productId: r.productId, quantity: String(r.grams), unit: "g" })),
      );
    }
    createdIds.push(dish.id);
  }

  res.status(201).json({ createdIds });
});

export default router;
