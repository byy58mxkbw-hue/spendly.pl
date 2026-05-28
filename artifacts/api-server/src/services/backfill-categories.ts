/**
 * Background job: backfill subcategory + confidence for products missing AI classification.
 *
 * Runs automatically on API server startup. Processes products in batches of 10,
 * grouped per user, so each user's corrections are applied correctly.
 * Fire-and-forget: never blocks server startup, never crashes the process.
 */

import { isNull, sql } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { categorizeProductWithAI, normalizeProductName } from "../lib/categorize-ai.js";
import { logger } from "../lib/logger.js";
import { BUILTIN_CATEGORY_DEFS } from "../lib/categorize.js";

/**
 * One-time cleanup: reset classification_confidence to NULL for products whose
 * category is not a known builtin (i.e. AI hallucinations from before validation
 * was added). This allows the backfill to re-classify them with the fixed logic.
 *
 * Safe to run on every startup — idempotent: after the first pass, all products
 * will have valid builtin categories and the UPDATE will touch 0 rows.
 */
async function cleanupInvalidCategories(): Promise<void> {
  try {
    const builtinIds = Object.keys(BUILTIN_CATEGORY_DEFS);

    // Reset invalid categories AND mark them needs_review so user can verify the re-classification
    const result = await db.execute(
      sql.raw(`UPDATE products SET classification_confidence = NULL, needs_review = true WHERE category IS NOT NULL AND category NOT IN (${builtinIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ")}) AND category NOT IN (SELECT category_id FROM user_categories WHERE user_id = products.user_id)`)
    );

    const affected = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (affected > 0) {
      logger.info({ affected }, "backfill-categories: reset invalid AI-generated categories for re-classification (marked needs_review)");
    } else {
      logger.info("backfill-categories: no invalid categories found, cleanup not needed");
    }
  } catch (err) {
    logger.warn({ err }, "backfill-categories: cleanup step failed (non-fatal)");
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

        // Preserve needs_review=true set by cleanup (invalid category reset) even when AI has high confidence
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
  // Step 1: Reset invalid (non-builtin, non-custom) categories so they get re-classified
  await cleanupInvalidCategories();

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
