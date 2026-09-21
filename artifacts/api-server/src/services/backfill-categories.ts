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
import { matchBrand } from "../lib/brand-map.js";
import { matchLearnedBrand } from "../lib/learned-brands.js";
import { matchLearnedCategoryTerm } from "../lib/learned-category-terms.js";
import { matchLearnedUserTerm, recordUserCorrectionTerms } from "../lib/learned-user-terms.js";

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

/**
 * One-time (idempotent) korekta fałszywych trafień do "sery" sprzed naprawy
 * matchera słów kluczowych. Klucz "ser " (z końcową spacją) trafiał do gałęzi
 * "fraza" i leciał na gołym includes bez lewej granicy słowa — łapał się jako
 * podciąg w środku dłuższych słów, np. olej "[KONESER GO] FRYTURA RZEPAKOWA"
 * (koneSER go) trafiał do sery. Matcher jest już naprawiony (wymaga granicy
 * z obu stron) — ten krok re-uruchamia go na produktach już oznaczonych jako
 * "sery" i przenosi te, które faktycznie nie powinny tam być.
 *
 * Bezpieczne przy każdym starcie:
 *  - rusza tylko produkty, dla których categorizeProduct() NIE zwraca już "sery"
 *    (prawdziwe sery, np. "ser cheddar", nadal trafiają — zostają bez zmian),
 *  - nigdy nie nadpisuje ręcznej korekty usera,
 *  - wynik matchera (inna kategoria lub "inne") trafia z needsReview=true,
 *    żeby user zweryfikował w kolejce zamiast ślepo ufać automatycznej korekcie,
 *  - idempotentne: po pierwszym przebiegu fałszywe trafienia są już poprawione.
 */
async function fixMiscategorizedSery(): Promise<void> {
  try {
    const rows = await db
      .select({ id: productsTable.id, name: productsTable.name, userId: productsTable.userId })
      .from(productsTable)
      .where(eq(productsTable.category, "sery"));

    if (rows.length === 0) {
      logger.info("backfill-categories: no 'sery' products to re-check");
      return;
    }

    const corrections = await db
      .select({ userId: productCorrectionsTable.userId, normalizedName: productCorrectionsTable.normalizedName })
      .from(productCorrectionsTable);
    const correctedKeys = new Set(corrections.map((c) => `${c.userId}::${c.normalizedName}`));

    let fixed = 0;
    for (const row of rows) {
      const canonicalName = normalizeProductName(row.name) || row.name.toLowerCase().trim();
      if (correctedKeys.has(`${row.userId}::${canonicalName}`)) continue;
      const recategorized = categorizeProduct(row.name);
      if (recategorized === "sery") continue;
      await db
        .update(productsTable)
        .set({ category: recategorized, subcategory: null, classificationConfidence: null, canonicalName, needsReview: true })
        .where(eq(productsTable.id, row.id));
      fixed++;
    }

    if (fixed > 0) {
      logger.info({ fixed, scanned: rows.length }, "backfill-categories: fixed false-positive 'sery' matches (no AI)");
    } else {
      logger.info({ scanned: rows.length }, "backfill-categories: no false-positive 'sery' matches found");
    }
  } catch (err) {
    logger.warn({ err }, "backfill-categories: fixMiscategorizedSery failed (non-fatal)");
  }
}

/**
 * P6 (Krok 7): uzupełnij `canonical_name` dla produktów, które go nie mają
 * (utworzone przed wprowadzeniem kolumny albo przez ścieżkę, która jej nie
 * ustawiała). Kolumna jest wykorzystywana przez indeksowaną propagację korekty
 * kategorii (routes/products.ts, PATCH /products/:id/correct-category) — bez
 * niej ta ścieżka spada na wolniejszy fallback (pełny skan + normalizacja w JS).
 * Idempotentne: po pierwszym przebiegu wszystkie wiersze mają canonical_name.
 */
async function backfillMissingCanonicalNames(): Promise<void> {
  try {
    const rows = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(isNull(productsTable.canonicalName));

    if (rows.length === 0) {
      logger.info("backfill-categories: all products already have canonical_name");
      return;
    }

    for (const row of rows) {
      const canonicalName = normalizeProductName(row.name) || row.name.toLowerCase().trim();
      await db.update(productsTable).set({ canonicalName }).where(eq(productsTable.id, row.id));
    }
    logger.info({ count: rows.length }, "backfill-categories: filled missing canonical_name");
  } catch (err) {
    logger.warn({ err }, "backfill-categories: backfillMissingCanonicalNames failed (non-fatal)");
  }
}

/**
 * Przeliczenie WSZYSTKICH już skategoryzowanych produktów silnikiem po jego
 * przebudowie (fold diakrytyków, unifikacja front/backend, rozszerzone keywordy,
 * usunięte nadmiernie szerokie marki, samo-uczenie Z10) — nie tylko tych w "inne"
 * (to robią już reclassifyQueuedInneByKeywords/reclassifyToSery/fixMiscategorizedSery
 * wyżej). Realny przykład z audytu: setki serów utknęły w "nabiał", bo trafiły tam
 * ZANIM kategoria "Sery" (Z8) w ogóle istniała — findOrCreateProduct nigdy nie
 * nadpisuje klasyfikacji, która nie jest null/"inne" (rule invoices.ts:560-573),
 * więc bez tego kroku zostałyby tam na zawsze mimo poprawnego silnika.
 *
 * Celowo KONSERWATYWNE (bez wywołań AI — tylko deterministyczne ścieżki, ten sam
 * porządek pierwszeństwa co w categorize-ai.ts minus AI): marka statyczna → marka
 * nauczona → keyword → term nauczony. Aktualizuje tylko gdy:
 *  - produkt NIE ma ręcznej korekty (product_corrections) — Z1 ma pierwszeństwo,
 *  - classification_confidence != 1.0 (dodatkowy bezpiecznik dla starszych wierszy
 *    sprzed istnienia tabeli product_corrections, ustawionych ręcznie na pewno),
 *  - nowa kategoria != "inne" — NIGDY nie obniżamy do nieznanej (audyt pokazał
 *    realne ryzyko: fraza z wieloma spacjami nie złapana przez keyword nie może
 *    cofnąć poprawnej wcześniejszej klasyfikacji),
 *  - nowa kategoria różni się od obecnej.
 * Idempotentne: drugi przebieg dotyka 0 wierszy, gdy wszystko już przeliczone.
 */
/**
 * Zasil learned_user_category_terms z historycznych, już istniejących korekt
 * (product_corrections) — bez tego kroku samo-uczenie (Z-user, patrz
 * lib/learned-user-terms.ts) działałoby tylko dla korekt zrobionych PO wdrożeniu
 * tej funkcji. User zgłosił dokładnie ten przypadek: ręcznie poprawił 2 produkty
 * na własną kategorię "DRZEWO" tydzień wcześniej, a kolejne podobne partie i tak
 * lądowały w "inne", bo mechanizm jeszcze nie istniał w momencie tamtej korekty.
 *
 * Bezpieczne przy każdym starcie: recordUserCorrectionTerms samo pilnuje
 * duplikatów/konfliktów (patrz tamten plik), więc ponowne uruchomienie tylko
 * podbija occurrences dla już znanych termów — nieszkodliwe.
 */
async function seedLearnedUserTermsFromCorrections(): Promise<void> {
  try {
    const corrections = await db
      .select({
        userId: productCorrectionsTable.userId,
        normalizedName: productCorrectionsTable.normalizedName,
        correctedCategory: productCorrectionsTable.correctedCategory,
        correctedSubcategory: productCorrectionsTable.correctedSubcategory,
      })
      .from(productCorrectionsTable);

    if (corrections.length === 0) {
      logger.info("backfill-categories: no historical corrections to seed learned-user-terms from");
      return;
    }

    for (const c of corrections) {
      await recordUserCorrectionTerms(c.userId, c.normalizedName, c.correctedCategory, c.correctedSubcategory);
    }
    logger.info({ count: corrections.length }, "backfill-categories: seeded learned-user-terms from historical corrections");
  } catch (err) {
    logger.warn({ err }, "backfill-categories: seedLearnedUserTermsFromCorrections failed (non-fatal)");
  }
}

async function reclassifyAllByDeterministicEngine(): Promise<void> {
  try {
    const rows = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        userId: productsTable.userId,
        category: productsTable.category,
        classificationConfidence: productsTable.classificationConfidence,
      })
      .from(productsTable);

    if (rows.length === 0) return;

    const corrections = await db
      .select({ userId: productCorrectionsTable.userId, normalizedName: productCorrectionsTable.normalizedName })
      .from(productCorrectionsTable);
    const correctedKeys = new Set(corrections.map((c) => `${c.userId}::${c.normalizedName}`));

    let moved = 0;
    for (const row of rows) {
      const canonicalName = normalizeProductName(row.name) || row.name.toLowerCase().trim();
      if (correctedKeys.has(`${row.userId}::${canonicalName}`)) continue;
      if (row.classificationConfidence === 1) continue;

      // UWAGA (regresja znaleziona 2026-09): Z-user MUSI być PO statycznym keywordzie,
      // nie przed — inaczej zbyt ogólny nauczony term (np. "drewno" z korekty drewna
      // budowlanego) przebijał już poprawne, konkretne dopasowanie keywordu dla
      // zupełnie innego produktu (np. "wkręt ... drewno" — wkręt do drewna, prawidłowo
      // "techniczne" przez keyword "wkręt", błędnie nadpisywany na "drzewo"). Kolejność
      // musi być identyczna jak w categorize-ai.ts: brand → learned brand → keyword →
      // Z-user → learned category term.
      const brand = matchBrand(canonicalName) ?? matchBrand(row.name.toLowerCase());
      const learnedBrand = brand ? null : (await matchLearnedBrand(canonicalName)) ?? (await matchLearnedBrand(row.name.toLowerCase()));
      const keywordCat = brand || learnedBrand ? "inne" : (categorizeProduct(canonicalName) !== "inne" ? categorizeProduct(canonicalName) : categorizeProduct(row.name.toLowerCase()));
      const userTerm = brand || learnedBrand || keywordCat !== "inne" ? null : (await matchLearnedUserTerm(row.userId, canonicalName)) ?? (await matchLearnedUserTerm(row.userId, row.name.toLowerCase()));
      const learnedTerm = brand || learnedBrand || keywordCat !== "inne" || userTerm ? null : (await matchLearnedCategoryTerm(canonicalName)) ?? (await matchLearnedCategoryTerm(row.name.toLowerCase()));

      const newCategory = brand?.category ?? learnedBrand?.category ?? (keywordCat !== "inne" ? keywordCat : null) ?? userTerm?.category ?? learnedTerm?.category ?? "inne";
      // UWAGA (regresja znaleziona 2026-09, audyt danych produkcyjnych): learnedBrand i
      // learnedTerm NIE dają subcategory. Jedna marka/term (np. "Trinnity", "Monin",
      // "mpro") pokrywa wiele różnych typów produktów w tej samej kategorii — subcategory
      // zapamiętana z JEDNEGO produktu i tak nadpisywana blindly przy każdej kolejnej
      // detekcji (recordBrandDetection/recordCategoryTermDetection) trafiała, po ponownym
      // uruchomieniu tego joba na starcie serwera, na WSZYSTKIE produkty tej marki/termu w
      // CAŁEJ (wielotenantowej) tabeli products — np. "korek do prób szczelności" na
      // regulatorze grzewczym, "puree owocowe" na syropie. brand (statyczny, ręcznie
      // kurowany brand-map.ts) i userTerm (per-user, z jego własnej korekty) zostają —
      // tam subcategory jest zaufana z dobrego powodu (patrz komentarze w categorize-ai.ts).
      const newSubcategory = brand?.subcategory ?? userTerm?.subcategory ?? null;
      const newConfidence = brand ? 0.92 : learnedBrand ? 0.85 : keywordCat !== "inne" ? 0.9 : userTerm ? 0.95 : learnedTerm ? 0.8 : 0;

      if (newCategory === "inne" || newCategory === row.category) continue;

      await db
        .update(productsTable)
        .set({
          category: newCategory,
          subcategory: newSubcategory,
          classificationConfidence: newConfidence,
          canonicalName,
          needsReview: false,
        })
        .where(eq(productsTable.id, row.id));
      moved++;
    }

    if (moved > 0) {
      logger.info({ moved, scanned: rows.length }, "backfill-categories: reclassified already-categorized products (engine rebuild, no AI)");
    } else {
      logger.info({ scanned: rows.length }, "backfill-categories: no already-categorized products needed reclassification");
    }
  } catch (err) {
    logger.warn({ err }, "backfill-categories: reclassifyAllByDeterministicEngine failed (non-fatal)");
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
  // Step 0: uzupełnij canonical_name tam gdzie brakuje (potrzebne dla indeksowanej
  // propagacji korekty kategorii, patrz routes/products.ts).
  await backfillMissingCanonicalNames();

  // Step 1: Reset products with categories that aren't builtin or user-created
  await cleanupInvalidCategories();

  // Step 2: Deterministic, zero-AI keyword reclassification of queued "inne"
  // products — clears most of the review queue before paying for any AI calls.
  await reclassifyQueuedInneByKeywords();

  // Step 2b: Migruj sery zaklasyfikowane jako "nabiał"/"inne" do nowej kategorii "sery" (Z8).
  await reclassifyToSery();

  // Step 2c: Napraw falszywe trafienia do "sery" sprzed naprawy matchera slow kluczowych
  // (np. olej "koneser" lapany jako podciag "ser " bez granicy slowa).
  await fixMiscategorizedSery();

  // Step 2c-2: zasil samo-uczenie z własnych kategorii usera historycznymi korektami
  // (Z-user) — musi być PRZED reclassifyAllByDeterministicEngine, żeby ten krok mógł
  // już z niego skorzystać w tym samym przebiegu startowym.
  await seedLearnedUserTermsFromCorrections();

  // Step 2d: przelicz WSZYSTKIE już skategoryzowane produkty przebudowanym silnikiem
  // (nie tylko sery/inne wyżej) — patrz uzasadnienie przy funkcji.
  await reclassifyAllByDeterministicEngine();

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
