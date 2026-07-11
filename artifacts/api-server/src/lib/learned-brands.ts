import { sql } from "drizzle-orm";
import { db, learnedBrandsTable } from "@workspace/db";
import type { Logger } from "pino";

/**
 * Z9 — samo-uczenie się marek z detekcji AI (categorize-ai.ts, pole detectedBrand
 * w odpowiedzi GPT). Wcześniej (Z7) detekcja była tylko logowana i wyrzucana.
 * Teraz: gdy AI wykryje markę z sensowną pewnością, zapisujemy ją globalnie
 * (marka to fakt o produkcie, nie preferencja usera — jak statyczny brand-map.ts).
 * Po osiągnięciu progu potwierdzeń kolejne produkty tej marki są klasyfikowane
 * bez wywołania AI (szybciej, taniej), tak jak wpisy z brand-map.ts.
 */

export type LearnedBrandInfo = { category: string; subcategory: string | null };

// Wymagane min. 2 niezależne potwierdzenia zanim marka zacznie być używana do
// auto-klasyfikacji — jedna wątpliwa detekcja AI nie może od razu wpłynąć na
// klasyfikację innych userów (tabela jest globalna).
const MIN_OCCURRENCES_TO_TRUST = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;

const KW_WORD_CHARS = "a-z0-9ąćęłńóśźż";
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildMatcher(brand: string): (n: string) => boolean {
  const b = brand.toLowerCase();
  if (b.includes(" ")) return (n: string) => n.includes(b);
  const re = new RegExp("(^|[^" + KW_WORD_CHARS + "])" + escapeRegex(b));
  return (n: string) => re.test(n);
}

let cache: Array<{ test: (n: string) => boolean; info: LearnedBrandInfo }> = [];
let cacheLoadedAt = 0;
let loadingPromise: Promise<void> | null = null;

async function loadCache(): Promise<void> {
  const rows = await db
    .select({
      brand: learnedBrandsTable.brand,
      category: learnedBrandsTable.category,
      subcategory: learnedBrandsTable.subcategory,
    })
    .from(learnedBrandsTable)
    .where(sql`${learnedBrandsTable.occurrences} >= ${MIN_OCCURRENCES_TO_TRUST}`);

  cache = rows.map((r) => ({
    test: buildMatcher(r.brand),
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

/** Sprawdź, czy znormalizowana nazwa zawiera markę nauczoną wcześniej przez AI. */
export async function matchLearnedBrand(normalizedName: string): Promise<LearnedBrandInfo | null> {
  try {
    await ensureCacheFresh();
  } catch {
    return null; // DB chwilowo niedostępna — nie blokuj klasyfikacji, po prostu pomiń
  }
  const n = normalizedName.toLowerCase();
  for (const { test, info } of cache) {
    if (test(n)) return info;
  }
  return null;
}

/**
 * Zapisz detekcję marki przez AI (fire-and-forget, wywołujący nie czeka na wynik).
 * Przy konflikcie (ta sama marka, inna kategoria niż zapamiętana) NIE nadpisuje —
 * loguje ostrzeżenie, żeby jedna wątpliwa detekcja nie nadpisała utrwalonej klasyfikacji.
 */
export async function recordBrandDetection(
  rawBrand: string,
  category: string,
  subcategory: string | null,
  confidence: number,
  logger?: Logger,
): Promise<void> {
  const brand = rawBrand.toLowerCase().trim();
  if (!brand || brand.length < 3) return;

  try {
    const [existing] = await db
      .select()
      .from(learnedBrandsTable)
      .where(sql`${learnedBrandsTable.brand} = ${brand}`)
      .limit(1);

    if (!existing) {
      await db.insert(learnedBrandsTable).values({
        brand,
        category,
        subcategory,
        occurrences: 1,
        confidence: confidence.toFixed(2),
      });
      return;
    }

    if (existing.category !== category) {
      logger?.warn(
        { brand, existingCategory: existing.category, newCategory: category },
        "learned-brands: konflikt kategorii dla marki, zachowuję istniejącą",
      );
      return;
    }

    const nextOccurrences = existing.occurrences + 1;
    await db
      .update(learnedBrandsTable)
      .set({
        occurrences: nextOccurrences,
        confidence: Math.max(Number(existing.confidence), confidence).toFixed(2),
        subcategory: subcategory ?? existing.subcategory,
        updatedAt: new Date(),
      })
      .where(sql`${learnedBrandsTable.id} = ${existing.id}`);

    // Mogliśmy właśnie przekroczyć próg zaufania — odśwież cache od razu
    // zamiast czekać na wygaśnięcie TTL.
    if (nextOccurrences === MIN_OCCURRENCES_TO_TRUST) {
      cacheLoadedAt = 0;
    }
  } catch (err) {
    logger?.warn({ err, brand }, "learned-brands: nie udało się zapisać detekcji (non-fatal)");
  }
}
