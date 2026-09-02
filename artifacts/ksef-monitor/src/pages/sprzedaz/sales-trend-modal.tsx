// „Jak ta pozycja sprzedaje się co miesiąc" — jedna pozycja menu przez rok.
// Otwiera się kliknięciem w wiersz na stronie Sprzedaż.
//
// DLACZEGO OSOBNY ENDPOINT, a nie dane z tabeli: tabela porównuje tylko dwa
// okresy, więc nie widać z niej sezonowości ani tego, czy spadek to wyjątek,
// czy trend ciągnący się od pół roku.
import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { apiUrl } from "@/lib/api-base";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Minus } from "@/lib/icons";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHART_COLORS, fmtQty, signedPct } from "../reports/components";

const MONTH_NAMES = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const MONTH_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MONTHS = 12;

function monthShort(ym: string): string {
  const m = parseInt(ym.split("-")[1] ?? "", 10);
  return MONTH_SHORT[m - 1] ?? ym;
}
function monthLong(ym: string): string {
  const [y, mm] = ym.split("-");
  return `${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm} ${y}`;
}

type TrendMonth = { month: string; qty: number; netValue: number; avgPrice: number | null };
type TrendResponse = { productName: string; variantCount: number; months: TrendMonth[] };

type Metric = "qty" | "net";

// Sprzedaż to przychód, więc więcej = lepiej. Odwrotnie niż przy kosztach,
// gdzie wzrost jest zły — dlatego NIE reużywamy `qtyTone` z raportów.
function salesTone(v: number | null | undefined): string {
  if (v == null || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-positive" : "text-negative";
}

function ChartTooltip({ active, payload, metric }: {
  active?: boolean;
  payload?: Array<{ payload: TrendMonth }>;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs">
      <p className="label-caps mb-1">{monthLong(d.month)}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {metric === "qty" ? `${fmtQty(d.qty)} szt.` : formatPrice(d.netValue)}
      </p>
      <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
        {metric === "qty" ? formatPrice(d.netValue) : `${fmtQty(d.qty)} szt.`}
        {d.avgPrice != null && ` · śr. ${formatPrice(d.avgPrice)}/szt.`}
      </p>
    </div>
  );
}

export function SalesTrendModal({ label, groupKey, productName, onClose }: {
  /** Nazwa do nagłówka — mamy ją od razu, więc tytuł nie mruga po wczytaniu. */
  label: string;
  /** Klucz grupy z POS: wykres obejmuje wszystkie warianty (np. wszystkie wysmażenia). */
  groupKey?: string;
  /** Pojedynczy wariant — gdy użytkownik kliknął w rozwiniętą pozycję. */
  productName?: string;
  onClose: () => void;
}) {
  const { session } = useClerk();
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("qty");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const token = await session?.getToken();
      const q = groupKey
        ? `key=${encodeURIComponent(groupKey)}`
        : `productName=${encodeURIComponent(productName ?? "")}`;
      const res = await fetch(apiUrl(`/api/sales/trend?${q}&months=${MONTHS}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = res.ok ? ((await res.json()) as TrendResponse) : null;
      if (!cancelled) { setData(json); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupKey, productName, session]);

  const rows = useMemo(
    () => (data?.months ?? []).map((m) => ({ ...m, label: monthShort(m.month) })),
    [data],
  );

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const value = (r: typeof last) => (metric === "qty" ? r?.qty ?? 0 : r?.netValue ?? 0);
  const delta = last && prev && value(prev) > 0 ? ((value(last) - value(prev)) / value(prev)) * 100 : null;
  const maxVal = rows.reduce((m, r) => Math.max(m, value(r)), 0);
  const avg = rows.length ? rows.reduce((s, r) => s + value(r), 0) / rows.length : 0;
  const fmt = (v: number) => (metric === "qty" ? `${fmtQty(v)} szt.` : formatPrice(v));
  const up = (delta ?? 0) > 0;
  const down = (delta ?? 0) < 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="head-display text-lg">{label}</DialogTitle>
        </DialogHeader>
        {/* Bez tego wykres grupy wyglądałby na sprzedaż jednej pozycji,
            a jest sumą kilku wariantów. */}
        {groupKey && (data?.variantCount ?? 0) > 1 && (
          <p className="text-xs text-muted-foreground -mt-2">
            Razem {data!.variantCount} warianty tej pozycji.
          </p>
        )}

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : maxVal <= 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak sprzedaży tej pozycji w ostatnich {MONTHS} miesiącach.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {([["qty", "Ilość"], ["net", "Wartość"]] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMetric(k)}
                  className={cn(
                    "px-2.5 py-1 border text-[11px] font-medium transition-colors",
                    metric === k
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-4 border-b border-border">
              <div>
                <p className="label-caps">{last ? monthLong(last.month) : "—"}</p>
                <p className="num-lg text-2xl text-foreground mt-1">{fmt(value(last))}</p>
              </div>
              <div>
                <p className="label-caps">{prev ? monthLong(prev.month) : "poprzedni"}</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">{fmt(value(prev))}</p>
              </div>
              {delta != null && (
                <div>
                  <p className="label-caps">Zmiana</p>
                  <p className={cn("num text-lg font-semibold mt-1 flex items-center gap-1", salesTone(delta))}>
                    {up ? <ArrowUp className="w-4 h-4" /> : down ? <ArrowDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {signedPct(delta)}
                  </p>
                </div>
              )}
              <div>
                <p className="label-caps">Średnia / mies.</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">{fmt(avg)}</p>
              </div>
            </div>

            <div className="pt-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rows} margin={{ top: 20, right: 8, left: -8, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => (metric === "qty" ? fmtQty(v) : String(Math.round(v)))}
                  />
                  <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey={metric === "qty" ? "qty" : "netValue"} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey={metric === "qty" ? "qty" : "netValue"}
                      content={(props: {
                        x?: string | number; y?: string | number; width?: string | number;
                        value?: string | number; index?: number;
                      }) => {
                        const { x, y, width, value: v, index } = props;
                        const n = Number(v ?? 0);
                        const isLast = index === rows.length - 1;
                        if (!n || (!isLast && n !== maxVal)) return null;
                        return (
                          <text
                            x={Number(x ?? 0) + Number(width ?? 0) / 2}
                            y={Number(y ?? 0) - 6}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={isLast ? 600 : 400}
                            fill="hsl(var(--foreground))"
                          >
                            {metric === "qty" ? fmtQty(n) : Math.round(n)}
                          </text>
                        );
                      }}
                    />
                    {rows.map((r) => (
                      <Cell key={r.month} fill={CHART_COLORS[0]} fillOpacity={r.month === last?.month ? 1 : 0.45} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {showTable ? "Ukryj tabelę" : "Pokaż jako tabelę"}
              </button>
            </div>

            {showTable && (
              <div className="max-h-56 overflow-y-auto border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-semibold">Miesiąc</th>
                      <th className="text-right px-3 py-1.5 font-semibold">Ilość</th>
                      <th className="text-right px-3 py-1.5 font-semibold">Wartość netto</th>
                      <th className="text-right px-3 py-1.5 font-semibold">Śr. cena</th>
                    </tr>
                  </thead>
                  <tbody className="rule-list">
                    {[...rows].reverse().map((r) => (
                      <tr key={r.month}>
                        <td className="px-3 py-1.5 text-muted-foreground">{monthLong(r.month)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{fmtQty(r.qty)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {r.netValue > 0 ? formatPrice(r.netValue) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.avgPrice != null ? formatPrice(r.avgPrice) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
