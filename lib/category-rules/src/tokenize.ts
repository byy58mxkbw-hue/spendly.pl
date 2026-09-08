import { normalizeForMatch } from "./text-normalize.js";

/**
 * Tokeny znaczące z nazwy produktu: dzielimy na całe słowa (granica słowa —
 * reguła 27), odrzucamy krótkie/szumowe wg przekazanego zbioru stopwords.
 *
 * Uogólnione z pierwotnej implementacji w routes/food-cost.ts (dopasowanie
 * fuzzy składnik→produkt) — tam zbiór stopwords zostaje lokalny dla tamtej
 * domeny (ING_STOPWORDS), tu funkcja jest reużywana też przez samo-uczenie
 * ogólnych terminów kategorii (lib/learned-category-terms.ts), z INNYM zbiorem
 * stopwords dopasowanym do tamtej domeny.
 */
export function significantTokens(s: string, stopwords: Set<string>, minLen = 3): string[] {
  return normalizeForMatch(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= minLen && !stopwords.has(t) && !/^\d+$/.test(t));
}
