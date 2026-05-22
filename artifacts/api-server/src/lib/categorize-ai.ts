import { db } from "@workspace/db";
import { userCategoriesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Logger } from "pino";
import { categorizeProduct, BUILTIN_CATEGORY_DEFS } from "./categorize.js";

/**
 * Slugify a label into a safe category ID.
 * e.g. "Dania gotowe" → "dania_gotowe"
 */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
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
 * Returns the final categoryId (may differ from input if de-duped).
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
 * Categorize a product name using:
 * 1. Fast keyword matching (synchronous, zero cost)
 * 2. If "inne" — ask GPT-4o-mini with full category list
 *    (built-in + user custom categories)
 *    AI may pick an existing category OR propose a new label (prefixed "NEW:")
 *    New labels are slugified, persisted, and returned.
 * 3. On any error or timeout — returns "inne"
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

  // Step 2: Build complete category list (built-in + user custom)
  const allCategories = await getUserCategories(userId);
  const existingIds = allCategories.map((c) => c.id);
  const categoryList = allCategories
    .map((c) => `${c.id}: ${c.label}`)
    .join("\n");

  const prompt = `Jesteś asystentem restauracji. Klasyfikuj produkt do najlepiej pasującej kategorii.

Możliwe odpowiedzi:
1. Podaj dokładne ID istniejącej kategorii (bez cudzysłowów, bez spacji)
2. Jeśli żadna nie pasuje, zaproponuj nową kategorię: NEW:<polska_nazwa> np. NEW:Dania gotowe

Istniejące kategorie:
${categoryList}

Produkt: ${productName}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 30,
        temperature: 0,
      },
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    const raw = resp.choices[0]?.message?.content?.trim() ?? "inne";

    // Handle NEW:<label> response
    const newMatch = raw.match(/^NEW:(.+)$/i);
    if (newMatch) {
      const newLabel = newMatch[1].trim().slice(0, 60);
      if (newLabel.length >= 2) {
        let slug = slugify(newLabel);
        // Avoid collisions with existing IDs
        if (existingIds.includes(slug)) {
          slug = `${slug}_2`;
        }
        await ensureCustomCategory(userId, slug, newLabel);
        logger?.info({ productName, slug, newLabel }, "categorize-ai: created new category");
        return slug;
      }
    }

    // Handle existing category ID response
    const candidate = raw.toLowerCase().replace(/[^a-z0-9_ąćęłńóśźż]/g, "");
    if (existingIds.includes(candidate)) {
      return candidate;
    }

    logger?.warn({ productName, raw }, "categorize-ai: unexpected AI response, using 'inne'");
    return "inne";
  } catch (err) {
    logger?.warn({ productName, err }, "categorize-ai: AI fallback failed, using 'inne'");
    return "inne";
  }
}
