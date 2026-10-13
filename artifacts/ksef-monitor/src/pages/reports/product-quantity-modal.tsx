// „Ile tego produktu zamawiam i po ile" — ilość, średnia cena NETTO i wartość jednego
// produktu w każdym miesiącu (przełącznik jak w oknie dania w Sprzedaży). Otwiera się
// kliknięciem w wiersz karty „Więcej / mniej zamówione" i w produkt na karcie dostawcy.
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

type Metric = "qty" | "price" | "value";
type Row = { ym: string; label: string; qty: number; spend: number; net: number; price: number | null };

// Cena i wartość to pieniądze: drożej = terakota, taniej = oliwka (semantyka kosztowa).
const moneyTone = (v: number | null | undefined) =>
  v == null || Math.abs(v) < 0.05 ? "text-muted-foreground" : v > 0 ? "text-negative" : "text-positive";

function ChartTooltip({ active, payload, unit }: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs">
      <p className="label-caps mb-1">{monthLong(d.ym)}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">{fmtQty(d.qty)} {unit}</p>
      {d.price != null && (
        <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{formatPrice(d.price)} / {unit} netto</p>
      )}
      {d.spend > 0 && (
        <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{formatPrice(d.spend)} brutto</p>
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
  const [metric, setMetric] = useState<Metric>("qty");
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
    const byMonth = new Map<string, { qty: number; spend: number; net: number }>();
    for (const r of data ?? []) {
      if (r.unit !== activeUnit) continue;
      const cur = byMonth.get(r.month) ?? { qty: 0, spend: 0, net: 0 };
      cur.qty += r.totalQuantity;
      cur.spend += r.totalSpend;
      cur.net += r.totalNet ?? 0;
      byMonth.set(r.month, cur);
    }
    return months.map((ym): Row => {
      const m = byMonth.get(ym);
      const qty = m?.qty ?? 0;
      return {
        ym,
        label: monthShort(ym),
        qty,
        spend: m?.spend ?? 0,
        net: m?.net ?? 0,
        // Średnia cena NETTO w miesiącu (jak na fakturze); miesiąc bez zakupów = brak ceny.
        price: qty > 0 && m && m.net > 0 ? m.net / qty : null,
      };
    });
  }, [data, activeUnit]);

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const maxQty = rows.reduce((m, r) => Math.max(m, r.qty), 0);
  const valueOf = (r: Row | undefined): number | null =>
    !r ? null : metric === "qty" ? r.qty : metric === "value" ? r.spend : r.price;
  const fmtMetric = (v: number | null) =>
    v == null ? "—" : metric === "qty" ? `${fmtQty(v)} ${activeUnit}` : metric === "price" ? `${formatPrice(v)} / ${activeUnit}` : formatPrice(v);
  const lastV = valueOf(last);
  const prevV = valueOf(prev);
  const delta = lastV != null && prevV != null && prevV > 0 ? ((lastV - prevV) / prevV) * 100 : null;
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  // Średnia: ilość i wartość na miesiąc; cena — ważona ilością z całego okresu.
  const avg =
    metric === "price"
      ? (totalQty > 0 && totalNet > 0 ? totalNet / totalQty : null)
      : rows.length ? rows.reduce((s, r) => s + (metric === "qty" ? r.qty : r.spend), 0) / rows.length : 0;
  const chartKey = metric === "qty" ? "qty" : metric === "value" ? "spend" : "price";
  const maxV = rows.reduce((m, r) => Math.max(m, valueOf(r) ?? 0), 0);
  const fmtAxis = (v: number) => (metric === "qty" ? fmtQty(v) : v >= 1000 ? `${Math.round(v / 1000)} tys.` : formatPrice(v).replace(/\s?zł/, ""));
  const tone = metric === "qty" ? qtyTone(delta) : moneyTone(delta);
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

            <div className="flex items-center gap-1">
              {([["qty", "Ilość"], ["price", "Cena"], ["value", "Wartość"]] as const).map(([k, lbl]) => (
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
              <span className="text-[11px] text-muted-foreground ml-2">
                {metric === "price" ? "średnia cena netto, jak na fakturze" : metric === "value" ? "wartość brutto" : ""}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-4 border-b border-border">
              <div>
                <p className="label-caps">{last ? monthLong(last.ym) : "—"}</p>
                <p className="num-lg text-2xl text-foreground mt-1">{fmtMetric(lastV)}</p>
              </div>
              <div>
                <p className="label-caps">{prev ? monthLong(prev.ym) : "poprzedni"}</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">{fmtMetric(prevV)}</p>
              </div>
              {delta != null && (
                <div>
                  <p className="label-caps">Zmiana</p>
                  <p className={cn("num text-lg font-semibold mt-1 flex items-center gap-1", tone)}>
                    {up ? <ArrowUp className="w-4 h-4" /> : down ? <ArrowDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {signedPct(delta)}
                  </p>
                </div>
              )}
              <div>
                <p className="label-caps">{metric === "price" ? "Średnia z 12 mies." : "Średnia / mies."}</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">{fmtMetric(avg)}</p>
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
                    tickFormatter={fmtAxis}
                  />
                  <Tooltip content={<ChartTooltip unit={activeUnit} />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey={chartKey} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey={chartKey}
                      content={(props: {
                        x?: string | number; y?: string | number; width?: string | number;
                        value?: string | number; index?: number;
                      }) => {
                        const { x, y, width, value, index } = props;
                        const v = Number(value ?? 0);
                        const isLast = index === rows.length - 1;
                        if (!v || (!isLast && v !== maxV)) return null;
                        return (
                          <text
                            x={Number(x ?? 0) + Number(width ?? 0) / 2}
                            y={Number(y ?? 0) - 6}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={isLast ? 600 : 400}
                            fill="hsl(var(--foreground))"
                          >
                            {metric === "qty" ? fmtQty(v) : fmtAxis(v)}
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
                      <th className="text-right px-3 py-1.5 font-semibold">Cena netto</th>
                      <th className="text-right px-3 py-1.5 font-semibold">Wartość brutto</th>
                    </tr>
                  </thead>
                  <tbody className="rule-list">
                    {[...rows].reverse().map((r) => (
                      <tr key={r.ym}>
                        <td className="px-3 py-1.5 text-muted-foreground">{monthLong(r.ym)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {fmtQty(r.qty)} {activeUnit}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {r.price != null ? `${formatPrice(r.price)} / ${activeUnit}` : "—"}
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
