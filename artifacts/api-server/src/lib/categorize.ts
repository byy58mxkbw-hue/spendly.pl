type CategoryRule = { id: string; keywords: string[] };

const CATEGORY_RULES: CategoryRule[] = [
  {
    id: "miesa",
    keywords: [
      "kurczak", "kurczaka", "wieprzow", "wołow", "wołowina", "wołowe",
      "cielę", "cielęc", "boczek", "kiełbas", "szynka", "szynki", "filet",
      "pierś", "piersi", "udziec", "karkówk", "karczek", "schab", "żebra",
      "żeberek", "żeberka", "łopatk", "mielon", "wędlin", "kabanos", "parówk",
      "salami", "golonk", "pasztet", "kotlet", "polędwiczk", "polędwica",
      "antrykot", "ligawa", "kaczk", "kacze", "indyk", "indycz", "gęś",
      "gęsi", "rosołow", "porcje rosołowe", "podudzie", "rostbef", "befsztyk",
      "gulasz", "drobiu", "drobiow", "mięs", "mięso", "mięsa", "jamon",
      "chorizo", "podgardle", "salceson", "baleron", "stek ",
    ],
  },
  {
    id: "warzywa",
    keywords: [
      // Warzywa
      "pomidor", "ogórek", "ogórk", "sałat", "pietruszk", "marchew", "marchewk",
      "ziemniak", "cebul", "por ", "por(", "poru", "papryka", "papryki",
      "brokuł", "brokułów", "kalafior", "kapust", "szpinak", "szparagi", "szparag",
      "batat", "burak", "buraczk", "dyni", "dynia", "awokado", "avocado",
      "kukurydz", "groszek", "groszku", "fasolka", "fasola", "cieciorka",
      "seler", "rzodkiew", "rzodkiewk", "daterino", "rukola", "roszponka",
      "endywia", "jarmuż", "radicchio", "bakłażan", "cukini", "kabaczek",
      "patison", "pasternak", "topinambur", "salsefi", "cykoria", "czosnek",
      "szczypior", "koper ", "kolendra", "bazylia", "mięta ", "lubczyk",
      "tymianek", "rozmaryn", "kiełki", "włoszczyzna", "imbir ", "guacamole",
      // Owoce
      "banan", "jabłk", "gruszk", "pomarańcz", "mandarynk", "cytryn",
      "winogron", "malina", "malin", "truskawk", "borówk", "mango", "ananas",
      "kiwi", "arbuz", "limonk", "granat", "grejpfrut", "melon", "papaja",
      "śliwk", "wiśni", "czereśni", "morela", "brzoskwini", "nektaryn",
      "agrest", "porzeczk", "rabarbar", "physalis", "pitahaya", "karambola",
      "kumkwat", "fisalis", "smoczy owoc", "miechunka", "żurawina", "marakuj",
      // Grzyby
      "grzyb", "pieczark", "borowik", "boczniak", "kurka ", "kurki ", "kurkami",
      "podgrzybek", "shiitake", "portobello", "chanterelle", "maślak", "opieniek",
      // Mrożone/przetworzone warzywa i owoce
      "mieszanka warzyw", "bukiet warzyw", "mieszanka chińsk", "sombrero",
      "mieszanka meksyk", "mieszanka euro", "mieszanka kompot", "kompotowa",
      "warzywa", "owoce", "owoc", "warzywo",
    ],
  },
  {
    id: "napoje",
    keywords: [
      "woda ", "wody ", "sok ", "soku ", "sokow", "napój", "napoje",
      "piwo", "wino ", "wina ", "win ", "kawa", "kawow", "herbata", "herbat",
      "lemoniada", "shake", "syrop", "syropu", "energetyk", "isotonic",
      "mineraln", "gazowany", "niegazowany",
      // Marki
      "coca-cola", "coca cola", "fanta", "sprite", "sprit", "cappy",
      "kinley", "tymb ", "tymbark", "schweppes", "pepsi", "7up", "mirinda",
      "lipton", "nestea", "red bull", "monster ", "powerade", "gatorade",
      "rgb x24", "0,25 rgb", "butelka szk", "but szk", "drs ", "nektar ",
      "igrist", "szampan", "prosecco", "nalewka",
    ],
  },
  {
    id: "nabiał",
    keywords: [
      "mleko", "mleka", "ser ", "sery", "serow", "jogurt", "jogurtu",
      "śmietan", "masło", "masła", "twaróg", "twarogu", "jajk", "jaja ",
      "jaj ", "kefir", "maślank", "śmietank", "ricotta", "mozzarella",
      "burrata", "feta", "camembert", "brie", "gouda", "edam", "parmezan",
      "grana padano", "halloumi", "cottage", "fromage", "nabiał",
    ],
  },
  {
    id: "ryby",
    keywords: [
      "łosoś", "łososia", "dorsz", "dorsza", "tuńczyk", "tuńczyka",
      "krewetk", "kalmar", "pstrąg", "pstrąga", "halibut", "mintaj",
      "ryba", "ryby", "rybna", "śledź", "śledzia", "makrela", "makreli",
      "krab", "homara", "ośmiornic", "małż", "ostryg", "anchois", "sardynk",
      "tilapia", "pangasius", "morszczuk", "flądra", "sandacz", "sum ",
      "karp", "lin ", "węgorz", "okoń", "szczupak",
    ],
  },
  {
    id: "pieczywo",
    keywords: [
      "chleb", "chleba", "bułk", "mąka", "mąki", "drożdż", "baguette",
      "croissant", "tortilla", "makaron", "makaronu", "ryż ", "ryżu",
      "kasza", "kaszy", "płatki", "biszkopt", "wafel", "wafle", "wafli",
      "suchar", "grissini", "ciabatta", "focaccia", "brioche", "pumpernikiel",
      "orkisz", "quinoa", "gryka", "bulgur", "kuskus", "semolinę", "amarant",
      "naleśnik", "pancake", "gnocchi", "vol-au-vent", "panierka", "frytki",
      "talarki ziemniacz", "dollar chips", "ciasto kataifi", "spód do quiche",
      "korpusy kruche", "soczewica", "nachos",
    ],
  },
  {
    id: "przyprawy",
    keywords: [
      "sól ", "soli ", "pieprz", "pieprzu", "przyprawa", "przyprawy",
      "sos ", "sosu ", "sosów", "musztarda", "majonez", "ketchup", "keczup",
      "ocet", "oliwa", "olej", "oleju", "olejów", "tłuszcz", "smalec", "ghee",
      "curry", "kurkuma", "chilli", "chili", "kminek", "cynamon", "gałka",
      "anyż", "wanilia", "ziele", "piment", "liść laurow", "zioła prowans",
      "zioła doniczk", "chrzan", "wasabi", "kapary", "esencja", "peperonata",
      "kucharek", "vegeta", "chia", "miód", "żelatyna", "ocet balsamicz",
      "barszcz", "żur ", "primerba",
    ],
  },
];

/**
 * Assign a category ID to a product based on its name.
 * Returns one of: miesa | warzywa | napoje | nabiał | ryby | pieczywo | przyprawy | inne
 */
export function categorizeProduct(name: string): string {
  const normalized = name.toLowerCase().replace(/^#/, "").trim();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return rule.id;
    }
  }
  return "inne";
}
