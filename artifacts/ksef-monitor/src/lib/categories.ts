export type Category = {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
};

/**
 * WAŻNE: kolejność w tablicy ma znaczenie!
 * categorizeProduct() zwraca pierwszą pasującą kategorię.
 * Bardziej specyficzne kategorie (z unikalnymi słowami kluczowymi)
 * muszą być PRZED bardziej ogólnymi (np. mrożonki przed pieczywo,
 * bo "frytki" powinny trafić do mrożonek, nie pieczywa).
 */
export const CATEGORIES: Category[] = [
  // ── 0. Koszty stałe (media, paliwo, najem, abonamenty) ──────────────────────
  // WAŻNE: pierwsze w kolejności. Prąd/gaz/internet/najem/paliwo to NIE składniki —
  // łapiemy je tu, żeby nie zaśmiecały kolejki „do przeglądu". Synchronizowane z backendem.
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
    ],
  },

  // ── 1. Alkohole ─────────────────────────────────────────────────────────────
  {
    id: "alkohole",
    label: "Alkohole",
    emoji: "🍷",
    keywords: [
      // Piwa
      "piwo", "piwa", "piwem", "piw ", "lager", "ale ", "ipa ", "porter",
      "stout", "weizen", "bock", "wheat beer", "craft beer",
      "litovel", "tyskie", "żywiec", "lech ", "heineken", "carlsberg",
      "desperados", "corona ", "budweiser", "hoegaarden", "leffe", "pilsner",
      // Wina
      "wino ", "vino ", "rouge", "rosé",
      "primitivo", "sauvignon", "chardonnay", "merlot", "cabernet",
      "pinot", "shiraz", "riesling", "sangiovese", "tempranillo",
      "prosecco", "cava ", "szampan", "szampana", "igrist",
      "igt ", "doc ", "aoc ", "dop ",
      "czerwone wino", "białe wino", "różowe wino",
      // Wódki i mocne
      "wódka", "wódki", "vodka", "wyborowa", "absolut", "belvedere",
      "żubrówka", "sobieski", "finlandia", "stanislav", "bols ",
      "whisky", "whiskey", "bourbon", "scotch", "rum ", "rumu ",
      "tequila", "mezcal", "gin ", "gins", "cognac", "koniak",
      "brandy", "calvados", "armagnac", "grappa", "schnaps",
      "spirytus", "bimber", "nalewka", "nalewki",
      // Likiery i aperitify
      "likier", "likieru", "liqueur", "triple sec", "creme de",
      "aperol", "campari", "amaretto", "baileys", "kahlua",
      "grand marnier", "drambuie", "tatratea", "jagermeister",
      "becherovka", "fernet", "chartreuse", "cointreau",
      "sambuca", "limoncello", "wermut", "vermouth", "bitter",
      "cydr", "cyder", "cider",
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
      // Płyny i środki czyszczące
      "płyn do naczyń", "płyn do mycia naczyń", "tabletki do zmywarki",
      "płyn do zmywarki", "sól do zmywarki", "nabłyszczacz do zmywarki",
      "środek czyszczący", "środek do czyszczenia", "zmywak", "zmywaki",
      "gąbka do mycia", "gąbki kuchenne",
      "wybielacz", "odkamieniacz", "odtłuszczacz",
      // Higiena i dezynfekcja
      "dezynfekcja", "dezynfekujący", "dezynfekant", "dezynfekant",
      "płyn dezynfekujący", "żel antybakteryjny", "środek dezynfekujący",
      "mydło w płynie", "mydło antybakteryjne",
      // Środki piorące
      "proszek do prania", "płyn do prania", "kapsułki do prania",
      // Artykuły sanitarne
      "papier toaletowy", "papier toalet",
      "ręczniki papierowe", "ręcznik kuchenny", "ręcznik jednorazowy",
      "chusteczki higieniczne", "chusteczki nawilżane",
      "odświeżacz powietrza", "odświeżacz wc", "kostka wc",
      // Środki do powierzchni
      "ścierka", "ścierki", "mop ", "mopa", "mopy",
      "rękawice lateksow", "rękawice gumow", "rękawice jednorazow",
      "worki na śmieci", "worki na odpad",
      // Płyn do wc
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
    label: "Opakowania",
    emoji: "🛍️",
    keywords: [
      // Folie i worki
      "folia aluminiowa", "folia stretch", "folia spożywcza", "folia do żywności",
      "folia pe", "folia pvc", "folia termokurczliwa",
      "torebka foliowa", "torba papierowa", "torebka papierowa",
      "woreczek strunowy", "woreczek do mrożenia",
      // Jednorazowe naczynia
      "kubek jednorazowy", "kubki jednorazowe", "kubek papierowy",
      "talerz jednorazowy", "talerze jednorazowe",
      "miska jednorazowa", "miseczka jednorazowa",
      "sztućce jednorazowe", "łyżeczka jednorazowa", "widelec jednorazowy",
      // Pojemniki i pudełka
      "pudełko na wynos", "pojemnik na wynos", "pojemnik do żywności",
      "pojemnik obiadowy", "lunch box", "pojemnik gastro",
      "karton do pizzy", "karton pizzy", "pudełko do pizzy",
      "tackа styropianowa", "taca jednorazowa",
      // Serwetki i papier
      "serwetki papierowe", "serwetki", "serwetka",
      "papier do pieczenia", "papier pergaminowy", "papier śniadaniowy",
      "papier do pakowania",
      // Akcesoria do serwowania
      "słomki", "słomka", "szaszłyki", "szaszłyk", "wykałaczki",
      "rękaw cukierniczy", "worek cukierniczy",
      "podstawki pod napoje", "podstawka pod szklankę",
      // Inne opakowania
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
    label: "Mrożonki",
    emoji: "❄️",
    keywords: [
      // Ogólne słowa kluczowe mrożonek
      "mrożon", "mrozon", "frozen", "deep frozen", "iqf",
      // Lody i desery mrożone
      "lody ", "lodu ", "lodów", "lód ", "ice cream", "sorbet", "gelato",
      "lody kulki", "lody gałki", "wafelek lodowy", "rożek lodowy",
      // Frytki i ziemniaki mrożone — WAŻNE: tu, a nie w pieczywie
      "frytki", "frytek", "frytka",
      "talarki ziemniacz", "kotlety ziemniaczane mroż",
      "potato fries", "potato wedge", "tater tots",
      "dollar chips", "hash brown",
      // Pizze mrożone
      "pizza mrożona", "pizza zamrożona",
      // Warzywa i owoce mrożone
      "warzywa mrożone", "mieszanka mrożona",
      "szpinak mrożony", "szparagi mrożone", "brokuły mrożone",
      "groszek mrożony", "kukurydza mrożona", "edamame",
      "owoce mrożone", "jagody mrożone", "maliny mrożone",
      "wiśnie mrożone", "truskawki mrożone",
      // Ryby i mięso mrożone
      "filet mrożony", "ryba mrożona", "mintaj mroż", "dorsz mroż",
      "krewetki mrożone", "paluszki rybne",
      "mięso mrożone", "burgery mrożone",
      // Wyroby mączne mrożone
      "pierogi mrożone", "krokiety mrożone", "kopytka mrożone",
      "bliny mrożone", "naleśniki mrożone",
      // Inne mrożone
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
      // Wskaźniki konserw i przetworów
      "w puszce", "puszka ", "puszki ", "puszek",
      "konserwow", "konserwa ", "konserwy ",
      "marynow", "marynata",
      "kiszon", "kwaszon",
      // Pomidory przetworzone
      "passata", "pelati", "pomidory krojone", "pomidory całe",
      "koncentrat pomidorowy", "pulpa pomidorowa",
      "pomidory w puszcze", "passata pomidorowa",
      // Oliwki i kapary
      "oliwki", "oliwka ",
      // Korniszony i kiszonki
      "korniszony", "korniszon",
      "ogórek kiszony", "ogórki kiszone", "ogórki konserwowe",
      "kapusta kiszona", "kapusta kwaszona", "kimchi",
      "burak ćwikłowy", "ćwikła",
      // Ryby i mięso konserwowe
      "anchois", "sardynki w oleju", "tuńczyk w oleju",
      "szproty", "szprot", "makrela wędzona",
      // Dżemy i przetwory owocowe
      "dżem", "marmolad", "powidła", "konfitura", "mus jabłkowy",
      // Inne przetwory
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
      // Drób
      "kurczak", "kurczaka", "kurczakiem",
      "indyk", "indycz", "kaczk", "kacze",
      "gęś", "gęsi", "przepiórk", "gołąb",
      "porcje rosołowe", "rosołow", "podudzie", "udko",
      "pierś z kurczaka", "piersi", "pierś",
      "udziec", "udzca",
      // Wieprzowina
      "wieprzow", "wieprzow", "karkówk", "karczek",
      "schab", "żebra", "żeberek", "żeberka", "żeberko",
      "łopatk", "boczek", "golonk", "golonka",
      "podgardle", "słonina",
      // Wołowina i cielęcina
      "wołow", "wołowina", "wołowe", "cielę", "cielęc",
      "rostbef", "befsztyk", "antrykot", "ligawa",
      // Jagnięcina i dziczyzna
      "jagnięcin", "baranin", "dziczyzn", "sarni", "jeleni",
      "dzik", "dzika",
      // Wędliny i wyroby mięsne
      "mielon", "wędlin", "kabanos", "parówk",
      "salami", "salceson", "baleron", "pasztet",
      "kiełbas", "szynka", "szynki", "ham ",
      "jamon", "chorizo", "mortadela", "cervelat",
      // Ogólne
      "filet", "polędwiczk", "polędwica",
      "kotlet", "schnitzel", "gulasz",
      "drobiu", "drobiow",
      "mięs", "mięso", "mięsa",
    ],
  },

  // ── 8. Nabiał i jaja ────────────────────────────────────────────────────────
  {
    id: "nabiał",
    label: "Nabiał / Jaja",
    emoji: "🥛",
    keywords: [
      // Mleko i śmietana
      "mleko", "mleka", "mleku",
      "śmietan", "śmietank", "kremówka", "double cream",
      "maślank", "kefir", "zsiadłe mleko",
      // Masło
      "masło", "masła", "masłem",
      // Sery
      "ser ", "sery", "serow", "serem",
      "jogurt", "jogurtu",
      "twaróg", "twarogu",
      "ricotta", "mozzarella", "burrata", "feta",
      "camembert", "brie", "gouda", "edam",
      "parmezan", "grana padano", "pecorino",
      "halloumi", "cottage", "fromage", "mascarpone",
      "skyr", "quark",
      "nabiał",
      // Jaja
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
    label: "Warzywa / Owoce / Grzyby",
    emoji: "🥦",
    keywords: [
      // Warzywa korzeniowe
      "marchew", "marchewk", "pietruszk", "seler", "pasternak",
      "burak", "buraczk", "topinambur",
      "rzodkiew", "rzodkiewk",
      // Warzywa psiankowate
      "pomidor", "papryka", "papryki", "bakłażan",
      // Warzywa kapustne
      "kapust", "brokuł", "brokułów", "kalafior",
      "jarmuż", "brukselka",
      // Liściaste i sałaty
      "sałat", "rukola", "roszponka", "endywia", "radicchio",
      "szpinak", "cykoria",
      // Cebulowe
      "cebul", "por ", "por(", "poru", "czosnek", "szalotka",
      "szczypior",
      // Strączkowe (świeże)
      "groszek", "groszku", "fasolka", "fasola", "cieciorka", "soczewica",
      "bób",
      // Inne warzywa
      "ziemniak", "szparagi", "szparag",
      "cukini", "kabaczek", "dyni", "dynia", "patison",
      "batat", "kukurydz", "koper ",
      "awokado", "avocado",
      "daterino",
      // Zioła świeże
      "bazylia", "mięta ", "kolendra", "lubczyk",
      "tymianek", "rozmaryn", "szałwia ", "estragon",
      "kiełki", "kiełk",
      "włoszczyzna",
      // Grzyby
      "grzyb", "pieczark", "borowik", "boczniak",
      "kurka ", "kurki ", "kurkami",
      "podgrzybek", "shiitake", "portobello", "chanterelle",
      "maślak", "opieniek", "trufla świeża", "truflowy",
      // Owoce (świeże)
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
      // Mieszanki warzywne
      "mieszanka warzyw", "bukiet warzyw",
      "mieszanka chińsk", "mieszanka meksyk",
      "mieszanka euro", "sombrero",
      "guacamole",
      // Ogólne
      "warzywa", "owoce", "owoc", "warzywo",
      "ogórek", "ogórk",
    ],
  },

  // ── 10. Napoje ──────────────────────────────────────────────────────────────
  {
    id: "napoje",
    label: "Napoje",
    emoji: "🥤",
    keywords: [
      // Wody i soki
      "woda ", "wody ", "sok ", "soku ", "sokow", "napój", "napoje",
      "nektar ", "nektaru",
      // Kawa i herbata
      "kawa", "kawow", "kawi", "espresso", "cappuccino", "latte",
      "herbata", "herbat", "herbatk",
      "matcha", "yerba mate", "rooibos",
      // Lemoniady i syropy
      "lemoniada", "shake", "syrop napojowy", "syrop do kawy",
      "energetyk", "isotonic",
      // Napoje gazowane
      "mineraln", "gazowany", "niegazowany",
      "coca-cola", "coca cola", "fanta", "sprite", "sprit", "cappy",
      "kinley", "tymbark", "schweppes", "pepsi", "7up", "mirinda",
      // Inne napoje markowe
      "lipton", "nestea", "red bull", "monster ",
      "powerade", "gatorade", "tiger ", "burn ",
      // Napoje mleczne
      "milk shake", "mleko smakowe",
      // Opisy opakowań napojowych
      "rgb x24", "0,25 rgb", "butelka szk", "but szk", "drs ",
    ],
  },

  // ── 11. Słodycze i cukiernia ────────────────────────────────────────────────
  {
    id: "slodycze",
    label: "Słodycze / Cukiernia",
    emoji: "🍰",
    keywords: [
      // Czekolada i kakao
      "czekolada", "czekoladow", "kakao", "kakao w proszku",
      "callebaut", "valrhona", "couverture", "ganache",
      "pralinki", "pralina", "truffle", "trufle cukiernicze",
      // Cukier i słodziki
      "cukier", "cukru", "cukrem",
      "cukier puder", "cukier waniliowy", "cukier brązowy",
      "kandyzowany", "karmel", "karmelu",
      "syrop cukrowy", "syrop klonowy", "syrop agawe",
      // Wyroby cukiernicze
      "tort", "tortu", "torcik",
      "ciasto", "ciastko", "ciastek", "ciastka",
      "muffin", "brownie", "cheesecake", "tarta ",
      "makaronik", "macaron",
      "beza", "bezowy", "pavlova",
      "sernik", "sernika",
      "tiramisu", "panna cotta", "crème brûlée", "creme brulee",
      // Ciasteczka i herbatniki
      "biszkopt", "suchar ",
      "wafel", "wafle", "wafli", "wafelek",
      "herbatnik", "ciasteczko",
      "chałwa", "nugat", "marcepan",
      // Dekoracje cukiernicze
      "posypka", "dekory cukrowe", "perełki cukrowe",
      "lukier", "fondant",
      "barwnik spożywczy",
      "skrobia", "mąka ryżowa",
      // Kremy i masy cukiernicze
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
      // Pieczywo
      "chleb", "chleba", "chlebem",
      "bułk", "bagietka", "baguette", "ciabatta",
      "focaccia", "brioche", "pumpernikiel",
      "grissini", "suchar",
      // Mąki i produkty zbożowe
      "mąka", "mąki", "mąką",
      "orkisz", "żyto", "semolina", "semolinę",
      "gryka", "kasza", "kaszy",
      "amarant", "quinoa",
      // Makarony
      "makaron", "makaronu", "spaghetti", "penne", "fusilli",
      "tagliatelle", "lasagna", "gnocchi",
      // Ryż
      "ryż ", "ryżu", "ryżem", "risotto",
      // Płatki i płatki śniadaniowe
      "płatki owsian", "płatki kukurydz", "musli", "granola",
      // Drożdże i proszki
      "drożdż", "proszek do pieczenia",
      // Wraps i tortille
      "tortilla", "wrap",
      // Kuskus i inne
      "kuskus", "bulgur", "amarant",
      // Naleśniki i pankcake
      "naleśnik", "pancake", "crepe",
      // Ciasta słone i niesłodzone
      "ciasto kataifi", "spód do quiche", "korpusy kruche",
      "vol-au-vent", "ciasto filo", "ciasto francuskie",
      "panierka bułczana", "panierka",
      // Inne zbożowe
      "soczewica", "nachos", "tortilla chip",
      "croissant",
      // Kluski i pieczywo długie (uzup. z realnych faktur)
      "kluski", "paluch", "kopytka",
    ],
  },

  // ── 13. Przyprawy, sosy, oleje ──────────────────────────────────────────────
  {
    id: "przyprawy",
    label: "Przyprawy / Sosy / Oleje",
    emoji: "🧂",
    keywords: [
      // Podstawowe przyprawy
      "sól ", "soli ", "sól morska",
      "pieprz", "pieprzu",
      "przyprawa", "przyprawy",
      // Zioła suszone
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
      // Sosy i kondymenty
      "sos ", "sosu ", "sosów",
      "musztarda", "majonez", "ketchup", "keczup",
      "ocet", "ocet balsamicz", "ocet winny",
      "chrzan", "wasabi", "kapary",
      "tabasco", "sriracha", "worcester",
      "tahini", "hummus",
      "tapenad",
      // Oleje i tłuszcze
      "oliwa", "olej", "oleju", "olejów",
      "olej rzepak", "olej słonecznik", "olej kokosow",
      "tłuszcz", "smalec", "ghee", "klarowane masło",
      "lard",
      // Słodziki i inne
      "miód", "miodu",
      "syrop", "syropu",
      "chia", "siemię lniane",
      "żelatyna", "pektyna", "agar",
      // Mieszanki i gotowe sosy
      "esencja", "peperonata", "primerba",
      "kucharek", "vegeta",
      "barszcz", "żur ", "barszcz w prosz",
      "puree marakuj", "puree owocowe",
      "pasta miso", "pasta curry", "pasta paprykow",
      "guacamole mieszanka",
      // Tłuszcze do smażenia (uzup. z realnych faktur)
      "margaryna", "frytura",
    ],
  },
];

export function categorizeProduct(name: string): string {
  const n = name.toLowerCase().replace(/^#/, "").trim();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => n.includes(kw.toLowerCase()))) {
      return cat.id;
    }
  }
  return "inne";
}
