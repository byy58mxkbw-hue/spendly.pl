import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";
import { Layout, PageHeader } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Search, ShoppingBag } from "@/lib/icons";

type SalesItem = { productName: string; qty: number; netValue: number; prevQty: number | null; qtyChangePct: number | null };
type SalesResponse = { from: string; to: string; totalQty: number; totalNet: number; items: SalesItem[] };

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
function monthLabel(m: string): string { const [y, mm] = m.split("-").map(Number); return `${MONTHS[mm - 1]} ${y}`; }
function shiftMonth(m: string, d: number): string { const [y, mm] = m.split("-").map(Number); const dt = new Date(Date.UTC(y, mm - 1 + d, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; }
function currentMonth(): string { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; }
const fmtQty = (v: number) => new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(v);

export default function Sprzedaz() {
  const { session } = useClerk();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
    return q ? list.filter((i) => i.productName.toLowerCase().includes(q)) : list;
  }, [data, search]);

  const empty = !loading && (!data || data.items.length === 0);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 md:py-7">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <div className="flex-1 min-w-0">
            <PageHeader title="Sprzedaż" />
            <p className="text-xs text-muted-foreground mt-0.5">Ile czego sprzedano — z GoPOS, z porównaniem do poprzedniego miesiąca.</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-lg border border-border hover:bg-secondary/50" aria-label="Poprzedni miesiąc"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium px-2 min-w-[120px] text-center capitalize">{monthLabel(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()} className="p-1.5 rounded-lg border border-border hover:bg-secondary/50 disabled:opacity-40" aria-label="Następny miesiąc"><ChevronRight className="w-4 h-4" /></button>
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
              <div className="flex items-baseline gap-4">
                <div><span className="text-xs text-muted-foreground">Pozycji</span> <span className="text-sm font-semibold">{data!.items.length}</span></div>
                <div><span className="text-xs text-muted-foreground">Sprzedano</span> <span className="text-sm font-semibold tabular-nums">{fmtQty(data!.totalQty)}</span></div>
                <div><span className="text-xs text-muted-foreground">Wartość netto</span> <span className="text-sm font-semibold tabular-nums">{formatPrice(data!.totalNet)}</span></div>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj pozycji…" className="pl-8 h-8 w-44 text-sm" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] tabular-nums">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-secondary/30">
                    <th className="text-left px-5 py-2">Pozycja</th>
                    <th className="text-right px-3 py-2">Sprzedano</th>
                    <th className="text-right px-3 py-2">Poprz. mies.</th>
                    <th className="text-right px-3 py-2">Zmiana</th>
                    <th className="text-right px-5 py-2">Wartość netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it, i) => {
                    const up = (it.qtyChangePct ?? 0) > 0;
                    return (
                      <tr key={i}>
                        <td className="px-5 py-2.5 max-w-[280px]"><span className="text-sm text-foreground truncate block">{it.productName}</span></td>
                        <td className="text-right px-3 py-2.5 text-sm font-medium text-foreground">{fmtQty(it.qty)}</td>
                        <td className="text-right px-3 py-2.5 text-xs text-muted-foreground">{it.prevQty != null ? fmtQty(it.prevQty) : "—"}</td>
                        <td className={cn("text-right px-3 py-2.5 text-xs font-medium", it.qtyChangePct == null ? "text-muted-foreground" : up ? "text-warning" : "text-positive")}>
                          {it.qtyChangePct == null ? "nowe" : (
                            <span className="inline-flex items-center justify-end gap-0.5">
                              {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{Math.abs(it.qtyChangePct).toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="text-right px-5 py-2.5 text-sm font-semibold text-foreground">{formatPrice(it.netValue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
