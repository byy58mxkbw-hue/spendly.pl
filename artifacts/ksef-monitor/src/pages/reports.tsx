import { useState, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useGetMonthlyReport } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ShoppingCart, FileText, Package, TrendingUp, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Category definitions ────────────────────────────────────────────────────

type Category = {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
};

const CATEGORIES: Category[] = [
  {
    id: "miesa",
    label: "Mięsa",
    emoji: "🥩",
    keywords: [
      "kurczak", "kurczaka", "wieprzow", "wołow", "wołowina", "wołowe", "cielę", "cielęc",
      "boczek", "kiełbas", "szynka", "szynki", "filet", "pierś", "piersi", "udziec",
      "karkówk", "karczek", "schab", "żebra", "żeberek", "żeberka", "łopatk",
      "mielon", "wędlin", "kabanos", "parówk", "salami", "golonk", "pasztet",
      "kotlet", "polędwiczk", "polędwica", "antrykot", "ligawa", "kaczk", "kacze",
      "indyk", "indycz", "gęś", "gęsi", "rosołow", "porcje rosołowe", "podudzie",
      "rostbef", "befsztyk", "gulasz", "drobiu", "drobiow", "mięs", "mięso", "mięsa",
      "jamon", "chorizo", "podgardle", "salceson", "baleron",
    ],
  },
  {
    id: "warzywa",
    label: "Warzywa / Owoce / Grzyby",
    emoji: "🥦",
    keywords: [
      // Warzywa
      "pomidor", "ogórek", "ogórk", "sałat", "pietruszk", "marchew", "marchewk",
      "ziemniak", "cebul", "por ", "por(", "poru", "papryka", "papryki",
      "brokuł", "brokułów", "kalafior", "kapust", "szpinak", "szparagi", "szparag",
      "batat", "burak", "dyni", "dynia", "awokado", "avocado", "kukurydz",
      "groszek", "groszku", "fasolka", "fasola", "cieciorka", "seler", "rzodkiew", "rzodkiewk",
      "daterino", "rukola", "roszponka", "endywia", "jarmuż", "radicchio",
      "bakłażan", "cukini", "kabaczek", "patison", "pasternak", "topinambur", "salsefi",
      "cykoria", "czosnek", "szczypior", "koper ", "kolendra", "bazylia",
      "mięta ", "lubczyk", "tymianek", "rozmaryn", "pieprz zielon",
      "kiełki", "włoszczyzna", "imbir ", "buraczk", "guacamole",
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
    label: "Napoje",
    emoji: "🥤",
    keywords: [
      "woda ", "wody ", "sok ", "soku ", "sokow", "napój", "napoje",
      "piwo", "wino ", "wina ", "win ", "kawa", "kawow", "herbata", "herbat",
      "lemoniada", "shake", "syrop", "syropu", "energetyk", "isotonic",
      "mineraln", "gazowany", "niegazowany",
      // Marki napojów
      "coca-cola", "coca cola", "fanta", "sprite", "sprit", "cappy",
      "kinley", "tymb ", "tymbark", "schweppes", "pepsi", "7up", "mirinda",
      "lipton", "nestea", "red bull", "monster ", "powerade", "gatorade",
      "rgb x24", "0,25 rgb", "butelka szk", "but szk", "drs ", "nektar ",
      "igrist", "szampan", "prosecco", "nalewka",
    ],
  },
  {
    id: "nabiał",
    label: "Nabiał / Jaja",
    emoji: "🥛",
    keywords: [
      "mleko", "mleka", "ser ", "sery", "serow", "jogurt", "jogurtu", "śmietan",
      "masło", "masła", "twaróg", "twarogu", "jajk", "jaja ", "jaj ", "kefir",
      "maślank", "śmietank", "ricotta", "mozzarella", "burrata", "feta",
      "camembert", "brie", "gouda", "edam", "parmezan", "grana padano",
      "halloumi", "cottage", "fromage", "nabiał",
    ],
  },
  {
    id: "ryby",
    label: "Ryby / Owoce morza",
    emoji: "🐟",
    keywords: [
      "łosoś", "łososia", "dorsz", "dorsza", "tuńczyk", "tuńczyka", "krewetk",
      "kalmar", "pstrąg", "pstrąga", "halibut", "mintaj", "ryba", "ryby", "rybna",
      "śledź", "śledzia", "makrela", "makreli", "krab", "homara", "ośmiornic",
      "małż", "ostryg", "anchois", "sardynk", "tilapia", "pangasius", "morszczuk",
      "flądra", "sandacz", "sum ", "karp", "lin ", "węgorz", "okoń", "szczupak",
    ],
  },
  {
    id: "pieczywo",
    label: "Pieczywo / Makarony",
    emoji: "🍞",
    keywords: [
      "chleb", "chleba", "bułk", "mąka", "mąki", "drożdż", "baguette", "croissant",
      "tortilla", "makaron", "makaronu", "ryż ", "ryżu", "kasza", "kaszy", "płatki",
      "biszkopt", "wafel", "wafle", "wafli", "suchar", "grissini", "ciabatta",
      "focaccia", "brioche", "pumpernikiel", "orkisz", "quinoa", "gryka", "bulgur",
      "kuskus", "semolinę", "amarant", "naleśnik", "pancake", "gnocchi", "vol-au-vent",
      "panierka", "frytki", "talarki ziemniacz", "dollar chips", "ciasto kataifi", "spód do quiche",
      "korpusy kruche", "soczewica", "nachos", "tortilla",
    ],
  },
  {
    id: "przyprawy",
    label: "Przyprawy / Sosy / Oleje",
    emoji: "🧂",
    keywords: [
      "sól ", "soli ", "pieprz", "pieprzu", "przyprawa", "przyprawy", "sos ",
      "sosu ", "sosów", "musztarda", "majonez", "ketchup", "keczup", "ocet",
      "oliwa", "olej", "oleju", "olejów", "tłuszcz", "smalec", "ghee",
      "curry", "kurkuma", "chilli", "chili", "kminek", "cynamon", "gałka",
      "anyż", "wanilia", "ziele", "piment", "liść laurow", "zioła prowans",
      "zioła doniczk", "chrzan", "wasabi", "kapary", "esencja", "peperonata",
      "kucharek", "vegeta", "chia", "miód", "żelatyna", "ocet balsamicz",
      "barszcz", "żur ", "primerba",
      "puree marakuj",
    ],
  },
];

function categorizeProduct(name: string): string {
  const n = name.toLowerCase().replace(/^#/, "").trim();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => n.includes(kw.toLowerCase()))) {
      return cat.id;
    }
  }
  return "inne";
}

// ─── Month helpers ────────────────────────────────────────────────────────────

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  const names = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  return `${names[parseInt(m) - 1]} ${year}`;
}
function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = [
  "hsl(173, 80%, 40%)",
  "hsl(200, 70%, 50%)",
  "hsl(220, 60%, 55%)",
  "hsl(250, 60%, 60%)",
  "hsl(280, 55%, 55%)",
];

// ─── Components ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SupplierCard({ supplier, rank }: {
  supplier: {
    supplierId: number;
    supplierName: string;
    totalSpend: number;
    invoiceCount: number;
    productCount: number;
    topProducts: Array<{ productName: string; unit: string; totalQuantity: number; avgPrice: number; totalCost: number }>;
  };
  rank: number;
}) {
  const [expanded, setExpanded] = useState(rank === 0);
  const topProducts = supplier.topProducts.slice(0, expanded ? 15 : 5);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
            style={{ background: COLORS[rank % COLORS.length] }}
          >
            {rank + 1}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{supplier.supplierName}</p>
            <p className="text-xs text-muted-foreground">
              {supplier.invoiceCount} {supplier.invoiceCount === 1 ? "faktura" : supplier.invoiceCount < 5 ? "faktury" : "faktur"} · {supplier.productCount} produktów
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-foreground">{formatPrice(supplier.totalSpend)}</p>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-6 py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
          <div>Produkt</div>
          <div className="text-right w-20">Ilość</div>
          <div className="text-right w-28">Śr. cena</div>
          <div className="text-right w-28">Łącznie</div>
        </div>
        <div className="divide-y divide-border">
          {topProducts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-6 py-2.5 items-center">
              <p className="text-sm text-foreground truncate pr-2">{p.productName}</p>
              <p className="text-sm text-muted-foreground text-right w-20">
                {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
              </p>
              <p className="text-sm text-foreground text-right w-28">{formatPrice(p.avgPrice)}/{p.unit}</p>
              <p className="text-sm font-semibold text-foreground text-right w-28">{formatPrice(p.totalCost)}</p>
            </div>
          ))}
        </div>
        {supplier.topProducts.length > 5 && (
          <button
            className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t border-border hover:bg-secondary/30 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Zwiń</> : <><ChevronDown className="w-3.5 h-3.5" />Pokaż wszystkie ({supplier.topProducts.length})</>}
          </button>
        )}
      </div>
    </div>
  );
}

type TopProduct = {
  productName: string;
  unit: string;
  totalQuantity: number;
  avgPrice: number;
  totalCost: number;
  supplierName?: string | null;
};

function TopProductsSection({ products }: { products: TopProduct[] }) {
  const [activeCategory, setActiveCategory] = useState("wszystkie");

  // Compute which categories actually have products
  const categorized = useMemo(() => {
    return products.map((p) => ({ ...p, category: categorizeProduct(p.productName) }));
  }, [products]);

  const presentCategories = useMemo(() => {
    const ids = new Set(categorized.map((p) => p.category));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [categorized]);

  const hasInne = categorized.some((p) => p.category === "inne");

  const displayProducts = useMemo(() => {
    if (activeCategory === "wszystkie") return categorized;
    return categorized.filter((p) => p.category === activeCategory);
  }, [categorized, activeCategory]);

  // Category spend totals for the active tab
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    categorized.forEach((p) => {
      totals[p.category] = (totals[p.category] || 0) + p.totalCost;
    });
    return totals;
  }, [categorized]);

  const totalAll = products.reduce((s, p) => s + p.totalCost, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Top produkty miesiąca</p>
        <span className="ml-auto text-xs text-muted-foreground">wg kosztu łącznego</span>
      </div>

      {/* Category tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-border flex items-center gap-1.5 flex-wrap">
        {/* All tab */}
        <button
          onClick={() => setActiveCategory("wszystkie")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            activeCategory === "wszystkie"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          Wszystkie
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full",
            activeCategory === "wszystkie" ? "bg-white/20" : "bg-muted"
          )}>
            {products.length}
          </span>
        </button>

        {presentCategories.map((cat) => {
          const count = categorized.filter((p) => p.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <span>{cat.emoji}</span>
              {cat.label}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full",
                activeCategory === cat.id ? "bg-white/20" : "bg-muted"
              )}>
                {count}
              </span>
            </button>
          );
        })}

        {hasInne && (
          <button
            onClick={() => setActiveCategory("inne")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activeCategory === "inne"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            Inne
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              activeCategory === "inne" ? "bg-white/20" : "bg-muted"
            )}>
              {categorized.filter((p) => p.category === "inne").length}
            </span>
          </button>
        )}

        {/* Active category spend */}
        {activeCategory !== "wszystkie" && (
          <span className="ml-auto text-xs text-muted-foreground">
            Wydano:{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(categoryTotals[activeCategory] ?? 0)}
            </span>
            <span className="text-muted-foreground ml-1">
              ({totalAll > 0 ? ((categoryTotals[activeCategory] ?? 0) / totalAll * 100).toFixed(1) : 0}% budżetu)
            </span>
          </span>
        )}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
        <div>Produkt</div>
        <div className="text-right w-32">Dostawca</div>
        <div className="text-right w-20">Ilość</div>
        <div className="text-right w-28">Śr. cena</div>
        <div className="text-right w-28">Łącznie</div>
      </div>

      {/* Rows */}
      {displayProducts.length > 0 ? (
        <div className="divide-y divide-border">
          {displayProducts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-3 items-center">
              <p className="text-sm font-medium text-foreground truncate pr-2">{p.productName}</p>
              <p className="text-xs text-muted-foreground text-right w-32 truncate">{p.supplierName ?? "—"}</p>
              <p className="text-sm text-muted-foreground text-right w-20">
                {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
              </p>
              <p className="text-sm text-foreground text-right w-28">{formatPrice(p.avgPrice)}/{p.unit}</p>
              <p className="text-sm font-bold text-foreground text-right w-28">{formatPrice(p.totalCost)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Brak produktów w tej kategorii w danym miesiącu.
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [month, setMonth] = useState(currentMonth());
  const isCurrentMonth = month === currentMonth();

  const { data, isLoading } = useGetMonthlyReport(
    { month },
    { query: { queryKey: ["reports-monthly", month] } }
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.suppliers
      .slice(0, 8)
      .map((s) => ({ name: s.supplierName.split(" ")[0], value: s.totalSpend, full: s.supplierName }));
  }, [data]);

  return (
    <Layout>
      <div className="px-8 py-8">
        <PageHeader
          title="Raporty"
          subtitle="Miesięczne podsumowanie zakupów i analiza dostawców"
          action={
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-1 py-1">
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setMonth(prevMonth(month))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-36 text-center px-2">{monthLabel(month)}</span>
              <Button
                variant="ghost" size="icon" className="w-8 h-8"
                onClick={() => setMonth(nextMonth(month))}
                disabled={isCurrentMonth}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          }
        />

        {/* Summary cards */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : data ? (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Łączne wydatki" value={formatPrice(data.totalSpend)} sub={`${data.invoiceCount} faktur`} icon={ShoppingCart} />
            <StatCard label="Śledzonych produktów" value={String(data.productCount)} sub="unikalnych pozycji" icon={Package} />
            <StatCard label="Liczba faktur" value={String(data.invoiceCount)} sub={`od ${data.suppliers.length} dostawców`} icon={FileText} />
          </div>
        ) : null}

        {/* Supplier spend chart */}
        {!isLoading && data && data.suppliers.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Wydatki wg dostawcy
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number, _, props) => [formatPrice(v), props.payload?.full]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top products with category tabs */}
        {!isLoading && data && data.topProducts.length > 0 && (
          <TopProductsSection products={data.topProducts} />
        )}

        {/* Per-supplier reports */}
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : data && data.suppliers.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">Raport per dostawca</p>
            {data.suppliers.map((supplier, i) => (
              <SupplierCard key={supplier.supplierId} supplier={supplier} rank={i} />
            ))}
          </div>
        ) : !isLoading ? (
          <div className="bg-card border border-border rounded-xl py-16 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Brak danych za {monthLabel(month)}</p>
            <p className="text-sm text-muted-foreground">Zaimportuj faktury z tego miesiąca, aby zobaczyć raport.</p>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
