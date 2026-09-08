import { sql } from "drizzle-orm";
import { db, learnedCategoryTermsTable } from "@workspace/db";
import type { Logger } from "pino";
import {
  buildKeywordMatcher,
  normalizeForMatch,
  significantTokens,
  categoryHasStaticMatch,
  type KeywordMatcher,
} from "@workspace/category-rules";
import { matchBrand } from "./brand-map.js";

/**
 * Z10 — samo-uczenie się ogólnych rzeczowników kategorii (nie marek — patrz Z9
 * w lib/learned-brands.ts). Gdy AI pewnie zaklasyfikuje produkt do kategorii,
 * a żaden statyczny keyword/brand go nie złapał, zapamiętujemy najbardziej
 * znaczący token z nazwy — kolejne produkty z tym tokenem są łapane bez
 * ponownego wywołania AI. Patrz komentarz w schema (learned-category-terms.ts)
 * po pełne uzasadnienie guardów.
 */

export type LearnedCategoryTermInfo = { category: string; subcategory: string | null };

const MIN_OCCURRENCES_TO_TRUST = 2;
const MIN_TERM_LENGTH = 4; // krótsze niż statyczne "ser"/"por" — zbyt ryzykowne dla auto-uczenia
const MAX_TERMS_PER_DETECTION = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Stopwords dla ekstrakcji tokenów kategorii — przymiotniki/marketing, które opisują
// WIELE kategorii i nigdy nie powinny same w sobie definiować kategorii. Osobny
// zbiór od ING_STOPWORDS w routes/food-cost.ts (tamten jest dla domeny dopasowania
// składnik→produkt), bo tu ryzyko fałszywego uczenia jest wyższe (zapis globalny).
const CATEGORY_TERM_STOPWORDS = new Set([
  "swiezy", "swieza", "swieze", "mrozony", "mrozona", "mrozone", "luz", "extra", "premium",
  "polski", "polska", "polskie", "klasyczny", "klasyczna", "tradycyjny", "tradycyjna",
  "domowy", "domowa", "wiejski", "wiejska", "ekologiczny", "bio", "light", "plus", "mix",
  "zestaw", "opakowanie", "porcja", "kawalek", "kawalki", "duzy", "duza", "maly", "mala",
  "nowy", "nowa", "oryginalny", "wysokiej", "jakosci", "gastronomiczny", "gastronomiczna",
]);

function isAlreadyCovered(token: string): boolean {
  // Token ma już statyczne znaczenie (keyword albo marka) — nie warto go uczyć ponownie.
  if (categoryHasStaticMatch(token)) return true;
  if (matchBrand(token)) return true;
  return false;
}

let cache: Array<{ test: KeywordMatcher; info: LearnedCategoryTermInfo }> = [];
let cacheLoadedAt = 0;
let loadingPromise: Promise<void> | null = null;

async function loadCache(): Promise<void> {
  const rows = await db
    .select({
      term: learnedCategoryTermsTable.term,
      category: learnedCategoryTermsTable.category,
      subcategory: learnedCategoryTermsTable.subcategory,
    })
    .from(learnedCategoryTermsTable)
    .where(
      sql`${learnedCategoryTermsTable.occurrences} >= ${MIN_OCCURRENCES_TO_TRUST} AND ${learnedCategoryTermsTable.blocked} = false`,
    );

  cache = rows.map((r) => ({
    test: buildKeywordMatcher(r.term),
    info: { category: r.category, subcategory: r.subcategory },
  }));
  cacheLoadedAt = Date.now();
}

async function ensureCacheFresh(): Promise<void> {
  if (cacheLoadedAt > 0 && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  if (!loadingPromise) {
    loadingPromise = loadCache().finally(() => { loadingPromise = null; });
  }
  await loadingPromise;
}

/** Sprawdź, czy znormalizowana nazwa zawiera termin kategorii nauczony wcześniej przez AI. */
export async function matchLearnedCategoryTerm(normalizedName: string): Promise<LearnedCategoryTermInfo | null> {
  try {
    await ensureCacheFresh();
  } catch {
    return null; // DB chwilowo niedostępna — nie blokuj klasyfikacji, po prostu pomiń
  }
  const n = normalizeForMatch(normalizedName);
  for (const { test, info } of cache) {
    if (test(n)) return info;
  }
  return null;
}

/**
 * Zapisz detekcję terminu kategorii przez AI (fire-and-forget). Ekstrahuje do
 * MAX_TERMS_PER_DETECTION najbardziej znaczących tokenów z nazwy (dłuższe/bardziej
 * specyficzne pierwsze), pomijając te już pokryte przez statyczny keyword/brand.
 * Przy konflikcie kategorii dla tego samego termu — BLOKUJE go trwale (patrz
 * uzasadnienie w schema).
 */
export async function recordCategoryTermDetection(
  canonicalName: string,
  category: string,
  subcategory: string | null,
  confidence: number,
  logger?: Logger,
): Promise<void> {
  // Próg wyższy niż przy markach (0.7) — tu wnioskujemy pośrednio z całej nazwy,
  // więc dajemy AI mniejszy margines niepewności zanim coś utrwalimy globalnie.
  if (category === "inne" || confidence < 0.75) return;

  const candidates = significantTokens(canonicalName, CATEGORY_TERM_STOPWORDS, MIN_TERM_LENGTH)
    .filter((t) => !isAlreadyCovered(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_TERMS_PER_DETECTION);

  for (const term of candidates) {
    try {
      const [existing] = await db
        .select()
        .from(learnedCategoryTermsTable)
        .where(sql`${learnedCategoryTermsTable.term} = ${term}`)
        .limit(1);

      if (!existing) {
        await db.insert(learnedCategoryTermsTable).values({
          term,
          category,
          subcategory,
          occurrences: 1,
          confidence: confidence.toFixed(2),
        });
        continue;
      }

      if (existing.blocked) continue; // term skompromitowany wcześniejszym konfliktem — nigdy więcej

      if (existing.category === category) {
        const nextOccurrences = existing.occurrences + 1;
        await db
          .update(learnedCategoryTermsTable)
          .set({
            occurrences: nextOccurrences,
            confidence: Math.max(Number(existing.confidence), confidence).toFixed(2),
            subcategory: subcategory ?? existing.subcategory,
            updatedAt: new Date(),
          })
          .where(sql`${learnedCategoryTermsTable.id} = ${existing.id}`);
        if (nextOccurrences === MIN_OCCURRENCES_TO_TRUST) cacheLoadedAt = 0;
      } else {
        // KONFLIKT: ten sam term, inna kategoria → term jest niejednoznaczny, blokujemy TRWALE.
        logger?.warn(
          { term, existingCategory: existing.category, newCategory: category },
          "learned-category-terms: konflikt kategorii, term zablokowany trwale",
        );
        await db
          .update(learnedCategoryTermsTable)
          .set({ conflictCount: existing.conflictCount + 1, blocked: true, updatedAt: new Date() })
          .where(sql`${learnedCategoryTermsTable.id} = ${existing.id}`);
        cacheLoadedAt = 0;
      }
    } catch (err) {
      logger?.warn({ err, term }, "learned-category-terms: nie udało się zapisać detekcji (non-fatal)");
    }
  }
}
