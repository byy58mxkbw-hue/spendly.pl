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
import { ArrowDown, ArrowUp, ArrowLeft, Minus } from "@/lib/icons";
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
function isCurrentCalendarMonth(ym: string): boolean {
  const d = new Date();
  return ym === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type TrendMonth = { month: string; qty: number; netValue: number; avgPrice: number | null };
type TrendResponse = { productName: string; variantCount: number; months: TrendMonth[] };

type DailyRow = { date: string; qty: number; netValue: number };
type DailyResponse = { days: DailyRow[] };

type Metric = "qty" | "net";

const WEEKDAY_SHORT = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];

function dayOfMonth(dateStr: string): string {
  return String(parseInt(dateStr.split("-")[2] ?? "", 10));
}
function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return WEEKDAY_SHORT[d.getDay()] ?? "";
}
function dayLong(dateStr: string): string {
  const [, mm, dd] = dateStr.split("-");
  return `${parseInt(dd, 10)} ${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm}, ${weekdayLabel(dateStr)}`;
}

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

function DailyChartTooltip({ active, payload, metric }: {
  active?: boolean;
  payload?: Array<{ payload: DailyRow }>;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs">
      <p className="label-caps mb-1">{dayLong(d.date)}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {metric === "qty" ? `${fmtQty(d.qty)} szt.` : formatPrice(d.netValue)}
      </p>
      <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
        {metric === "qty" ? formatPrice(d.netValue) : `${fmtQty(d.qty)} szt.`}
      </p>
    </div>
  );
}

export function SalesTrendModal({ label, groupKey, productName, total, initialMetric, category, excludeCategories, onClose }: {
  /** Nazwa do nagłówka — mamy ją od razu, więc tytuł nie mruga po wczytaniu. */
  label: string;
  /** Klucz grupy z POS: wykres obejmuje wszystkie warianty (np. wszystkie wysmażenia). */
  groupKey?: string;
  /** Pojedynczy wariant — gdy użytkownik kliknął w rozwiniętą pozycję. */
  productName?: string;
  /** Suma WSZYSTKICH pozycji — klik w podsumowanie "Sprzedano"/"Wartość netto" na górze strony. */
  total?: boolean;
  initialMetric?: Metric;
  /** Tylko w trybie `total` — te same filtr/odpięte kategorie co pasek nad
   * tabelą, z którego ten modal się otwiera (patrz routes/sales.ts). */
  category?: string;
  excludeCategories?: Set<string>;
  onClose: () => void;
}) {
  const { session } = useClerk();
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>(initialMetric ?? "qty");
  const [showTable, setShowTable] = useState(false);
  // Klik w słupek miesiąca pokazuje rozbicie dzień po dniu — dociągane z GoPOS
  // na żądanie (patrz routes/sales.ts `/sales/trend/daily`), więc pierwsze
  // wejście w zamknięty miesiąc trwa chwilę dłużej niż kolejne (cache).
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [dailyData, setDailyData] = useState<DailyResponse | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(false);

  // Zbudowane raz na zmianę filtrów — oba efekty (miesięczny i dzienny) pytają
  // z tymi samymi parametrami, żeby słupek i jego drill-down zawsze się zgadzały.
  const excludeKey = excludeCategories ? [...excludeCategories].sort().join(",") : "";
  const filterQuery = useMemo(() => {
    const parts: string[] = [];
    if (category) parts.push(`category=${encodeURIComponent(category)}`);
    if (excludeKey) parts.push(`excludeCategories=${encodeURIComponent(excludeKey)}`);
    return parts.join("&");
  }, [category, excludeKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const token = await session?.getToken();
      const q = total
        ? "total=1"
        : groupKey
          ? `key=${encodeURIComponent(groupKey)}`
          : `productName=${encodeURIComponent(productName ?? "")}`;
      const res = await fetch(apiUrl(`/api/sales/trend?${q}&months=${MONTHS}${filterQuery ? `&${filterQuery}` : ""}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = res.ok ? ((await res.json()) as TrendResponse) : null;
      if (!cancelled) { setData(json); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupKey, productName, total, session, filterQuery]);

  useEffect(() => {
    if (!drillMonth) return;
    let cancelled = false;
    setDailyLoading(true);
    setDailyError(false);
    void (async () => {
      const token = await session?.getToken();
      const q = total
        ? "total=1"
        : groupKey
          ? `key=${encodeURIComponent(groupKey)}`
          : `productName=${encodeURIComponent(productName ?? "")}`;
      const res = await fetch(apiUrl(`/api/sales/trend/daily?${q}&month=${drillMonth}${filterQuery ? `&${filterQuery}` : ""}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = res.ok ? ((await res.json()) as DailyResponse) : null;
      if (!cancelled) {
        setDailyData(json);
        setDailyError(!res.ok);
        setDailyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [drillMonth, groupKey, productName, total, session, filterQuery]);

  const rows = useMemo(
    () => (data?.months ?? []).map((m) => ({ ...m, label: monthShort(m.month) })),
    [data],
  );

  const dailyRows = useMemo(
    () => (dailyData?.days ?? []).map((d) => ({ ...d, label: dayOfMonth(d.date) })),
    [dailyData],
  );
  const dailyValue = (r: DailyRow | undefined) => (metric === "qty" ? r?.qty ?? 0 : r?.netValue ?? 0);
  const dailyMax = dailyRows.reduce((m, r) => Math.max(m, dailyValue(r)), 0);

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const value = (r: typeof last) => (metric === "qty" ? r?.qty ?? 0 : r?.netValue ?? 0);
  // `last` to zawsze najświeższy miesiąc w oknie — gdy to BIEŻĄCY, niepełny
  // miesiąc (np. 1 dzień listopada), porównanie z pełnym październikiem daje
  // fałszywe "-98%". Zamiast liczyć, oznaczamy to jawnie (patrz niżej).
  const lastInProgress = last ? isCurrentCalendarMonth(last.month) : false;
  const delta = last && prev && !lastInProgress && value(prev) > 0 ? ((value(last) - value(prev)) / value(prev)) * 100 : null;
  const maxVal = rows.reduce((m, r) => Math.max(m, value(r)), 0);
  const avg = rows.length ? rows.reduce((s, r) => s + value(r), 0) / rows.length : 0;
  const fmt = (v: number) => (metric === "qty" ? `${fmtQty(v)} szt.` : formatPrice(v));
  const up = (delta ?? 0) > 0;
  const down = (delta ?? 0) < 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="head-display text-lg">{label}</DialogTitle>
        </DialogHeader>
        {/* Treść może być dłuższa niż ekran telefonu (wykres + tabela + drill-down
            dzienny) — scrolluje się ONA, nie cały dialog, żeby nagłówek i przełącznik
            ilość/wartość zostały na widoku. */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0">
        {/* Bez tego wykres grupy wyglądałby na sprzedaż jednej pozycji,
            a jest sumą kilku wariantów. */}
        {groupKey && (data?.variantCount ?? 0) > 1 && (
          <p className="text-xs text-muted-foreground -mt-2">
            Razem {data!.variantCount} warianty tej pozycji.
          </p>
        )}
        {total && (category || excludeKey) && (
          <p className="text-xs text-muted-foreground -mt-2">
            Liczone z tym samym filtrem/odpiętymi kategoriami co lista na stronie.
          </p>
        )}

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : maxVal <= 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak sprzedaży {total ? "" : "tej pozycji "}w ostatnich {MONTHS} miesiącach.
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
              {lastInProgress ? (
                <div>
                  <p className="label-caps">Zmiana</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[10rem] italic">
                    miesiąc w trakcie — porównanie po jego zakończeniu
                  </p>
                </div>
              ) : delta != null && (
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
                      <Cell
                        key={r.month}
                        fill={CHART_COLORS[0]}
                        fillOpacity={r.month === last?.month ? 1 : 0.45}
                        cursor="pointer"
                        onClick={() => setDrillMonth(r.month)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground -mt-1">Kliknij słupek, by zobaczyć dni tego miesiąca.</p>
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

            {drillMonth && (
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => { setDrillMonth(null); setDailyData(null); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Wróć do miesięcy
                  </button>
                  <p className="label-caps">{monthLong(drillMonth)} — dni</p>
                </div>

                {dailyLoading ? (
                  <Skeleton className="h-56 w-full" />
                ) : dailyError ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nie udało się pobrać rozbicia dziennego z GoPOS. Spróbuj ponownie za chwilę.
                  </p>
                ) : dailyMax <= 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Brak sprzedaży {total ? "" : "tej pozycji "}w {monthLong(drillMonth)}.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dailyRows} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="18%">
                      <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        interval={dailyRows.length > 20 ? 1 : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v: number) => (metric === "qty" ? fmtQty(v) : String(Math.round(v)))}
                      />
                      <Tooltip content={<DailyChartTooltip metric={metric} />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey={metric === "qty" ? "qty" : "netValue"} radius={[2, 2, 0, 0]} isAnimationActive={false}>
                        {dailyRows.map((r) => (
                          <Cell key={r.date} fill={CHART_COLORS[0]} fillOpacity={dailyValue(r) > 0 ? 0.85 : 0.15} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
