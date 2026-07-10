/**
 * Background job: backfill subcategory + confidence for products missing AI classification.
 *
 * Runs automatically on API server startup. Processes products in batches of 10,
 * grouped per user, so each user's corrections are applied correctly.
 * Fire-and-forget: never blocks server startup, never crashes the process.
 */

import { isNull, sql } from "drizzle-orm";
import { db, productsTable, userCategoriesTable, productCorrectionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { categorizeProductWithAI, normalizeProductName } from "../lib/categorize-ai.js";
import { logger } from "../lib/logger.js";
import { BUILTIN_CATEGORY_DEFS, categorizeProduct } from "../lib/categorize.js";

/**
 * Cleanup step: reset classification_confidence to NULL for products whose
 * category is not a known builtin AND not a user-created category.
 * Also marks them needs_review so they get re-classified.
 *
 * Idempotent: after all products are properly classified, this touches 0 rows.
 *
 * NOTE: The old "cleanupHallucinatedUserCategories" step that deleted all entries
 * from user_categories was REMOVED — it incorrectly destroyed user-created categories
 * on every server restart. The current code never auto-creates user_categories
 * (only explicit POST /categories does), so no cleanup of user_categories is needed.
 */
async function cleanupInvalidCategories(): Promise<void> {
  try {
    const builtinIds = Object.keys(BUILTIN_CATEGORY_DEFS);

    // Fetch all user-created custom categories so we don't reset products using them
    const userCatRows = await db
      .select({ categoryId: userCategoriesTable.categoryId })
      .from(userCategoriesTable);
    const userCategoryIds = userCatRows.map((r) => r.categoryId);

    const allValidIds = [...builtinIds, ...userCategoryIds];

    const result = await db.execute(
      sql.raw(
        `UPDATE products
         SET classification_confidence = NULL, needs_review = true
         WHERE category IS NOT NULL
           AND category NOT IN (${allValidIds
             .map((id) => `'${id.replace(/'/g, "''")}'`)
             .join(", ")})`
      )
    );

    const affected = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (affected > 0) {
      logger.info({ affected }, "backfill-categories: reset truly-invalid categories for re-classification (marked needs_review)");
    } else {
      logger.info("backfill-categories: no invalid categories found, cleanup not needed");
    }
  } catch (err) {
    logger.warn({ err }, "backfill-categories: cleanupInvalidCategories failed (non-fatal)");
  }
}

/**
 * Deterministic (zero-AI) reclassification of review-queue leftovers.
 *
 * Products sitting in the "do przeglądu" queue (needs_review = true) that still
 * land in "inne" are re-run through the keyword rules ONLY. With the expanded
 * CATEGORY_RULES (koszty stałe, marki, opakowania, środki czystości…) most of
 * them now match a real category, so we move them out of the queue without any
 * OpenAI calls — exactly like the local cleanup that took the queue 277 → 24.
 *
 * Safe by design:
 *  - only touches products still in the queue (needs_review = true),
 *  - never overrides an explicit user correction,
 *  - idempotent: a second run matches 0 rows because items are no longer "inne".
 */
async function reclassifyQueuedInneByKeywords(): Promise<void> {
  try {
    const queued = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        userId: productsTable.userId,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.needsReview, true),
          eq(productsTable.category, "inne"),
        ),
      );

    if (queued.length === 0) {
      logger.info("backfill-categories: no queued 'inne' products to reclassify");
      return;
    }

    // Load user corrections once so we never override an explicit manual choice.
    const corrections = await db
      .select({
        userId: productCorrectionsTable.userId,
        normalizedName: productCorrectionsTable.normalizedName,
      })
      .from(productCorrectionsTable);
    const correctedKeys = new Set(
      corrections.map((c) => `${c.userId}::${c.normalizedName}`),
    );

    let moved = 0;
    for (const product of queued) {
      const canonicalName =
        normalizeProductName(product.name) || product.name.toLowerCase().trim();

      // Respect manual corrections — leave the user's choice untouched.
      if (correctedKeys.has(`${product.userId}::${canonicalName}`)) continue;

      const keywordCategory =
        categorizeProduct(canonicalName) !== "inne"
          ? categorizeProduct(canonicalName)
          : categorizeProduct(product.name.toLowerCase());

      if (keywordCategory === "inne") continue;

      await db
        .update(productsTable)
        .set({
          category: keywordCategory,
          subcategory: null,
          classificationConfidence: 0.9,
          canonicalName,
          needsReview: false,
        })
        .where(eq(productsTable.id, product.id));
      moved++;
    }

    logger.info(
      { moved, scanned: queued.length, remaining: queued.length - moved },
      "backfill-categories: deterministic keyword reclassification of queued 'inne' done",
    );
  } catch (err) {
    logger.warn({ err }, "backfill-categories: reclassifyQueuedInneByKeywords failed (non-fatal)");
  }
}

/**
 * One-time (idempotent) migration after splitting "sery" out of "nabiał" (Z8).
 *
 * Sery były klasyfikowane zanim reguła "sery" powstała, więc utknęły w "nabiał"
 * (poprawna kategoria builtin — nierewidowana) LUB w "inne" z ustawionym confidence
 * (nierewidowane, bo needs_review=false). Żaden inny krok backfillu ich nie rusza,
 * więc kategoria "Sery" jest pusta na froncie (filtr pokazuje tylko kategorie z
 * produktami). Ten krok re-uruchamia matcher słów kluczowych na produktach w
 * "nabiał" i "inne" — reguła "sery" jest PRZED "nabiał", więc sery zwracają "sery"
 * i są przenoszone. Reszta obu kategorii zostaje nietknięta.
 *
 * Zero AI, bezpieczne przy każdym starcie:
 *  - przenosi wyłącznie gdy matcher zwróci dokładnie "sery" (nie rusza mleka/jaj),
 *  - nigdy nie nadpisuje ręcznej korekty usera,
 *  - idempotentne: po pierwszym przebiegu sery są już w "sery", kolejne = 0 zmian.
 */
async function reclassifyToSery(): Promise<void> {
  try {
    const rows = await db
      .select({ id: productsTable.id, name: productsTable.name, userId: productsTable.userId })
      .from(productsTable)
      .where(inArray(productsTable.category, ["nabiał", "inne"]));

    if (rows.length === 0) {
      logger.info("backfill-categories: no 'nabiał'/'inne' products to check for sery split");
      return;
    }

    // Respect explicit manual corrections — never override a user's choice.
    const corrections = await db
      .select({ userId: productCorrectionsTable.userId, normalizedName: productCorrectionsTable.normalizedName })
      .from(productCorrectionsTable);
    const correctedKeys = new Set(corrections.map((c) => `${c.userId}::${c.normalizedName}`));

    let moved = 0;
    for (const row of rows) {
      const canonicalName = normalizeProductName(row.name) || row.name.toLowerCase().trim();
      if (correctedKeys.has(`${row.userId}::${canonicalName}`)) continue;
      if (categorizeProduct(row.name) !== "sery") continue;
      await db
        .update(productsTable)
        .set({ category: "sery", subcategory: null, classificationConfidence: 0.9, canonicalName, needsReview: false })
        .where(eq(productsTable.id, row.id));
      moved++;
    }

    if (moved > 0) {
      logger.info({ moved, scanned: rows.length }, "backfill-categories: migrated cheeses → sery (no AI)");
    } else {
      logger.info({ scanned: rows.length }, "backfill-categories: no cheeses to migrate into sery");
    }
  } catch (err) {
    logger.warn({ err }, "backfill-categories: reclassifyToSery failed (non-fatal)");
  }
}

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;

async function processBatch(
  products: Array<{ id: number; name: string; category: string | null; userId: string; needsReview: boolean | null }>,
): Promise<void> {
  await Promise.all(
    products.map(async (product) => {
      try {
        const classification = await categorizeProductWithAI(product.name, product.userId);
        const canonicalName = normalizeProductName(product.name) || product.name.toLowerCase().trim();

        // Preserve needs_review=true set by cleanup even when AI has high confidence
        const needsReview = product.needsReview === true || classification.confidence < 0.75;

        await db
          .update(productsTable)
          .set({
            category: classification.category,
            subcategory: classification.subcategory,
            classificationConfidence: classification.confidence,
            canonicalName,
            needsReview,
          })
          .where(eq(productsTable.id, product.id));
      } catch (err) {
        logger.warn({ productId: product.id, productName: product.name, err }, "backfill-categories: failed to classify product");
      }
    }),
  );
}

export async function runCategoryBackfill(): Promise<void> {
  // Step 1: Reset products with categories that aren't builtin or user-created
  await cleanupInvalidCategories();

  // Step 2: Deterministic, zero-AI keyword reclassification of queued "inne"
  // products — clears most of the review queue before paying for any AI calls.
  await reclassifyQueuedInneByKeywords();

  // Step 2b: Migruj sery zaklasyfikowane jako "nabiał"/"inne" do nowej kategorii "sery" (Z8).
  await reclassifyToSery();

  try {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        category: productsTable.category,
        userId: productsTable.userId,
        needsReview: productsTable.needsReview,
      })
      .from(productsTable)
      .where(isNull(productsTable.classificationConfidence))
      .orderBy(productsTable.userId, productsTable.id);

    if (products.length === 0) {
      logger.info("backfill-categories: all products already classified, nothing to do");
      return;
    }

    logger.info({ count: products.length }, "backfill-categories: starting background classification");

    let done = 0;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      await processBatch(batch);
      done += batch.length;

      if (done % 50 === 0 || done === products.length) {
        logger.info({ done, total: products.length }, "backfill-categories: progress");
      }

      if (i + BATCH_SIZE < products.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    logger.info({ total: done }, "backfill-categories: completed");
  } catch (err) {
    logger.error({ err }, "backfill-categories: job failed");
  }
}
