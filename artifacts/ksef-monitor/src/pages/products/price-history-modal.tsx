import { useEffect, useMemo, useState } from "react";
import {
  useGetProductPriceHistory,
  useGetProductQuantityTrend,
  getGetProductPriceHistoryQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import { Building2 } from "@/lib/icons";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { track } from "@/lib/posthog";

const MONTH_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MONTH_NAMES = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
function monthShort(ym: string) {
  const m = parseInt(ym.split("-")[1] ?? "", 10);
  return MONTH_SHORT[m - 1] ?? ym;
}
function monthLong(ym: string) {
  const [y, mm] = ym.split("-");
  return `${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm} ${y}`;
}
function lastMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function PriceHistoryModal({
  productId,
  productName,
  onClose,
  focusSupplierId,
  focusSupplierName,
  onSelectInvoice,
}: {
  productId: number;
  productName: string;
  onClose: () => void;
  focusSupplierId?: number;
  focusSupplierName?: string;
  onSelectInvoice?: (invoiceId: number) => void;
}) {
  useEffect(() => { track("price_history_viewed", { product_id: productId }); }, [productId]);

  const [tab, setTab] = useState<"ceny" | "zakupy">("ceny");

  // ── Tab: Ceny ──
  const priceParams = focusSupplierId != null ? { supplierId: focusSupplierId } : undefined;
  const { data: history, isLoading: priceLoading } = useGetProductPriceHistory(productId, priceParams, {
    query: {
      enabled: true,
      queryKey: focusSupplierId != null
        ? [...getGetProductPriceHistoryQueryKey(productId), focusSupplierId]
        : getGetProductPriceHistoryQueryKey(productId),
    },
  });

  const chartData = history?.map((h) => ({
    date: formatDate(h.date),
    price: h.price,
    supplier: h.supplierName,
  }));

  const latestBySupplier = new Map<number, { name: string; price: number; date: string }>();
  for (const h of history ?? []) {
    const prev = latestBySupplier.get(h.supplierId);
    if (!prev || h.date > prev.date)
      latestBySupplier.set(h.supplierId, { name: h.supplierName, price: h.price, date: h.date });
  }
  const supplierPrices = [...latestBySupplier.values()];
  const cheapest = supplierPrices.length > 1
    ? supplierPrices.reduce((min, s) => s.price < min.price ? s : min, supplierPrices[0])
    : null;
  const priciest = cheapest
    ? supplierPrices.reduce((max, s) => s.price > max.price ? s : max, supplierPrices[0])
    : null;

  // ── Tab: Zakupy ──
  const { data: qtyData, isLoading: qtyLoading } = useGetProductQuantityTrend(
    { productId, months: 12 },
    { query: { queryKey: ["product-qty-trend", productId], enabled: tab === "zakupy" } },
  );

  const activeUnit = useMemo(() => {
    if (!qtyData?.length) return "";
    const totals = new Map<string, number>();
    for (const r of qtyData) totals.set(r.unit, (totals.get(r.unit) ?? 0) + r.totalQuantity);
    return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [qtyData]);

  const monthlyRows = useMemo(() => {
    const months = lastMonths(12);
    const byMonth = new Map<string, { qty: number; spend: number; price: number | null }>();
    for (const r of qtyData ?? []) {
      if (r.unit !== activeUnit) continue;
      const cur = byMonth.get(r.month) ?? { qty: 0, spend: 0, price: null };
      cur.qty += r.totalQuantity;
      cur.spend += r.totalSpend;
      cur.price = r.avgUnitPrice ?? cur.price;
      byMonth.set(r.month, cur);
    }
    return months.map((ym) => {
      const m = byMonth.get(ym);
      return { ym, label: monthShort(ym), qty: m?.qty ?? 0, spend: m?.spend ?? 0, price: m?.price ?? null };
    });
  }, [qtyData, activeUnit]);

  const maxSpend = Math.max(...monthlyRows.map((r) => r.spend), 1);
  const currentMonth = monthlyRows[monthlyRows.length - 1];
  const prevMonth = monthlyRows[monthlyRows.length - 2];
  const avgSpend = monthlyRows.filter((r) => r.spend > 0).reduce((s, r) => s + r.spend, 0)
    / (monthlyRows.filter((r) => r.spend > 0).length || 1);
  const pctChange = prevMonth?.spend > 0
    ? ((currentMonth.spend - prevMonth.spend) / prevMonth.spend) * 100
    : null;

  const TABS = [
    { id: "ceny", label: "Historia cen" },
    { id: "zakupy", label: "Zakupy / miesiąc" },
  ] as const;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" data-testid="dialog-price-history">
        <DialogHeader className="shrink-0">
          <DialogTitle>Historia cen: {productName}</DialogTitle>
          {focusSupplierName && (
            <div className="flex items-center gap-1.5 mt-1">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">{focusSupplierName}</span>
            </div>
          )}
        </DialogHeader>

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 border-b border-border pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: CENY ── */}
        {tab === "ceny" && (
          priceLoading ? (
            <Skeleton className="h-56 w-full rounded-lg" />
          ) : chartData && chartData.length > 0 ? (
            <div className="flex flex-col min-h-0 gap-4 pt-2">
              {cheapest && (
                <div className="shrink-0 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex-wrap">
                  <Building2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">Najtaniej u</span>
                  <span className="text-sm font-semibold text-foreground">{cheapest.name}</span>
                  <span className="text-sm font-bold text-primary tabular-nums">{formatPrice(cheapest.price)}</span>
                  {priciest && priciest.price > cheapest.price && (
                    <span className="ml-auto text-[11px] text-positive font-medium">
                      taniej o {formatPrice(priciest.price - cheapest.price)} niż {priciest.name}
                    </span>
                  )}
                </div>
              )}
              <div className="shrink-0">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} zł`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: "12px" }}
                      formatter={(value: number, _name, props) => [formatPrice(value), props.payload?.supplier]}
                    />
                    <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Data</th>
                      <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Dostawca</th>
                      <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Cena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history?.slice().reverse().map((h, i) => (
                      <tr key={i}
                        onClick={onSelectInvoice ? () => onSelectInvoice(h.invoiceId) : undefined}
                        className={cn("border-b border-border last:border-0 hover:bg-secondary/40 transition-colors", onSelectInvoice && "cursor-pointer")}
                        title={onSelectInvoice ? `Otwórz fakturę ${h.invoiceNumber}` : undefined}
                      >
                        <td className="px-4 py-2.5">{formatDate(h.date)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{h.supplierName}</span>
                            {onSelectInvoice && <span className="text-[10px] text-primary/70 truncate shrink-0">· {h.invoiceNumber}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatPrice(h.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Brak historii cen dla tego produktu.</div>
          )
        )}

        {/* ── TAB: ZAKUPY / MIESIĄC ── */}
        {tab === "zakupy" && (
          qtyLoading ? (
            <Skeleton className="h-56 w-full rounded-lg mt-2" />
          ) : monthlyRows.some((r) => r.spend > 0) ? (
            <div className="flex flex-col min-h-0 gap-4 pt-2">
              {/* KPI */}
              <div className="shrink-0 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{monthLong(currentMonth.ym)}</p>
                  <p className="num-lg text-foreground">{formatPrice(currentMonth.spend)}</p>
                </div>
                {prevMonth && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{monthLong(prevMonth.ym)}</p>
                    <p className="num text-sm text-muted-foreground">{formatPrice(prevMonth.spend)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Średnia / mies.</p>
                  <p className="num text-sm text-muted-foreground">{formatPrice(avgSpend)}</p>
                  {pctChange != null && (
                    <p className={cn("text-xs font-semibold", pctChange > 0 ? "text-negative" : "text-positive")}>
                      {pctChange > 0 ? "↑" : "↓"} {Math.abs(pctChange).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>

              {/* Bar chart — wydatki */}
              <div className="shrink-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyRows} margin={{ top: 16, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: "12px" }}
                      formatter={(value: number) => [formatPrice(value), "Wydatek brutto"]}
                      labelFormatter={(label, payload) => monthLong(payload?.[0]?.payload?.ym ?? label)}
                    />
                    <Bar dataKey="spend" radius={[3, 3, 0, 0]}>
                      {monthlyRows.map((row, i) => (
                        <Cell
                          key={i}
                          fill={row.ym === currentMonth.ym
                            ? "hsl(var(--primary))"
                            : `hsl(var(--primary) / ${Math.max(0.25, row.spend / maxSpend * 0.75)})`}
                        />
                      ))}
                      <LabelList
                        dataKey="spend"
                        position="top"
                        formatter={(v: number) => v > 0 ? formatPrice(v) : ""}
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabela miesięczna */}
              <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium text-xs">Miesiąc</th>
                      <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs">Ilość ({activeUnit})</th>
                      <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs">Śr. cena</th>
                      <th className="text-right px-4 py-2 text-muted-foreground font-medium text-xs">Wartość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthlyRows].reverse().filter((r) => r.spend > 0).map((r) => (
                      <tr key={r.ym} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                        <td className="px-4 py-2 text-sm">{monthLong(r.ym)}</td>
                        <td className="px-4 py-2 text-right num text-sm">{r.qty % 1 === 0 ? r.qty : r.qty.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right num text-sm text-muted-foreground">
                          {r.price != null ? formatPrice(r.price) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right num font-semibold text-sm">{formatPrice(r.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Brak danych zakupowych dla tego produktu.</div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
