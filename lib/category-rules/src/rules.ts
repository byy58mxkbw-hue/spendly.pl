/**
 * KANONICZNA lista kategorii i słów kluczowych — jedyne źródło prawdy, współdzielone
 * przez backend (api-server) i frontend (ksef-monitor). Wcześniej istniały DWIE
 * niezależne kopie tej listy (artifacts/api-server/src/lib/categorize.ts i
 * artifacts/ksef-monitor/src/lib/categories.ts) z RÓŻNYMI silnikami dopasowania —
 * backend miał poprawną granicę słowa, frontend robił goły `includes()`, więc UI
 * potrafiło pokazać inną kategorię niż backend faktycznie zapisał. Scalone tutaj.
 *
 * WAŻNE: kolejność w tablicy ma znaczenie!
 * Bardziej specyficzne kategorie (z unikalnymi słowami kluczowymi)
 * muszą być PRZED bardziej ogólnymi.
 * Przykład: mrozonki i konserwy PRZED warzywa/ryby,
 *            slodycze PRZED pieczywo (czekolada, ciastka)
 *            srodki_czystosci i opakowania PRZED napoje (papier, folie)
 *            sery PRZED nabiał (serek trafia do sery, nie nabiał)
 *            napoje PRZED warzywa (sok pomarańczowy/jabłkowy, syrop smakowy
 *              typu Monin marakuja — łapały się na nazwę owocu zamiast "sok "/marki)
 *            orzechy OSTATNIA (bare "orzech" łapie też kremy/syropy orzechowe)
 */
export type CategoryDef = { id: string; label: string; emoji: string; keywords: string[] };

export const CATEGORY_DEFS: CategoryDef[] = [
  // ── 0. Koszty stałe (media, paliwo, najem, abonamenty) ──────────────────────
  // WAŻNE: pierwsze w kolejności. Pozycje z faktur za prąd/gaz/internet/najem to
  // NIE są składniki — łapiemy je tu, żeby nie zaśmiecały kolejki „do przeglądu".
  // Słowa kluczowe są specyficzne i nie kolidują z produktami spożywczymi.
  {
    id: "koszty_stale",
    label: "Koszty stałe",
    emoji: "🧾",
    keywords: [
      // Energia i media
      "elektryczn", "energii czynnej", "energii biernej", "pobór energii",
      "rozliczenie energii", "dystrybucj", "opłata mocowa", "kogeneracyjn",
      "opłata oze", "oze szczyt", "oze pozostał", "sieciow", "stawka jakościow",
      "składnik stały", "składnik zmienny", "opłata handlowa", "opłata przejściow",
      "opłata abonamentow", "opłata jakościow",
      // Telekomunikacja i internet
      "internet", "światłowod", "abonament", "pakiet usługi", "usługi bez limitu",
      "opłata za sim", "karta sim",
      // Najem i dzierżawa
      "dzierżawa", "najem", "wynajem", "czynsz", "leasing",
      // Paliwo i opał
      "paliwo", "diesel", "benzyn", "napędowy", "efecta", "adblue", "ad blue",
      "tankowanie", "gaz ziemny", "gazu ziemnego", "opał", "pellet", "węgiel drzewny",
      // Usługi i biuro
      "monitorowania", "monitoring", "interwencji", "wywóz odpad", "wywóz śmieci",
      "papier ksero", "toner", "tusz do drukarki", "koperta",
      "opłata za udostępnienie", "opłata serwisow",
      // Usługi, prowizje, paliwo, leasing (uzup. 2 — z realnych faktur)
      "przejściow", "moc pobrana", "usługa ", "prowizja", "obsługę transakcji",
      "cashback", "kaucja", "transportow", "kurier", "szkolenie", "bhp",
      "leasingow", "rolka termiczna", "verva", "fuelsave", "pb 95", "pb95",
      "administracji skarbow", "raportowanie do",
      // Opłaty ogólne i rozliczeniowe (uzup. — realny problem zgłoszony przez usera:
      // "opłaty" nie były łapane, bo dotąd tylko konkretne frazy typu "opłata mocowa").
      "opłata", "opłaty", "opłat ", "rachunek", "rachunku", "ubezpieczenie",
      "polisa", "składka ubezpieczeniow", "abonament miesięczn",
      "usługi księgow", "obsługa księgow", "obsługę księgow", "amortyzacj",
      "rata leasingow", "czynsz najmu", "opłata eksploatacyjn",
      "wywóz nieczystości", "media ",
    ],
  },

  // ── 0b. Techniczne / Przemysłowe (pojazdy, hydraulika, złączki, maszyny) ────
  // Zgłoszone przez usera (2026-09): część kont ma na fakturach dużo pozycji
  // niezwiązanych z gastronomią. Audyt realnych danych (2026-09) pokazał, że
  // kategoria "sprzet" (dziś: patelnie/garnki) była zaśmiecona wszystkim, co
  // nie pasowało nigdzie indziej: kalkulator, portfel kelnerski, myjka
  // ciśnieniowa, rury kanalizacyjne PVC, śruby/nakrętki/kołki, części maszyn
  // przemysłowych, prasa hydrauliczna, hartowane szkło, pilnik — nie tylko
  // części samochodowe. Świadomie SZEROKA kategoria (decyzja użytkownika) —
  // "sprzet" zostaje wyłącznie dla prawdziwego wyposażenia kuchennego.
  // "bosma"/"px26d"/" h7 "/"akumulator" przeniesione tu ze "sprzet" — to były
  // w rzeczywistości oznaczenia żarówki samochodowej (12V 55W H7 PX26d).
  // WAŻNE: musi być blisko początku (jak koszty_stale) — inaczej ogólne słowa
  // typu "olej"/"filtr" z kategorii spożywczych (przyprawy) wygrałyby pierwsze
  // nad bardziej specyficznym "olej silnikowy"/"filtr oleju".
  {
    id: "techniczne",
    label: "Techniczne / Przemysłowe",
    emoji: "🔧",
    keywords: [
      // Zawieszenie i układ kierowniczy — "łącznik stabilizatora" to konkretny
      // zgłoszony przykład; celowo BEZ gołego "stabilizator" (bywa terminem
      // dodatku spożywczego w opisach składników, zbyt ryzykowne jako pojedyncze
      // słowo na samym początku kolejności kategorii).
      "łącznik stabilizatora", "amortyzator", "wahacz",
      "drążek kierowniczy", "końcówka drążka", "przegub", "sworzeń wahacza",
      "poduszka silnika", "poduszka skrzyni",
      // Hamulce
      "hamulc", "klocki hamulcowe", "tarcza hamulcowa", "płyn hamulcowy",
      "przewód hamulcowy", "bęben hamulcowy", "szczęki hamulcowe",
      // Silnik i eksploatacja pojazdów
      "sprzęgł", "filtr oleju", "filtr powietrza", "filtr paliwa",
      "filtr kabinowy", "świeca zapłonowa", "świece zapłonowe",
      "olej silnikowy", "olej przekładniowy", "pasek klinowy", "pasek rozrządu",
      "rozrząd", "tłumik", "katalizator",
      "chłodnica", "termostat silnika", "alternator", "rozrusznik",
      "akumulator samochodow", "akumulator", "pompa wody", "pompa paliwa",
      // Ogumienie i elektryka pojazdów
      "opona ", "opony ", "felga", "felgi", "wycieraczk", "żarówka h",
      "żarówka samochodow", "bezpiecznik samochodow", "bosma", "px26d", " h7 ",
      // Serwis pojazdów
      "część zamienna", "części zamienne", "serwis samochodow",
      "przegląd techniczny", "naprawa samochod", "warsztat samochodow",
      "wulkanizacj", "geometria kół", "wymiana oleju",
      // Hydraulika i instalacje (uzup. — audyt 2026-09: rury/złączki na fakturach)
      "rura pp", "rura kanalizacyjn", "rura instalacyjn", "kanalizacyjn",
      "hydraulik", "złączka", "kolanko instalacyjn", "trójnik instalacyjn",
      "zawór kulowy", "zawór instalacyjn", "wąż hydrauliczn",
      // Złączki, śruby, elementy złączne
      "śruba", "śruby", "nakrętk", "podkładka techniczn", "wkręt",
      "kołek rozporow", "dybel", "gwint metryczn", "łożysko", "uszczelka",
      "uszczelniacz", "obejma", "wspornik montażow",
      // Maszyny, elektryka przemysłowa, warsztat
      "silnik elektryczn", "silnik ", "panel sterowania", "gniazdo styków",
      "osłona panelu", "osłona sprzęgła", "obudowa maszyn", "prasa hydrauliczn",
      "siłownik", "myjka ciśnieniow", "parownica", "pilnik ", "wiertło",
      "wiertark", "śrubokręt", "klucz nasadow", "szlifierk", "spawark",
      "hartowane szkło", "szkło hartowan",
      // Biurowe/pozostałe niespożywcze (uzup. — realne pozycje z audytu)
      "kalkulator", "portfel kelnerski",
    ],
  },

  // ── 1. Alkohole ─────────────────────────────────────────────────────────────
  {
    id: "alkohole",
    label: "Alkohole",
    emoji: "🍷",
    keywords: [
      // Piwo
      "piwo", "piwa", "piwem", "piw ", "lager", "ale ", "ipa ", "porter",
      "stout", "weizen", "bock", "wheat beer", "craft beer", "bz ", "bz",
      "litovel", "tyskie", "żywiec", "lech ", "heineken", "carlsberg",
      "desperados", "corona ", "budweiser", "hoegaarden", "leffe", "pilsner",
      "piwo bezalkoholow", "piwo 0",
      // Wino
      // "rosé"/"rose" celowo USUNIĘTE — to NIE jest problem granicy słowa (samo
      // słowo już jest poprawnie odgraniczone), tylko niejednoznaczność
      // znaczeniowa: "rose" to też zapach/kolor w kosmetykach i chemii
      // (audyt danych produkcyjnych 2026-09: "Persil ... Rose 66 prań" — proszek
      // do prania! — trafiał do alkoholi). Wina różowe i tak łapią "wino "/"vino "
      // albo "różowe wino"/frazy DOC/appellation — bez istotnej straty.
      "wino ", "vino ", "rouge",
      "primitivo", "sauvignon", "chardonnay", "merlot", "cabernet",
      "pinot", "shiraz", "riesling", "sangiovese", "tempranillo",
      "prosecco", "cava ", "szampan", "szampana", "igrist",
      // "igt "/"doc "/"aoc "/"dop " USUNIĘTE (audyt danych 2026-09) — to ogólne unijne
      // oznaczenia pochodzenia chronionego, używane też na SERACH i innych produktach
      // spożywczych, nie tylko winach (np. "SER GRANA PADANO ... DOP" trafiał do
      // alkoholi zamiast serów, bo kategoria alkohole jest wcześniej w kolejności).
      // Prawdziwe wina i tak łapią się przez odmiany winogron (primitivo/chardonnay/
      // sauvignon itd.) — bez straty.
      "cz/w", "b/w", "b/wyt",
      "b/pw", "cz/pw", "czerwone wino", "białe wino", "różowe wino",
      // Mocne alkohole
      "wódka", "wódki", "vodka", "wyborowa", "absolut", "belvedere",
      "żubrówka", "sobieski", "finlandia", "stanislav", "bols ",
      "whisky", "whiskey", "bourbon", "scotch", "rum ", "rumu ",
      "tequila", "mezcal", "gin ", "gins", "cognac", "koniak",
      "brandy", "calvados", "armagnac", "grappa", "schnaps",
      "spirytus", "bimber", "nalewka", "nalewki",
      // Likiery
      "likier", "likieru", "liqueur", "triple sec", "creme de",
      "aperol", "campari", "amaretto", "baileys", "kahlua",
      "grand marnier", "drambuie", "tatratea", "jagermeister",
      "becherovka", "fernet", "chartreuse", "cointreau",
      "sambuca", "limoncello", "wermut", "vermouth", "bitter",
      // Cydr
      "cydr", "cyder", "cider",
      // Ogólne
      "alkohol", "alcopop",
      // Marki (uzup. z realnych faktur)
      "bacardi", "jameson", "pirosmani", "carta blanca",
    ],
  },

  // ── 2. Środki czystości i higiena ───────────────────────────────────────────
  {
    id: "srodki_czystosci",
    label: "Środki czystości",
    emoji: "🧹",
    keywords: [
      "płyn do naczyń", "płyn do mycia naczyń", "tabletki do zmywarki",
      "płyn do zmywarki", "sól do zmywarki", "nabłyszczacz do zmywarki",
      "środek czyszczący", "środek do czyszczenia", "zmywak", "zmywaki",
      "gąbka do mycia", "gąbki kuchenne",
      "wybielacz", "odkamieniacz", "odtłuszczacz",
      "dezynfekcja", "dezynfekujący", "dezynfekant",
      "płyn dezynfekujący", "żel antybakteryjny", "środek dezynfekujący",
      "mydło w płynie", "mydło antybakteryjne",
      "proszek do prania", "płyn do prania", "kapsułki do prania",
      "papier toaletowy", "papier toalet",
      "ręczniki papierowe", "ręcznik kuchenny", "ręcznik jednorazowy",
      "chusteczki higieniczne", "chusteczki nawilżane",
      "odświeżacz powietrza", "odświeżacz wc", "kostka wc",
      "ścierka", "ścierki", "mop ", "mopa", "mopy",
      "rękawice lateksow", "rękawice gumow", "rękawice jednorazow",
      "worki na śmieci", "worki na odpad",
      "płyn do wc", "wc net", "domestos",
      // Marki i środki owadobójcze (uzup. z realnych faktur)
      "ajax", "cif ", "cilit", "clinex", "ecoshine", "bref", "astonish",
      "czyściwo", "na muchy", "muchospray", "lep na", "owadobójcz", "purox",
      // "prań" (bez granicy z prawej) łapał "pranom" jako część nazwy marki
      // sosu tajskiego ("Mae Pranom" — audyt danych produkcyjnych 2026-09).
      // "prań " (ze spacją) nadal łapie prawdziwe "X prań" (np. "66 prań").
      "vizir", "prań ", "bros", "ręcznik składany",
    ],
  },

  // ── 3. Opakowania i jednorazówki ────────────────────────────────────────────
  {
    id: "opakowania",
    label: "Opakowania",
    emoji: "🛍️",
    keywords: [
      "folia aluminiowa", "folia stretch", "folia spożywcza", "folia do żywności",
      "folia pe", "folia pvc", "folia termokurczliwa",
      "torebka foliowa", "torba papierowa", "torebka papierowa",
      "woreczek strunowy", "woreczek do mrożenia",
      "kubek jednorazowy", "kubki jednorazowe", "kubek papierowy",
      "talerz jednorazowy", "talerze jednorazowe",
      "miska jednorazowa", "miseczka jednorazowa",
      "sztućce jednorazowe", "łyżeczka jednorazowa", "widelec jednorazowy",
      "pudełko na wynos", "pojemnik na wynos", "pojemnik do żywności",
      "pojemnik obiadowy", "lunch box", "pojemnik gastro",
      "karton do pizzy", "karton pizzy", "pudełko do pizzy",
      "taca styropianowa", "taca jednorazowa",
      "serwetki papierowe", "serwetki", "serwetka",
      "papier do pieczenia", "papier pergaminowy", "papier śniadaniowy",
      "papier do pakowania",
      "słomki", "słomka", "szaszłyki", "szaszłyk", "wykałaczki",
      "rękaw cukierniczy", "worek cukierniczy",
      "podstawki pod napoje", "podstawka pod szklankę",
      "etykiety", "naklejki", "tasma klejąca", "taśma do pakowania",
      // Pojemniki do zgrzewu i tacki (uzup. z realnych faktur)
      "do zgrzewu", "pojemnik", "styropianow", "menubox", "papier jumbo",
      "tacka", "taca ", "miska do zgrzewu", "opakowanie hamburger", "opakowanie gastro",
      "opak ", "reklamówka", "pakowania próżni", "pap jumbo", "worki do pakowania",
      // Drewniane jednorazówki do serwowania (odróżnić od trwałego wyposażenia w "sprzet")
      "drewniana łyżeczka jednorazow", "widelec drewnian jednorazow",
    ],
  },

  // ── 4. Mrożonki ─────────────────────────────────────────────────────────────
  {
    id: "mrozonki",
    label: "Mrożonki",
    emoji: "❄️",
    keywords: [
      "mrożon", "mrozon", "frozen", "deep frozen", "mccain",
      // "lodów" (bez granicy z prawej) był PREFIKSEM słowa "lodowa" po foldzie
      // diakrytyków (ó→o) — łapał "sałata lodowa" (zwykłą sałatę!) jako mrożonkę
      // (regresja własna, znaleziona w audycie 2026-09). "lodów " (ze spacją)
      // wymusza granicę z prawej, "lodowa" jej nie spełnia.
      "lody ", "lodu ", "lodów ", "lód ", "ice cream", "sorbet", "gelato",
      "lody kulki", "lody gałki", "wafelek lodowy", "rożek lodowy",
      "frytki", "frytek", "frytka",
      "talarki ziemniacz", "kotlety ziemniaczane mroż",
      "potato fries", "potato wedge", "tater tots",
      "dollar chips", "hash brown",
      "pizza mrożona", "pizza zamrożona",
      "warzywa mrożone", "mieszanka mrożona",
      "szpinak mrożony", "szparagi mrożone", "brokuły mrożone",
      "groszek mrożony", "kukurydza mrożona", "edamame",
      "owoce mrożone", "jagody mrożone", "maliny mrożone",
      "wiśnie mrożone", "truskawki mrożone",
      "filet mrożony", "ryba mrożona", "mintaj mroż", "dorsz mroż",
      "krewetki mrożone", "paluszki rybne",
      "mięso mrożone", "burgery mrożone",
      "pierogi mrożone", "krokiety mrożone", "kopytka mrożone",
      "bliny mrożone", "naleśniki mrożone",
      "nuggets", "nuggety", "chicken strips mroż",
      "kotlet mrożony", "filet mroż",
    ],
  },

  // ── 5. Konserwy i przetwory ─────────────────────────────────────────────────
  {
    id: "konserwy",
    label: "Konserwy / Przetwory",
    emoji: "🥫",
    keywords: [
      "w puszce", "puszka ", "puszki ", "puszek",
      "konserwow", "konserwa ", "konserwy ",
      "marynow", "marynata",
      "kiszon", "kwaszon",
      "passata", "pelati", "pomidory krojone", "pomidory całe",
      "koncentrat pomidorowy", "pulpa pomidorowa",
      "pomidory w puszcze", "passata pomidorowa",
      "oliwki", "oliwka ",
      "korniszony", "korniszon",
      "ogórek kiszony", "ogórki kiszone", "ogórki konserwowe",
      "kapusta kiszona", "kapusta kwaszona", "kimchi",
      "burak ćwikłowy", "ćwikła",
      "anchois", "sardynki w oleju", "tuńczyk w oleju",
      "szproty", "szprot", "makrela wędzona",
      "dżem", "marmolad", "powidła", "konfitura", "mus jabłkowy",
      "pasta truflowa", "tapenad",
      "grillowane papryki", "papryki konserwowe",
      "karczochy w oleju", "suszone pomidory",
    ],
  },

  // ── 6. Ryby i owoce morza ───────────────────────────────────────────────────
  {
    id: "ryby",
    label: "Ryby / Owoce morza",
    emoji: "🐟",
    keywords: [
      "łosoś", "łososia", "łososiem", "dorsz", "dorsza",
      "tuńczyk", "tuńczyka", "tuńczykowi",
      "krewetk", "kalmar", "kalmary",
      "pstrąg", "pstrąga", "halibut", "mintaj",
      "ryba", "ryby", "rybna", "rybn",
      "śledź", "śledzia", "śledzie",
      "makrela", "makreli",
      "krab", "kraba", "homara", "homar", "ośmiornic",
      "małż", "małże", "ostryg",
      "sardynk", "tilapia", "pangasius", "morszczuk",
      "flądra", "sandacz", "sum ", "karp", "lin ", "węgorz",
      "okoń", "szczupak", "amur", "tołpyga",
      "owoce morza",
    ],
  },

  // ── 7. Mięsa i wędliny ──────────────────────────────────────────────────────
  {
    id: "miesa",
    label: "Mięsa / Wędliny",
    emoji: "🥩",
    keywords: [
      "kurczak", "kurczaka", "kurczakiem",
      "indyk", "indycz", "kaczk", "kacze",
      "gęś", "gęsi", "przepiórk", "gołąb",
      "porcje rosołowe", "rosołow", "podudzie", "udko",
      "pierś z kurczaka", "piersi", "pierś",
      "udziec", "udzca",
      "wieprzow", "karkówk", "karczek",
      "schab", "żebra", "żeberek", "żeberka", "żeberko",
      "łopatk", "boczek", "golonk", "golonka",
      "podgardle", "słonina",
      "wołow", "wołowina", "wołowe", "cielę", "cielęc",
      "rostbef", "befsztyk", "antrykot", "ligawa",
      // Bare " dzik" USUNIĘTE — "Dzik" to popularna marka suplementów/sosów
      // (multiwitamina, sos barbecue itd. ze znakiem ®), niezwiązana z dziczyzną;
      // audyt danych produkcyjnych 2026-09 pokazał 5 realnych produktów tej marki
      // błędnie trafiających do mięs. "dziczyzn" już łapie prawdziwą dziczyznę.
      "jagnięcin", "baranin", "dziczyzn", "sarni", "jeleni",
      // "mielon" (mielony/mielona) USUNIĘTE — to ogólny przymiotnik "zmielony",
      // używany też przy kawie ("kawa mielona"), przyprawach ("pieprz mielony")
      // i orzechach, nie tylko mięsie (audyt danych 2026-09: realne produkty
      // "FORT KAWA MIELONA" i "PIEPRZ CZARNY MIELONY" trafiały do mięs). Mięso
      // mielone i tak łapie się przez "mięso"/"mięsa" albo konkretne zwierzę/
      // element (np. "wołow", "kurczak") — bez straty.
      "wędlin", "kabanos", "parówk", "kiszka", "kaszank",
      "salami", "salceson", "baleron", "pasztet",
      "kiełbas", "szynka", "szynki", "ham ",
      "jamon", "chorizo", "mortadela", "cervelat",
      "filet", "polędwiczk", "polędwica",
      "kotlet", "schnitzel", "gulasz",
      "drobiu", "drobiow",
      // UWAGA: bare "mięs" był tu wcześniej, ale po foldzie diakrytyków (ę→e) staje
      // się "mies" — to przypadkowy PREFIKS słowa "mieszanka" (mieszanka warzyw/chińska
      // itd.), więc łapał niespożywcze mieszanki jako mięso (regresja znaleziona w
      // audycie 2026-09). Zastąpione dłuższymi, bezpiecznymi rdzeniami: "mięsn"
      // (mięsny/mięsne/mięsnych) i "mięsem" NIE są prefiksem "mieszanka".
      "mięsn", "mięsem", "mięso", "mięsa", "stek ",
    ],
  },

  // ── Sery (wydzielone z Nabiału, Z8) ─────────────────────────────────────────
  // MUSI być PRZED regułą "nabiał", żeby serowe nazwy (w tym „serek") trafiały tu.
  {
    id: "sery",
    label: "Sery",
    emoji: "🧀",
    keywords: [
      "ser ", "sery", "serow", "serem", "serek",
      "twaróg", "twarogu",
      "ricotta", "mozzarella", "burrata", "feta",
      "camembert", "brie", "gouda", "edam",
      "parmezan", "grana padano", "pecorino",
      "halloumi", "cottage", "fromage", "mascarpone",
      "cheddar", "formagio", "pleśniow",
      "mix serów", "fellada",
      // Rzadkie/regionalne sery (uzup. — dzięki fold diakrytyków wystarczy jedna
      // forma zapisu, "comté"/"comte" itd. matchują się nawzajem automatycznie).
      "oscypek", "oscypka", "oscypki", "bryndza", "bryndzy",
      "roquefort", "comte", "emmentaler", "emmental",
      "raclette", "stilton", "manchego", "provolone", "scamorza",
      "taleggio", "reblochon", "morbier", "munster", "limburger",
      "maasdam", "jarlsberg", "havarti", "korycinski", "korycińsk",
      "bundz", "redykołka", "gorgonzola", "asiago", "fontina",
      "gruyere", "appenzeller", "tomme", "chevre", "boursin",
      "philadelphia", "serek topiony", "ser topiony", "ser wędzony",
      "wędzony ser",
    ],
  },

  // ── 8. Nabiał i jaja ────────────────────────────────────────────────────────
  {
    id: "nabiał",
    label: "Nabiał / Jaja",
    emoji: "🥛",
    keywords: [
      "mleko", "mleka", "mleku",
      "śmietan", "śmietank", "kremówka", "double cream",
      "maślank", "kefir", "zsiadłe mleko",
      "masło", "masła", "masłem",
      "jogurt", "jogurtu",
      "skyr", "quark",
      "nabiał",
      "jajk", "jaja ", "jaj ", "jajec",
      "jajko", "jajka",
      "cremefine",
    ],
  },

  // ── 9. Napoje ──────────────────────────────────────────────────────────────
  // PRZED warzywa (audyt danych produkcyjnych 2026-09): "sok pomarańczowy"/
  // "sok jabłkowy" łapały się na nazwę owocu w warzywa ("pomarańcz"/"jabłk")
  // zanim dotarły do "sok " tutaj; "Monin syrop marakuja" łapał się na
  // "marakuj" (owoc marakuja) zamiast na markę napojową Monin.
  {
    id: "napoje",
    label: "Napoje",
    emoji: "🥤",
    keywords: [
      "woda ", "wody ", "sok ", "soku ", "sokow", "napój", "napoje",
      "nektar ", "nektaru",
      // "kawą" USUNIĘTE — bez granicy z prawej po foldzie ("ą"→"a") staje się
      // prefiksem "kawałki" (kawałki czegokolwiek, nie tylko kawy). "kawa " (ze
      // spacją) już łapie każde wystąpienie "kawą" po foldzie — bez straty.
      "kawa ", "kawy", "kawow", "espresso", "cappuccino", "latte",
      "herbata", "herbat", "herbatk",
      "matcha", "yerba mate", "rooibos",
      "lemoniada", "shake", "syrop napojowy", "syrop do kawy",
      "energetyk", "isotonic",
      "mineraln", "gazowany", "niegazowany",
      "coca-cola", "coca cola", "fanta", "sprite", "sprit", "cappy",
      "kinley", "tymbark", "schweppes", "pepsi", "7up", "mirinda",
      "lipton", "nestea", "red bull", "monster ",
      "powerade", "gatorade", "tiger ", "burn ", "monin",
      "milk shake", "mleko smakowe",
      "rgb x24", "0,25 rgb", "butelka szk", "but szk", "drs ",
      "tonic", "kinletonic",
    ],
  },

  // ── 10. Warzywa, owoce i grzyby ─────────────────────────────────────────────
  {
    id: "warzywa",
    label: "Warzywa / Owoce / Grzyby",
    emoji: "🥦",
    keywords: [
      "marchew", "marchewk", "pietruszk", "seler", "pasternak",
      "burak", "buraczk", "topinambur",
      "rzodkiew", "rzodkiewk",
      "pomidor", "papryka", "papryki", "bakłażan",
      "kapust", "brokuł", "brokułów", "kalafior",
      "jarmuż", "brukselka",
      // "sałat" (bez granicy z prawej) był prefiksem "salaterka" (miska do
      // sałaty — sprzęt kuchenny, nie warzywo; audyt danych produkcyjnych
      // 2026-09). Zastąpione konkretnymi formami odmiany. UWAGA: "sałatę"
      // (biernik) celowo POMINIĘTA — po foldzie (ę→e) staje się "salate",
      // identyczne z pierwszymi 6 znakami "salaterka" (ta sama pułapka).
      // Nazwy produktów na fakturach i tak są w mianowniku, więc bez straty.
      "sałata", "sałaty", "sałatk",
      "rukola", "roszponka", "endywia", "radicchio",
      "szpinak", "cykoria",
      "cebul", "por ", "por(", "poru", "czosnek", "szalotka",
      "szczypior",
      "groszek", "groszku", "fasolka", "fasola", "cieciorka", "soczewica",
      "bób",
      "ziemniak", "szparagi", "szparag",
      "cukini", "kabaczek", "dyni", "dynia", "patison",
      "batat", "kukurydz", "koper ",
      "awokado", "avocado",
      "daterino",
      "bazylia", "mięta ", "kolendra", "lubczyk",
      "tymianek", "rozmaryn", "szałwia ", "estragon",
      "kiełki", "kiełk",
      "włoszczyzna",
      "grzyb", "pieczark", "borowik", "boczniak",
      "kurka ", "kurki ", "kurkami",
      "podgrzybek", "shiitake", "portobello", "chanterelle",
      "maślak", "opieniek", "trufla świeża", "truflowy",
      "banan", "jabłk", "gruszk",
      "pomarańcz", "mandarynk", "cytryn", "limonk",
      "winogron", "malina", "malin", "truskawk",
      "borówk", "mango", "ananas", "papaja",
      "kiwi", "arbuz", "granat", "grejpfrut", "melon",
      "śliwk", "wiśni", "czereśni", "morela", "brzoskwini", "nektaryn",
      "agrest", "porzeczk", "rabarbar",
      "physalis", "pitahaya", "karambola", "kumkwat",
      "smoczy owoc", "miechunka", "żurawina", "marakuj",
      "imbir ", "imbiru",
      "mieszanka warzyw", "bukiet warzyw",
      "mieszanka chińsk", "mieszanka meksyk",
      "mieszanka euro", "sombrero",
      "guacamole",
      "salsefia", "botwina", "kwiat jadaln",
      "warzywa", "owoce", "owoc", "warzywo",
      "ogórek", "ogórk",
    ],
  },

  // ── 11. Słodycze i cukiernia ────────────────────────────────────────────────
  {
    id: "slodycze",
    label: "Słodycze / Cukiernia",
    emoji: "🍰",
    keywords: [
      "czekolada", "czekoladow", "kakao", "kakao w proszku",
      "callebaut", "valrhona", "couverture", "ganache",
      "pralinki", "pralina", "truffle", "trufle cukiernicze",
      "cukier", "cukru", "cukrem",
      "cukier puder", "cukier waniliowy", "cukier brązowy",
      "kandyzowany", "karmel", "karmelu",
      "syrop cukrowy", "syrop klonowy", "syrop agawe",
      // "tort" (bez granicy z prawej) był PREFIKSEM słowa "tortilla" — łapał
      // wrapy/tortille jako słodycze zamiast pieczywa (regresja niezwiązana
      // z diakrytykami, znaleziona w audycie 2026-09). "tort " (ze spacją)
      // wymusza granicę z prawej strony, "tortilla" jej nie spełnia.
      "tort ", "tortu", "torcik",
      "ciasto", "ciastko", "ciastek", "ciastka",
      "muffin", "brownie", "cheesecake",
      "makaronik", "macaron",
      "beza", "bezowy", "pavlova",
      "sernik", "sernika",
      "tiramisu", "panna cotta", "crème brûlée", "creme brulee",
      "biszkopt", "suchar ",
      "wafel", "wafle", "wafli", "wafelek",
      "herbatnik", "ciasteczko",
      "chałwa", "nugat", "marcepan",
      "posypka", "dekory cukrowe", "perełki cukrowe",
      "lukier", "fondant",
      "barwnik spożywczy",
      "skrobia", "mąka ryżowa",
      "krem cukierniczy", "krem patissier", "krem budyniowy",
      "masa kajmakow", "dulce de leche",
      // Uzup. z realnych faktur
      "nutella", "lava cake", "suflet",
    ],
  },

  // ── 12. Pieczywo, makarony i zboża ──────────────────────────────────────────
  {
    id: "pieczywo",
    label: "Pieczywo / Makarony / Zboża",
    emoji: "🍞",
    keywords: [
      "chleb", "chleba", "chlebem",
      "bułk", "bagietka", "baguette", "ciabatta",
      "focaccia", "brioche", "pumpernikiel",
      "grissini", "suchar",
      "mąka", "mąki", "mąką",
      "orkisz", "żyto", "semolina", "semolinę",
      // "kasza" (bez granicy z prawej) był prefiksem "kaszanka" (kaszanka to
      // wędlina/kiszka z krwią, NIE kasza — audyt 2026-09). "kasza " (ze spacją)
      // wymusza granicę, "kaszanka" trafia teraz do mięs/wędlin (patrz niżej).
      "gryka", "kasza ", "kaszy",
      "amarant", "quinoa",
      "makaron", "makaronu", "spaghetti", "penne", "fusilli",
      "tagliatelle", "lasagna", "gnocchi",
      "ryż ", "ryżu", "ryżem", "risotto",
      "płatki owsian", "płatki kukurydz", "musli", "granola",
      "drożdż", "proszek do pieczenia",
      "tortilla", "wrap",
      "kuskus", "bulgur",
      "naleśnik", "pancake", "crepe",
      "ciasto kataifi", "spód do quiche", "korpusy kruche",
      "vol-au-vent", "ciasto filo", "ciasto francuskie",
      "panierka bułczana", "panierka",
      "nachos", "tortilla chip",
      "croissant",
      // Kluski i pieczywo długie (uzup. z realnych faktur)
      "kluski", "paluch", "kopytka",
      "rigatoni", "paccheri",
    ],
  },

  // ── 13. Przyprawy, sosy, oleje ──────────────────────────────────────────────
  {
    id: "przyprawy",
    label: "Przyprawy / Sosy / Oleje",
    emoji: "🧂",
    keywords: [
      "sól ", "soli ", "sól morska",
      "pieprz", "pieprzu",
      "przyprawa", "przyprawy",
      "bazylia sucha", "oregano", "tymianek suchy", "rozmaryn susz",
      "majeranek", "curry", "kurkuma",
      "chilli", "chili", "kminek", "cynamon", "gałka muszk",
      "anyż", "wanilia", "waniliow",
      "ziele angielskie", "piment",
      "liść laurow", "liście laurow",
      "zioła prowansalskie", "zioła doniczk",
      "kolendra sucha", "koper suchy",
      "kardamon", "szafran", "sumak", "za'atar",
      "czarnuszka", "fenugreek",
      "sos ", "sosu ", "sosów",
      "musztarda", "majonez", "ketchup", "keczup",
      "ocet", "ocet balsamicz", "ocet winny",
      "chrzan", "wasabi", "kapary",
      "tabasco", "sriracha", "worcester",
      "tahini", "hummus",
      "tapenad",
      "oliwa", "olej", "oleju", "olejów",
      "olej rzepak", "olej słonecznik", "olej kokosow",
      "tłuszcz", "smalec", "ghee", "klarowane masło",
      "lard",
      "miód", "miodu",
      "syrop", "syropu",
      // "chia" (bez granicy z prawej) był prefiksem wina "Chianti" — proaktywna
      // naprawa (nie znaleziona w danych, ale ten sam wzorzec ryzyka co "mielon"/
      // "lodów"/"mięs"). "chia " (ze spacją) nadal łapie "nasiona chia".
      "chia ", "siemię lniane",
      "żelatyna", "pektyna", "agar",
      "esencja", "peperonata", "primerba",
      "kucharek", "vegeta",
      "barszcz", "żur ", "barszcz w prosz",
      "puree marakuj", "puree owocowe",
      "pasta miso", "pasta curry", "pasta paprykow",
      "guacamole mieszanka",
      // Tłuszcze do smażenia (uzup. z realnych faktur)
      "margaryna", "frytura",
      // Uzup. 3 — z audytu realnych faktur
      "sambal", "nori", "glony", "żurek", "zakwas",
    ],
  },

  // ── 14. Sprzęt / Wyposażenie ────────────────────────────────────────────────
  // WYŁĄCZNIE prawdziwe wyposażenie kuchenne (naczynia, narzędzia kuchenne,
  // żarówki/świetlówki lokalu). Wszystko techniczne/przemysłowe/motoryzacyjne
  // (rury, śruby, części maszyn, sprzęt warsztatowy) idzie do "techniczne" —
  // audyt 2026-09 pokazał, że ta kategoria była tym zaśmiecona.
  // Słowa kluczowe są specyficzne, żeby nie kolidować ze składnikami.
  {
    id: "sprzet",
    label: "Sprzęt / Wyposażenie",
    emoji: "🧰",
    keywords: [
      "patelni", "patelnia", "garnek", "garnk", "rondel", "rondl", "salaterk",
      "szczypce", " czypce", "termometr", "deska do kroj", "deski do kroj",
      "chochla", "cedzak", "durszlak", "sitko ", "tarka kuch", "trzepaczka",
      "wałek do", "łopatka kuch", "blacha do piecz", "blacha piekarn",
      "forma do piecz", "forma do tort", "naczynie żarood", "garnki",
      "żarówka", "świetlówka",
      "sprzęt", "wyposażenie",
      // Deski i akcesoria serwisowe/prezentacyjne (uzup. — zgłoszone przez usera:
      // dotąd tylko "deska/deski DO KROJENIA" było łapane, deski serwisowe/prezentacyjne
      // nie). Celowo BEZ gołego "drzewo"/"drewno" — zbyt niejednoznaczne (może być
      // opał w koszty_stale, materiał sprzętu, albo dekoracja) — tylko konkretne frazy.
      "deska serwisowa", "deska bukowa", "deska dębowa", "deska do serwowania",
      "deska prezentacyjna", "drewniana taca", "podkładka drewniana",
      "akcesoria drewniane", "łyżka drewniana kuch", "łopatka drewniana kuch",
    ],
  },

  // ── 15. Orzechy / Bakalie ───────────────────────────────────────────────────
  // OSTATNIA reguła: bare "orzech" łapie też kremy/syropy orzechowe (Nutella,
  // syrop laskowy), więc musi być PO słodyczach/przyprawach/napojach — tu zostają
  // tylko czyste orzechy i bakalie, których nie złapała żadna wcześniejsza reguła.
  {
    id: "orzechy",
    label: "Orzechy / Bakalie",
    emoji: "🥜",
    keywords: [
      "orzech", "orzeszk", "migdał", "migdal", "pistacj", "nerkowiec",
      "rodzynk", "bakali", "laskow", "włoskie orzech", "nerkowca",
      "ziemne solone", "płatki słodkie",
    ],
  },
];

/**
 * Built-in category definitions (id → label + emoji). Wyprowadzone z CATEGORY_DEFS
 * (+ "inne", które nie ma słów kluczowych — jest domyślnym wynikiem categorizeProduct,
 * nie regułą do dopasowania), żeby nie trzeba było pamiętać o dwóch osobnych strukturach.
 */
export const BUILTIN_CATEGORY_DEFS: Record<string, { label: string; emoji: string }> = {
  ...Object.fromEntries(CATEGORY_DEFS.map((c) => [c.id, { label: c.label, emoji: c.emoji }])),
  inne: { label: "Inne", emoji: "📦" },
};
