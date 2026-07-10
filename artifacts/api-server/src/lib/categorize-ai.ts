import { db } from "@workspace/db";
import { userCategoriesTable, productCorrectionsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Logger } from "pino";
import { categorizeProduct, BUILTIN_CATEGORY_DEFS } from "./categorize.js";

export interface ClassificationResult {
  category: string;
  subcategory: string | null;
  confidence: number;
  canonicalName: string;
}

/**
 * Normalize a raw product name from an invoice into a cleaner canonical form.
 * Removes brand prefixes in brackets, units, leading quantities, etc.
 */
export function normalizeProductName(name: string): string {
  return name
    .replace(/\[.*?\]/g, "")                                     // Remove [BRAND] prefixes
    .replace(/\(.*?\)/g, "")                                     // Remove (info in parens)
    .replace(/^\s*\d+\s*[xX]\s*/g, "")                          // Remove "2x " quantity prefix
    .replace(/\b\d+[,.]?\d*\s*(kg|dkg|g|l|ml|szt|op|opak|pcs|litr|butel|zest|kpl)\b/gi, "")
    .replace(/[-–—/\\|]+$/, "")                                  // Remove trailing separators
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Get all categories for a user: built-in + user custom.
 */
export async function getUserCategories(userId: string): Promise<
  Array<{ id: string; label: string; emoji: string; isCustom: boolean }>
> {
  const builtinCategories = Object.entries(BUILTIN_CATEGORY_DEFS).map(([id, def]) => ({
    id,
    label: def.label,
    emoji: def.emoji,
    isCustom: false,
  }));

  let customCategories: Array<{ id: string; label: string; emoji: string; isCustom: boolean }> = [];
  try {
    const rows = await db
      .select()
      .from(userCategoriesTable)
      .where(eq(userCategoriesTable.userId, userId));

    customCategories = rows.map((r) => ({
      id: r.categoryId,
      label: r.label,
      emoji: "🏷️",
      isCustom: true,
    }));
  } catch {
    // table not yet migrated — return only builtins
  }

  return [...builtinCategories, ...customCategories];
}

/**
 * Ensure a custom category exists for a user (upsert).
 * Silently does nothing if the ID already exists (built-in or custom).
 */
export async function ensureCustomCategory(
  userId: string,
  categoryId: string,
  label: string,
): Promise<string> {
  if (BUILTIN_CATEGORY_DEFS[categoryId]) return categoryId;

  try {
    await db
      .insert(userCategoriesTable)
      .values({ userId, categoryId, label })
      .onConflictDoNothing();
  } catch {
    // ignore
  }
  return categoryId;
}

/**
 * Look up the most recent user correction for a normalized product name.
 * Returns null if no correction exists.
 */
async function getLatestCorrection(
  userId: string,
  normalizedName: string,
): Promise<{ correctedCategory: string; correctedSubcategory: string | null } | null> {
  try {
    const [row] = await db
      .select({
        correctedCategory: productCorrectionsTable.correctedCategory,
        correctedSubcategory: productCorrectionsTable.correctedSubcategory,
      })
      .from(productCorrectionsTable)
      .where(
        and(
          eq(productCorrectionsTable.userId, userId),
          eq(productCorrectionsTable.normalizedName, normalizedName),
        ),
      )
      .orderBy(desc(productCorrectionsTable.createdAt))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Categorize a product name using:
 * 1. Check user corrections (self-learning) — highest priority
 * 2. Fast keyword matching (synchronous, zero cost, confidence 0.90)
 * 3. GPT-4o-mini with full category list → returns JSON with subcategory + confidence
 *
 * Always returns a ClassificationResult with category, subcategory, confidence, canonicalName.
 */
export async function categorizeProductWithAI(
  productName: string,
  userId: string,
  logger?: Logger,
  supplierDefaultCategory?: string | null,
  // Z3: opcjonalnie przekaż kategorie usera (wbudowane + własne), żeby przy imporcie
  // wielu pozycji nie odpytywać DB per produkt. Gdy brak — pobierane wewnątrz (ścieżka AI).
  userCategories?: Array<{ id: string; label: string }>,
): Promise<ClassificationResult> {
  const normalizedName = normalizeProductName(productName);
  const canonicalName = normalizedName || productName.toLowerCase().trim();

  // Step 1: Check user corrections (self-learning override — explicit per-product choice)
  const correction = await getLatestCorrection(userId, canonicalName);
  if (correction) {
    logger?.info({ productName, canonicalName, category: correction.correctedCategory }, "categorize: using user correction");
    return {
      category: correction.correctedCategory,
      subcategory: correction.correctedSubcategory ?? null,
      confidence: 1.0,
      canonicalName,
    };
  }

  // Step 2: Fast keyword matching on normalized + original.
  // Runs BEFORE the supplier default so a reliable keyword hit (e.g. "płyn do naczyń"
  // → środki czystości, "energia elektryczna" → koszty stałe) wins even when the
  // supplier has a default category set for a mixed assortment.
  const keywordResult =
    categorizeProduct(canonicalName) !== "inne"
      ? categorizeProduct(canonicalName)
      : categorizeProduct(productName.toLowerCase());

  if (keywordResult !== "inne") {
    return {
      category: keywordResult,
      subcategory: null,
      confidence: 0.9,
      canonicalName,
    };
  }

  // Step 3: Supplier default category — keyword missed, so fall back to the
  // supplier's configured category (if any) before paying for an AI call.
  if (supplierDefaultCategory) {
    logger?.info({ productName, canonicalName, category: supplierDefaultCategory }, "categorize: using supplier default category");
    return {
      category: supplierDefaultCategory,
      subcategory: null,
      // Z4: to zgadywanie po dostawcy (nie po nazwie produktu) — niższa pewność niż
      // keyword (0.9), żeby przy mieszanym asortymencie pozycja trafiła do „Do przeglądu".
      confidence: 0.6,
      canonicalName,
    };
  }

  if (!openai) {
    logger?.info({ productName }, "categorize: AI not configured, using keyword match fallback");
    return { category: "inne", subcategory: null, confidence: 0.7, canonicalName };
  }

  // Step 3: AI classification — returns JSON with subcategory + confidence
  // Z3: dopuszczamy własne kategorie usera (nie tylko wbudowane) w promptcie i walidacji.
  const cats = userCategories ?? (await getUserCategories(userId)).map((c) => ({ id: c.id, label: c.label }));
  const idByNorm = new Map(
    cats.map((c) => [c.id.toLowerCase().replace(/[^a-z0-9_ąćęłńóśźż]/g, ""), c.id] as const),
  );
  const categoryList = cats.map((c) => `${c.id}: ${c.label}`).join("\n");

  const prompt = `Jesteś asystentem restauracji. Klasyfikuj produkt spożywczy lub gastronomiczny.

Zwróć WYŁĄCZNIE obiekt JSON (bez markdown, bez komentarzy):
{"category":"<id kategorii>","subcategory":"<podkategoria po polsku lub null>","confidence":<0.0-1.0>}

Zasady:
- category: DOKŁADNIE jedno ID z listy poniżej — nic innego. Jeśli żadna kategoria nie pasuje, użyj "inne"
- subcategory: szczegółowa podkategoria (np. "mozzarella", "filet z łososia", "kurczak pierś") lub null
- confidence: pewność klasyfikacji od 0.0 do 1.0

Dostępne kategorie (jedyne dopuszczalne wartości dla "category"):
${categoryList}

Produkt: ${productName}
Znormalizowana nazwa: ${canonicalName}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
        temperature: 0,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const raw = resp.choices[0]?.message?.content?.trim() ?? "{}";
    let parsed: { category?: string; subcategory?: string | null; confidence?: number } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger?.warn({ productName, raw }, "categorize-ai: failed to parse JSON response");
      return { category: "inne", subcategory: null, confidence: 0.4, canonicalName };
    }

    let finalCategory = parsed.category?.trim() ?? "inne";
    const finalConfidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.6;
    const finalSubcategory = parsed.subcategory && parsed.subcategory !== "null"
      ? parsed.subcategory.trim().slice(0, 60)
      : null;

    // Waliduj wobec dozwolonych ID (wbudowane + własne usera); resztę → "inne".
    const normalized = finalCategory.toLowerCase().replace(/[^a-z0-9_ąćęłńóśźż]/g, "");
    const matchedId = idByNorm.get(normalized);
    if (!matchedId) {
      logger?.warn({ productName, finalCategory }, "categorize-ai: unknown category ID, using 'inne'");
      finalCategory = "inne";
    } else {
      finalCategory = matchedId;
    }

    return {
      category: finalCategory,
      subcategory: finalSubcategory,
      confidence: finalConfidence,
      canonicalName,
    };
  } catch (err) {
    logger?.warn({ productName, err }, "categorize-ai: AI fallback failed, using 'inne'");
    return { category: "inne", subcategory: null, confidence: 0.3, canonicalName };
  }
}

/**
 * Save a user correction for self-learning.
 * This is called when a user manually corrects a product's category.
 */
export async function saveProductCorrection(
  userId: string,
  productId: number,
  productName: string,
  correctedCategory: string,
  correctedSubcategory: string | null,
): Promise<void> {
  const normalizedName = normalizeProductName(productName);
  try {
    await db
      .insert(productCorrectionsTable)
      .values({
        userId,
        productId,
        productName,
        normalizedName: normalizedName || productName.toLowerCase().trim(),
        correctedCategory,
        correctedSubcategory,
      });
  } catch (err) {
    // Non-fatal — log but don't throw
  }
}
