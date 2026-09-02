import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useClerk } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, Search, ShoppingBag, Download, Loader2 } from "@/lib/icons";

// Wykres pojedynczej pozycji ładowany leniwie — ciągnie recharts, który nie ma
// czego szukać w głównym chunku strony z tabelą.
const SalesTrendModal = lazy(() => import("./sprzedaz/sales-trend-modal").then((m) => ({ default: m.SalesTrendModal })));

type SalesItem = {
  productName: string;
  qty: number;
  netValue: number;
  prevQty: number | null;
  prevNet: number | null;
  qtyChangePct: number | null;
  netChangePct: number | null;
};
type SalesResponse = {
  from: string;
  to: string;
  totalQty: number;
  totalNet: number;
  prevTotalQty: number;
  prevTotalNet: number;
  totalQtyChangePct: number | null;
  totalNetChangePct: number | null;
  items: SalesItem[];
};

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
function monthLabel(m: string): string { const [y, mm] = m.split("-").map(Number); return `${MONTHS[mm - 1]} ${y}`; }
function shiftMonth(m: string, d: number): string { const [y, mm] = m.split("-").map(Number); const dt = new Date(Date.UTC(y, mm - 1 + d, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; }
function currentMonth(): string { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; }
const fmtQty = (v: number) => new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(v);

// Sprzedaż to przychód: wzrost jest dobry. Odwrotnie niż przy kosztach, gdzie
// terakota oznacza „drożej" — dlatego tu rosnąca strzałka jest oliwkowa.
function tone(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  return pct > 0 ? "text-positive" : pct < 0 ? "text-negative" : "text-muted-foreground";
}

type SortKey = "productName" | "qty" | "prevQty" | "qtyChangePct" | "netValue" | "prevNet" | "netChangePct";
type SortDir = "asc" | "desc";
type Sort = { key: SortKey; dir: SortDir };

// Domyslny kierunek per kolumna: nazwy czyta sie od A, liczby ogląda od
// najwiekszej. Inaczej pierwszy klik w „Sprzedano" pokazywalby same zera.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  productName: "asc",
  qty: "desc",
  prevQty: "desc",
  qtyChangePct: "desc",
  netValue: "desc",
  prevNet: "desc",
  netChangePct: "desc",
};

function compareItems(a: SalesItem, b: SalesItem, sort: Sort): number {
  const mul = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "productName") {
    // localeCompare z "pl" — inaczej Ł ląduje za Z, a ą za z.
    return a.productName.localeCompare(b.productName, "pl") * mul;
  }
  const av = a[sort.key];
  const bv = b[sort.key];
  // Puste ("nowa pozycja", brak poprzedniego miesiąca) ZAWSZE na końcu,
  // niezależnie od kierunku — inaczej odwrócenie sortowania wypycha na górę
  // wiersze bez danych i chowa te, po które użytkownik kliknął.
  if (av == null || bv == null) {
    if (av == null && bv == null) return 0;
    return av == null ? 1 : -1;
  }
  return (av - bv) * mul;
}

function SortHeader({ label, sortKey, sort, onSort, align = "right", className }: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "left" ? "text-left" : "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sortuj wg: ${label}`}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active
          ? (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
      </button>
    </th>
  );
}

function ChangeCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">nowa</span>;
  const up = pct > 0;
  return (
    <span className={cn("inline-flex items-center justify-end gap-0.5", tone(pct))}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function Sprzedaz() {
  const { session } = useClerk();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [trendItem, setTrendItem] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "netValue", dir: "desc" });

  // Ten sam nagłówek drugi raz = odwrócenie kierunku. Inny nagłówek = jego
  // własny domyślny kierunek.
  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const token = await session?.getToken();
      const res = await fetch(apiUrl(`/api/sales?month=${month}`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const json = res.ok ? ((await res.json()) as SalesResponse) : null;
      if (!cancelled) { setData(json); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [month, session]);

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((i) => i.productName.toLowerCase().includes(q)) : list;
    return [...filtered].sort((a, b) => compareItems(a, b, sort));
  }, [data, search, sort]);

  const empty = !loading && (!data || data.items.length === 0);

  // Endpoint binarny — poza Orvalem, jak eksport raportów zakupowych.
  async function exportXlsx() {
    setExporting(true);
    try {
      const token = await session?.getToken();
      const res = await fetch(apiUrl(`/api/sales.xlsx?month=${month}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("Pusty plik z serwera");
      const fname = `sprzedaz-${month}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Pobrano zestawienie sprzedaży", description: fname });
    } catch (err) {
      console.error("Eksport Excel nie powiódł się:", err);
      toast({
        variant: "destructive",
        title: "Nie udało się pobrać pliku Excel",
        description: err instanceof Error ? err.message : "Nieznany błąd",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <div className="flex-1 min-w-0">
            <PageHeader title="Sprzedaż" />
            <p className="text-xs text-muted-foreground mt-0.5">Ile czego sprzedano i za ile — z GoPOS, z porównaniem do poprzedniego miesiąca.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={exportXlsx} disabled={exporting || empty} className="gap-1.5">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Excel
            </Button>
            <div className="flex items-center gap-1">
              <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-lg border border-border hover:bg-secondary/50" aria-label="Poprzedni miesiąc"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium px-2 min-w-[120px] text-center capitalize">{monthLabel(month)}</span>
              <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()} className="p-1.5 rounded-lg border border-border hover:bg-secondary/50 disabled:opacity-40" aria-label="Następny miesiąc"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : empty ? (
          <div className="glass py-20 text-center px-4">
            <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Brak danych sprzedaży za {monthLabel(month)}</p>
            <p className="text-sm text-muted-foreground">Podłącz i zsynchronizuj GoPOS w ustawieniach integracji.</p>
          </div>
        ) : (
          <div className="glass overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-4 flex-wrap">
                <div><span className="text-xs text-muted-foreground">Pozycji</span> <span className="text-sm font-semibold">{data!.items.length}</span></div>
                <div>
                  <span className="text-xs text-muted-foreground">Sprzedano</span>{" "}
                  <span className="text-sm font-semibold tabular-nums">{fmtQty(data!.totalQty)}</span>
                  {data!.totalQtyChangePct != null && (
                    <span className={cn("text-xs ml-1 tabular-nums", tone(data!.totalQtyChangePct))}>
                      ({data!.totalQtyChangePct > 0 ? "+" : ""}{data!.totalQtyChangePct.toFixed(0)}%)
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Wartość netto</span>{" "}
                  <span className="text-sm font-semibold tabular-nums">{formatPrice(data!.totalNet)}</span>
                  {data!.totalNetChangePct != null && (
                    <span className={cn("text-xs ml-1 tabular-nums", tone(data!.totalNetChangePct))}>
                      ({data!.totalNetChangePct > 0 ? "+" : ""}{data!.totalNetChangePct.toFixed(0)}%)
                    </span>
                  )}
                </div>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj pozycji…" className="pl-8 h-8 w-44 text-sm" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] tabular-nums">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-secondary/30">
                    <SortHeader label="Pozycja" sortKey="productName" sort={sort} onSort={toggleSort} align="left" className="px-5 py-2" />
                    <SortHeader label="Sprzedano" sortKey="qty" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortHeader label="Poprz. mies." sortKey="prevQty" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortHeader label="Zmiana" sortKey="qtyChangePct" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortHeader label="Wartość netto" sortKey="netValue" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortHeader label="Poprz. mies." sortKey="prevNet" sort={sort} onSort={toggleSort} className="px-3 py-2" />
                    <SortHeader label="Zmiana" sortKey="netChangePct" sort={sort} onSort={toggleSort} className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it, i) => (
                    <tr
                      key={i}
                      onClick={() => setTrendItem(it.productName)}
                      className="cursor-pointer hover:bg-secondary/30 transition-colors"
                      title="Pokaż sprzedaż miesiąc po miesiącu"
                    >
                      <td className="px-5 py-2.5 max-w-[280px]"><span className="text-sm text-foreground truncate block">{it.productName}</span></td>
                      <td className="text-right px-3 py-2.5 text-sm font-medium text-foreground">{fmtQty(it.qty)}</td>
                      <td className="text-right px-3 py-2.5 text-xs text-muted-foreground">{it.prevQty != null ? fmtQty(it.prevQty) : "—"}</td>
                      <td className="text-right px-3 py-2.5 text-xs font-medium"><ChangeCell pct={it.qtyChangePct} /></td>
                      <td className="text-right px-3 py-2.5 text-sm font-semibold text-foreground">{formatPrice(it.netValue)}</td>
                      <td className="text-right px-3 py-2.5 text-xs text-muted-foreground">{it.prevNet != null ? formatPrice(it.prevNet) : "—"}</td>
                      <td className="text-right px-5 py-2.5 text-xs font-medium"><ChangeCell pct={it.netChangePct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {trendItem && (
        <Suspense fallback={null}>
          <SalesTrendModal productName={trendItem} onClose={() => setTrendItem(null)} />
        </Suspense>
      )}
    </Layout>
  );
}
