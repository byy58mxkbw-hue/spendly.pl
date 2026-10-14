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
  "parmigiano reggiano": { category: "sery", subcategory: "parmezan dojrzewający" },
  "pecorino romano": { category: "sery", subcategory: "ser owczy włoski" },
  gorgonzola: { category: "sery", subcategory: "ser pleśniowy" },
  roquefort: { category: "sery", subcategory: "ser pleśniowy owczy" },
  mascarpone: { category: "sery", subcategory: "mascarpone" },
  ricotta: { category: "sery", subcategory: "ricotta" },
  feta: { category: "sery", subcategory: "feta" },
  gouda: { category: "sery", subcategory: "gouda" },
  edam: { category: "sery", subcategory: "ser holenderski" },
  leerdammer: { category: "sery", subcategory: "ser holenderski z dziurkami" },
  emmentaler: { category: "sery", subcategory: "ser szwajcarski" },
  gruyere: { category: "sery", subcategory: "ser szwajcarski twardy" },
  camembert: { category: "sery", subcategory: "camembert" },
  brie: { category: "sery", subcategory: "ser pleśniowy miękki" },
  taleggio: { category: "sery", subcategory: "ser włoski półmiękki" },
  manchego: { category: "sery", subcategory: "ser owczy hiszpański" },
  halloumi: { category: "sery", subcategory: "ser grillowany" },
  raclette: { category: "sery", subcategory: "ser alpejski do roztapiania" },
  provolone: { category: "sery", subcategory: "ser włoski wędzony" },
  burrata: { category: "sery", subcategory: "ser świeży włoski" },
  philadelphia: { category: "sery", subcategory: "twarożek kremowy" },
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
  kerrygold: { category: "nabiał", subcategory: "masło" },
  lurpak: { category: "nabiał", subcategory: "masło" },
  "elle vire": { category: "nabiał", subcategory: "śmietanka kulinarna" },
  "elle & vire": { category: "nabiał", subcategory: "śmietanka kulinarna" },
  meggle: { category: "nabiał", subcategory: "masło gastronomiczne" },

  // ── Napoje ──
  "coca-cola": { category: "napoje", subcategory: "cola" },
  "coca cola": { category: "napoje", subcategory: "cola" },
  pepsi: { category: "napoje", subcategory: "cola" },
  sprite: { category: "napoje", subcategory: "napój gazowany" },
  fanta: { category: "napoje", subcategory: "napój gazowany" },
  schweppes: { category: "napoje", subcategory: "tonik" },
  "fever-tree": { category: "napoje", subcategory: "tonik premium" },
  "fever tree": { category: "napoje", subcategory: "tonik premium" },
  "san pellegrino": { category: "napoje", subcategory: "woda gazowana" },
  "san-pellegrino": { category: "napoje", subcategory: "woda gazowana" },
  perrier: { category: "napoje", subcategory: "woda gazowana" },
  "dr pepper": { category: "napoje", subcategory: "napój gazowany" },
  tymbark: { category: "napoje", subcategory: "sok" },
  kubuś: { category: "napoje", subcategory: "sok" },
  cappy: { category: "napoje", subcategory: "sok" },
  "red bull": { category: "napoje", subcategory: "energetyk" },
  tiger: { category: "napoje", subcategory: "energetyk" },
  monster: { category: "napoje", subcategory: "energetyk" },
  burn: { category: "napoje", subcategory: "energetyk" },
  lipton: { category: "napoje", subcategory: "herbata mrożona" },
  cisowianka: { category: "napoje", subcategory: "woda" },
  muszynianka: { category: "napoje", subcategory: "woda" },
  nałęczowanka: { category: "napoje", subcategory: "woda" },
  "żywiec zdrój": { category: "napoje", subcategory: "woda" },
  "kropla beskidu": { category: "napoje", subcategory: "woda" },

  // ── Syropy barowe ──
  monin: { category: "syropy", subcategory: "syrop barowy" },
  torani: { category: "syropy", subcategory: "syrop barowy" },
  davinci: { category: "syropy", subcategory: "syrop barowy" },
  "da vinci": { category: "syropy", subcategory: "syrop barowy" },

  // ── Alkohole ──
  // Piwa
  tyskie: { category: "alkohole", subcategory: "piwo" },
  heineken: { category: "alkohole", subcategory: "piwo" },
  warka: { category: "alkohole", subcategory: "piwo" },
  desperados: { category: "alkohole", subcategory: "piwo" },
  somersby: { category: "alkohole", subcategory: "cydr" },
  żubr: { category: "alkohole", subcategory: "piwo" },
  okocim: { category: "alkohole", subcategory: "piwo" },
  carlsberg: { category: "alkohole", subcategory: "piwo" },
  corona: { category: "alkohole", subcategory: "piwo" },
  budvar: { category: "alkohole", subcategory: "piwo czeskie" },
  hoegaarden: { category: "alkohole", subcategory: "piwo pszeniczne" },
  paulaner: { category: "alkohole", subcategory: "piwo pszeniczne" },
  erdinger: { category: "alkohole", subcategory: "piwo pszeniczne" },
  leffe: { category: "alkohole", subcategory: "piwo belgijskie" },
  "pilsner urquell": { category: "alkohole", subcategory: "piwo czeskie" },
  guinness: { category: "alkohole", subcategory: "piwo stout" },
  "stella artois": { category: "alkohole", subcategory: "piwo" },
  // Wódki
  soplica: { category: "alkohole", subcategory: "wódka" },
  finlandia: { category: "alkohole", subcategory: "wódka" },
  żubrówka: { category: "alkohole", subcategory: "wódka" },
  wyborowa: { category: "alkohole", subcategory: "wódka" },
  luksusowa: { category: "alkohole", subcategory: "wódka" },
  chopin: { category: "alkohole", subcategory: "wódka" },
  belvedere: { category: "alkohole", subcategory: "wódka" },
  absolut: { category: "alkohole", subcategory: "wódka" },
  "grey goose": { category: "alkohole", subcategory: "wódka" },
  smirnoff: { category: "alkohole", subcategory: "wódka" },
  // Whisky
  jameson: { category: "alkohole", subcategory: "whisky" },
  "jack daniels": { category: "alkohole", subcategory: "whisky" },
  "jack daniel": { category: "alkohole", subcategory: "whisky" },
  ballantines: { category: "alkohole", subcategory: "whisky szkocka" },
  "johnnie walker": { category: "alkohole", subcategory: "whisky szkocka" },
  grants: { category: "alkohole", subcategory: "whisky szkocka" },
  "chivas regal": { category: "alkohole", subcategory: "whisky szkocka" },
  glenfiddich: { category: "alkohole", subcategory: "whisky single malt" },
  glenlivet: { category: "alkohole", subcategory: "whisky single malt" },
  dewars: { category: "alkohole", subcategory: "whisky szkocka" },
  "tullamore dew": { category: "alkohole", subcategory: "whisky irlandzka" },
  "jim beam": { category: "alkohole", subcategory: "whisky bourbon" },
  "makers mark": { category: "alkohole", subcategory: "whisky bourbon" },
  // Giny
  beefeater: { category: "alkohole", subcategory: "gin" },
  "bombay sapphire": { category: "alkohole", subcategory: "gin" },
  bombay: { category: "alkohole", subcategory: "gin" },
  hendricks: { category: "alkohole", subcategory: "gin" },
  tanqueray: { category: "alkohole", subcategory: "gin" },
  gordons: { category: "alkohole", subcategory: "gin" },
  // Rumy
  bacardi: { category: "alkohole", subcategory: "rum" },
  "captain morgan": { category: "alkohole", subcategory: "rum" },
  "havana club": { category: "alkohole", subcategory: "rum" },
  // Likiery i aperitify
  baileys: { category: "alkohole", subcategory: "likier" },
  aperol: { category: "alkohole", subcategory: "likier aperitif" },
  campari: { category: "alkohole", subcategory: "likier aperitif" },
  cointreau: { category: "alkohole", subcategory: "likier pomarańczowy" },
  disaronno: { category: "alkohole", subcategory: "likier migdałowy" },
  jagermeister: { category: "alkohole", subcategory: "likier ziołowy" },
  "jägermeister": { category: "alkohole", subcategory: "likier ziołowy" },
  malibu: { category: "alkohole", subcategory: "likier kokosowy" },
  krupnik: { category: "alkohole", subcategory: "likier miodowy" },
  // Wermut i wina wzmacniane
  martini: { category: "alkohole", subcategory: "wermut" },
  cinzano: { category: "alkohole", subcategory: "wermut" },
  // Wina musujące i szampany
  prosecco: { category: "alkohole", subcategory: "wino musujące" },
  zonin: { category: "alkohole", subcategory: "prosecco" },
  freixenet: { category: "alkohole", subcategory: "wino musujące" },
  // Koniaki i brandy
  "remy martin": { category: "alkohole", subcategory: "koniak" },
  hennessy: { category: "alkohole", subcategory: "koniak" },
  // Tequila
  patron: { category: "alkohole", subcategory: "tequila" },
  olmeca: { category: "alkohole", subcategory: "tequila" },
  "jose cuervo": { category: "alkohole", subcategory: "tequila" },

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
  hellmanns: { category: "przyprawy", subcategory: "majonez" },
  hellmann: { category: "przyprawy", subcategory: "majonez" },
  roleski: { category: "przyprawy", subcategory: "ketchup" },
  maille: { category: "przyprawy", subcategory: "musztarda dijon" },
  amora: { category: "przyprawy", subcategory: "musztarda" },
  kikkoman: { category: "przyprawy", subcategory: "sos sojowy" },
  "franks red hot": { category: "przyprawy", subcategory: "sos chili" },
  "frank's red hot": { category: "przyprawy", subcategory: "sos chili" },
  fanex: { category: "przyprawy", subcategory: "sosy gastronomiczne" },
  "lea perrins": { category: "przyprawy", subcategory: "sos worcestershire" },
  "lea & perrins": { category: "przyprawy", subcategory: "sos worcestershire" },
  // Oleje i oliwy
  monini: { category: "przyprawy", subcategory: "oliwa z oliwek" },
  "filippo berio": { category: "przyprawy", subcategory: "oliwa z oliwek" },
  borges: { category: "przyprawy", subcategory: "oliwa z oliwek" },
  kujawski: { category: "przyprawy", subcategory: "olej" },
  bertolli: { category: "przyprawy", subcategory: "oliwa z oliwek" },

  // ── Makarony / mąki ──
  // Marki wyłącznie makaronów/mąki → kategoria "makarony"
  barilla: { category: "makarony", subcategory: "makaron" },
  lubella: { category: "makarony", subcategory: "makaron" },
  "de cecco": { category: "makarony", subcategory: "makaron włoski" },
  divella: { category: "makarony", subcategory: "makaron włoski" },
  garofalo: { category: "makarony", subcategory: "makaron włoski" },
  panzani: { category: "makarony", subcategory: "makaron" },
  riesa: { category: "makarony", subcategory: "makaron" },
  caputo: { category: "makarony", subcategory: "mąka do pizzy" },
  // ── Pieczywo (inne) ──
  balviten: { category: "pieczywo", subcategory: "pieczywo bezglutenowe" },

  // ── Słodycze ──
  nutella: { category: "slodycze", subcategory: "krem czekoladowy" },
  milka: { category: "slodycze", subcategory: "czekolada" },
  wedel: { category: "slodycze", subcategory: "czekolada" },
  haribo: { category: "slodycze", subcategory: "żelki" },
  kinder: { category: "slodycze", subcategory: "czekolada" },
  lindt: { category: "slodycze", subcategory: "czekolada premium" },
  toblerone: { category: "slodycze", subcategory: "czekolada szwajcarska" },
  raffaello: { category: "slodycze", subcategory: "pralinki kokosowe" },
  "ferrero rocher": { category: "slodycze", subcategory: "pralinki orzechowe" },
  callebaut: { category: "slodycze", subcategory: "czekolada kuwertura" },
  valrhona: { category: "slodycze", subcategory: "czekolada kuwertura premium" },
  "lotus biscoff": { category: "slodycze", subcategory: "herbatniki karmelowe" },
  biscoff: { category: "slodycze", subcategory: "herbatniki karmelowe" },
  oreo: { category: "slodycze", subcategory: "ciastka" },
  // ── Kawa i herbata ──
  lavazza: { category: "kawa_herbata", subcategory: "kawa ziarnista" },
  illy: { category: "kawa_herbata", subcategory: "kawa espresso" },
  segafredo: { category: "kawa_herbata", subcategory: "kawa ziarnista" },
  jacobs: { category: "kawa_herbata", subcategory: "kawa mielona" },
  tchibo: { category: "kawa_herbata", subcategory: "kawa ziarnista" },
  nescafe: { category: "kawa_herbata", subcategory: "kawa instant" },
  pellini: { category: "kawa_herbata", subcategory: "kawa ziarnista" },
  musetti: { category: "kawa_herbata", subcategory: "kawa ziarnista" },
  dilmah: { category: "kawa_herbata", subcategory: "herbata premium" },
  tetley: { category: "kawa_herbata", subcategory: "herbata ekspresowa" },
  teekanne: { category: "kawa_herbata", subcategory: "herbata ekspresowa" },
  ahmad: { category: "kawa_herbata", subcategory: "herbata liściasta" },
  twinings: { category: "kawa_herbata", subcategory: "herbata" },

  // ── Mrożonki ──
  // UWAGA: "iglotex" celowo USUNIĘTE (audyt danych 2026-09) — "Iglotex Professional"
  // to marka foodservice z PEŁNYM asortymentem (orzechy, bułka tarta, ryż, marynaty),
  // nie tylko mrożonki. Sztywne mapowanie na "mrozonki" psuło 10/10 sprawdzonych
  // produktów tej marki w realnych danych (orzechy laskowe, migdały, ryż arborio,
  // borowiki marynowane trafiały do mrożonek). Keywordy i tak łapią poprawnie.
  hortex: { category: "mrozonki", subcategory: "mrożonki" },
  mowi: { category: "mrozonki", subcategory: "łosoś mrożony" },

  // ── Konserwy / przetwory ──
  // UWAGA: "łowicz" celowo USUNIĘTE (audyt danych 2026-09) — Łowicz to marka
  // wieloliniowa (nabiał: masło, mleko ORAZ przetwory), sztywne mapowanie na
  // "konserwy" psuło produkty nabiałowe/serowe tej marki (masło, mleko UHT,
  // a nawet ser Fellada trafiały do konserw). Keywordy łapią poprawnie bez marki.
  bonduelle: { category: "konserwy", subcategory: "warzywa konserwowe" },
  "rio mare": { category: "konserwy", subcategory: "tuńczyk konserwowy" },
  ortiz: { category: "konserwy", subcategory: "anchois i tuńczyk" },

  // ── Środki czystości ──
  domestos: { category: "srodki_czystosci", subcategory: "płyn czyszczący" },
  ludwik: { category: "srodki_czystosci", subcategory: "płyn do naczyń" },
  fairy: { category: "srodki_czystosci", subcategory: "płyn do naczyń" },
  ajax: { category: "srodki_czystosci", subcategory: "płyn czyszczący" },
  cif: { category: "srodki_czystosci", subcategory: "mleczko czyszczące" },
  tork: { category: "srodki_czystosci", subcategory: "ręczniki papierowe" },
  vileda: { category: "srodki_czystosci", subcategory: "mopy i ścierki" },
  tenzi: { category: "srodki_czystosci", subcategory: "chemia profesjonalna" },
  ecolab: { category: "srodki_czystosci", subcategory: "chemia gastronomiczna" },
  clinex: { category: "srodki_czystosci", subcategory: "chemia profesjonalna" },
  buzil: { category: "srodki_czystosci", subcategory: "środki czyszczące" },
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
