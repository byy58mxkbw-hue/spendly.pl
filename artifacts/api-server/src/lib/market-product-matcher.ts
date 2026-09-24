import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db, marketProductAliasesTable } from "@workspace/db";
import { normalizedUnitSql } from "./units.js";

// Dopasowanie rozmyte nazw produktów TYLKO dla benchmarku rynkowego (market-benchmark-job.ts).
// Nie ruszamy istniejącej normalizeProductName() (categorize-ai.ts) — to inny, dodatkowy
// krok grupowania, liczony raz dziennie w batchu. Zero AI: diakrytyki + pg_trgm (wbudowane
// rozszerzenie Postgresa), zero kosztu tokenów.

const DIACRITICS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

export function stripDiacritics(name: string): string {
  return name.replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch] ?? ch);
}

/**
 * Klucz do WSTĘPNEGO koszyka kandydatów (nie ostateczna decyzja o połączeniu —
 * to robi similarity() z pg_trgm). Diakrytyki + lowercase/trim + obcięcie
 * typowej końcówki liczby mnogiej dla słów >4 znaki.
 */
export function bucketKey(canonicalName: string): string {
  const base = stripDiacritics(canonicalName.toLowerCase().trim());
  if (base.length > 4 && /[yi]$/.test(base)) return base.slice(0, -1);
  return base;
}

/** Nazwy krótsze niż to wymagają dokładnego dopasowania — fuzzy na krótkich słowach jest niebezpieczne. */
export const MIN_FUZZY_LENGTH = 4;
export const FUZZY_SIMILARITY_THRESHOLD = 0.6;

export interface NameVariant {
  canonicalName: string;
  unit: string;
  category: string | null;
  userCount: number;
}

// Union-find (disjoint-set) — łączy pary nazw powyżej progu similarity() w grupy.
export class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root); // path compression (jednopoziomowa, wystarczająca przy tej skali)
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Deterministyczny wybór market_group_key dla grupy: wariant używany przez
 * NAJWIĘKSZĄ liczbę różnych userów (nie pierwszy z brzegu, nie najkrótszy),
 * tiebreak alfabetyczny — żeby wynik nie skakał między uruchomieniami joba.
 */
export function pickGroupKey(variants: NameVariant[]): string {
  let best = variants[0];
  for (const v of variants.slice(1)) {
    if (
      v.userCount > best.userCount ||
      (v.userCount === best.userCount && v.canonicalName.localeCompare(best.canonicalName) < 0)
    ) {
      best = v;
    }
  }
  return best.canonicalName;
}

/** Kategoria najczęściej występująca wśród wariantów grupy — informacyjnie w market_product_aliases. */
export function modalCategory(variants: Array<{ category: string | null }>): string | null {
  const counts = new Map<string, number>();
  for (const v of variants) {
    if (!v.category) continue;
    counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [cat, count] of counts) {
    if (count > bestCount) {
      best = cat;
      bestCount = count;
    }
  }
  return best;
}

type AggregatedRow = {
  canonical_name: string;
  unit: string;
  user_count: number;
};

type CategoryVoteRow = {
  canonical_name: string;
  unit: string;
  category: string | null;
  cnt: number;
};

type SimilarityPair = {
  name_a: string;
  name_b: string;
  sim: number;
}

const uid = (name: string, unit: string) => `${name}::${unit}`;

/**
 * Uruchamia dopasowanie rozmyte i przelicza market_product_aliases od zera
 * (tabela to widok pochodny, bezpiecznie ją nadpisać przy każdym uruchomieniu).
 * Wywoływane z market-benchmark-job.ts przed liczeniem agregatów cenowych.
 */
export async function runMarketProductMatcher(log: Logger): Promise<{ groups: number; namesProcessed: number }> {
  // Krok 1: zdystyluj (canonical_name, unit) -> liczba różnych userów. Jednostka
  // znormalizowana (normalizedUnitSql, jak w reports.ts) — inaczej "kg"/"Kg"/"KG"
  // dzielą jeden produkt na osobne, sztucznie rozdrobnione grupy (realny bug
  // znaleziony po pierwszym uruchomieniu joba na produkcji: unit_count=1 wszędzie).
  const aggResult = await db.execute<AggregatedRow>(sql`
    SELECT canonical_name, ${normalizedUnitSql(sql`unit`)} AS unit, COUNT(DISTINCT user_id)::int AS user_count
    FROM products
    WHERE canonical_name IS NOT NULL AND canonical_name <> ''
    GROUP BY canonical_name, ${normalizedUnitSql(sql`unit`)}
  `);
  const aggRows = aggResult.rows;

  // Kategoria per (canonical_name, unit znormalizowany) — modalna (nazwa bywa zapisana
  // z inną kategorią u różnych userów, grupowanie nie może na tym pękać).
  const catResult = await db.execute<CategoryVoteRow>(sql`
    SELECT canonical_name, ${normalizedUnitSql(sql`unit`)} AS unit, category, COUNT(*)::int AS cnt
    FROM products
    WHERE canonical_name IS NOT NULL AND canonical_name <> ''
    GROUP BY canonical_name, ${normalizedUnitSql(sql`unit`)}, category
  `);
  const categoryVotes = new Map<string, { category: string | null; cnt: number }>();
  for (const r of catResult.rows) {
    const key = uid(r.canonical_name, r.unit);
    const current = categoryVotes.get(key);
    if (!current || r.cnt > current.cnt) categoryVotes.set(key, { category: r.category, cnt: r.cnt });
  }

  const rows: NameVariant[] = aggRows.map((r) => ({
    canonicalName: r.canonical_name,
    unit: r.unit,
    category: categoryVotes.get(uid(r.canonical_name, r.unit))?.category ?? null,
    userCount: r.user_count,
  }));

  if (rows.length === 0) {
    log.info("benchmark: matcher — brak produktów z canonical_name, nic do grupowania");
    return { groups: 0, namesProcessed: 0 };
  }

  // Krok 2: koszyki (kategoria, unit) — nigdy nie łącz między kategoriami/jednostkami,
  // to jedyna ochrona przed absurdalnymi połączeniami krótkich słów.
  const bySameBucket = new Map<string, NameVariant[]>();
  for (const r of rows) {
    const k = `${r.category ?? ""}::${r.unit}`;
    const arr = bySameBucket.get(k) ?? [];
    arr.push(r);
    bySameBucket.set(k, arr);
  }

  const uf = new UnionFind();
  for (const r of rows) uf.find(uid(r.canonicalName, r.unit)); // zarejestruj wszystkie, nawet singletony

  let mergedPairCount = 0;
  const mergeLog: Array<{ a: string; b: string; sim: number }> = [];

  for (const [, bucket] of bySameBucket) {
    if (bucket.length < 2) continue;

    // Wstępny koszyk kandydatów (diakrytyki + lowercase + obcięcie liczby mnogiej) —
    // ogranicza liczbę par sprawdzanych similarity() do sensownych kandydatów.
    const byPrefilter = new Map<string, NameVariant[]>();
    for (const v of bucket) {
      const k = bucketKey(v.canonicalName);
      const arr = byPrefilter.get(k) ?? [];
      arr.push(v);
      byPrefilter.set(k, arr);
    }

    for (const [, candidates] of byPrefilter) {
      const longEnough = candidates.filter((c) => c.canonicalName.length >= MIN_FUZZY_LENGTH);
      const names = [...new Set(longEnough.map((c) => c.canonicalName))];
      if (names.length < 2) continue;

      // Realny trigram similarity liczony przez Postgres (pg_trgm) — nie reimplementujemy
      // algorytmu w JS, żeby wynik był identyczny z tym, na czym stoi indeks GIN.
      //
      // UWAGA: interpolacja JS-owej tablicy (${names}) w sql`` drizzle-orm nie tworzy
      // jednego bindowania text[] — rozwija się do tuple ($1, $2, ...), co Postgres
      // odczytuje jako RECORD i wywala "cannot cast type record to text[]" (złapane
      // na produkcji przy pierwszym uruchomieniu joba — zob. run-benchmark-once.ts).
      // ARRAY[$1, $2, ...]::text[] budowany przez sql.join to jedyny poprawny sposób.
      const namesArray = sql`ARRAY[${sql.join(names.map((n) => sql`${n}`), sql`, `)}]::text[]`;
      const pairs = await db.execute<SimilarityPair>(sql`
        SELECT a.name AS name_a, b.name AS name_b, similarity(a.name, b.name) AS sim
        FROM unnest(${namesArray}) a(name)
        CROSS JOIN unnest(${namesArray}) b(name)
        WHERE a.name < b.name AND similarity(a.name, b.name) >= ${FUZZY_SIMILARITY_THRESHOLD}
      `);

      for (const p of pairs.rows) {
        const va = bucket.find((v) => v.canonicalName === p.name_a);
        const vb = bucket.find((v) => v.canonicalName === p.name_b);
        if (!va || !vb) continue;
        uf.union(uid(va.canonicalName, va.unit), uid(vb.canonicalName, vb.unit));
        mergedPairCount++;
        mergeLog.push({ a: p.name_a, b: p.name_b, sim: Number(p.sim) });
      }
    }
  }

  // Krok 3: zbuduj finalne grupy z union-find, wybierz market_group_key.
  const groupsByRoot = new Map<string, NameVariant[]>();
  for (const r of rows) {
    const root = uf.find(uid(r.canonicalName, r.unit));
    const arr = groupsByRoot.get(root) ?? [];
    arr.push(r);
    groupsByRoot.set(root, arr);
  }

  const aliasRows: Array<{ canonicalName: string; unit: string; category: string | null; marketGroupKey: string }> = [];
  for (const [, variants] of groupsByRoot) {
    const groupKey = pickGroupKey(variants);
    const groupCat = modalCategory(variants);
    for (const v of variants) {
      aliasRows.push({ canonicalName: v.canonicalName, unit: v.unit, category: v.category ?? groupCat, marketGroupKey: groupKey });
    }
  }

  // Tabela to widok pochodny — bezpiecznie przeliczyć od zera przy każdym uruchomieniu.
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM market_product_aliases`);
    for (const batch of chunk(aliasRows, 500)) {
      await tx.insert(marketProductAliasesTable).values(
        batch.map((b) => ({ canonicalName: b.canonicalName, unit: b.unit, category: b.category, marketGroupKey: b.marketGroupKey })),
      );
    }
  });

  log.info(
    { grupy: groupsByRoot.size, nazwy: rows.length, polaczeniaPar: mergedPairCount, przyklady: mergeLog.slice(0, 20) },
    "benchmark: matcher — grupowanie market_product_aliases przeliczone",
  );

  return { groups: groupsByRoot.size, namesProcessed: rows.length };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
