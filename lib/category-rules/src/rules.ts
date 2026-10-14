/**
 * KANONICZNA lista kategorii i słów kluczowych — jedyne źródło prawdy, współdzielone
 * przez backend (api-server) i frontend (ksef-monitor). Wcześniej istniały DWIE
 * niezależne kopie tej listy (artifacts/api-server/src/lib/categorize.ts i
 * artifacts/ksef-monitor/src/lib/categories.ts) z RÓŻNYMI silnikami dopasowania —
 * backend miał poprawną granicę słowa, frontend robił goły `includes()`, więc UI
 * potrafiło pokazać inną kategorię niż backend faktycznie zapisał. Scalone tutaj.
 *
 * WAŻNE: kolejność w tablicy ma znaczenie!
 * Bardziej specyficzne kategorie muszą być PRZED bardziej ogólnymi.
 * Aktualna kolejność (2026-10):
 *   biuro, kaucje PRZED koszty_stale
 *   naprawy PRZED techniczne
 *   syropy, kawa_herbata PRZED napoje
 *   owoce PRZED przyprawy PRZED warzywa
 *     (owoce: unika false-positive z "sok owocowy" → napoje; przyprawy PRZED warzywa:
 *      multi-word "cebula suszona"/"czosnek granulowany" wygrywają z bare "cebul"/"czosnek")
 *   makarony PRZED sery I warzywa (ravioli/gnocchi to makaron; tortellini z serem → makarony)
 *   slodycze PRZED pieczywo (czekolada, ciastka)
 *   srodki_czystosci i opakowania PRZED napoje (papier, folie)
 *   sery PRZED nabiał (serek trafia do sery, nie nabiał)
 *   napoje PRZED owoce (sok pomarańczowy/jabłkowy → napoje, nie owoce)
 *   orzechy OSTATNIA (bare "orzech" łapie też kremy/syropy orzechowe)
 */
export type CategoryDef = { id: string; label: string; emoji: string; keywords: string[] };

export const CATEGORY_DEFS: CategoryDef[] = [
  // ── Biuro / Druk ─────────────────────────────────────────────────────────────
  // PRZED koszty_stale: rolka termiczna/papier ksero/koperty wpadały do koszty_stale.
  {
    id: "biuro",
    label: "Biuro / Druk",
    emoji: "📄",
    keywords: [
      "rolka termiczna", "rolka paragonowa", "taśma termiczna",
      "papier ksero", "papier a4", "papier do drukarki",
      "koperta ",
      "toner do drukarki", "tusz do drukarki",
      "marker do tablicy", "marker suchościeraln",
      "druk menu", "druk ulotki", "druk plakatu", "wydruki cyfrowe",
      "wizytówka", "naklejka reklamow", "baner reklamowy",
    ],
  },

  // ── Kaucje i opakowania zwrotne ──────────────────────────────────────────────
  // PRZED koszty_stale: "kaucja" trafiała do koszty_stale przez ogólny keyword.
  // NIE używamy bare "drs " — to skrót na butelkach napojów, nie tylko zwrot kaucji.
  {
    id: "kaucje",
    label: "Kaucje / Opakowania zwrotne",
    emoji: "♻️",
    keywords: [
      "kaucja ",
      "opakowanie zwrotne", "opakowania zwrotne",
      "keg zwrotny", "butelka zwrotna", "skrzynka zwrotna",
      "paleta zwrotna", "transporter zwrotny",
      "zwrot kaucji", "zwrot opakowania",
    ],
  },

  // ── 0. Koszty stałe (media, paliwo, najem, abonamenty) ──────────────────────
  // WAŻNE: pierwsze w kolejności (po biuro/kaucje). Pozycje z faktur za prąd/gaz/
  // internet/najem to NIE są składniki — łapiemy je tu, żeby nie zaśmiecały kolejki.
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
      // Usługi i monitoring
      "monitorowania", "monitoring", "interwencji", "wywóz odpad", "wywóz śmieci",
      "opłata za udostępnienie", "opłata serwisow",
      // Usługi, prowizje (uzup. z realnych faktur)
      "przejściow", "moc pobrana", "usługa ", "prowizja", "obsługę transakcji",
      "cashback", "transportow", "kurier", "szkolenie", "bhp",
      "leasingow", "verva", "fuelsave", "pb 95", "pb95",
      "administracji skarbow", "raportowanie do",
      // Opłaty ogólne i rozliczeniowe
      "opłata", "opłaty", "opłat ", "rachunek", "rachunku", "ubezpieczenie",
      "polisa", "składka ubezpieczeniow", "abonament miesięczn",
      "usługi księgow", "obsługa księgow", "obsługę księgow", "amortyzacj",
      "rata leasingow", "czynsz najmu", "opłata eksploatacyjn",
      "wywóz nieczystości", "media ",
    ],
  },

  // ── Naprawy i serwis lokalu ──────────────────────────────────────────────────
  // PRZED techniczne: serwis zmywarki/ekspresu trafiał do techniczne (pojazdy/maszyny).
  {
    id: "naprawy",
    label: "Naprawy / Serwis lokalu",
    emoji: "🔨",
    keywords: [
      "serwis zmywarki", "serwis ekspresu", "serwis kawy",
      "naprawa zmywarki", "naprawa ekspresu", "naprawa klimatyzacji",
      "konserwacja klimatyzacji", "przegląd instalacji",
      "serwis urządzenia gastronomicz",
      "naprawa urządzenia", "naprawa pieca",
      "konserwacja urządzenia",
    ],
  },

  // ── 0b. Techniczne / Przemysłowe (pojazdy, hydraulika, złączki, maszyny) ────
  {
    id: "techniczne",
    label: "Techniczne / Przemysłowe",
    emoji: "🔧",
    keywords: [
      "łącznik stabilizatora", "amortyzator", "wahacz",
      "drążek kierowniczy", "końcówka drążka", "przegub", "sworzeń wahacza",
      "poduszka silnika", "poduszka skrzyni",
      "hamulc", "klocki hamulcowe", "tarcza hamulcowa", "płyn hamulcowy",
      "przewód hamulcowy", "bęben hamulcowy", "szczęki hamulcowe",
      "sprzęgł", "filtr oleju", "filtr powietrza", "filtr paliwa",
      "filtr kabinowy", "świeca zapłonowa", "świece zapłonowe",
      "olej silnikowy", "olej przekładniowy", "pasek klinowy", "pasek rozrządu",
      "rozrząd", "tłumik", "katalizator",
      "chłodnica", "termostat silnika", "alternator", "rozrusznik",
      "akumulator samochodow", "akumulator", "pompa wody", "pompa paliwa",
      "opona ", "opony ", "felga", "felgi", "wycieraczk", "żarówka h",
      "żarówka samochodow", "bezpiecznik samochodow", "bosma", "px26d", " h7 ",
      "część zamienna", "części zamienne", "serwis samochodow",
      "przegląd techniczny", "naprawa samochod", "warsztat samochodow",
      "wulkanizacj", "geometria kół", "wymiana oleju",
      "rura pp", "rura kanalizacyjn", "rura instalacyjn", "kanalizacyjn",
      "hydraulik", "złączka", "kolanko instalacyjn", "trójnik instalacyjn",
      "zawór kulowy", "zawór instalacyjn", "wąż hydrauliczn",
      "śruba", "śruby", "nakrętk", "podkładka techniczn", "wkręt",
      "kołek rozporow", "dybel", "gwint metryczn", "łożysko", "uszczelka",
      "uszczelniacz", "obejma", "wspornik montażow",
      "silnik elektryczn", "silnik ", "panel sterowania", "gniazdo styków",
      "osłona panelu", "osłona sprzęgła", "obudowa maszyn", "prasa hydrauliczn",
      "siłownik", "myjka ciśnieniow", "parownica", "pilnik ", "wiertło",
      "wiertark", "śrubokręt", "klucz nasadow", "szlifierk", "spawark",
      "hartowane szkło", "szkło hartowan",
      "kalkulator", "portfel kelnerski",
    ],
  },

  // ── 1. Alkohole ─────────────────────────────────────────────────────────────
  {
    id: "alkohole",
    label: "Alkohole",
    emoji: "🍷",
    keywords: [
      "piwo", "piwa", "piwem", "piw ", "lager", "ale ", "ipa ", "porter",
      "stout", "weizen", "bock", "wheat beer", "craft beer", "bz ", "bz",
      "litovel", "tyskie", "żywiec", "lech ", "heineken", "carlsberg",
      "desperados", "corona ", "budweiser", "hoegaarden", "leffe", "pilsner",
      "piwo bezalkoholow", "piwo 0",
      "wino ", "vino ", "rouge",
      "primitivo", "sauvignon", "chardonnay", "merlot", "cabernet",
      "pinot", "shiraz", "riesling", "sangiovese", "tempranillo",
      "prosecco", "cava ", "szampan", "szampana", "igrist",
      "cz/w", "b/w", "b/wyt",
      "b/pw", "cz/pw", "czerwone wino", "białe wino", "różowe wino",
      "wódka", "wódki", "vodka", "wyborowa", "absolut", "belvedere",
      "żubrówka", "sobieski", "finlandia", "stanislav", "bols ",
      "whisky", "whiskey", "bourbon", "scotch", "rum ", "rumu ",
      "tequila", "mezcal", "gin ", "gins", "cognac", "koniak",
      "brandy", "calvados", "armagnac", "grappa", "schnaps",
      "spirytus", "bimber", "nalewka", "nalewki",
      "likier", "likieru", "liqueur", "triple sec", "creme de",
      "aperol", "campari", "amaretto", "baileys", "kahlua",
      "grand marnier", "drambuie", "tatratea", "jagermeister",
      "becherovka", "fernet", "chartreuse", "cointreau",
      "sambuca", "limoncello", "wermut", "vermouth", "bitter",
      "cydr", "cyder", "cider",
      "alkohol", "alcopop",
      "bacardi", "jameson", "pirosmani", "carta blanca",
      "angostura", "keg ", "kegu ",
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
      "ajax", "cif ", "cilit", "clinex", "ecoshine", "bref", "astonish",
      "czyściwo", "na muchy", "muchospray", "lep na", "owadobójcz", "purox",
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
      "do zgrzewu", "pojemnik", "styropianow", "menubox", "papier jumbo",
      "tacka", "taca ", "miska do zgrzewu", "opakowanie hamburger", "opakowanie gastro",
      "opak ", "reklamówka", "pakowania próżni", "pap jumbo", "worki do pakowania",
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
      "jagnięcin", "baranin", "dziczyzn", "sarni", "jeleni",
      "wędlin", "kabanos", "parówk", "kiszka", "kaszank",
      "salami", "salceson", "baleron", "pasztet",
      "kiełbas", "szynka", "szynki", "ham ",
      "jamon", "chorizo", "mortadela", "cervelat",
      "filet", "polędwiczk", "polędwica",
      "kotlet", "schnitzel", "gulasz",
      "drobiu", "drobiow",
      "mięsn", "mięsem", "mięso", "mięsa", "stek ",
    ],
  },

  // ── Makarony / Kluski ─────────────────────────────────────────────────────────
  // PRZED sery i warzywa (2026-10): "tortellini z serem" → makarony (nie sery),
  // "ravioli z borowikami" → makarony (nie warzywa). Ravioli/gnocchi to makaron.
  {
    id: "makarony",
    label: "Makarony / Kluski",
    emoji: "🍝",
    keywords: [
      "makaron", "makaronu",
      "spaghetti", "penne", "fusilli",
      "tagliatelle", "lasagna", "rigatoni", "paccheri",
      "linguine", "fettuccine", "farfalle", "conchiglie",
      "ravioli", "tortellini", "cappelletti",
      "gnocchi",
      "kluski", "kopytka",
    ],
  },

  // ── Sery (wydzielone z Nabiału, Z8) ─────────────────────────────────────────
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

  // ── Syropy i dodatki barowe ──────────────────────────────────────────────────
  // PRZED napoje: Monin syrop trafiał do napojów, CO2 do inne.
  // Nie używamy bare "syrop " — kolizja z "syrop klonowy" (slodycze), "syrop" (przyprawy).
  {
    id: "syropy",
    label: "Syropy i dodatki barowe",
    emoji: "🧃",
    keywords: [
      // Marki syropów barowych
      "monin",
      "da vinci syrop",
      "lord of taste",
      "pureco syrop",
      "fanex syrop",
      // Puree barowe (koktajlowe) — cukiernicze (Boiron/Ponthier) idą do owoce
      "puree barowe", "puree koktajlowe",
      // CO2 / dwutlenek węgla do nalewaków i saturatorów
      "co2 ", "dwutlenek wegla",
      "nabój do syfonu", "nabój gazowy",
      // Syropy smakowe (ogólna fraza)
      "syrop barmanski", "syrop do koktajli",
      // Podstawy barowe
      "grenadyna", "orgeat", "falernum",
    ],
  },

  // ── Kawa i herbata ────────────────────────────────────────────────────────────
  // PRZED napoje: kawa/herbata trafiały do napojów (2026-10 split).
  {
    id: "kawa_herbata",
    label: "Kawa i herbata",
    emoji: "☕",
    keywords: [
      "kawa ", "kawy", "kawow",
      "espresso", "cappuccino", "latte",
      "herbata", "herbat", "herbatk",
      "matcha", "yerba mate", "rooibos",
      "kapsułki do kawy", "arabica", "robusta",
      // kakao pitne (napój) tu; kakao w proszku/cukiernicze → slodycze
      "kakao pitne", "kakao do picia",
    ],
  },

  // ── 9. Napoje ──────────────────────────────────────────────────────────────
  // PRZED owoce: sok pomarańczowy/jabłkowy nie może trafić do owoce.
  {
    id: "napoje",
    label: "Napoje",
    emoji: "🥤",
    keywords: [
      "woda ", "wody ", "sok ", "soku ", "sokow", "napój", "napoje",
      "nektar ", "nektaru",
      "lemoniada", "shake", "syrop napojowy", "syrop do kawy",
      "energetyk", "isotonic",
      "mineraln", "gazowany", "niegazowany",
      "coca-cola", "coca cola", "fanta", "sprite", "sprit", "cappy",
      "kinley", "tymbark", "schweppes", "pepsi", "7up", "mirinda",
      "lipton", "nestea", "red bull", "monster ",
      "powerade", "gatorade", "tiger ", "burn ",
      "milk shake", "mleko smakowe",
      "rgb x24", "0,25 rgb", "butelka szk", "but szk", "drs ",
      "tonic", "kinletonic",
    ],
  },

  // ── Owoce ─────────────────────────────────────────────────────────────────────
  // PRZED przyprawy i warzywa: owoce były zmieszane z warzywami (2026-10 split).
  // "owoce morza" → ryby (pozycja wcześniejsza) — brak kolizji.
  {
    id: "owoce",
    label: "Owoce",
    emoji: "🍎",
    keywords: [
      // Cytrusy
      "pomarańcz", "mandarynk", "cytryn", "limonk", "grejpfrut",
      // Jabłka, gruszki
      "jabłk", "gruszk",
      // Pestkowe i inne klimatu umiarkowanego
      "śliwk", "wiśni", "czereśni", "morela", "brzoskwini", "nektaryn",
      // Jagodowe (bez bare "malin" — jest prefiksem "malinowy", np. "pomidor malinowy")
      "malina", "maliny", "malin ", "truskawk", "borówk", "agrest", "porzeczk",
      "żurawina",
      // Tropikalne
      "banan", "mango", "ananas", "papaja",
      "kiwi", "arbuz", "granat", "melon",
      // Egzotyczne
      "physalis", "pitahaya", "smoczy owoc", "miechunka", "karambola", "kumkwat",
      "marakuj",
      // Winorośl
      "winogron",
      // Awokado
      "awokado", "avocado",
      // Rabarbar
      "rabarbar",
      // Puree owocowe cukiernicze (Boiron, Ponthier, Profimator) — NIE barowe (→ syropy)
      "boiron", "ponthier", "profimator",
      "puree owocowe", "puree z mango", "puree z maliny", "puree z truskawk",
      // Ogólne
      "owoce", "owoc",
    ],
  },

  // ── 13. Przyprawy, sosy, oleje ──────────────────────────────────────────────
  // PRZED warzywa (2026-10): multi-word "cebula suszona"/"czosnek granulowany"
  // wygrywają z bare "cebul"/"czosnek" w warzywa — świeże wersje nadal → warzywa.
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
      "chia ", "siemię lniane",
      "żelatyna", "pektyna", "agar",
      "esencja", "peperonata", "primerba",
      "kucharek", "vegeta",
      "barszcz", "żur ", "barszcz w prosz",
      "pasta miso", "pasta curry", "pasta paprykow",
      "guacamole mieszanka",
      "margaryna", "frytura",
      "sambal", "nori", "glony", "żurek", "zakwas",
      // Suszone/przetworzone warzywa jako przyprawy (2026-10)
      "cebula suszona", "cebulka prażona", "czosnek granulowany",
    ],
  },

  // ── 10. Warzywa i grzyby ─────────────────────────────────────────────────────
  // Owoce przeniesione do kategorii "owoce" (2026-10).
  {
    id: "warzywa",
    label: "Warzywa / Grzyby",
    emoji: "🥦",
    keywords: [
      "marchew", "marchewk", "pietruszk", "seler", "pasternak",
      "burak", "buraczk", "topinambur",
      "rzodkiew", "rzodkiewk",
      "pomidor", "papryka", "papryki", "bakłażan",
      "kapust", "brokuł", "brokułów", "kalafior",
      "jarmuż", "brukselka",
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
      "daterino",
      "bazylia", "mięta ", "kolendra", "lubczyk",
      "tymianek", "rozmaryn", "szałwia ", "estragon",
      "kiełki", "kiełk",
      "włoszczyzna",
      "grzyb", "pieczark", "borowik", "boczniak",
      "kurka ", "kurki ", "kurkami",
      "podgrzybek", "shiitake", "portobello", "chanterelle",
      "maślak", "opieniek", "trufla świeża", "truflowy",
      "imbir ", "imbiru",
      "mieszanka warzyw", "bukiet warzyw",
      "mieszanka chińsk", "mieszanka meksyk",
      "mieszanka euro", "sombrero",
      "guacamole",
      "salsefia", "botwina", "kwiat jadaln",
      "warzywa", "warzywo",
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
      "nutella", "lava cake", "suflet",
    ],
  },

  // ── 12. Pieczywo, mąka i zboża ──────────────────────────────────────────────
  // Makarony przeniesione do kategorii "makarony" (2026-10, przed sery).
  {
    id: "pieczywo",
    label: "Pieczywo / Mąka / Zboża",
    emoji: "🍞",
    keywords: [
      "chleb", "chleba", "chlebem",
      "bułk", "bagietka", "baguette", "ciabatta",
      "focaccia", "brioche", "pumpernikiel",
      "grissini", "suchar",
      "mąka", "mąki", "mąką",
      "orkisz", "żyto", "semolina", "semolinę",
      "gryka", "kasza ", "kaszy",
      "amarant", "quinoa",
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
      "paluch",
    ],
  },

  // ── 14. Sprzęt / Wyposażenie ────────────────────────────────────────────────
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
      "deska serwisowa", "deska bukowa", "deska dębowa", "deska do serwowania",
      "deska prezentacyjna", "drewniana taca", "podkładka drewniana",
      "akcesoria drewniane", "łyżka drewniana kuch", "łopatka drewniana kuch",
    ],
  },

  // ── 15. Orzechy / Bakalie ───────────────────────────────────────────────────
  // OSTATNIA reguła: bare "orzech" łapie też kremy/syropy orzechowe.
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
