import { buildKeywordMatcher, normalizeForMatch, type KeywordMatcher } from "@workspace/category-rules";

// Z6 — słownik marek / nazw własnych → kategoria + gotowa podkategoria.
// Rozpoznanie marki daje pewne trafienie z granularną subcategory, bez pytania AI.
// Klucz: znormalizowana marka (fold diakrytyków + lowercase). Kategoria MUSI być
// istniejącym ID (patrz BUILTIN_CATEGORY_DEFS w @workspace/category-rules).
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
  // UWAGA: "piątnica" i "mlekovita" celowo USUNIĘTE (audyt danych 2026-09) — obie
  // marki sprzedają też SERY pod tą samą nazwą (np. "Serek do sushi Piątnica",
  // "Ser Faruki Mlekovita"), które przez sztywne mapowanie na "nabiał" nigdy nie
  // trafiały do "sery". Mleko/śmietana tych marek i tak łapią się poprawnie przez
  // keywordy ("mleko", "śmietana") — bez straty.
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
  // UWAGA: "knorr" celowo USUNIĘTE (audyt danych 2026-09) — Knorr sprzedaje też ryż
  // i makarony pod tą samą marką ([KNORR] RYŻ DŁUGOZIARNISTY, [KNORR] MAKARON
  // GWIAZDKI), które brand-map wrzucał do przypraw. Genuine produkty przyprawowe
  // Knorr (sosy, primerba, esencje) i tak trafiają poprawnie przez keywordy
  // ("sos ", "esencja", "primerba", "peperonata") — bez straty.
  // UWAGA: "pudliszki" celowo USUNIĘTE (audyt danych 2026-09) — Pudliszki sprzedaje
  // też pomidory w puszce/pelati pod tą samą marką (nie tylko ketchup), które przez
  // sztywne mapowanie na "przyprawy" nigdy nie trafiały do "konserwy". Ketchup i tak
  // łapie się poprawnie przez keyword "ketchup"/"keczup" — bez straty.
  tabasco: { category: "przyprawy", subcategory: "sos ostry" },
  heinz: { category: "przyprawy", subcategory: "ketchup" },
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
  // UWAGA: "iglotex" celowo USUNIĘTE (audyt danych 2026-09) — "Iglotex Professional"
  // to marka foodservice z PEŁNYM asortymentem (orzechy, bułka tarta, ryż, marynaty),
  // nie tylko mrożonki. Sztywne mapowanie na "mrozonki" psuło 10/10 sprawdzonych
  // produktów tej marki w realnych danych (orzechy laskowe, migdały, ryż arborio,
  // borowiki marynowane trafiały do mrożonek). Keywordy i tak łapią poprawnie.
  hortex: { category: "mrozonki", subcategory: "mrożonki" },

  // ── Konserwy / przetwory ──
  // UWAGA: "łowicz" celowo USUNIĘTE (audyt danych 2026-09) — Łowicz to marka
  // wieloliniowa (nabiał: masło, mleko ORAZ przetwory), sztywne mapowanie na
  // "konserwy" psuło produkty nabiałowe/serowe tej marki (masło, mleko UHT,
  // a nawet ser Fellada trafiały do konserw). Keywordy łapią poprawnie bez marki.
  bonduelle: { category: "konserwy", subcategory: "warzywa konserwowe" },

  // ── Środki czystości ──
  domestos: { category: "srodki_czystosci", subcategory: "płyn czyszczący" },
  ludwik: { category: "srodki_czystosci", subcategory: "płyn do naczyń" },
  fairy: { category: "srodki_czystosci", subcategory: "płyn do naczyń" },
  ajax: { category: "srodki_czystosci", subcategory: "płyn czyszczący" },
  cif: { category: "srodki_czystosci", subcategory: "mleczko czyszczące" },
};

// Prekompilacja dopasowań (matchBrand bywa w gorących pętlach importu). Wspólny
// matcher z @workspace/category-rules — ten sam silnik co keywordy kategorii,
// fold diakrytyków na marce PRZY KOMPILACJI (buildKeywordMatcher robi to samo
// na wejściu w środku), więc "łaciate" i "laciate" trafiają w ten sam wpis.
const BRAND_MATCHERS: Array<{ test: KeywordMatcher; info: BrandInfo }> = Object.entries(BRAND_MAP).map(
  ([brand, info]) => ({ test: buildKeywordMatcher(brand), info }),
);

/** Rozpoznaj markę/nazwę własną w znormalizowanej nazwie produktu. */
export function matchBrand(normalizedName: string): BrandInfo | null {
  const n = normalizeForMatch(normalizedName);
  for (const { test, info } of BRAND_MATCHERS) {
    if (test(n)) return info;
  }
  return null;
}
