import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db, marketProductAliasesTable } from "@workspace/db";
import { normalizedUnitSql } from "./units.js";
import { genericProduct, priceBasis, type GenericProduct, type PriceBasis } from "@workspace/category-rules";

// Grupowanie nazw produktów TYLKO dla benchmarku rynkowego (market-benchmark-job.ts), liczone
// raz dziennie w batchu. Nie ruszamy normalizeProductName() (categorize-ai.ts). Zero AI:
// słownik produktów bazowych + przeliczenie ceny na kg/l + GTIN (patrz runMarketProductMatcher).

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


// Kategorie wykluczone z benchmarku rynkowego — nie są cenami produktów, które
// da się "kupić gdzie indziej taniej": koszty stałe (czynsz, media, prowizje
// bankowe, ubezpieczenia) zależą od lokalizacji/umowy/metrażu każdej restauracji,
// nie od dostawcy, więc porównanie ich do "mediany rynkowej" jest myślące, nie
// pomocne (na prośbę: "koszty stałe wyłączmy... prąd gaz każda restauracja ma
// inne zużycie"). Współdzielone z routes/benchmarks.ts, żeby wykluczenie było
// symetryczne (matcher nigdy nie tworzy dla nich aliasu -> job nigdy nie liczy
// agregatu -> endpoint i tak nie znalazłby benchmarku, ale wyklucz też po stronie
// "Twojej ceny", żeby nawet nie pokazywały się jako "brak danych").
export const EXCLUDED_BENCHMARK_CATEGORIES = ["koszty_stale"] as const;

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


const uid = (name: string, unit: string) => `${name}::${unit}`;

/**
 * Przelicza market_product_aliases od zera (tabela to widok pochodny). Wywoływane z
 * market-benchmark-job.ts przed liczeniem agregatów cenowych.
 *
 * Normalizacja (2026-10-11, przebudowa po błędnych porównaniach z produkcji): każda nazwa
 * z faktury dostaje „kartę” — produkt bazowy ze słownika (genericProduct), jednostkę
 * porównania i mnożnik ceny (priceBasis: paczka 1,05 kg za 44,80 zł/szt → 42,67 zł/kg) oraz
 * GTIN z KSeF, jeśli jest. Grupujemy tylko pozycje o tej samej karcie. Podobieństwo liter
 * (pg_trgm) NIE łączy już różnych nazw — dawało „sorbet malinowy” = „malina”, „płyn do
 * naczyń mięta” = „mięta”. Nazwy spoza słownika porównują się wyłącznie z identyczną nazwą
 * (albo przez wspólny GTIN). Bez zapytań similarity() w pętli — O(n) na mapach.
 */
export async function runMarketProductMatcher(log: Logger): Promise<{ groups: number; namesProcessed: number }> {
  const notExcludedCategory = sql`(category IS NULL OR category NOT IN (${sql.join(EXCLUDED_BENCHMARK_CATEGORIES.map((c) => sql`${c}`), sql`, `)}))`;

  // (canonical_name, jednostka znormalizowana) -> liczba różnych userów. Jednostka przez
  // normalizedUnitSql — inaczej „kg”/„Kg”/„KG” rozdrabniały ten sam produkt.
  const aggResult = await db.execute<AggregatedRow>(sql`
    SELECT canonical_name, ${normalizedUnitSql(sql`unit`)} AS unit, COUNT(DISTINCT user_id)::int AS user_count
    FROM products
    WHERE canonical_name IS NOT NULL AND canonical_name <> '' AND ${notExcludedCategory}
    GROUP BY canonical_name, ${normalizedUnitSql(sql`unit`)}
  `);

  // Kategoria modalna per wariant (nazwa bywa zapisana z inną kategorią u różnych userów).
  const catResult = await db.execute<CategoryVoteRow>(sql`
    SELECT canonical_name, ${normalizedUnitSql(sql`unit`)} AS unit, category, COUNT(*)::int AS cnt
    FROM products
    WHERE canonical_name IS NOT NULL AND canonical_name <> '' AND ${notExcludedCategory}
    GROUP BY canonical_name, ${normalizedUnitSql(sql`unit`)}, category
  `);
  const categoryVotes = new Map<string, { category: string | null; cnt: number }>();
  for (const r of catResult.rows) {
    const key = uid(r.canonical_name, r.unit);
    const current = categoryVotes.get(key);
    if (!current || r.cnt > current.cnt) categoryVotes.set(key, { category: r.category, cnt: r.cnt });
  }

  // Najczęstszy GTIN per wariant (z pozycji faktur KSeF).
  const gtinResult = await db.execute<{ canonical_name: string; unit: string; gtin: string; cnt: number }>(sql`
    SELECT p.canonical_name, ${normalizedUnitSql(sql`p.unit`)} AS unit, btrim(ii.gtin) AS gtin, COUNT(*)::int AS cnt
    FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.gtin IS NOT NULL AND btrim(ii.gtin) <> '' AND p.canonical_name IS NOT NULL
    GROUP BY 1, 2, 3
  `);
  const gtinOf = new Map<string, { gtin: string; cnt: number }>();
  for (const r of gtinResult.rows) {
    const key = uid(r.canonical_name, r.unit);
    const current = gtinOf.get(key);
    if (!current || r.cnt > current.cnt) gtinOf.set(key, { gtin: r.gtin, cnt: r.cnt });
  }

  const rows: NameVariant[] = aggResult.rows.map((r) => ({
    canonicalName: r.canonical_name,
    unit: r.unit,
    category: categoryVotes.get(uid(r.canonical_name, r.unit))?.category ?? null,
    userCount: r.user_count,
  }));

  if (rows.length === 0) {
    log.info("benchmark: matcher — brak produktów z canonical_name, nic do grupowania");
    return { groups: 0, namesProcessed: 0 };
  }

  const uf = new UnionFind();
  const basisOf = new Map<string, PriceBasis>();
  const genericOf = new Map<string, GenericProduct>();
  const byCard = new Map<string, string>();
  const byGtin = new Map<string, string>();
  let genericCount = 0;
  let gtinUnions = 0;
  for (const r of rows) {
    const id = uid(r.canonicalName, r.unit);
    uf.find(id);
    const basis = priceBasis(r.canonicalName, r.unit);
    basisOf.set(id, basis);
    const g = genericProduct(r.canonicalName);
    if (g) {
      genericOf.set(id, g);
      genericCount++;
    }
    // Ta sama karta = ten sam towar: produkt bazowy (albo dokładnie ta sama nazwa) + jednostka
    // porównania + nieprzeliczalna gramatura. Nigdy nie łączymy kg ze sztuką.
    const card = `${g ? `g:${g.key}` : `n:${r.canonicalName}`}::${basis.compareUnit}::${basis.packKey}`;
    const first = byCard.get(card);
    if (first) uf.union(first, id);
    else byCard.set(card, id);

    // Wspólny GTIN (kod kreskowy z KSeF) = ten sam towar, nawet przy innych nazwach.
    const gt = gtinOf.get(id);
    if (gt) {
      const gk = `${gt.gtin}::${basis.compareUnit}`;
      const firstG = byGtin.get(gk);
      if (firstG) {
        if (uf.find(firstG) !== uf.find(id)) gtinUnions++;
        uf.union(firstG, id);
      } else byGtin.set(gk, id);
    }
  }

  const groupsByRoot = new Map<string, NameVariant[]>();
  for (const r of rows) {
    const root = uf.find(uid(r.canonicalName, r.unit));
    const arr = groupsByRoot.get(root) ?? [];
    arr.push(r);
    groupsByRoot.set(root, arr);
  }

  const aliasRows: Array<{ canonicalName: string; unit: string; category: string | null; marketGroupKey: string; compareUnit: string; priceFactor: number }> = [];
  for (const [, variants] of groupsByRoot) {
    // Grupa z produktem bazowym dostaje jego czystą nazwę („Cytryna”), nie surową z faktury;
    // nieprzeliczalna gramatura dopisywana do klucza („Czosnek · 3szt”), żeby się nie zlała.
    const generics = variants
      .map((v) => ({ g: genericOf.get(uid(v.canonicalName, v.unit)), users: v.userCount }))
      .filter((x): x is { g: GenericProduct; users: number } => !!x.g)
      .sort((a, b) => b.users - a.users || a.g.label.localeCompare(b.g.label));
    const firstBasis = basisOf.get(uid(variants[0]!.canonicalName, variants[0]!.unit))!;
    const groupKey = generics[0]
      ? (firstBasis.packKey ? `${generics[0].g.label} · ${firstBasis.packKey}` : generics[0].g.label)
      : pickGroupKey(variants);
    // Kategoria GRUPY (modalna), nie wariantu: job liczy medianę per (grupa, jednostka,
    // kategoria) — różnie skategoryzowana „Cytryna” dzieliłaby się na dwie mediany.
    const groupCat = modalCategory(variants);
    for (const v of variants) {
      const b = basisOf.get(uid(v.canonicalName, v.unit))!;
      aliasRows.push({
        canonicalName: v.canonicalName,
        unit: v.unit,
        category: groupCat ?? v.category,
        marketGroupKey: groupKey,
        compareUnit: b.compareUnit,
        priceFactor: b.factor,
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM market_product_aliases`);
    for (const batch of chunk(aliasRows, 500)) await tx.insert(marketProductAliasesTable).values(batch);
  });

  log.info(
    {
      grupy: groupsByRoot.size,
      nazwy: rows.length,
      zeSlownika: genericCount,
      pokrycieSlownikaProc: Math.round((genericCount / rows.length) * 100),
      polaczeniaGtin: gtinUnions,
      przeliczoneNaKgL: aliasRows.filter((a) => a.compareUnit !== a.unit).length,
    },
    "benchmark: matcher — karty produktów przeliczone",
  );

  return { groups: groupsByRoot.size, namesProcessed: rows.length };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
