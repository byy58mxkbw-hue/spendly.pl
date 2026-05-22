import { db } from "@workspace/db";
import { userCategoriesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Logger } from "pino";
import { categorizeProduct, BUILTIN_CATEGORY_DEFS } from "./categorize.js";

/**
 * Categorize a product name using:
 * 1. Fast keyword matching (synchronous, zero cost)
 * 2. If "inne" — try user's custom categories first
 * 3. If still "inne" — ask GPT-4o-mini (5s timeout, fallback to "inne")
 *
 * Returns the category ID string.
 */
export async function categorizeProductWithAI(
  productName: string,
  userId: string,
  logger?: Logger,
): Promise<string> {
  // Step 1: Fast keyword matching
  const keywordResult = categorizeProduct(productName);
  if (keywordResult !== "inne") {
    return keywordResult;
  }

  // Step 2: Try user's custom categories by checking label keywords
  try {
    const userCats = await db
      .select()
      .from(userCategoriesTable)
      .where(eq(userCategoriesTable.userId, userId));

    for (const cat of userCats) {
      const normalized = productName.toLowerCase();
      const labelNorm = cat.label.toLowerCase();
      if (normalized.includes(labelNorm) || labelNorm.includes(normalized.split(" ")[0])) {
        return cat.categoryId;
      }
    }
  } catch (err) {
    logger?.warn({ err }, "categorize-ai: failed to fetch user categories");
  }

  // Step 3: AI fallback
  const builtinIds = Object.keys(BUILTIN_CATEGORY_DEFS).filter((id) => id !== "inne");
  const builtinList = builtinIds.map((id) => `${id}: ${BUILTIN_CATEGORY_DEFS[id].label}`).join("\n");

  const prompt = `Jesteś asystentem dla restauracji.
Klasyfikuj produkt do jednej z poniższych kategorii.
Odpowiedz TYLKO jednym ID kategorii (bez cudzysłowów, spacji, bez wyjaśnień).
Jeśli żadna kategoria nie pasuje, odpowiedz: inne

Dostępne kategorie:
${builtinList}

Produkt: ${productName}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0,
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const raw = resp.choices[0]?.message?.content?.trim().toLowerCase() ?? "inne";
    const candidate = raw.replace(/[^a-z_ąćęłńóśźż]/g, "");

    if (builtinIds.includes(candidate)) {
      return candidate;
    }

    logger?.warn({ productName, raw }, "categorize-ai: unexpected AI response");
    return "inne";
  } catch (err) {
    logger?.warn({ productName, err }, "categorize-ai: AI fallback failed, using 'inne'");
    return "inne";
  }
}

/**
 * Get all categories for a user: built-in (id, label, emoji) + user custom.
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
    // table not yet created — return only builtins
  }

  return [...builtinCategories, ...customCategories];
}

/**
 * Ensure a custom category exists for a user.
 * If categoryId already exists (built-in or custom), returns false.
 * Otherwise inserts it and returns true.
 */
export async function ensureCustomCategory(
  userId: string,
  categoryId: string,
  label: string,
): Promise<boolean> {
  if (BUILTIN_CATEGORY_DEFS[categoryId]) return false;

  try {
    await db
      .insert(userCategoriesTable)
      .values({ userId, categoryId, label })
      .onConflictDoNothing();
    return true;
  } catch {
    return false;
  }
}
