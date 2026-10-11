import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetBenchmarks,
  useUpdateBenchmarkOptIn,
  useSubmitBenchmarkFeedback,
  getGetBenchmarksQueryKey,
  type BenchmarkItem,
  type BenchmarkSkipped,
  type BenchmarkFeedbackBodyReason,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ArrowRight, ShieldOff, Check, Trophy, ArrowLeftRight, HelpCircle, ChevronDown } from "@/lib/icons";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Link, useSearch } from "wouter";
import { BenchmarkInvoiceView } from "@/components/benchmark-invoice-view";
import { readViewerImport } from "@/lib/viewer-import";
import { track } from "@/lib/posthog";
import { CATEGORIES } from "@/lib/categories";
import { plural } from "@/lib/plural";

// Modal historii ceny ładowany leniwie — Twoi dostawcy i faktury źródłowe produktu.
const PriceHistoryModal = lazy(() => import("./products/price-history-modal").then((m) => ({ default: m.PriceHistoryModal })));

type SortMode = "delta_desc" | "delta_asc" | "az";

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

// ─── Formatowanie ────────────────────────────────────────────────────────────
const pctFmt = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/** „↑ 4,5%” / „↓ 3,0%” — kierunek niesie strzałka, liczba bez znaku. */
const arrowPct = (v: number) => `${v > 0 ? "↑" : v < 0 ? "↓" : ""} ${pctFmt.format(Math.abs(v))}%`.trim();
const qtyFmt = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 });


const UNIT_SHORT: Record<string, string> = { kg: "kg", l: "l", szt: "szt", opak: "opak", g: "g", ml: "ml" };
const unitShort = (u: string | null | undefined) => (u ? UNIT_SHORT[u] ?? u : "");

const MONTHS_NOM = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const MONTHS_LOC = ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrześniu", "październiku", "listopadzie", "grudniu"];
const MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const monthPart = (ym: string, names: string[]) => {
  const [y, m] = ym.split("-").map(Number);
  return m ? `${names[m - 1]} ${y}` : ym;
};

/** „opakowanie 200 g”, „opakowanie 10 kg”, „opakowanie 30 szt.” — z mnożnika ceny. */
function packLabel(factor: number, unit: string): string {
  const size = 1 / factor;
  if (unit === "kg") return size < 1 ? `${numFmt.format(size * 1000)} g` : `${numFmt.format(size)} kg`;
  if (unit === "l") return size < 1 ? `${numFmt.format(size * 1000)} ml` : `${numFmt.format(size)} l`;
  return `${numFmt.format(size)} szt.`;
}

const CONFIDENCE_CHIP: Record<string, { label: string; cls: string }> = {
  gtin: { label: "Dopasowanie pewne: kod GTIN", cls: "bg-positive/15 text-positive" },
  dictionary_pack: { label: "Dopasowanie: słownik + gramatura", cls: "bg-warning/15 text-warning" },
  dictionary: { label: "Dopasowanie: słownik", cls: "bg-warning/15 text-warning" },
  exact_name: { label: "Dopasowanie: ta sama nazwa", cls: "bg-secondary text-muted-foreground" },
};

function tierChip(tier: string | null | undefined, unit: string): string | null {
  const u = unit === "l" ? "l" : "kg";
  switch (tier) {
    case "luz": return "Na wagę";
    case "S": return `Opakowania do 1 ${u}`;
    case "M": return `Opakowania 1–5 ${u}`;
    case "L": return `Opakowania powyżej 5 ${u}`;
    case "szt": return "Cena za sztukę";
    default: return null;
  }
}

const SKIP_REASON: Record<string, string> = {
  dish: "danie gotowe, nie surowiec",
  processed: "przetwór lub produkt krojony",
  frozen: "mrożonka",
  plant_based: "zamiennik roślinny",
  non_food: "nie żywność",
};

const FEEDBACK_REASONS: Array<{ value: BenchmarkFeedbackBodyReason; label: (market: string) => string }> = [
  { value: "other_product", label: () => "To inny produkt (np. inny gatunek, w saszetkach, przetworzony)" },
  { value: "wrong_pack", label: () => "Źle przeliczona gramatura opakowania" },
  { value: "different_quality", label: () => "Inna jakość lub odmiana (premium, bio)" },
];

// ─── Pasek: środkowa połowa rynku, kreska mediany, kropka = Twoja cena ─────────
function PriceTrack({ p25, p75, median, yourPrice, over }: { p25: number | null; p75: number | null; median: number; yourPrice: number; over: boolean }) {
  const values = [median, yourPrice, ...(p25 != null ? [p25] : []), ...(p75 != null ? [p75] : [])];
  const lo = Math.min(...values) * 0.92;
  const hi = Math.max(...values) * 1.08;
  const span = hi - lo || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  return (
    <div className="mt-5">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {p25 != null && p75 != null && (
          <div className="absolute top-0.5 bottom-0.5 bg-secondary" style={{ left: `${pct(p25)}%`, width: `${Math.max(1, pct(p75) - pct(p25))}%` }} />
        )}
        <div className="absolute -top-0.5 w-0.5 h-4 bg-foreground" style={{ left: `${pct(median)}%` }} aria-label="mediana rynku" />
        <div
          className={cn("absolute top-1/2 w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2", over ? "bg-negative" : "bg-positive")}
          style={{ left: `${pct(yourPrice)}%` }}
          aria-label="Twoja cena"
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5 num">
        <span>{formatPrice(lo)}</span>
        <span>{formatPrice(hi)}</span>
      </div>
    </div>
  );
}

function Kpi({ label, children, foot }: { label: string; children: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className="bg-card p-4 md:p-5 flex flex-col">
      <p className="label-caps">{label}</p>
      <div className="mt-2">{children}</div>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{foot}</p>
    </div>
  );
}

function FeedbackForm({ item, onDone }: { item: BenchmarkItem; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<BenchmarkFeedbackBodyReason>("other_product");
  const submit = useSubmitBenchmarkFeedback();
  const market = item.marketLabel ?? item.productName;
  return (
    <div className="mt-4 border border-border p-4">
      <p className="text-sm font-semibold mb-3">Dlaczego to nie jest „{market}”?</p>
      <div className="space-y-2">
        {FEEDBACK_REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="radio" name={`fb-${item.productId}`} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-primary" />
            {r.label(market)}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap mt-4">
        <button
          type="button"
          disabled={submit.isPending || !item.variants?.length}
          onClick={() =>
            submit.mutate(
              { data: { variants: item.variants ?? [], reason, marketGroupKey: item.marketLabel ?? null } },
              {
                onSuccess: () => {
                  track("benchmark_feedback", { reason });
                  void queryClient.invalidateQueries({ queryKey: getGetBenchmarksQueryKey() });
                  onDone();
                },
              },
            )
          }
          className="text-sm font-semibold px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          Wyłącz z porównania
        </button>
        <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          Od razu znika z Twojego porównania. Zgłoszenia od kilku restauracji poprawiają dopasowanie dla wszystkich.
        </p>
      </div>
      {submit.isError && <p className="text-xs text-negative mt-2">Nie udało się zapisać zgłoszenia. Spróbuj ponownie.</p>}
    </div>
  );
}

function ItemSubtitle({ item }: { item: BenchmarkItem }) {
  const cat = item.category ? CATEGORY_LABEL[item.category] ?? item.category : null;
  if (!cat && !item.marketLabel) return null;
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      {cat}
      {cat && item.marketLabel ? " · " : ""}
      {item.marketLabel && (
        <>
          produkt rynkowy: <b className="text-foreground font-semibold">{item.marketLabel}</b>
        </>
      )}
      {item.packTier === "szt" && item.marketLabel ? " · cena za sztukę" : ""}
    </p>
  );
}

function InvoiceNames({ names }: { names: string[] | undefined }) {
  const [open, setOpen] = useState(false);
  if (!names || names.length < 2) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
        {names.length} {plural(names.length, ["nazwa", "nazwy", "nazw"])} z faktur <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {names.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

function yourPeriodCaption(scope: string | undefined, from: string | null | undefined): string {
  if (scope === "invoice") return "z tej faktury";
  if (scope === "latestMonth" && from) return `średnia ważona, ${monthPart(from, MONTHS_NOM)}`;
  return "średnia ważona, ost. 3 mies.";
}

function BenchmarkCard({ item, scope, yourFrom }: { item: BenchmarkItem; scope?: string; yourFrom?: string | null }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const unit = unitShort(item.unit);

  if (item.insufficientData) {
    return (
      <div className="border border-dashed border-border bg-background/40 p-4 md:p-5 grid gap-3 md:grid-cols-2" data-testid={`benchmark-row-${item.productName}`}>
        <div>
          <p className="font-semibold text-foreground">{item.productName}</p>
          <ItemSubtitle item={item} />
          <InvoiceNames names={item.invoiceNames} />
        </div>
        <p className="text-sm text-muted-foreground">
          {item.notComparableReason === "price_outlier"
            ? "Twoja cena różni się od rynku ponad 2,5× — to zwykle inne opakowanie (np. karton zamiast sztuki) albo inny produkt pod podobną nazwą. Nie liczymy tej pozycji do oszczędności."
            : `Za mało danych, by pokazać porównanie anonimowo. Pokażemy je, gdy ceny poda co najmniej ${item.minUsers ?? 5} innych restauracji.`}
        </p>
      </div>
    );
  }

  const median = item.medianPrice ?? 0;
  const delta = item.deltaPercent ?? 0;
  const over = delta > 0;
  const savings = item.savingsPerMonth ?? 0;
  const conf = item.matchConfidence ? CONFIDENCE_CHIP[item.matchConfidence] : null;
  const tier = tierChip(item.packTier, item.unit);
  const showConversion = item.priceFactor != null && item.priceFactor !== 1 && item.invoiceUnitPrice != null && item.invoiceUnit && item.invoiceUnit !== item.unit;
  const medianCaption =
    item.periodFallback === "R12"
      ? null
      : item.medianPeriod
        ? monthPart(item.medianPeriod, MONTHS_NOM)
        : "";

  return (
    <div className="bg-card border border-border" data-testid={`benchmark-row-${item.productName}`}>
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{item.productName}</p>
            <ItemSubtitle item={item} />
            <InvoiceNames names={item.invoiceNames} />
          </div>
          <span className={cn("text-sm font-semibold whitespace-nowrap num", over ? "text-negative" : "text-positive")}>
            {arrowPct(delta)} {over ? "powyżej" : "poniżej"} mediany
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {conf && <span className={cn("text-[11px] font-semibold px-2 py-0.5", conf.cls)}>{conf.label}</span>}
          {tier && <span className="text-[11px] font-semibold px-2 py-0.5 bg-warning/15 text-warning">{tier}</span>}
          {item.tierFallback && (
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-secondary text-muted-foreground">porównanie ze wszystkimi wielkościami opakowań</span>
          )}
        </div>

        {showConversion && (
          <p className="flex items-center gap-2 text-xs bg-secondary/60 px-3 py-2 mt-3">
            <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>
              Na fakturze <b className="num">{formatPrice(item.invoiceUnitPrice)} / {unitShort(item.invoiceUnit)}</b>{" "}
              {item.priceFactor! >= 1 ? `× ${numFmt.format(item.priceFactor!)}` : `÷ ${numFmt.format(1 / item.priceFactor!)}`} ({`opakowanie ${packLabel(item.priceFactor!, item.unit)}`}) ={" "}
              <b className="num">{formatPrice(item.yourPrice)} / {unit}</b>
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3 mt-4">
          <div>
            <p className="text-xs text-muted-foreground">Twoja cena</p>
            <p className="num-lg text-xl mt-0.5">{formatPrice(item.yourPrice)}/{unit}</p>
            <p className="text-xs text-muted-foreground">{yourPeriodCaption(scope, yourFrom)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mediana rynku</p>
            <p className="num-lg text-xl mt-0.5">{formatPrice(median)}/{unit}</p>
            {item.periodFallback === "R12" ? (
              <p className="text-xs text-warning">
                z 12 mies. — w {MONTHS_LOC[new Date().getMonth()]} za mało danych
              </p>
            ) : (
              <p className="text-xs text-muted-foreground num">
                {medianCaption}{item.sourceBucket ? ` · ${item.sourceBucket} restauracji` : ""}
              </p>
            )}
          </div>
          <div>
            {item.largerPackMedian != null ? (
              <>
                <p className="text-xs text-muted-foreground">Większe opakowania</p>
                <p className="num-lg text-xl mt-0.5">{formatPrice(item.largerPackMedian)}/{unit}</p>
                <p className="text-xs text-muted-foreground">mediana dla opakowań powyżej 5 {item.unit === "l" ? "l" : "kg"} — rozważ większe opakowanie</p>
              </>
            ) : item.p25Price != null && item.p75Price != null ? (
              <>
                <p className="text-xs text-muted-foreground">Środkowa połowa rynku</p>
                <p className="num-lg text-xl mt-0.5">{formatPrice(item.p25Price)}–{formatPrice(item.p75Price)}</p>
                <p className="text-xs text-muted-foreground">tyle płaci połowa restauracji</p>
              </>
            ) : null}
          </div>
        </div>

        <PriceTrack p25={item.p25Price ?? null} p75={item.p75Price ?? null} median={median} yourPrice={item.yourPrice} over={over} />
      </div>

      <div className="border-t border-dashed border-border px-4 md:px-5 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
          <span className="text-muted-foreground">
            {over && savings > 0 ? (
              <>
                Potencjalna oszczędność: <b className="text-foreground num">{formatPrice(savings)} / mies.</b>{" "}
                <span className="num">przy {qtyFmt.format(item.monthlyQuantity)} {unit} miesięcznie</span>
              </>
            ) : over ? (
              "Płacisz trochę więcej niż mediana."
            ) : (
              "Kupujesz taniej niż większość — trzymaj tego dostawcę."
            )}
          </span>
          <span className="flex items-center gap-4 flex-wrap">
            {item.productId != null && (
              <button
                type="button"
                onClick={() => { setHistoryOpen(true); track("benchmark_price_history_open"); }}
                className="text-primary font-medium inline-flex items-center gap-1 hover:underline"
              >
                Historia ceny i Twoi dostawcy <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {over && (
              <a href="/blog/jak-negocjowac-ceny-z-dostawcami" className="text-primary hover:underline">
                Jak negocjować cenę
              </a>
            )}
            <button
              type="button"
              onClick={() => setFeedbackOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary"
            >
              <HelpCircle className="w-3.5 h-3.5" /> To nie ten produkt
            </button>
          </span>
        </div>
        {feedbackOpen && <FeedbackForm item={item} onDone={() => setFeedbackOpen(false)} />}
      </div>

      {historyOpen && item.productId != null && (
        <Suspense fallback={null}>
          <PriceHistoryModal productId={item.productId} productName={item.productName} onClose={() => setHistoryOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function SkippedSection({ skipped }: { skipped: BenchmarkSkipped[] }) {
  const [all, setAll] = useState(false);
  if (skipped.length === 0) return null;
  const shown = all ? skipped : skipped.slice(0, 4);
  return (
    <section id="pominiete" className="bg-card border border-border p-4 md:p-5 mt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label-caps">Pominięte w porównaniu</p>
        {skipped.length > 4 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm font-semibold text-primary hover:underline">
            {all ? "Pokaż mniej" : `Pokaż wszystkie (${skipped.length})`}
          </button>
        )}
      </div>
      <p className="text-sm mt-1">Tych pozycji nie porównujemy z rynkiem, bo to inny produkt niż świeży odpowiednik.</p>
      <ul className="rule-list mt-3">
        {shown.map((s) => (
          <li key={`${s.name}__${s.reason}`} className="flex justify-between gap-4 py-2.5 text-sm">
            <span>{s.name}</span>
            <span className="text-muted-foreground text-right">{SKIP_REASON[s.reason] ?? s.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Methodology() {
  return (
    <ul className="text-xs text-background/75 leading-relaxed mt-3 space-y-1 list-disc pl-4">
      <li>Medianę liczymy z cen INNYCH restauracji — Twoja cena nigdy do niej nie wchodzi.</li>
      <li>Wynik pokazujemy, gdy ceny podało co najmniej 5 innych restauracji (w tym 2 z fakturami z KSeF); środkową połowę rynku — od 8.</li>
      <li>Każda restauracja to jeden głos: jedna cena na lokal, średnia ważona ilością, niezależnie od liczby dostawców.</li>
      <li>Ceny za opakowanie przeliczamy na kilogram, litr albo sztukę z gramatury w nazwie i porównujemy w podobnych wielkościach opakowań.</li>
      <li>Medianę i przedział zaokrąglamy do 10 gr, a liczbę restauracji pokazujemy w przedziałach (5–9, 10–19, 20+).</li>
      <li>Ceny netto, bez korekt i rozliczeń zaliczek. Porównanie z tego samego miesiąca, a gdy danych za mało — z ostatnich 12 miesięcy (podpisane).</li>
    </ul>
  );
}

function updatedCaption(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return ` · aktualne na ${d.toLocaleDateString("pl-PL")}, ${d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function Benchmark() {
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<SortMode>("delta_desc");
  const [showInsufficient, setShowInsufficient] = useState(true);
  const [methodOpen, setMethodOpen] = useState(false);

  // ?z=podglad&inv=ID — wejście z powitania po imporcie faktury z podglądu XML.
  const search = useSearch();
  const params = new URLSearchParams(search);
  const invParam = Number(params.get("inv"));
  const invoiceId = Number.isInteger(invParam) && invParam > 0 ? invParam : null;
  const fromViewer = params.get("z") === "podglad";
  const [scope, setScope] = useState<"invoice" | "all">(invoiceId ? "invoice" : "all");
  const invoiceScope = scope === "invoice" && invoiceId != null;
  const viewerImport = fromViewer ? readViewerImport() : null;

  const { data, isLoading, isError } = useGetBenchmarks(invoiceScope ? { invoiceId: invoiceId! } : {});

  const [viewTracked, setViewTracked] = useState(false);
  useEffect(() => {
    if (viewTracked || !data) return;
    setViewTracked(true);
    track("benchmark_view", { from: fromViewer ? "podglad" : "menu", matched_count: data.items.filter((i) => !i.insufficientData).length });
  }, [data, fromViewer, viewTracked]);
  const updateOptIn = useUpdateBenchmarkOptIn();

  function setOptIn(optedIn: boolean) {
    updateOptIn.mutate({ data: { optedIn } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBenchmarksQueryKey({}) }) });
  }

  const items = data?.items ?? [];
  const skipped = data?.skipped ?? [];
  const sorted = useMemo(() => {
    const rows = showInsufficient ? items : items.filter((i) => !i.insufficientData);
    return [...rows].sort((a, b) => {
      // Porównane zawsze przed „za mało danych”.
      if (a.insufficientData !== b.insufficientData) return a.insufficientData ? 1 : -1;
      if (sort === "az") return a.productName.localeCompare(b.productName, "pl");
      const da = a.deltaPercent ?? 0;
      const db = b.deltaPercent ?? 0;
      return sort === "delta_desc" ? db - da : da - db;
    });
  }, [items, showInsufficient, sort]);

  const summary = data?.summary ?? null;
  const optedIn = data?.optedIn ?? true;
  const contribution = summary?.contributionBucket === "<5" ? "mniej niż 5" : summary?.contributionBucket ?? "";

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-5xl">
        {viewerImport && invoiceId === viewerImport.invoiceId && (
          <div className="flex items-start gap-3 border border-positive/30 bg-positive/10 px-4 py-3 mb-5 text-sm">
            <Check className="w-4 h-4 shrink-0 mt-0.5 text-positive" />
            <p className="flex-1">
              <b>Faktura {viewerImport.invoiceNumber} {viewerImport.duplicate ? "jest już na Twoim koncie" : "zaimportowana"}.</b>{" "}
              {viewerImport.itemsCount} pozycji od {viewerImport.supplierName}. Poniżej porównanie z medianą cen innych restauracji
              {data?.yourPricePeriodFrom ? ` z ${monthPart(data.yourPricePeriodFrom, MONTHS_GEN)}` : ""}.
            </p>
            <Link href="/invoices"><span className="text-primary font-semibold cursor-pointer whitespace-nowrap">Zobacz fakturę</span></Link>
          </div>
        )}

        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <p className="label-caps text-muted-foreground" data-testid="benchmark-period">
              Ceny netto · porównanie z tego samego miesiąca{updatedCaption(summary?.computedAt)}
            </p>
            <h1 className="head-display text-3xl md:text-4xl mt-1">Twoje ceny na tle rynku</h1>
          </div>
          {invoiceId != null && (
            <div className="flex border border-border text-sm" role="group" aria-label="Zakres porównania">
              <button className={cn("px-3.5 py-2", invoiceScope ? "bg-foreground text-background" : "bg-card")} onClick={() => setScope("invoice")}>Z tej faktury</button>
              <button className={cn("px-3.5 py-2", !invoiceScope ? "bg-foreground text-background" : "bg-card")} onClick={() => setScope("all")}>Wszystkie produkty</button>
            </div>
          )}
        </div>

        {invoiceScope && !isLoading && !isError && data?.optedIn !== false ? (
          <BenchmarkInvoiceView items={data?.items ?? []} />
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : isError ? (
          <div className="bg-card border border-border p-6 text-center text-sm text-destructive">Nie udało się załadować porównania cen.</div>
        ) : !optedIn ? (
          <div className="bg-card border border-border p-8 text-center">
            <ShieldOff className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Porównanie cen jest wyłączone</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Wyłączyłeś udział w porównaniu — Twoje ceny nie zasilają statystyk innych restauracji i Ty też nie widzisz ich mediany.
              Możesz to zmienić w każdej chwili.
            </p>
            <button onClick={() => setOptIn(true)} disabled={updateOptIn.isPending} className="text-sm font-medium px-4 py-2 bg-primary text-primary-foreground hover:opacity-90">
              Włącz porównanie cen
            </button>
          </div>
        ) : items.length === 0 && skipped.length === 0 ? (
          <div className="bg-card border border-border p-8 text-center">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Jeszcze brak danych</p>
            <p className="text-sm text-muted-foreground">Zaimportuj fakturę albo podłącz KSeF — porównanie policzy się dla produktów z Twoich faktur zakupowych.</p>
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border mb-5">
                <Kpi label="Potencjał oszczędności" foot="tylko z pewnych dopasowań i tej samej wielkości opakowań">
                  <p className="num-lg text-3xl text-negative">
                    {formatPrice(summary.savingsPotentialTotal)}<span className="text-sm font-medium text-muted-foreground"> / mies.</span>
                  </p>
                </Kpi>
                <Kpi label="Względem mediany" foot="średnio, ważone tym, ile kupujesz">
                  <p className={cn("num-lg text-3xl", summary.avgDeltaPercent > 0 ? "text-foreground" : "text-positive")}>{arrowPct(summary.avgDeltaPercent)}</p>
                </Kpi>
                <Kpi
                  label="Produkty z porównaniem"
                  foot={
                    summary.skippedCount > 0 ? (
                      <>
                        {summary.skippedCount} {plural(summary.skippedCount, ["pominięty", "pominięte", "pominiętych"])} jako przetwory lub dania gotowe —{" "}
                        <a href="#pominiete" className="text-primary hover:underline">zobacz listę</a>
                      </>
                    ) : (
                      "reszta: za mało danych rynkowych"
                    )
                  }
                >
                  <p className="num-lg text-3xl">
                    {summary.benchmarkedCount}<span className="text-base font-medium text-muted-foreground"> / {summary.totalCount + summary.skippedCount}</span>
                  </p>
                </Kpi>
                <Kpi label="Twój wkład w dane" foot="restauracji korzysta z Twoich anonimowych cen">
                  <p className="num-lg text-3xl">{contribution}</p>
                </Kpi>
              </div>
            )}

            <div className="bg-foreground text-background p-4 md:p-5 mb-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
                <div className="flex-1">
                  <p className="font-semibold text-sm mb-1">Jak liczymy, żeby nikt nie poznał Twoich cen</p>
                  <p className="text-sm text-background/80 leading-relaxed">
                    Twoja cena nigdy nie wchodzi do mediany, którą widzisz. Pokazujemy wynik dopiero, gdy ceny podało co najmniej 5 innych
                    restauracji, medianę zaokrąglamy do 10 gr, a liczbę restauracji pokazujemy w przedziałach.{" "}
                    <button type="button" onClick={() => setMethodOpen((v) => !v)} className="text-primary hover:underline">
                      {methodOpen ? "Zwiń metodologię" : "Pełna metodologia"}
                    </button>
                  </p>
                  {methodOpen && <Methodology />}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={optedIn} onCheckedChange={setOptIn} disabled={updateOptIn.isPending} aria-label="Udział w porównaniu cen" />
                Udział w anonimowym porównaniu
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={showInsufficient} onChange={(e) => setShowInsufficient(e.target.checked)} className="accent-primary" />
                  Pokaż też bez wystarczających danych
                </label>
                <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                  <SelectTrigger className="h-8 text-xs w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delta_desc">Przepłacasz najwięcej</SelectItem>
                    <SelectItem value="delta_asc">Oszczędzasz najwięcej</SelectItem>
                    <SelectItem value="az">Alfabetycznie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4" data-testid="benchmark-rows">
              {sorted.map((item) => (
                <BenchmarkCard key={`${item.productName}__${item.unit}__${item.packTier ?? ""}`} item={item} scope={data?.scope} yourFrom={data?.yourPricePeriodFrom} />
              ))}
              {sorted.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">Brak produktów z porównaniem.</div>}
            </div>

            <SkippedSection skipped={skipped} />
          </>
        )}
      </div>
    </Layout>
  );
}
