/**
 * Background job: backfill subcategory + confidence for products missing AI classification.
 *
 * Runs automatically on API server startup. Processes products in batches of 10,
 * grouped per user, so each user's corrections are applied correctly.
 * Fire-and-forget: never blocks server startup, never crashes the process.
 */

import { isNull } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { categorizeProductWithAI, normalizeProductName } from "../lib/categorize-ai.js";
import { logger } from "../lib/logger.js";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;

async function processBatch(
  products: Array<{ id: number; name: string; category: string | null; userId: string }>,
): Promise<void> {
  await Promise.all(
    products.map(async (product) => {
      try {
        const classification = await categorizeProductWithAI(product.name, product.userId);
        const canonicalName = normalizeProductName(product.name) || product.name.toLowerCase().trim();

        await db
          .update(productsTable)
          .set({
            category: classification.category,
            subcategory: classification.subcategory,
            classificationConfidence: classification.confidence,
            canonicalName,
            needsReview: classification.confidence < 0.75,
          })
          .where(eq(productsTable.id, product.id));
      } catch (err) {
        logger.warn({ productId: product.id, productName: product.name, err }, "backfill-categories: failed to classify product");
      }
    }),
  );
}

export async function runCategoryBackfill(): Promise<void> {
  try {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        category: productsTable.category,
        userId: productsTable.userId,
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
