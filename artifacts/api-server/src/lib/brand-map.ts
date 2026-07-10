// Z6 — słownik marek / nazw własnych → kategoria + gotowa podkategoria.
// Rozpoznanie marki daje pewne trafienie z granularną subcategory, bez pytania AI.
// Klucz: znormalizowana marka (lowercase). Kategoria MUSI być istniejącym ID
// (patrz BUILTIN_CATEGORY_DEFS w categorize.ts).
//
// Zasada doboru: tylko distinctive nazwy o niskim ryzyku false-positive na fragmencie
// innego słowa. Krótkie/wieloznaczne pomijamy (np. „lech" łapałoby „lecho").

export type BrandInfo = { category: string; subcategory: string };

const BRAND_MAP: Record<string, BrandInfo> = {
  // ── Sery (Z8: osobna kategoria) ──
  cheddar: { category: "sery", subcategory: "ser cheddar" },
  mozzarella: { category: "sery", subcategory: "mozzarella" },
  parmezan: { category: "sery", subcategory: "parmezan" },
  "grana padano": { category: "sery", subcategory: "parmezan" },
  gorgonzola: { category: "sery", subcategory: "ser pleśniowy" },
  mascarpone: { category: "sery", subcategory: "mascarpone" },
  ricotta: { category: "sery", subcategory: "ricotta" },
  feta: { category: "sery", subcategory: "feta" },
  gouda: { category: "sery", subcategory: "gouda" },
  camembert: { category: "sery", subcategory: "camembert" },
  hochland: { category: "sery", subcategory: "ser topiony" },
  almette: { category: "sery", subcategory: "serek kremowy" },
  galbani: { category: "sery", subcategory: "mozzarella" },
  // ── Nabiał / mleczne ──
  piątnica: { category: "nabiał", subcategory: "nabiał" },
  mlekovita: { category: "nabiał", subcategory: "nabiał" },
  łaciate: { category: "nabiał", subcategory: "mleko" },
  danio: { category: "nabiał", subcategory: "serek" },
  actimel: { category: "nabiał", subcategory: "jogurt" },

  // ── Napoje ──
  "coca-cola": { category: "napoje", subcategory: "cola" },
  "coca cola": { category: "napoje", subcategory: "cola" },
  pepsi: { category: "napoje", subcategory: "cola" },
  sprite: { category: "napoje", subcategory: "napój gazowany" },
  fanta: { category: "napoje", subcategory: "napój gazowany" },
  tymbark: { category: "napoje", subcategory: "sok" },
  kubuś: { category: "napoje", subcategory: "sok" },
  cappy: { category: "napoje", subcategory: "sok" },
  "red bull": { category: "napoje", subcategory: "energetyk" },
  tiger: { category: "napoje", subcategory: "energetyk" },
  lipton: { category: "napoje", subcategory: "herbata mrożona" },
  cisowianka: { category: "napoje", subcategory: "woda" },
  muszynianka: { category: "napoje", subcategory: "woda" },
  nałęczowanka: { category: "napoje", subcategory: "woda" },
  "żywiec zdrój": { category: "napoje", subcategory: "woda" },
  "kropla beskidu": { category: "napoje", subcategory: "woda" },

  // ── Alkohole ──
  tyskie: { category: "alkohole", subcategory: "piwo" },
  heineken: { category: "alkohole", subcategory: "piwo" },
  warka: { category: "alkohole", subcategory: "piwo" },
  desperados: { category: "alkohole", subcategory: "piwo" },
  somersby: { category: "alkohole", subcategory: "cydr" },
  soplica: { category: "alkohole", subcategory: "wódka" },
  finlandia: { category: "alkohole", subcategory: "wódka" },
  jameson: { category: "alkohole", subcategory: "whisky" },
  "jack daniels": { category: "alkohole", subcategory: "whisky" },
  baileys: { category: "alkohole", subcategory: "likier" },
  aperol: { category: "alkohole", subcategory: "likier" },
  prosecco: { category: "alkohole", subcategory: "wino musujące" },

  // ── Przyprawy / sosy / oleje ──
  tabasco: { category: "przyprawy", subcategory: "sos ostry" },
  heinz: { category: "przyprawy", subcategory: "ketchup" },
  pudliszki: { category: "przyprawy", subcategory: "ketchup" },
  knorr: { category: "przyprawy", subcategory: "bulion" },
  maggi: { category: "przyprawy", subcategory: "przyprawa" },
  vegeta: { category: "przyprawy", subcategory: "przyprawa" },
  kamis: { category: "przyprawy", subcategory: "przyprawa" },
  kucharek: { category: "przyprawy", subcategory: "przyprawa" },
  develey: { category: "przyprawy", subcategory: "sos" },

  // ── Pieczywo / makarony ──
  barilla: { category: "pieczywo", subcategory: "makaron" },
  lubella: { category: "pieczywo", subcategory: "makaron" },

  // ── Słodycze ──
  nutella: { category: "slodycze", subcategory: "krem czekoladowy" },
  milka: { category: "slodycze", subcategory: "czekolada" },
  wedel: { category: "slodycze", subcategory: "czekolada" },
  haribo: { category: "slodycze", subcategory: "żelki" },
  kinder: { category: "slodycze", subcategory: "czekolada" },

  // ── Mrożonki ──
  hortex: { category: "mrozonki", subcategory: "mrożonki" },
  iglotex: { category: "mrozonki", subcategory: "mrożonki" },

  // ── Konserwy / przetwory ──
  łowicz: { category: "konserwy", subcategory: "przetwory" },
  bonduelle: { category: "konserwy", subcategory: "warzywa konserwowe" },

  // ── Środki czystości ──
  domestos: { category: "srodki_czystosci", subcategory: "płyn czyszczący" },
  ludwik: { category: "srodki_czystosci", subcategory: "płyn do naczyń" },
  fairy: { category: "srodki_czystosci", subcategory: "płyn do naczyń" },
  ajax: { category: "srodki_czystosci", subcategory: "płyn czyszczący" },
  cif: { category: "srodki_czystosci", subcategory: "mleczko czyszczące" },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Prekompilacja dopasowań (matchBrand bywa w gorących pętlach importu).
// Frazy ze spacją → includes; pojedyncze słowa → granica słowa z polskimi znakami.
const BRAND_MATCHERS: Array<{ test: (n: string) => boolean; info: BrandInfo }> = Object.entries(
  BRAND_MAP,
).map(([brand, info]) => {
  const b = brand.toLowerCase();
  if (b.includes(" ")) return { test: (n: string) => n.includes(b), info };
  const re = new RegExp("(^|[^a-z0-9ąćęłńóśźż])" + escapeRegex(b));
  return { test: (n: string) => re.test(n), info };
});

/** Rozpoznaj markę/nazwę własną w znormalizowanej nazwie produktu. */
export function matchBrand(normalizedName: string): BrandInfo | null {
  const n = normalizedName.toLowerCase();
  for (const { test, info } of BRAND_MATCHERS) {
    if (test(n)) return info;
  }
  return null;
}
