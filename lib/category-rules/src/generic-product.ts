import { normalizeForMatch } from "./text-normalize.js";

/**
 * Produkt BAZOWY z nazwy z faktury — do porównania cen między restauracjami.
 * Każdy dostawca pisze inaczej: „CYTRYNY ARGENTYNA KL.I”, „Cytryna luz 1kg”,
 * „cytryny świeże” — to dla rynku jedna „Cytryna”. Pomijamy pochodzenie, klasę,
 * opakowanie i liczby; liczą się rdzenie słów ze słownika niżej.
 *
 * Zasady dopasowania (deterministyczne, zero AI):
 *  - nazwa → lowercase, bez ogonków, interpunkcja/cyfry jako separatory → tokeny;
 *  - wzorzec to ciąg rdzeni („filet kurcz”) — KAŻDY musi być początkiem jakiegoś tokenu;
 *    rdzeń z „$” na końcu musi być CAŁYM tokenem (krótkie słowa: „por$”, „sol$”);
 *  - wyklucz: jeśli którykolwiek token zaczyna się od wykluczenia, wpis odpada —
 *    „sok z cytryny” ani „koncentrat pomidorowy” to nie świeża cytryna/pomidor;
 *  - wygrywa PIERWSZY pasujący wpis, więc szczegółowe („pomidor malinowy”) stoją
 *    przed ogólnymi („pomidor”).
 * Jednostki nie łączymy tutaj — robi to wywołujący (cena za kg ≠ za sztukę).
 */
export type GenericProductGroup = "Owoce" | "Warzywa" | "Zioła" | "Mięso i ryby" | "Nabiał" | "Spiżarnia";
export type GenericProduct = { key: string; label: string; group: GenericProductGroup };

type Entry = { label: string; match: string[]; exclude?: string[] };

// Przetworzone formy — nigdy nie mylimy ich ze świeżym produktem.
const PROCESSED = [
  "sok$", "soku$", "soki$", "puree", "pure$", "syrop", "susz", "mroz", "konfitur", "dzem", "pasta", "sos$", "sosu", "koncentrat",
  "przecier", "marynow", "konserw", "puszk", "chips", "aromat", "ekstrakt", "lemoniad", "napoj", "nektar",
  "czips", "frytk", "skrobi", "liofil", "kandyz", "granul", "proszk", "mielon", "wedzon", "przypraw", "kremow", "skork", "zest$",
  // 2026-10-11: „CZOSNEK GRANULOWANY 1KG” (granulat), „OLIWA Z OLIWEK CZOSNEK I CHILLI”, „KUWETA SORBET
  // MALINOWY 5L” trafiały do świeżego czosnku/maliny i pokazywały +1400% „powyżej mediany”.
  "oliw", "olej", "sorbet", "lody", "lod$", "deser", "kuwet", "jogurt", "napar", "herbat", "likier", "piwo", "wino$",
  // 2026-10-11 (drugi przegląd): „Cebulki w occie balsamicznym 860g”, „Malina grys 2,5kg” (mrożona kruszonka).
  "occ", "ocet", "balsam", "marynat", "glazur", "grys", "pulp", "nadzien", "krem$",
  // „KWASEK CYTRYNOWY 1KG” to nie cytryna.
  "kwas",
];

// Mięso premium/przetworzone to inny produkt niż zwykły element („Antrykot dojrzewający
// premium stek” za 164 zł/kg vs zwykły antrykot 60 zł/kg — realny przypadek 2026-10-11).
const MEAT_EX = ["dojrzew", "sezonow", "wagyu", "angus", "marynow", "marynat", "panier", "wedzon", "gotowan", "pieczon", "sous", "kebab", "nugget", "burger"];
const MEAT = (label: string, match: string[], extra: string[] = []): Entry => ({ label, match, exclude: [...MEAT_EX, ...extra] });

const FRESH = (label: string, match: string[], extra: string[] = []): Entry => ({ label, match, exclude: [...PROCESSED, ...extra] });

const ENTRIES: Entry[] = [
  // Wielowyrazowe, które zawierają nazwę innego produktu („malinowy” ≠ malina) — najpierw.
  FRESH("Pomidor koktajlowy", ["pomidor", "koktajl"]), FRESH("Pomidor koktajlowy", ["pomidor", "cherry"]),
  FRESH("Pomidor malinowy", ["pomidor", "malin"]),
  // ── Owoce ──
  FRESH("Cytryna", ["cytryn"]),
  FRESH("Limonka", ["limonk"], ["kafir"]), FRESH("Limonka", ["limet"]),
  FRESH("Pomarańcza", ["pomarancz"]),
  FRESH("Grejpfrut", ["grejpfrut"]),
  FRESH("Mandarynka", ["mandaryn"]),
  FRESH("Jabłko", ["jablk"]), FRESH("Jabłko", ["jablek"]),
  FRESH("Gruszka", ["grusz"]),
  FRESH("Banan", ["banan"]),
  FRESH("Truskawka", ["truskaw"]),
  FRESH("Borówka", ["borowk"]),
  FRESH("Malina", ["malin"]),
  FRESH("Winogrono", ["winogron"]),
  FRESH("Arbuz", ["arbuz"]),
  FRESH("Ananas", ["ananas"]),
  FRESH("Mango", ["mango"]),
  FRESH("Awokado", ["awokad"]),
  FRESH("Kiwi", ["kiwi"]),
  // ── Warzywa ──
  FRESH("Ziemniaki", ["ziemniak"]),
  FRESH("Batat", ["batat"]),
  FRESH("Pomidor", ["pomidor"]),
  { label: "Ogórek kiszony", match: ["ogor", "kiszon"] },
  FRESH("Ogórek", ["ogor"], ["kiszon", "konserwow"]),
  FRESH("Cebula czerwona", ["cebul", "czerwon"]),
  FRESH("Cebula", ["cebul"], ["dymk", "smazon", "prazon"]),
  FRESH("Czosnek", ["czosn"], ["niedzwiedz"]),
  FRESH("Marchew", ["marchew"]), FRESH("Marchew", ["marchw"]),
  FRESH("Natka pietruszki", ["natk"]),
  FRESH("Pietruszka korzeń", ["pietrusz"]),
  FRESH("Seler naciowy", ["seler", "naci"]),
  FRESH("Seler", ["seler"]),
  FRESH("Por", ["por$"]),
  FRESH("Papryka", ["papryk"], ["slodk", "ostr", "piri"]),
  FRESH("Sałata lodowa", ["salat", "lodow"]),
  FRESH("Sałata rzymska", ["salat", "rzym"]),
  FRESH("Rukola", ["rukol"]), FRESH("Rukola", ["rokiet"]),
  FRESH("Szpinak", ["szpinak"]),
  FRESH("Kapusta pekińska", ["kapust", "pekin"]),
  FRESH("Kapusta czerwona", ["kapust", "czerwon"]),
  { label: "Kapusta kiszona", match: ["kapust", "kiszon"] },
  FRESH("Kapusta biała", ["kapust"], ["kiszon", "pekin", "czerwon", "brukse", "wlosk"]),
  FRESH("Brokuł", ["brokul"]),
  FRESH("Kalafior", ["kalafior"]),
  FRESH("Cukinia", ["cukini"]),
  FRESH("Bakłażan", ["baklazan"]),
  FRESH("Pieczarki", ["pieczar"]),
  FRESH("Boczniak", ["boczniak"]),
  FRESH("Fasolka szparagowa", ["fasol", "szparag"]),
  FRESH("Szparagi", ["szparag"]),
  FRESH("Burak", ["burak"], ["cwikl"]),
  FRESH("Rzodkiewka", ["rzodkiew"]),
  FRESH("Imbir", ["imbir"]),
  FRESH("Mięta", ["miet"], ["herbat", "likier", "cukierk", "guma"]),
  FRESH("Bazylia", ["bazyli"]),
  FRESH("Koperek", ["koper"], ["wloski", "nasion"]),
  FRESH("Szczypiorek", ["szczypior"]),
  FRESH("Kolendra", ["kolendr"], ["ziarn", "nasion"]),
  FRESH("Rozmaryn", ["rozmaryn"]),
  FRESH("Tymianek", ["tymian"]),
  // ── Mięso i ryby (szczegółowe przed ogólnymi) ──
  MEAT("Filet z kurczaka", ["filet", "kurcz"]),
  MEAT("Filet z kurczaka", ["piers", "kurcz"]),
  MEAT("Udo z kurczaka", ["ud", "kurcz"]),
  MEAT("Skrzydełka z kurczaka", ["skrzyd", "kurcz"]),
  MEAT("Filet z indyka", ["filet", "indy"]),
  MEAT("Filet z indyka", ["piers", "indy"]),
  MEAT("Polędwica wołowa", ["poledwic", "wolow"]),
  MEAT("Wołowina mielona", ["wolow", "miel"]),
  MEAT("Antrykot", ["antrykot"]),
  MEAT("Rostbef", ["rostbef"]),
  MEAT("Polędwiczka wieprzowa", ["poledwicz", "wiep"]),
  MEAT("Karkówka", ["karkow"]),
  MEAT("Łopatka wieprzowa", ["lopatk", "wiep"]),
  MEAT("Schab", ["schab"]),
  MEAT("Żeberka", ["zeber"]),
  { label: "Boczek wędzony", match: ["boczek", "wedz"] },
  { label: "Boczek", match: ["boczek"] },
  MEAT("Kaczka", ["kacz"]),
  { label: "Łosoś wędzony", match: ["losos", "wedz"] },
  { label: "Łosoś", match: ["losos"], exclude: ["pasta", "puszk", "sos$"] },
  MEAT("Dorsz", ["dorsz"]),
  MEAT("Krewetki", ["krewet"]),
  // ── Nabiał ──
  { label: "Masło", match: ["masl"], exclude: ["maslank", "orzech", "klarow", "czosnk", "zio", "kakao", "shea"] },
  { label: "Mleko", match: ["mlek"], exclude: ["kokos", "zageszcz", "proszk", "skondens", "owsian", "sojow", "migdal", "ryzow", "czekolad"] },
  { label: "Śmietana 36%", match: ["smietan", "36"] },
  { label: "Śmietana 30%", match: ["smietan", "30"] },
  { label: "Śmietana 18%", match: ["smietan", "18"] },
  { label: "Śmietana 12%", match: ["smietan", "12"] },
  { label: "Jogurt naturalny", match: ["jogurt", "natur"] },
  { label: "Twaróg", match: ["twarog"] },
  { label: "Mozzarella", match: ["mozzarel"] },
  { label: "Mascarpone", match: ["mascarpon"] },
  { label: "Feta", match: ["feta$"] },
  { label: "Jaja", match: ["jaj"], exclude: ["makaron", "majonez", "jajeczn"] },
  // ── Sucha spiżarnia ──
  { label: "Mąka pszenna", match: ["maka$", "pszen"] },
  { label: "Cukier puder", match: ["cukier", "puder"] },
  { label: "Cukier", match: ["cukier"], exclude: ["trzcin", "wanili", "zel", "syrop", "kostk", "paluszk", "saszet", "porcj", "stick"] },
  { label: "Sól", match: ["sol$"], exclude: ["solon", "solank"] },
  { label: "Ryż", match: ["ryz$"], exclude: ["wafl", "mak", "papier"] },
  { label: "Olej rzepakowy", match: ["olej", "rzepak"] },
  { label: "Oliwa z oliwek", match: ["oliwa$"] },
  { label: "Oliwki", match: ["oliwk"] },
];

const HERBS = new Set(["Mięta", "Bazylia", "Koperek", "Szczypiorek", "Kolendra", "Rozmaryn", "Tymianek", "Natka pietruszki"]);
const FRUITS = new Set(["Cytryna", "Limonka", "Pomarańcza", "Grejpfrut", "Mandarynka", "Jabłko", "Gruszka", "Banan", "Truskawka", "Borówka", "Malina", "Winogrono", "Arbuz", "Ananas", "Mango", "Awokado", "Kiwi"]);
const MEAT_FISH = new Set(["Filet z kurczaka", "Udo z kurczaka", "Skrzydełka z kurczaka", "Filet z indyka", "Polędwica wołowa", "Wołowina mielona", "Antrykot", "Rostbef", "Polędwiczka wieprzowa", "Karkówka", "Łopatka wieprzowa", "Schab", "Żeberka", "Boczek wędzony", "Boczek", "Kaczka", "Łosoś wędzony", "Łosoś", "Dorsz", "Krewetki"]);
const DAIRY = new Set(["Masło", "Mleko", "Śmietana 36%", "Śmietana 30%", "Śmietana 18%", "Śmietana 12%", "Jogurt naturalny", "Twaróg", "Mozzarella", "Mascarpone", "Feta", "Jaja"]);
const PANTRY = new Set(["Mąka pszenna", "Cukier puder", "Cukier", "Sól", "Ryż", "Olej rzepakowy", "Oliwa z oliwek", "Oliwki"]);

/** Grupa do prezentacji (np. publiczna strona cen) — jawnie ze słownika, nie z kategorii userów. */
export function groupOf(label: string): GenericProductGroup {
  if (HERBS.has(label)) return "Zioła";
  if (FRUITS.has(label)) return "Owoce";
  if (MEAT_FISH.has(label)) return "Mięso i ryby";
  if (DAIRY.has(label)) return "Nabiał";
  if (PANTRY.has(label)) return "Spiżarnia";
  return "Warzywa";
}

function tokenize(name: string): string[] {
  return normalizeForMatch(name)
    .replace(/[^a-z0-9%]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function hasStem(tokens: string[], stem: string): boolean {
  if (stem.endsWith("$")) {
    const w = stem.slice(0, -1);
    return tokens.includes(w);
  }
  return tokens.some((t) => t.startsWith(stem));
}

function keyOf(label: string): string {
  return normalizeForMatch(label).replace(/[^a-z0-9%]+/g, " ").trim();
}

// Chemia, opakowania, jednorazówki — nigdy produkt spożywczy, choćby nazwa miała „miętę”
// („GAR KUBUŚ PŁ. D/NACZYŃ 5L MIĘTA KARNISTER” trafiał do świeżej mięty, 2026-10-11).
const NON_FOOD = [
  "plyn", "naczyn", "karnister", "detergent", "srodek", "srodk", "worek", "worki", "workow", "foli", "rekawic", "papier",
  "mydl", "zmywar", "recznik", "serwetk", "tack", "pojemnik", "kubk", "kubek", "slomk", "wykalacz", "gabk", "scierk",
  "odtluszcz", "dezynf", "chlor", "tabletk", "nablyszcz", "odkam", "czyszcz", "wybiel", "plukank", "sztuc",
];

/** Czy nazwa z faktury to na pewno nie żywność (chemia, opakowania, jednorazówki). */
export function isNonFood(name: string): boolean {
  const tokens = tokenize(name);
  return NON_FOOD.some((x) => hasStem(tokens, x));
}

/** Produkt bazowy z nazwy z faktury albo null, gdy nazwa nie pasuje do słownika. */
export function genericProduct(name: string): GenericProduct | null {
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;
  if (NON_FOOD.some((x) => hasStem(tokens, x))) return null;
  for (const e of ENTRIES) {
    if (!e.match.every((s) => hasStem(tokens, s))) continue;
    if (e.exclude?.some((x) => hasStem(tokens, x))) continue;
    return { key: keyOf(e.label), label: e.label, group: groupOf(e.label) };
  }
  return null;
}

/** Liczba różnych produktów bazowych w słowniku (informacyjnie, np. w testach). */
export const GENERIC_PRODUCT_COUNT = new Set(ENTRIES.map((e) => e.label)).size;

// ── Gramatura opakowania w nazwie ────────────────────────────────────────────
const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|dag|g|l|cl|ml|szt|sztuk|x)(?![a-z])/g;

/**
 * Sygnatura opakowania z nazwy („1,05KG PET” → "1.05kg", „1KG [6SZT]” → "1kg+6szt",
 * „1000 SZT x 5g” → "1000szt+5g") albo "" gdy nazwa nie podaje ilości.
 *
 * Po co: przy jednostce „szt”/„opak” cena jest za OPAKOWANIE. „Czosnek granulowany 1kg” za
 * 44,80 zł/szt i główka czosnku za 2,86 zł/szt mają tę samą jednostkę, ale nie są porównywalne
 * (realny błąd 2026-10-11: +1466% „powyżej mediany”). Porównujemy tylko pozycje o tej samej
 * sygnaturze. Przy kg/l gramatura w nazwie nie ma znaczenia — cena i tak jest za kilogram/litr.
 */
export function packSignature(name: string): string {
  const n = normalizeForMatch(name);
  const parts: string[] = [];
  for (const m of n.matchAll(AMOUNT_RE)) {
    const num = Number(m[1]!.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) continue;
    const unit = m[2] === "sztuk" || m[2] === "x" ? "szt" : m[2]!;
    parts.push(`${num}${unit}`);
  }
  return [...new Set(parts)].sort().join("+");
}

// ── Cena porównywalna: za kg/l zamiast za opakowanie ─────────────────────────
const TO_BASE: Record<string, { base: "kg" | "l"; mult: number }> = {
  kg: { base: "kg", mult: 1 }, dag: { base: "kg", mult: 0.01 }, g: { base: "kg", mult: 0.001 },
  l: { base: "l", mult: 1 }, cl: { base: "l", mult: 0.01 }, ml: { base: "l", mult: 0.001 },
};
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|dag|g|l|cl|ml)(?![a-z])/g;
// „1000 SZT x 5g”, „6 x 1l”, „12x0,5l” — liczba sztuk wprost przed rozmiarem = mnożnik.
const MULTI_RE = /(\d+)\s*(?:szt|sztuk)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|dag|g|l|cl|ml)(?![a-z])/;
const num = (s: string) => Number(s.replace(",", "."));

/**
 * Łączna ilość towaru w JEDNEJ pozycji fakturowanej „na sztuki”, z nazwy:
 * „CZOSNEK 1,05KG” → 1.05 kg; „1000 SZT x 5g” → 5 kg; „MALINA 2,5KG [4SZT]” → 2.5 kg.
 * Liczba w nawiasie („[4SZT]”, „[6SZT]”) to informacja o kartonie u hurtowni, a cena na
 * fakturze jest za pojedyncze opakowanie — NIE mnożymy przez nią (sprawdzone na cenach:
 * „Malina grys 2,5kg [4szt]” 59,80 zł = ~24 zł/kg, przez 4 wyszłoby nierealne 6 zł/kg).
 * null, gdy nazwa nie podaje gramatury albo wychodzi nierealna wartość.
 */
export function parsePack(name: string): { total: number; base: "kg" | "l" } | null {
  const n = normalizeForMatch(name).replace(/\[[^\]]*\]/g, " ");
  const multi = n.match(MULTI_RE);
  let best: { total: number; base: "kg" | "l" } | null = null;
  if (multi) {
    const b = TO_BASE[multi[3]!]!;
    best = { total: num(multi[1]!) * num(multi[2]!) * b.mult, base: b.base };
  } else {
    for (const m of n.matchAll(SIZE_RE)) {
      const b = TO_BASE[m[2]!]!;
      const total = num(m[1]!) * b.mult;
      // Największa podana ilość („Ser 1kg plastry 150g” → 1 kg); kg i l się nie mieszają.
      if (!best || (b.base === best.base && total > best.total)) best = { total, base: b.base };
    }
  }
  if (!best || !Number.isFinite(best.total) || best.total < 0.005 || best.total > 50) return null;
  return best;
}

export type PriceBasis = {
  /** Jednostka porównania: kg/l, gdy da się przeliczyć; inaczej jednostka z faktury. */
  compareUnit: string;
  /** Cena porównywalna = cena z faktury × factor (ilość porównywalna = ilość ÷ factor). */
  factor: number;
  /** Gramatura, której nie dało się przeliczyć (np. „3szt”) — rozdziela grupy. */
  packKey: string;
};

/**
 * Jak porównywać cenę pozycji: „Czosnek 1,05kg” po 44,80 zł/szt → 42,67 zł/kg, porównywalne
 * z czosnkiem kupowanym na kilogramy. Tak robią to systemy zakupowe gastronomii — najpierw cena
 * za kg/l, potem porównanie. Jednostka kg/l/g/ml z faktury: już jest „za ilość”.
 */
export function priceBasis(name: string, normalizedUnit: string): PriceBasis {
  if (normalizedUnit === "kg" || normalizedUnit === "l") return { compareUnit: normalizedUnit, factor: 1, packKey: "" };
  if (normalizedUnit === "g") return { compareUnit: "kg", factor: 1000, packKey: "" };
  if (normalizedUnit === "ml") return { compareUnit: "l", factor: 1000, packKey: "" };
  const pack = parsePack(name);
  if (pack) return { compareUnit: pack.base, factor: 1 / pack.total, packKey: "" };
  return { compareUnit: normalizedUnit, factor: 1, packKey: packSignature(name) };
}
