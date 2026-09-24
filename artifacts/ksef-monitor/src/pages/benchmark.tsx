import { useMemo, useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useGetBenchmarks, useUpdateBenchmarkOptIn, getGetBenchmarksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Users,
  TrendingUp,
  TrendingDown,
  Percent,
  Trophy,
  ArrowRight,
  ShieldOff,
} from "@/lib/icons";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { CATEGORIES } from "@/lib/categories";
import type { BenchmarkItem } from "@workspace/api-client-react";

type SortMode = "delta_desc" | "delta_asc" | "az";

// Ładna etykieta pod nazwą produktu w wierszu (np. "miesa" -> "Mięsa") —
// kategorie kanoniczne z lib/category-rules; własne kategorie usera nie mają
// wpisu, wtedy zostaje surowe id.
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

// Kilka grubych koszyków do filtrowania — dużo mniej chipów niż 17 kategorii
// systemowych, z których większość i tak ma "za mało danych" przy małej bazie
// userów. Nie zmienia kategorii zapisanej w bazie, tylko grupuje ją na potrzeby
// tego jednego filtra. Nieznana/własna kategoria user'a -> "Inne".
const COARSE_CATEGORY_GROUPS: Record<string, string> = {
  warzywa: "Warzywa i owoce",
  miesa: "Mięso i ryby",
  ryby: "Mięso i ryby",
  nabiał: "Nabiał",
  sery: "Nabiał",
  pieczywo: "Pieczywo i słodycze",
  slodycze: "Pieczywo i słodycze",
  napoje: "Napoje",
  alkohole: "Napoje",
  mrozonki: "Spożywcze inne",
  konserwy: "Spożywcze inne",
  przyprawy: "Spożywcze inne",
  orzechy: "Spożywcze inne",
  techniczne: "Zaopatrzenie",
  srodki_czystosci: "Zaopatrzenie",
  opakowania: "Zaopatrzenie",
  sprzet: "Zaopatrzenie",
};

function coarseCategory(raw: string | null | undefined): string {
  if (!raw) return "Inne";
  return COARSE_CATEGORY_GROUPS[raw] ?? "Inne";
}

// ─── Mini sparkline (mediana rynkowa, 6 mies.) — lokalny, jak w dashboard.tsx ──
function TrendSparkline({ points }: { points: Array<{ month: string; median: number }> }) {
  const values = points.map((p) => p.median).filter((v) => isFinite(v));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 64, H = 22;
  const xs = values.map((_, i) => (i / (values.length - 1)) * W);
  const ys = values.map((v) => H - ((v - min) / range) * H);
  const path = values.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const rising = values[values.length - 1]! > values[0]!;
  // Semantyka kosztowa: rosnąca mediana rynkowa = terakota, spadająca = oliwka.
  const color = rising ? "hsl(var(--negative))" : "hsl(var(--positive))";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <path d={path} stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Pasek zakresu 25–75 percentyl + mediana + Twoja cena, skalowany per wiersz ──
function PriceTrack({ p25, p75, median, yourPrice }: { p25: number | null; p75: number | null; median: number; yourPrice: number }) {
  const lo = p25 ?? median * 0.85;
  const hi = p75 ?? median * 1.15;
  const domainMin = Math.min(lo, yourPrice) * 0.9;
  const domainMax = Math.max(hi, yourPrice) * 1.1;
  const span = domainMax - domainMin || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - domainMin) / span) * 100));

  const over = yourPrice > median;

  return (
    <div className="relative h-2 rounded-full bg-secondary my-3.5 mx-1">
      <div
        className="absolute top-0 bottom-0 rounded-full bg-muted-foreground/25"
        style={{ left: `${pct(lo)}%`, width: `${Math.max(2, pct(hi) - pct(lo))}%` }}
      />
      <div className="absolute -top-1 w-0.5 h-4 rounded-sm bg-foreground/40" style={{ left: `${pct(median)}%` }} />
      <div
        className={cn(
          "absolute -top-1.5 w-4 h-4 rounded-full bg-card border-[3px] shadow-sm -translate-x-1/2",
          over ? "border-negative" : "border-positive",
        )}
        style={{ left: `${pct(yourPrice)}%` }}
      />
    </div>
  );
}

function StatTile({ label, value, valueClass, foot }: { label: string; value: string; valueClass?: string; foot: string }) {
  return (
    <div className="bg-card p-4 flex flex-col">
      <p className="label-caps min-h-[2rem]">{label}</p>
      <p className={cn("num-lg text-2xl mt-2", valueClass ?? "text-foreground")}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1.5">{foot}</p>
    </div>
  );
}

function BenchmarkRow({ item }: { item: BenchmarkItem }) {
  if (item.insufficientData) {
    return (
      <div className="bg-card border border-border p-4 opacity-60" data-testid={`benchmark-row-${item.productName}`}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <span className="font-medium text-sm text-foreground">{item.productName}</span>{" "}
            <span className="text-muted-foreground text-xs">/ {item.unit}</span>
            {item.category && <span className="label-caps block mt-0.5">{CATEGORY_LABEL[item.category] ?? item.category}</span>}
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground whitespace-nowrap">
            brak benchmarku
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 border border-dashed border-border rounded-md px-3 py-2 inline-flex items-center gap-1.5">
          Za mało danych, by pokazać benchmark anonimowo — potrzeba min. {item.minUsers} restauracji w danych
          (obecnie: {item.distinctUserCount ?? 0}).
        </p>
      </div>
    );
  }

  const median = item.medianPrice ?? 0;
  const delta = item.deltaPercent ?? 0;
  const over = delta > 0;
  const savings = item.savingsPerMonth ?? 0;

  return (
    <div className="bg-card border border-border p-4" data-testid={`benchmark-row-${item.productName}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <span className="font-medium text-sm text-foreground">{item.productName}</span>{" "}
          <span className="text-muted-foreground text-xs">/ {item.unit}</span>
          {item.category && <span className="label-caps block mt-0.5">{CATEGORY_LABEL[item.category] ?? item.category}</span>}
        </div>
        <span
          className={cn(
            "text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1",
            over ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive",
          )}
        >
          {over ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {formatPercent(Math.abs(delta))} {over ? "powyżej" : "poniżej"} mediany
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Twoja cena: <b className="text-foreground num">{formatPrice(item.yourPrice)}</b></span>
            <span>Mediana: <b className="text-foreground num">{formatPrice(median)}</b></span>
          </div>
          <PriceTrack p25={item.p25Price ?? null} p75={item.p75Price ?? null} median={median} yourPrice={item.yourPrice} />
        </div>
        {item.history && item.history.length > 1 && (
          <div className="shrink-0 text-center">
            <TrendSparkline points={item.history} />
            <p className="text-[10px] text-muted-foreground mt-0.5">rynek, {item.history.length} mies.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-2.5 border-t border-dashed border-border text-xs text-muted-foreground">
        <span className="num">{item.distinctUserCount} restauracji w danych</span>
        {over && savings > 0 ? (
          <span>
            Potencjalna oszczędność: <b className="num text-negative">{formatPrice(savings)}/mies.</b>{" "}
            <Link href="/reports" className="text-primary font-medium inline-flex items-center gap-0.5 hover:underline">
              zobacz tańszych dostawców <ArrowRight className="w-3 h-3" />
            </Link>
          </span>
        ) : item.p25Price != null && item.p75Price != null ? (
          <span>Zakres: {formatPrice(item.p25Price)}–{formatPrice(item.p75Price)}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function Benchmark() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("delta_desc");
  const [showInsufficient, setShowInsufficient] = useState(false);

  const { data, isLoading, isError } = useGetBenchmarks({});
  const updateOptIn = useUpdateBenchmarkOptIn();

  function setOptIn(optedIn: boolean) {
    updateOptIn.mutate(
      { data: { optedIn } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBenchmarksQueryKey({}) }) },
    );
  }

  const items = data?.items ?? [];

  // Respektuje przełącznik "pokaż też bez wystarczających danych" — inaczej chip
  // "Wszystkie (N)" liczył WSZYSTKIE Twoje produkty z ostatnich 3 mies. (setki),
  // podczas gdy lista pod spodem domyślnie pokazywała tylko te z benchmarkiem.
  const visibleItems = useMemo(
    () => (showInsufficient ? items : items.filter((i) => !i.insufficientData)),
    [items, showInsufficient],
  );

  const categories = useMemo(() => {
    const byCat = new Map<string, { total: number; deltaSum: number; deltaCount: number }>();
    for (const i of visibleItems) {
      const cat = coarseCategory(i.category);
      const entry = byCat.get(cat) ?? { total: 0, deltaSum: 0, deltaCount: 0 };
      entry.total++;
      if (!i.insufficientData && i.deltaPercent != null) {
        entry.deltaSum += i.deltaPercent;
        entry.deltaCount++;
      }
      byCat.set(cat, entry);
    }
    return [...byCat.entries()]
      .map(([category, v]) => ({
        category,
        total: v.total,
        avgDelta: v.deltaCount > 0 ? v.deltaSum / v.deltaCount : null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [visibleItems]);

  const filtered = useMemo(() => {
    const rows = categoryFilter === "all" ? visibleItems : visibleItems.filter((i) => coarseCategory(i.category) === categoryFilter);
    const sorted = [...rows].sort((a, b) => {
      if (sort === "az") return a.productName.localeCompare(b.productName, "pl");
      const da = a.insufficientData ? -Infinity : a.deltaPercent ?? 0;
      const db = b.insufficientData ? -Infinity : b.deltaPercent ?? 0;
      return sort === "delta_desc" ? db - da : da - db;
    });
    return sorted;
  }, [visibleItems, categoryFilter, sort]);

  const summary = data?.summary ?? null;
  const optedIn = data?.optedIn ?? true;

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-4xl">
        <PageHeader
          title="Benchmark rynkowy"
          subtitle="Twoje ceny na tle anonimowej mediany rynkowej — bez pokazywania danych innej restauracji czy dostawcy"
        />

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <div className="bg-card border border-border p-6 text-center text-sm text-destructive">
            Nie udało się załadować benchmarku rynkowego.
          </div>
        ) : !optedIn ? (
          <div className="bg-card border border-border p-8 text-center">
            <ShieldOff className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Benchmark rynkowy jest wyłączony</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Wyłączyłeś udział w benchmarku — Twoje ceny nie zasilają statystyk innych restauracji i Ty też nie
              widzisz ich mediany. Możesz to zmienić w każdej chwili.
            </p>
            <button
              onClick={() => setOptIn(true)}
              disabled={updateOptIn.isPending}
              className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Włącz benchmark rynkowy
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-border p-8 text-center">
            <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Jeszcze brak danych</p>
            <p className="text-sm text-muted-foreground">
              Zaimportuj więcej faktur — benchmark policzy się dla produktów kupowanych w ostatnich 3 miesiącach.
            </p>
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-4">
                <StatTile
                  label="Potencjał oszczędności / mies."
                  value={formatPrice(summary.savingsPotentialTotal)}
                  valueClass="text-negative"
                  foot="gdybyś płacił medianę za produkty powyżej rynku"
                />
                <StatTile
                  label="Vs. rynek (średnio)"
                  value={formatPercent(summary.avgDeltaPercent)}
                  valueClass={summary.avgDeltaPercent > 0 ? "text-negative" : "text-positive"}
                  foot={summary.avgDeltaPercent > 0 ? "płacisz więcej niż mediana" : "płacisz mniej niż mediana"}
                />
                <StatTile
                  label="Produkty z benchmarkiem"
                  value={`${summary.benchmarkedCount} / ${summary.totalCount}`}
                  foot="reszta: za mało danych rynkowych"
                />
                <StatTile
                  label="Twój wkład w dane"
                  value={String(summary.contributionCount)}
                  foot="restauracji korzysta też z Twoich (anonimowych) cen"
                />
              </div>
            )}

            <div className="flex items-start gap-3 bg-foreground text-background rounded-md p-4 mb-4">
              <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-positive" />
              <div>
                <p className="font-semibold text-sm mb-1">Pełna anonimowość — z założenia, nie jako opcja</p>
                <p className="text-xs text-background/70 leading-relaxed">
                  Widzisz wyłącznie medianę i zakres rynkowy (25–75 percentyl), nigdy cenę konkretnego dostawcy ani
                  restauracji. Benchmark liczy się dopiero przy min. 5 różnych restauracjach w danych — poniżej progu
                  widzisz „za mało danych", nie przybliżoną wartość.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-positive/10 border border-positive/20 rounded-md px-4 py-3 mb-5 text-sm">
              <Users className="w-4 h-4 shrink-0 text-positive" />
              <span className="flex-1 text-foreground">
                <b>Twoje ceny anonimowo zasilają benchmark dla {summary?.contributionCount ?? 0} innych restauracji</b> —
                dokładnie tak, jak ich ceny zasilają Twój.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">Udział</span>
                <Switch checked={optedIn} onCheckedChange={setOptIn} disabled={updateOptIn.isPending} aria-label="Udział w benchmarku rynkowym" />
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
                    categoryFilter === "all" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:bg-secondary/70",
                  )}
                >
                  Wszystkie <span className="opacity-70">({visibleItems.length})</span>
                </button>
                {categories.map((c) => (
                  <button
                    key={c.category}
                    onClick={() => setCategoryFilter(c.category)}
                    className={cn(
                      "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
                      categoryFilter === c.category ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:bg-secondary/70",
                    )}
                  >
                    {c.category}{" "}
                    <span className="opacity-70 num">{c.avgDelta != null ? formatPercent(c.avgDelta) : "brak"}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={showInsufficient}
                    onChange={(e) => setShowInsufficient(e.target.checked)}
                    className="accent-primary"
                  />
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

            <div className="space-y-2.5" data-testid="benchmark-rows">
              {filtered.length > 0 ? (
                filtered.map((item) => <BenchmarkRow key={`${item.productName}__${item.unit}`} item={item} />)
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Brak produktów w tej kategorii.
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 mt-5 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/25" /> zakres rynkowy (25–75 percentyl)</span>
              <span className="flex items-center gap-1.5"><span className="w-0.5 h-2.5 bg-foreground/40" /> mediana rynkowa</span>
              <span className="flex items-center gap-1.5"><Percent className="w-3 h-3" /> Twoja cena</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
