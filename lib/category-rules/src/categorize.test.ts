import { describe, it, expect } from "vitest";
import { categorizeProduct } from "./categorize";

// Z5 — dopasowanie słów kluczowych po granicy słowa (z fold diakrytyków).
// Siatka regresji: pewne trafienia + pułapki, w których stare `includes`
// dawało false-positive na fragmencie słowa.
describe("categorizeProduct: pewne trafienia", () => {
  const cases: Array<[string, string]> = [
    ["mleko 2%", "nabiał"],
    ["masło extra 82%", "nabiał"],
    ["jogurt naturalny", "nabiał"],
    // Sery wydzielone z Nabiału (Z8):
    ["serek wiejski", "sery"],
    ["ser cheddar", "sery"],
    ["twaróg", "sery"],
    ["mozzarella", "sery"],
    ["filet z łososia", "ryby"],
    ["wołowina", "miesa"],
    ["kurczak filet", "miesa"],
    ["pomidor malinowy", "warzywa"],
    ["woda mineralna", "napoje"],
    ["piwo ale", "alkohole"],
    ["konserwa rybna", "konserwy"],
  ];
  for (const [name, expected] of cases) {
    it(`"${name}" → ${expected}`, () => {
      expect(categorizeProduct(name)).toBe(expected);
    });
  }
});

describe("categorizeProduct: granica słowa nie łapie fragmentów", () => {
  // „konserwa" zawiera „ser", ale nie jest nabiałem (dopasowanie po granicy słowa).
  it('"konserwa rybna" nie trafia do nabiał', () => {
    expect(categorizeProduct("konserwa rybna")).not.toBe("nabiał");
  });
  // Regresja: "ser " (z końcową spacją) trafiało do gałęzi "fraza" (bo zawiera
  // spację) i leciało na gołym includes bez lewej granicy — łapało się w środku
  // dłuższych słów. "koneser go" / "frytura" to olej, nie ser.
  it('"[KONESER GO] FRYTURA RZEPAKOWA PŁYNNA" nie trafia do sery', () => {
    expect(categorizeProduct("[KONESER GO] FRYTURA RZEPAKOWA PŁYNNA 9,5L WIADRO")).not.toBe("sery");
  });
  it('"deser czekoladowy" nie trafia do sery', () => {
    expect(categorizeProduct("deser czekoladowy")).not.toBe("sery");
  });
  it('"ser żółty plastry" nadal trafia do sery (prawdziwe trafienie nie ucierpiało)', () => {
    expect(categorizeProduct("ser żółty plastry")).toBe("sery");
  });
  // Słowa niespożywcze / nieznane → inne (brak false-positive na fragmencie).
  for (const name of ["import towarów", "konsumpcyjny", "xyz nieznane produkt"]) {
    it(`"${name}" → inne`, () => {
      expect(categorizeProduct(name)).toBe("inne");
    });
  }
});

// Fold diakrytyków — nazwa bez polskich ogonków (częsta z OCR/ręcznego wpisu)
// musi trafiać dokładnie tak samo jak nazwa z ogonkami, w obie strony.
describe("categorizeProduct: fold diakrytyków", () => {
  it('"twarog" (bez ogonków) trafia tak samo jak "twaróg"', () => {
    expect(categorizeProduct("twarog")).toBe(categorizeProduct("twaróg"));
    expect(categorizeProduct("twarog")).toBe("sery");
  });
  it('"oscypek wedzony" (bez ogonków) trafia do sery', () => {
    expect(categorizeProduct("oscypek wedzony 200g")).toBe("sery");
  });
  it('"comte" i "comté" trafiają tak samo', () => {
    expect(categorizeProduct("comte")).toBe(categorizeProduct("comté"));
    expect(categorizeProduct("comte")).toBe("sery");
  });
});

// Regresje znalezione w audycie realnych danych (2026-09) podczas budowy silnika.
describe("categorizeProduct: regresje z audytu realnych danych", () => {
  it('"mieszanka chińska" nie trafia do mięs (kolizja "mięs"→"mies" po foldzie z "mieszanka")', () => {
    expect(categorizeProduct("mieszanka chińska 2,5kg")).not.toBe("miesa");
    expect(categorizeProduct("mieszanka chińska 2,5kg")).toBe("warzywa");
  });
  it('formy "mięsny/mięsne/mięso/mięsem" nadal trafiają do mięs mimo zawężenia rdzenia', () => {
    for (const name of ["wyrób mięsny", "dania mięsne", "mięso mielone", "mięsem faszerowane"]) {
      expect(categorizeProduct(name)).toBe("miesa");
    }
  });
  it('"tortilla"/"wrap tortilla" nie trafia do słodyczy (bare "tort" był prefiksem "tortilla")', () => {
    expect(categorizeProduct("tortilla pszenna")).toBe("pieczywo");
    expect(categorizeProduct("wrap tortilla")).toBe("pieczywo");
  });
  it('"tort czekoladowy" nadal trafia do słodyczy mimo naprawy', () => {
    expect(categorizeProduct("tort czekoladowy")).toBe("slodycze");
  });
});

// Rozszerzona lista serów (rzadkie/regionalne) — główny przykład zgłoszony przez usera.
describe("categorizeProduct: rzadkie/regionalne sery", () => {
  const cheeses = [
    "oscypek", "bryndza owcza", "roquefort", "emmentaler", "raclette",
    "stilton", "manchego", "provolone", "scamorza", "gruyere", "taleggio",
    "gorgonzola", "korycinski wędzony",
  ];
  for (const name of cheeses) {
    it(`"${name}" → sery`, () => {
      expect(categorizeProduct(name)).toBe("sery");
    });
  }
});

// Koszty stałe — realny problem zgłoszony przez usera: ogólne "opłaty" nie były łapane.
describe("categorizeProduct: koszty stałe (opłaty/rachunki/ubezpieczenia)", () => {
  const cases = [
    "opłata za wywóz odpadów", "opłaty administracyjne", "rachunek za telefon",
    "ubezpieczenie lokalu", "abonament miesięczny ochrona", "usługi księgowe listopad",
    "rata leasingowa samochód",
  ];
  for (const name of cases) {
    it(`"${name}" → koszty_stale`, () => {
      expect(categorizeProduct(name)).toBe("koszty_stale");
    });
  }
  // "opłata"/"rachunek" to ogólne słowa — pilnujemy braku kolizji ze spożywczymi.
  it('"rachunek kelnerski druk" nie zostaje przypadkiem złapany przez coś spożywczego', () => {
    expect(categorizeProduct("rachunek kelnerski druk")).toBe("koszty_stale");
  });
});

// Sprzęt — deski serwisowe/prezentacyjne (zgłoszone przez usera), odróżnione od
// gołego "drzewo"/"drewno", które celowo NIE jest keywordem (zbyt niejednoznaczne).
// "DOP"/"DOC"/"IGT"/"AOC" to unijne oznaczenia pochodzenia chronionego używane
// TAKŻE na serach (nie tylko winach) — bare "dop "/"doc "/"igt "/"aoc " w alkoholach
// łapało sery zanim dotarły do reguły "sery" (audyt danych 2026-09).
describe("categorizeProduct: DOP/IGT nie są już wyłączne dla alkoholi", () => {
  it('"ser grana padano ... DOP" trafia do sery, nie do alkoholi', () => {
    expect(categorizeProduct("ser grana padano dop ok.1kg")).toBe("sery");
  });
  it('prawdziwe wino IGT nadal trafia do alkoholi (przez odmianę winogron)', () => {
    expect(categorizeProduct("duca di saragnano puglia igt primitivo")).toBe("alkohole");
  });
});

// Kolejne kolizje prefiksowe znalezione w rozszerzonym audycie (2026-09) — wszystkie
// tego samego wzorca: krótkie słowo kluczowe bez granicy z prawej strony przypadkiem
// jest prefiksem niepowiązanego, dłuższego słowa.
describe("categorizeProduct: dalsze kolizje prefiksowe (audyt rozszerzony)", () => {
  it('"sałata lodowa" nie trafia do mrożonek ("lodów" był prefiksem "lodowa")', () => {
    expect(categorizeProduct("sałata lodowa")).toBe("warzywa");
  });
  it('lody nadal poprawnie trafiają do mrożonek', () => {
    expect(categorizeProduct("lody waniliowe")).toBe("mrozonki");
    expect(categorizeProduct("lodów czekoladowych")).toBe("mrozonki");
  });
  it('"kawa mielona"/"pieprz mielony" nie trafiają do mięs ("mielon" był zbyt ogólny)', () => {
    expect(categorizeProduct("kawa mielona 500g")).toBe("napoje");
    expect(categorizeProduct("pieprz czarny mielony 1kg")).toBe("przyprawy");
  });
  it('mięso mielone nadal poprawnie trafia do mięs', () => {
    expect(categorizeProduct("wołowina mielona na burgery")).toBe("miesa");
  });
  it('"kawałki" (czegokolwiek) nie trafiają do napojów ("kawą" był prefiksem)', () => {
    expect(categorizeProduct("tofu w kawałkach")).not.toBe("napoje");
  });
  it('"kaszanka" trafia do mięs/wędlin, nie do pieczywa ("kasza" był jej prefiksem)', () => {
    expect(categorizeProduct("kaszanka wiejska 400g")).toBe("miesa");
  });
  it('kasza (zboże) nadal poprawnie trafia do pieczywa', () => {
    expect(categorizeProduct("kasza gryczana 1kg")).toBe("pieczywo");
  });
});

// Nowa kategoria zgłoszona przez usera (2026-09): niektóre konta mają na fakturach
// dużo pozycji niezwiązanych z gastronomią. Audyt realnych produkcyjnych danych
// pokazał że to nie tylko części samochodowe, ale cały przemysłowy/warsztatowy
// asortyment (rury, śruby, części maszyn, narzędzia, nawet kalkulator/portfel) —
// świadomie SZEROKA kategoria (decyzja usera), "sprzet" zostaje tylko dla kuchni.
// Kategoria musi być blisko początku kolejności, żeby wygrywać z ogólnymi słowami
// spożywczymi ("olej", "filtr").
describe("categorizeProduct: techniczne / przemysłowe (pojazdy, hydraulika, maszyny)", () => {
  const cases = [
    "łącznik stabilizatora przód", "amortyzator tylny", "filtr oleju silnikowego",
    "olej silnikowy 5w30", "klocki hamulcowe przednie", "żarówka h7 12v",
    "opona zimowa 195/65", "śruba m8x20", "wycieraczki przednie komplet",
    // Realne przykłady z audytu produkcyjnych danych (2026-09) — poza motoryzacją.
    "kalkulator sdc-868", "portfel kelnerski skórzany",
    "parownica karcher sc 5 easyfix", "rura pp kanalizacyjna 110x2000",
    "nakrętka przedłużna bis m10", "osłona panelu sterowania tm31",
    "silnik tm31", "prasa hydrauliczna umur", "hartowane szkło tel protect",
    "pilnik 5,2 mm",
  ];
  for (const name of cases) {
    it(`"${name}" → techniczne`, () => {
      expect(categorizeProduct(name)).toBe("techniczne");
    });
  }
  it("zwykłe produkty spożywcze nie trafiają do techniczne mimo wczesnej pozycji kategorii", () => {
    expect(categorizeProduct("olej rzepakowy 5l")).not.toBe("techniczne");
    expect(categorizeProduct("masło extra 200g")).not.toBe("techniczne");
    expect(categorizeProduct("filtr do kawy")).not.toBe("techniczne");
  });
  it("prawdziwe wyposażenie kuchenne nadal trafia do sprzet, nie techniczne", () => {
    expect(categorizeProduct("patelnia nieprzywierająca 40cm")).toBe("sprzet");
    expect(categorizeProduct("szczypce uniwersalne z blokadą")).toBe("sprzet");
  });
});

// Regresje znalezione w audycie PRAWDZIWYCH danych produkcyjnych (2026-09),
// przy generowaniu jednorazowego przeliczenia — złapane PRZED wdrożeniem na
// produkcję, więc nigdy nie trafiły do bazy. Każda inna niż typowa "prefix vs
// fold" pułapka: tu chodzi o markę/rzeczownik dzielący rdzeń z pospolitym słowem.
describe("categorizeProduct: regresje z audytu produkcyjnego (marki vs pospolite słowa)", () => {
  it('marka suplementów/sosów "Dzik®" nie trafia do mięs (bare "dzik" usunięty)', () => {
    expect(categorizeProduct("multiwitamina dzik")).not.toBe("miesa");
    expect(categorizeProduct("sos zero dzik® barbecue")).toBe("przyprawy");
  });
  it('sos "Mae Pranom" nie trafia do środków czystości ("prań" wymaga teraz granicy)', () => {
    expect(categorizeProduct("sos pad thai mae pranom")).not.toBe("srodki_czystosci");
  });
  it('proszek do prania z zapachem "rose" trafia do środków czystości, nie alkoholi', () => {
    expect(categorizeProduct("persil universal rose 66 prań")).toBe("srodki_czystosci");
  });
  it('prawdziwe pranie nadal trafia do środków czystości', () => {
    expect(categorizeProduct("60 prań proszek do prania")).toBe("srodki_czystosci");
  });
  it('miska "salaterka" trafia do sprzętu, nie warzyw ("sałatę" nie koliduje już z "salaterka")', () => {
    expect(categorizeProduct("selena salaterka śr.12cm")).toBe("sprzet");
  });
  it('sałata/sałatka nadal poprawnie trafiają do warzyw', () => {
    expect(categorizeProduct("sałata lodowa")).toBe("warzywa");
    expect(categorizeProduct("sałatka jarzynowa")).toBe("warzywa");
  });
  it('wino różowe/rosé nadal poprawnie trafia do alkoholi (przez "wino "/"różowe wino")', () => {
    expect(categorizeProduct("wino rosé wytrawne")).toBe("alkohole");
    expect(categorizeProduct("różowe wino musujące")).toBe("alkohole");
  });
  it('prawdziwa dziczyzna nadal trafia do mięs', () => {
    expect(categorizeProduct("dziczyzna gulasz")).toBe("miesa");
  });
});

// Regresje znalezione przy weryfikacji prod_category_updates.sql (2026-09-21,
// przed odpaleniem na produkcji): napoje (sok/syrop smakowy) łapały się na
// nazwę owocu w warzywa, bo warzywa były wcześniej w tablicy CATEGORY_DEFS.
describe("categorizeProduct: napoje PRZED warzywa (sok, syropy smakowe)", () => {
  it('"sok pomarańczowy" trafia do napoje, nie warzywa (przez nazwę owocu)', () => {
    expect(categorizeProduct("pet 1/12 toma sok pomaranczowy drs")).toBe("napoje");
  });
  it('"sok jabłkowy" trafia do napoje, nie warzywa', () => {
    expect(categorizeProduct("pet 1/12 toma sok jablkowy drs")).toBe("napoje");
  });
  it('syrop smakowy marki Monin trafia do napoje, nie warzywa (przez "marakuj")', () => {
    expect(categorizeProduct("monin syrop marakuja - passion fruit")).toBe("napoje");
  });
  it('prawdziwe owoce nadal trafiają do warzyw', () => {
    expect(categorizeProduct("pomarańcze kraj pochodzenia hiszpania")).toBe("warzywa");
    expect(categorizeProduct("jabłka polskie")).toBe("warzywa");
    expect(categorizeProduct("marakuja świeża")).toBe("warzywa");
  });
});

describe("categorizeProduct: sprzęt (deski, akcesoria drewniane)", () => {
  it('"deska serwisowa bukowa 40cm" → sprzet', () => {
    expect(categorizeProduct("deska serwisowa bukowa 40cm")).toBe("sprzet");
  });
  it('"deska do krojenia plastikowa" → sprzet (już wcześniej łapane)', () => {
    expect(categorizeProduct("deska do krojenia plastikowa")).toBe("sprzet");
  });
  it('"węgiel drzewny do grilla" → koszty_stale (opał, nie wyposażenie)', () => {
    expect(categorizeProduct("węgiel drzewny do grilla")).toBe("koszty_stale");
  });
});
