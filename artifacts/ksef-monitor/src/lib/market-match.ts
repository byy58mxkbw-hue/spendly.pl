import { genericProduct, normalizeForMatch } from "@workspace/category-rules";
import { apiUrl } from "@/lib/api-base";

// Ile pozycji faktury da się porównać z medianą rynku — liczone W PRZEGLĄDARCE.
// Pobieramy publiczną listę produktów z opublikowaną medianą (bez cen, GET bez żadnych
// danych z faktury) i dopasowujemy nazwy tym samym słownikiem co serwer
// (@workspace/category-rules genericProduct), więc „Cytryny Argentyna kl.I” trafia
// w „Cytryna”. Jednostka musi się zgadzać — inaczej licznik obiecywałby za dużo.

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kilogram: "kg", kilogramy: "kg",
  szt: "szt", st: "szt", sztuka: "szt", sztuki: "szt",
  l: "l", litr: "l", litry: "l",
};

function unitKey(u: string): string {
  const v = normalizeForMatch(u).replace(/\./g, "").trim();
  return UNIT_ALIASES[v] ?? v;
}

function nameKey(name: string): string {
  return genericProduct(name)?.key ?? normalizeForMatch(name).replace(/\s+/g, " ").trim();
}

export async function fetchMarketKeys(): Promise<Set<string>> {
  const res = await fetch(apiUrl("/api/public/market-groups"));
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { groups: Array<{ name: string; unit: string }> };
  return new Set(body.groups.map((g) => `${nameKey(g.name)}::${unitKey(g.unit)}`));
}

export function countComparable(items: Array<{ name: string; unit: string }>, keys: Set<string>): number {
  return items.filter((it) => keys.has(`${nameKey(it.name)}::${unitKey(it.unit)}`)).length;
}
