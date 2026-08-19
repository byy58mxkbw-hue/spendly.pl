// „Ile tego produktu zamawiam co miesiąc" — ilości jednego produktu przez rok.
// Otwiera się kliknięciem w wiersz karty „Więcej / mniej zamówione".
//
// DLACZEGO OSOBNY ENDPOINT, a nie dane z karty: karta porównuje tylko dwa okresy
// i ślepnie na rotację dostawców (jeśli poprzednio kupowałeś u kogoś innego, jego
// ilość w ogóle nie wraca z /reports/monthly). Ten wykres liczy się bezpośrednio
// z pozycji faktur, więc widzi całą historię niezależnie od tego, kto sprzedawał.
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useGetProductQuantityTrend } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCostCenter } from "@/contexts/cost-center-context";
import { ArrowDown, ArrowUp, AlertTriangle, Minus } from "@/lib/icons";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHART_COLORS, fmtQty, signedPct, qtyTone } from "./components";

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

// Lista ostatnich N miesięcy — potrzebna, żeby miesiąc BEZ zakupów pokazał zero,
// a nie zniknął. Dziura w danych wyglądałaby jak ciągłość.
function lastMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function ChartTooltip({ active, payload, unit }: {
  active?: boolean;
  payload?: Array<{ payload: { ym: string; qty: number; spend: number } }>;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs">
      <p className="label-caps mb-1">{monthLong(d.ym)}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">{fmtQty(d.qty)} {unit}</p>
      {d.spend > 0 && (
        <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{formatPrice(d.spend)}</p>
      )}
    </div>
  );
}

export function ProductQuantityModal({
  productName,
  unit,
  onClose,
}: {
  productName: string;
  /** Jednostka z klikniętego wiersza — od niej zaczynamy. */
  unit?: string;
  onClose: () => void;
}) {
  const { selectedId: costCenterId } = useCostCenter();
  const [showTable, setShowTable] = useState(false);
  const [unitOverride, setUnitOverride] = useState<string | null>(null);
  const ccParam = costCenterId != null ? { costCenterId } : {};

  // Bez parametru `unit` — chcemy WSZYSTKIE jednostki, żeby wykryć ich zmianę.
  const { data, isLoading } = useGetProductQuantityTrend(
    { productName, months: MONTHS, ...ccParam },
    { query: { queryKey: ["product-qty-trend", productName, costCenterId] } },
  );

  const units = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, number>();
    for (const r of data) totals.set(r.unit, (totals.get(r.unit) ?? 0) + r.totalQuantity);
    // Najczęstsza jednostka pierwsza — na niej otwieramy, gdy brak podpowiedzi.
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([u]) => u);
  }, [data]);

  const activeUnit = unitOverride ?? (unit && units.includes(unit) ? unit : units[0] ?? unit ?? "");
  const otherUnits = units.filter((u) => u !== activeUnit);

  const rows = useMemo(() => {
    const months = lastMonths(MONTHS);
    const byMonth = new Map<string, { qty: number; spend: number }>();
    for (const r of data ?? []) {
      if (r.unit !== activeUnit) continue;
      const cur = byMonth.get(r.month) ?? { qty: 0, spend: 0 };
      cur.qty += r.totalQuantity;
      cur.spend += r.totalSpend;
      byMonth.set(r.month, cur);
    }
    return months.map((ym) => ({
      ym,
      label: monthShort(ym),
      qty: byMonth.get(ym)?.qty ?? 0,
      spend: byMonth.get(ym)?.spend ?? 0,
    }));
  }, [data, activeUnit]);

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const delta = last && prev && prev.qty > 0 ? ((last.qty - prev.qty) / prev.qty) * 100 : null;
  const maxQty = rows.reduce((m, r) => Math.max(m, r.qty), 0);
  const avg = rows.length ? rows.reduce((s, r) => s + r.qty, 0) / rows.length : 0;
  const up = (delta ?? 0) > 0;
  const down = (delta ?? 0) < 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="head-display text-lg">{productName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : maxQty <= 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak zakupów tego produktu w ostatnich {MONTHS} miesiącach.
          </p>
        ) : (
          <>
            {/* Zmiana jednostki jest realnym zdarzeniem (dostawca przeszedł z opak
                na kg). Nie wolno tego zsumować ani przemilczeć — mówimy wprost. */}
            {otherUnits.length > 0 && (
              <div className="flex items-start gap-2 border-y border-warning/40 bg-warning/[0.07] px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
                <div className="text-xs text-foreground">
                  <p>
                    Ten produkt bywał kupowany też w jednostce{" "}
                    <strong>{otherUnits.join(", ")}</strong>. Te zakupy nie są na wykresie —
                    ilości w różnych jednostkach się nie sumują.
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {units.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnitOverride(u)}
                        className={cn(
                          "px-2 py-0.5 border text-[11px] font-medium transition-colors",
                          u === activeUnit
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-4 border-b border-border">
              <div>
                <p className="label-caps">{last ? monthLong(last.ym) : "—"}</p>
                <p className="num-lg text-2xl text-foreground mt-1">
                  {fmtQty(last?.qty ?? 0)}{" "}
                  <span className="text-base font-normal text-muted-foreground">{activeUnit}</span>
                </p>
              </div>
              <div>
                <p className="label-caps">{prev ? monthLong(prev.ym) : "poprzedni"}</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">
                  {fmtQty(prev?.qty ?? 0)} {activeUnit}
                </p>
              </div>
              {delta != null && (
                <div>
                  <p className="label-caps">Zmiana</p>
                  <p className={cn("num text-lg font-semibold mt-1 flex items-center gap-1", qtyTone(delta))}>
                    {up ? <ArrowUp className="w-4 h-4" /> : down ? <ArrowDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {signedPct(delta)}
                  </p>
                </div>
              )}
              <div>
                <p className="label-caps">Średnia / mies.</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">{fmtQty(avg)} {activeUnit}</p>
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
                    width={48}
                    tickFormatter={(v: number) => fmtQty(v)}
                  />
                  <Tooltip content={<ChartTooltip unit={activeUnit} />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="qty" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="qty"
                      content={(props: {
                        x?: string | number; y?: string | number; width?: string | number;
                        value?: string | number; index?: number;
                      }) => {
                        const { x, y, width, value, index } = props;
                        const v = Number(value ?? 0);
                        const isLast = index === rows.length - 1;
                        if (!v || (!isLast && v !== maxQty)) return null;
                        return (
                          <text
                            x={Number(x ?? 0) + Number(width ?? 0) / 2}
                            y={Number(y ?? 0) - 6}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={isLast ? 600 : 400}
                            fill="hsl(var(--foreground))"
                          >
                            {fmtQty(v)}
                          </text>
                        );
                      }}
                    />
                    {rows.map((r) => (
                      <Cell
                        key={r.ym}
                        fill={CHART_COLORS[0]}
                        fillOpacity={r.ym === last?.ym ? 1 : 0.45}
                      />
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
                      <th className="text-right px-3 py-1.5 font-semibold">Wartość</th>
                    </tr>
                  </thead>
                  <tbody className="rule-list">
                    {[...rows].reverse().map((r) => (
                      <tr key={r.ym}>
                        <td className="px-3 py-1.5 text-muted-foreground">{monthLong(r.ym)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {fmtQty(r.qty)} {activeUnit}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.spend > 0 ? formatPrice(r.spend) : "—"}
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
