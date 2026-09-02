// Grupowanie pozycji sprzedaży z POS: warianty tej samej pozycji menu (stopnie
// wysmażenia steka, smaki herbaty) mają w POS WSPÓLNE id produktu, a różne nazwy.
//
// Wyciągnięte z `routes/food-cost.ts`, bo tej samej logiki potrzebuje strona
// Sprzedaż. Druga kopia heurystyki rozjechałaby się z pierwszą — jak wcześniej
// cennik w trzech kopiach i dopasowanie nazw produktów w alertach.

// Normalizacja nazwy jak w SQL matchu (regexp_replace(LOWER(name),'\s+',' ')).
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Wspólny prefiks CAŁYCH słów — nazwa bazowa grupy wariantów.
// „Stek z Polędwicy Wołowej Medium" + „…Well Done" → „Stek z Polędwicy Wołowej".
export function commonWordPrefix(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0].trim();
  const split = names.map((n) => n.trim().replace(/\s+/g, " ").split(" "));
  const first = split[0];
  const out: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const w = first[i].toLowerCase();
    if (split.every((s) => (s[i] ?? "").toLowerCase() === w)) out.push(first[i]);
    else break;
  }
  return out.length > 0 ? out.join(" ") : names[0].trim();
}

/**
 * Klucz grupy. Id produktu z POS jest STABILNE między miesiącami — nazwa nie
 * jest, bo prefiks liczy się z wariantów sprzedanych w danym okresie. Dlatego
 * porównania miesiąc do miesiąca muszą lecieć po kluczu, nigdy po nazwie.
 */
export function posGroupKey(row: { name: string; posProductId: string | null }): string {
  return row.posProductId ? `id:${row.posProductId}` : `nm:${normalizeName(row.name)}`;
}

export type PosMember = { name: string; qty: number; net: number };
export type PosGroup = { key: string; name: string; qty: number; net: number; members: PosMember[] };

// Grupuje pozycje POS po id produktu (warianty = wspólne id), sumując ilość i przychód.
// Zachowuje składowe warianty (`members`) — część produktów użytkownik chce
// wiązać per-wariant (herbata: inny smak = inny koszt), nie zbiorczo.
export function groupPosByProduct(
  rows: Array<{ name: string; posProductId: string | null; qty: number; net: number }>,
): PosGroup[] {
  const byKey = new Map<string, { members: PosMember[]; qty: number; net: number }>();
  for (const r of rows) {
    const key = posGroupKey(r);
    const g = byKey.get(key) ?? { members: [], qty: 0, net: 0 };
    g.members.push({ name: r.name, qty: r.qty, net: r.net });
    g.qty += r.qty;
    g.net += r.net;
    byKey.set(key, g);
  }
  return [...byKey.entries()].map(([key, g]) => ({
    key,
    name: commonWordPrefix(g.members.map((m) => m.name)),
    qty: g.qty,
    net: g.net,
    members: g.members,
  }));
}
