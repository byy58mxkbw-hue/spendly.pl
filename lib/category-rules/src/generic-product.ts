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
export type GenericProduct = { key: string; label: string };

type Entry = { label: string; match: string[]; exclude?: string[] };

// Przetworzone formy — nigdy nie mylimy ich ze świeżym produktem.
const PROCESSED = [
  "sok$", "soku$", "soki$", "puree", "pure$", "syrop", "susz", "mroz", "konfitur", "dzem", "pasta", "sos$", "sosu", "koncentrat",
  "przecier", "marynow", "konserw", "puszk", "chips", "aromat", "ekstrakt", "lemoniad", "napoj", "nektar",
  "czips", "frytk", "skrobi", "liofil", "kandyz", "granulat", "proszk", "mielon", "wedzon", "przypraw", "kremow", "skork", "zest$",
];

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
  { label: "Filet z kurczaka", match: ["filet", "kurcz"] },
  { label: "Filet z kurczaka", match: ["piers", "kurcz"] },
  { label: "Udo z kurczaka", match: ["ud", "kurcz"] },
  { label: "Skrzydełka z kurczaka", match: ["skrzyd", "kurcz"] },
  { label: "Filet z indyka", match: ["filet", "indy"] },
  { label: "Filet z indyka", match: ["piers", "indy"] },
  { label: "Polędwica wołowa", match: ["poledwic", "wolow"] },
  { label: "Wołowina mielona", match: ["wolow", "miel"] },
  { label: "Antrykot", match: ["antrykot"] },
  { label: "Rostbef", match: ["rostbef"] },
  { label: "Polędwiczka wieprzowa", match: ["poledwicz", "wiep"] },
  { label: "Karkówka", match: ["karkow"] },
  { label: "Łopatka wieprzowa", match: ["lopatk", "wiep"] },
  { label: "Schab", match: ["schab"] },
  { label: "Żeberka", match: ["zeber"] },
  { label: "Boczek wędzony", match: ["boczek", "wedz"] },
  { label: "Boczek", match: ["boczek"] },
  { label: "Kaczka", match: ["kacz"] },
  { label: "Łosoś wędzony", match: ["losos", "wedz"] },
  { label: "Łosoś", match: ["losos"], exclude: ["pasta", "puszk", "sos$"] },
  { label: "Dorsz", match: ["dorsz"] },
  { label: "Krewetki", match: ["krewet"] },
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
  { label: "Cukier", match: ["cukier"], exclude: ["trzcin", "wanili", "zel", "syrop", "kostk"] },
  { label: "Sól", match: ["sol$"], exclude: ["solon", "solank"] },
  { label: "Ryż", match: ["ryz$"], exclude: ["wafl", "mak", "papier"] },
  { label: "Olej rzepakowy", match: ["olej", "rzepak"] },
  { label: "Oliwa z oliwek", match: ["oliwa$"] },
  { label: "Oliwki", match: ["oliwk"] },
];

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

/** Produkt bazowy z nazwy z faktury albo null, gdy nazwa nie pasuje do słownika. */
export function genericProduct(name: string): GenericProduct | null {
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;
  for (const e of ENTRIES) {
    if (!e.match.every((s) => hasStem(tokens, s))) continue;
    if (e.exclude?.some((x) => hasStem(tokens, x))) continue;
    return { key: keyOf(e.label), label: e.label };
  }
  return null;
}

/** Liczba różnych produktów bazowych w słowniku (informacyjnie, np. w testach). */
export const GENERIC_PRODUCT_COUNT = new Set(ENTRIES.map((e) => e.label)).size;
