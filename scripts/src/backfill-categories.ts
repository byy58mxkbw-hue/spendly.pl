/**
 * Backfill AI categorization for all products missing subcategory/confidence.
 *
 * For each product:
 *   - Computes canonicalName (normalized product name)
 *   - Calls GPT-4o-mini to assign subcategory + confirm/improve category + confidence
 *   - Updates subcategory, classificationConfidence, canonicalName, needsReview in DB
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill-categories
 *
 * Options (env vars):
 *   BATCH_SIZE=15       concurrent requests (default 15)
 *   DRY_RUN=1           print results without updating DB
 */

import { db, productsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 15);
const DRY_RUN = process.env.DRY_RUN === "1";

// Canonical built-in categories (matches BUILTIN_CATEGORY_DEFS in categorize.ts)
const CATEGORIES = `alkohole: Alkohole
miesa: Mięso i drób
ryby: Ryby i owoce morza
nabiał: Nabiał i jaja
warzywa: Warzywa i owoce
pieczywo: Pieczywo i makarony
przyprawy: Przyprawy, oleje i sosy
napoje: Napoje bezalkoholowe
slodycze: Słodycze i desery
mrozoniki: Mrożonki
mrozonki: Mrożonki
srodki_czystosci: Środki czystości
opakowania: Opakowania i jednorazówki
inne: Inne`;

function normalizeProductName(name: string): string {
  return name
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/^\s*\d+\s*[xX]\s*/g, "")
    .replace(/\b\d+[,.]?\d*\s*(kg|dkg|g|l|ml|szt|op|opak|pcs|litr|butel|zest|kpl)\b/gi, "")
    .replace(/[-–—/\\|]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

async function classifyProduct(
  name: string,
  existingCategory: string | null,
): Promise<{ category: string; subcategory: string | null; confidence: number }> {
  const canonicalName = normalizeProductName(name) || name.toLowerCase().trim();
  const categoryHint = existingCategory && existingCategory !== "inne"
    ? `\nObecna kategoria (może być poprawna): ${existingCategory}`
    : "";

  const prompt = `Jesteś asystentem restauracji. Klasyfikuj produkt gastronomiczny.

Zwróć WYŁĄCZNIE obiekt JSON (bez markdown):
{"category":"<id>","subcategory":"<podkategoria po polsku lub null>","confidence":<0.0-1.0>}

Zasady:
- category: dokładne ID z listy poniżej
- subcategory: szczegółowa podkategoria (np. "pierś z kurczaka", "łosoś atlantycki", "ser gouda") lub null
- confidence: pewność od 0.0 do 1.0

Dostępne kategorie:
${CATEGORIES}${categoryHint}

Produkt: ${name}
Znormalizowana nazwa: ${canonicalName}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = resp.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      category?: string;
      subcategory?: string | null;
      confidence?: number;
    };

    const category = (parsed.category?.trim() ?? existingCategory ?? "inne").replace(/^NEW:/i, "inne");
    const subcategory = typeof parsed.subcategory === "string" ? parsed.subcategory.trim() || null : null;
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.6;

    return { category, subcategory, confidence };
  } catch {
    return { category: existingCategory ?? "inne", subcategory: null, confidence: 0.5 };
  }
}

async function processBatch(
  products: Array<{ id: number; name: string; category: string | null }>,
  done: number,
  total: number,
): Promise<void> {
  await Promise.all(
    products.map(async (product) => {
      const canonicalName = normalizeProductName(product.name) || product.name.toLowerCase().trim();
      const { category, subcategory, confidence } = await classifyProduct(product.name, product.category);
      const needsReview = confidence < 0.75;

      if (DRY_RUN) {
        console.log(`[DRY] ${product.name} → ${category} / ${subcategory ?? "—"} (${(confidence * 100).toFixed(0)}%)`);
        return;
      }

      await db
        .update(productsTable)
        .set({
          category,
          subcategory,
          classificationConfidence: confidence,
          canonicalName,
          needsReview,
        })
        .where(eq(productsTable.id, product.id));
    }),
  );

  const pct = (((done + products.length) / total) * 100).toFixed(0);
  console.log(`  [${pct}%] ${done + products.length}/${total} done`);
}

async function main() {
  console.log(`Backfill AI categories — BATCH_SIZE=${BATCH_SIZE}${DRY_RUN ? " DRY_RUN" : ""}`);

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      category: productsTable.category,
    })
    .from(productsTable)
    .where(isNull(productsTable.classificationConfidence))
    .orderBy(productsTable.id);

  console.log(`Found ${products.length} products to process.\n`);

  if (products.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  let done = 0;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await processBatch(batch, done, products.length);
    done += batch.length;

    // Small delay between batches to stay within rate limits
    if (i + BATCH_SIZE < products.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Print summary
  const updated = await db
    .select({
      id: productsTable.id,
      subcategory: productsTable.subcategory,
      classificationConfidence: productsTable.classificationConfidence,
      needsReview: productsTable.needsReview,
    })
    .from(productsTable)
    .where(isNull(productsTable.classificationConfidence));

  console.log(`\nDone! ${DRY_RUN ? "(dry run — no changes made)" : `${done} products updated.`}`);
  if (!DRY_RUN) {
    console.log(`Remaining without confidence: ${updated.length}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
