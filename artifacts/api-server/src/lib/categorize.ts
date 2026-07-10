/**
 * WAŻNE: kolejność w tablicy ma znaczenie!
 * Bardziej specyficzne kategorie (z unikalnymi słowami kluczowymi)
 * muszą być PRZED bardziej ogólnymi.
 * Przykład: mrozonki i konserwy PRZED warzywa/ryby,
 *            slodycze PRZED pieczywo (czekolada, ciastka)
 *            srodki_czystosci i opakowania PRZED napoje (papier, folie)
 *
 * Backend i frontend muszą mieć identyczny zestaw kategorii i kolejność —
 * ta lista jest autorytatywna, categories.ts na frontendzie synchronizuje słowa kluczowe.
 */
export type CategoryRule = { id: string; keywords: string[] };

export const CATEGORY_RULES: CategoryRule[] = [
  // ── 0. Koszty stałe (media, paliwo, najem, abonamenty) ──────────────────────
  // WAŻNE: pierwsze w kolejności. Pozycje z faktur za prąd/gaz/internet/najem to
  // NIE są składniki — łapiemy je tu, żeby nie zaśmiecały kolejki „do przeglądu".
  // Słowa kluczowe są specyficzne i nie kolidują z produktami spożywczymi.
  {
    id: "koszty_stale",
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
    ],
  },

  // ── 1. Alkohole ─────────────────────────────────────────────────────────────
  {
    id: "alkohole",
    keywords: [
      // Piwo
      "piwo", "piwa", "piwem", "piw ", "lager", "ale ", "ipa ", "porter",
      "stout", "weizen", "bock", "wheat beer", "craft beer", "bz ", "bz",
      "litovel", "tyskie", "żywiec", "lech ", "heineken", "carlsberg",
      "desperados", "corona ", "budweiser", "hoegaarden", "leffe", "pilsner",
      // Wino
      "wino ", "vino ", "rouge", "rosé",
      "primitivo", "sauvignon", "chardonnay", "merlot", "cabernet",
      "pinot", "shiraz", "riesling", "sangiovese", "tempranillo",
      "prosecco", "cava ", "szampan", "szampana", "igrist",
      "igt ", "doc ", "aoc ", "dop ", "cz/w", "b/w", "b/wyt",
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
      "vizir", "prań", "bros", "ręcznik składany",
    ],
  },

  // ── 3. Opakowania i jednorazówki ────────────────────────────────────────────
  {
    id: "opakowania",
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
    ],
  },

  // ── 4. Mrożonki ─────────────────────────────────────────────────────────────
  {
    id: "mrozonki",
    keywords: [
      "mrożon", "mrozon", "frozen", "deep frozen", "mccain",
      "lody ", "lodu ", "lodów", "lód ", "ice cream", "sorbet", "gelato",
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
      " dzik",
      "mielon", "wędlin", "kabanos", "parówk", "kiszka",
      "salami", "salceson", "baleron", "pasztet",
      "kiełbas", "szynka", "szynki", "ham ",
      "jamon", "chorizo", "mortadela", "cervelat",
      "filet", "polędwiczk", "polędwica",
      "kotlet", "schnitzel", "gulasz",
      "drobiu", "drobiow",
      "mięs", "mięso", "mięsa", "stek ",
    ],
  },

  // ── 8. Nabiał i jaja ────────────────────────────────────────────────────────
  {
    id: "nabiał",
    keywords: [
      "mleko", "mleka", "mleku",
      "śmietan", "śmietank", "kremówka", "double cream",
      "maślank", "kefir", "zsiadłe mleko",
      "masło", "masła", "masłem",
      "ser ", "sery", "serow", "serem",
      "jogurt", "jogurtu",
      "twaróg", "twarogu",
      "ricotta", "mozzarella", "burrata", "feta",
      "camembert", "brie", "gouda", "edam",
      "parmezan", "grana padano", "pecorino",
      "halloumi", "cottage", "fromage", "mascarpone",
      "skyr", "quark",
      "nabiał",
      "jajk", "jaja ", "jaj ", "jajec",
      "jajko", "jajka",
      // Sery markowe i pleśniowe (uzup. z realnych faktur)
      "formagio", "pleśniow", "cremefine",
      "mix serów", "serek", "fellada",
    ],
  },

  // ── 9. Warzywa, owoce i grzyby ──────────────────────────────────────────────
  {
    id: "warzywa",
    keywords: [
      "marchew", "marchewk", "pietruszk", "seler", "pasternak",
      "burak", "buraczk", "topinambur",
      "rzodkiew", "rzodkiewk",
      "pomidor", "papryka", "papryki", "bakłażan",
      "kapust", "brokuł", "brokułów", "kalafior",
      "jarmuż", "brukselka",
      "sałat", "rukola", "roszponka", "endywia", "radicchio",
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

  // ── 10. Napoje ──────────────────────────────────────────────────────────────
  {
    id: "napoje",
    keywords: [
      "woda ", "wody ", "sok ", "soku ", "sokow", "napój", "napoje",
      "nektar ", "nektaru",
      "kawa ", "kawy", "kawą", "kawow", "espresso", "cappuccino", "latte",
      "herbata", "herbat", "herbatk",
      "matcha", "yerba mate", "rooibos",
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

  // ── 11. Słodycze i cukiernia ────────────────────────────────────────────────
  {
    id: "slodycze",
    keywords: [
      "czekolada", "czekoladow", "kakao", "kakao w proszku",
      "callebaut", "valrhona", "couverture", "ganache",
      "pralinki", "pralina", "truffle", "trufle cukiernicze",
      "cukier", "cukru", "cukrem",
      "cukier puder", "cukier waniliowy", "cukier brązowy",
      "kandyzowany", "karmel", "karmelu",
      "syrop cukrowy", "syrop klonowy", "syrop agawe",
      "tort", "tortu", "torcik",
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
    keywords: [
      "chleb", "chleba", "chlebem",
      "bułk", "bagietka", "baguette", "ciabatta",
      "focaccia", "brioche", "pumpernikiel",
      "grissini", "suchar",
      "mąka", "mąki", "mąką",
      "orkisz", "żyto", "semolina", "semolinę",
      "gryka", "kasza", "kaszy",
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
      "chia", "siemię lniane",
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
  // Nie-surowce: naczynia kuchenne, narzędzia, drobne AGD, części/żarówki.
  // Słowa kluczowe są specyficzne, żeby nie kolidować ze składnikami.
  {
    id: "sprzet",
    keywords: [
      "patelni", "patelnia", "garnek", "garnk", "rondel", "rondl",
      "szczypce", " czypce", "termometr", "deska do kroj", "deski do kroj",
      "chochla", "cedzak", "durszlak", "sitko ", "tarka kuch", "trzepaczka",
      "wałek do", "łopatka kuch", "blacha do piecz", "blacha piekarn",
      "forma do piecz", "forma do tort", "naczynie żarood", "garnki",
      "żarówka", "świetlówka", "bosma", "px26d", " h7 ", "akumulator",
      "sprzęt", "wyposażenie",
    ],
  },

  // ── 15. Orzechy / Bakalie ───────────────────────────────────────────────────
  // OSTATNIA reguła: bare "orzech" łapie też kremy/syropy orzechowe (Nutella,
  // syrop laskowy), więc musi być PO słodyczach/przyprawach/napojach — tu zostają
  // tylko czyste orzechy i bakalie, których nie złapała żadna wcześniejsza reguła.
  {
    id: "orzechy",
    keywords: [
      "orzech", "orzeszk", "migdał", "migdal", "pistacj", "nerkowiec",
      "rodzynk", "bakali", "laskow", "włoskie orzech", "nerkowca",
      "ziemne solone", "płatki słodkie",
    ],
  },
];

/**
 * Built-in category definitions (id → label + emoji).
 * Kept in sync with categories.ts on the frontend.
 */
export const BUILTIN_CATEGORY_DEFS: Record<string, { label: string; emoji: string }> = {
  alkohole: { label: "Alkohole", emoji: "🍷" },
  srodki_czystosci: { label: "Środki czystości", emoji: "🧹" },
  opakowania: { label: "Opakowania", emoji: "🛍️" },
  mrozonki: { label: "Mrożonki", emoji: "❄️" },
  konserwy: { label: "Konserwy / Przetwory", emoji: "🥫" },
  ryby: { label: "Ryby / Owoce morza", emoji: "🐟" },
  miesa: { label: "Mięsa / Wędliny", emoji: "🥩" },
  nabiał: { label: "Nabiał / Jaja", emoji: "🥛" },
  warzywa: { label: "Warzywa / Owoce / Grzyby", emoji: "🥦" },
  napoje: { label: "Napoje", emoji: "🥤" },
  slodycze: { label: "Słodycze / Cukiernia", emoji: "🍰" },
  pieczywo: { label: "Pieczywo / Makarony / Zboża", emoji: "🍞" },
  przyprawy: { label: "Przyprawy / Sosy / Oleje", emoji: "🧂" },
  koszty_stale: { label: "Koszty stałe", emoji: "🧾" },
  orzechy: { label: "Orzechy / Bakalie", emoji: "🥜" },
  sprzet: { label: "Sprzęt / Wyposażenie", emoji: "🧰" },
  inne: { label: "Inne", emoji: "📦" },
};

/**
 * Fast keyword-based categorization (synchronous).
 * Returns a built-in category ID or "inne" if nothing matched.
 */
// Z5: twardsze dopasowanie słów kluczowych.
// - Frazy / słowa ze spacją → zostają na includes (spacja już daje granicę).
// - Pojedyncze słowa → dopasowanie po GRANICY SŁOWA: start łańcucha lub poprzedzone
//   nie-literą. Uwzględniamy polskie znaki (ą,ć,ę,ł,…), bo JS `\b` traktuje je jako
//   nie-słowo. Dzięki temu „por" nie łapie „imPORt", a „sum" nie łapie „konSUMpcyjny".
//   Granica tylko z przodu (nie z tyłu) — żeby „por" dalej łapało „pory"/„pora".
const KW_WORD_CHARS = "a-z0-9ąćęłńóśźż";
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
type KeywordMatcher = (normalized: string) => boolean;
function buildKeywordMatcher(kw: string): KeywordMatcher {
  const k = kw.toLowerCase();
  if (k.includes(" ")) return (n) => n.includes(k);
  const re = new RegExp("(^|[^" + KW_WORD_CHARS + "])" + escapeRegex(k));
  return (n) => re.test(n);
}
// Prekompilacja raz przy starcie (categorizeProduct bywa w gorących pętlach importu).
const COMPILED_RULES: Array<{ id: string; matchers: KeywordMatcher[] }> = CATEGORY_RULES.map(
  (rule) => ({ id: rule.id, matchers: rule.keywords.map(buildKeywordMatcher) }),
);

export function categorizeProduct(name: string): string {
  const normalized = name.toLowerCase().replace(/^#/, "").trim();
  for (const rule of COMPILED_RULES) {
    if (rule.matchers.some((m) => m(normalized))) {
      return rule.id;
    }
  }
  return "inne";
}
