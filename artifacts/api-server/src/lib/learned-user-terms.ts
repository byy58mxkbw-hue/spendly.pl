import { sql } from "drizzle-orm";
import { db, learnedUserCategoryTermsTable } from "@workspace/db";
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
 * Z-user — samo-uczenie terminów kategorii z RĘCZNYCH KOREKT konkretnego usera
 * (patrz schema/learned-user-category-terms.ts po pełne uzasadnienie). Uzupełnia
 * Z10 (learned-category-terms.ts, globalne, z detekcji AI): to tutaj jest sygnał
 * OSOBISTY i działa też dla WŁASNYCH kategorii usera (np. "DRZEWO"), których Z10
 * nigdy nie dotyka (Z10 zna tylko kategorie z listy przekazanej do AI, ale zapisuje
 * globalnie — nie ma to sensu dla kategorii, które istnieją tylko u jednego usera).
 */

export type LearnedUserTermInfo = { category: string; subcategory: string | null };

// Jedna jawna korekta usera to już wystarczający sygnał — w przeciwieństwie do Z9/Z10
// (niepewne detekcje AI, próg 2), tu user OSOBIŚCIE zdecydował.
const MIN_OCCURRENCES_TO_TRUST = 1;
const MIN_TERM_LENGTH = 4;
const MAX_TERMS_PER_CORRECTION = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

const CATEGORY_TERM_STOPWORDS = new Set([
  "swiezy", "swieza", "swieze", "mrozony", "mrozona", "mrozone", "luz", "extra", "premium",
  "polski", "polska", "polskie", "klasyczny", "klasyczna", "tradycyjny", "tradycyjna",
  "domowy", "domowa", "wiejski", "wiejska", "ekologiczny", "bio", "light", "plus", "mix",
  "zestaw", "opakowanie", "porcja", "kawalek", "kawalki", "duzy", "duza", "maly", "mala",
  "nowy", "nowa", "oryginalny", "wysokiej", "jakosci", "gastronomiczny", "gastronomiczna",
]);

function isAlreadyCovered(token: string): boolean {
  if (categoryHasStaticMatch(token)) return true;
  if (matchBrand(token)) return true;
  return false;
}

let cache: Array<{ userId: string; test: KeywordMatcher; info: LearnedUserTermInfo }> = [];
let cacheLoadedAt = 0;
let loadingPromise: Promise<void> | null = null;

async function loadCache(): Promise<void> {
  const rows = await db
    .select({
      userId: learnedUserCategoryTermsTable.userId,
      term: learnedUserCategoryTermsTable.term,
      category: learnedUserCategoryTermsTable.category,
      subcategory: learnedUserCategoryTermsTable.subcategory,
    })
    .from(learnedUserCategoryTermsTable)
    .where(
      sql`${learnedUserCategoryTermsTable.occurrences} >= ${MIN_OCCURRENCES_TO_TRUST} AND ${learnedUserCategoryTermsTable.blocked} = false`,
    );

  cache = rows.map((r) => ({
    userId: r.userId,
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

/** Sprawdź, czy znormalizowana nazwa zawiera term nauczony wcześniej z korekt TEGO usera. */
export async function matchLearnedUserTerm(userId: string, normalizedName: string): Promise<LearnedUserTermInfo | null> {
  try {
    await ensureCacheFresh();
  } catch {
    return null;
  }
  const n = normalizeForMatch(normalizedName);
  for (const row of cache) {
    if (row.userId === userId && row.test(n)) return row.info;
  }
  return null;
}

/**
 * Zapisz termy z ręcznej korekty produktu (fire-and-forget). Wywoływane z
 * saveProductCorrection() przy KAŻDEJ korekcie — buduje generalizację z jednego
 * konkretnego wyboru usera na przyszłe podobne produkty.
 */
export async function recordUserCorrectionTerms(
  userId: string,
  canonicalName: string,
  category: string,
  subcategory: string | null,
  logger?: Logger,
): Promise<void> {
  const candidates = significantTokens(canonicalName, CATEGORY_TERM_STOPWORDS, MIN_TERM_LENGTH)
    .filter((t) => !isAlreadyCovered(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_TERMS_PER_CORRECTION);

  for (const term of candidates) {
    try {
      const [existing] = await db
        .select()
        .from(learnedUserCategoryTermsTable)
        .where(sql`${learnedUserCategoryTermsTable.userId} = ${userId} AND ${learnedUserCategoryTermsTable.term} = ${term}`)
        .limit(1);

      if (!existing) {
        await db.insert(learnedUserCategoryTermsTable).values({
          userId,
          term,
          category,
          subcategory,
          occurrences: 1,
          confidence: "0.95",
        });
        cacheLoadedAt = 0; // od razu zaufany (próg=1) — odśwież cache natychmiast
        continue;
      }

      if (existing.blocked) continue;

      if (existing.category === category) {
        await db
          .update(learnedUserCategoryTermsTable)
          .set({ occurrences: existing.occurrences + 1, subcategory: subcategory ?? existing.subcategory, updatedAt: new Date() })
          .where(sql`${learnedUserCategoryTermsTable.id} = ${existing.id}`);
      } else {
        // KONFLIKT: ten sam user, ten sam term, inna kategoria → term niejednoznaczny
        // nawet w kontekście tego jednego usera (np. "drewno" raz jako materiał do
        // "DRZEWO", innym razem jako deska do krojenia w "sprzet") — blokujemy trwale.
        logger?.warn(
          { userId, term, existingCategory: existing.category, newCategory: category },
          "learned-user-terms: konflikt kategorii, term zablokowany trwale",
        );
        await db
          .update(learnedUserCategoryTermsTable)
          .set({ conflictCount: existing.conflictCount + 1, blocked: true, updatedAt: new Date() })
          .where(sql`${learnedUserCategoryTermsTable.id} = ${existing.id}`);
        cacheLoadedAt = 0;
      }
    } catch (err) {
      logger?.warn({ err, userId, term }, "learned-user-terms: nie udało się zapisać (non-fatal)");
    }
  }
}
