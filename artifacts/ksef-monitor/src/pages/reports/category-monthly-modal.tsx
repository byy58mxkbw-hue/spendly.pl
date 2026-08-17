// „Ile wydałem na mięso w tym miesiącu, a ile w poprzednim" — jedna kategoria,
// miesiąc po miesiącu. Otwiera się kliknięciem w kategorię w Raportach.
//
// DLACZEGO OSOBNY WYKRES, skoro trend kategorii już istnieje: tamten jest
// SKUMULOWANY (8 kategorii w jednym słupku). Na skumulowanym słupku wspólną
// podstawę ma tylko dolna seria — pozostałych nie da się porównywać między
// miesiącami, bo każda „pływa" na tych pod nią. Do pytania o JEDNĄ kategorię
// właściwą formą jest emfaza: jedna seria, jeden kolor, reszta poza wykresem.
//
// Kolor bierzemy z `categoryColor()` — tego samego, co ikona kategorii. Kolor
// idzie więc za ENCJĄ, nie za pozycją w rankingu (paleta indeksowana rankiem
// przemalowuje serie przy zmianie filtra i myli czytelnika).
import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useGetCategorySpendTrend } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCostCenter } from "@/contexts/cost-center-context";
import { CategoryIcon, categoryColor } from "@/lib/category-icons";
import { ArrowDown, ArrowUp, ArrowRight, Minus } from "@/lib/icons";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const MONTH_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

function monthShort(ym: string): string {
  const m = parseInt(ym.split("-")[1] ?? "", 10);
  return MONTH_SHORT[m - 1] ?? ym;
}
function monthLong(ym: string): string {
  const [y, mm] = ym.split("-");
  return `${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm} ${y}`;
}

function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: { ym: string; spend: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border px-3 py-2 text-xs">
      <p className="label-caps mb-1">{monthLong(d.ym)}</p>
      <p className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(d.spend)}</p>
    </div>
  );
}

export function CategoryMonthlyModal({
  categoryId,
  categoryLabel,
  onClose,
}: {
  categoryId: string;
  categoryLabel: string;
  onClose: () => void;
}) {
  const { selectedId: costCenterId } = useCostCenter();
  const [showTable, setShowTable] = useState(false);
  const ccParam = costCenterId != null ? { costCenterId } : {};
  const MONTHS = 12;

  const { data, isLoading } = useGetCategorySpendTrend(
    { months: MONTHS, ...ccParam },
    { query: { queryKey: ["category-spend-trend", MONTHS, costCenterId] } },
  );

  // Endpoint zwraca WSZYSTKIE kategorie po miesiącach — wycinamy jedną.
  // Miesiące bez zakupów muszą zostać jako zero, inaczej wykres skłamie:
  // przerwa w danych wyglądałaby jak ciągłość.
  const rows = useMemo(() => {
    if (!data) return [];
    const months = Array.from(new Set(data.map((r) => r.month))).sort();
    const sums = new Map<string, number>();
    for (const r of data) {
      if ((r.category ?? "inne") !== categoryId) continue;
      sums.set(r.month, (sums.get(r.month) ?? 0) + r.totalSpend);
    }
    return months.map((ym) => ({ ym, label: monthShort(ym), spend: sums.get(ym) ?? 0 }));
  }, [data, categoryId]);

  const color = categoryColor(categoryId);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const delta = last && prev && prev.spend > 0
    ? ((last.spend - prev.spend) / prev.spend) * 100
    : null;
  const maxSpend = rows.reduce((m, r) => Math.max(m, r.spend), 0);
  const avg = rows.length ? rows.reduce((s, r) => s + r.spend, 0) / rows.length : 0;
  const hasAny = maxSpend > 0;

  // Wzrost kosztu = źle (terakota), spadek = dobrze (oliwka).
  const up = (delta ?? 0) > 0;
  const down = (delta ?? 0) < 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 head-display text-lg">
            <CategoryIcon categoryId={categoryId} className="w-5 h-5 shrink-0" />
            {categoryLabel}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasAny ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak zakupów w tej kategorii w ostatnich {MONTHS} miesiącach.
          </p>
        ) : (
          <>
            {/* Odpowiedź słowami — wykres jest uzupełnieniem, nie jedyną drogą do liczby. */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-4 border-b border-border">
              <div>
                <p className="label-caps">{last ? monthLong(last.ym) : "—"}</p>
                <p className="num-lg text-2xl text-foreground mt-1">{formatPrice(last?.spend ?? 0)}</p>
              </div>
              <div>
                <p className="label-caps">{prev ? monthLong(prev.ym) : "poprzedni"}</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">
                  {formatPrice(prev?.spend ?? 0)}
                </p>
              </div>
              {delta != null && (
                <div>
                  <p className="label-caps">Zmiana</p>
                  <p className={cn(
                    "num text-lg font-semibold mt-1 flex items-center gap-1",
                    up && "text-negative", down && "text-positive",
                    !up && !down && "text-muted-foreground",
                  )}>
                    {up ? <ArrowUp className="w-4 h-4" /> : down ? <ArrowDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    {Math.abs(delta).toFixed(1)}%
                  </p>
                </div>
              )}
              <div>
                <p className="label-caps">Średnia / mies.</p>
                <p className="num text-lg font-semibold text-muted-foreground mt-1">{formatPrice(avg)}</p>
              </div>
            </div>

            <div className="pt-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={rows} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
                  {/* Siatka: ciągły hairline, bez kreskowania (kreski czytają się jak próg). */}
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
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)} tys.` : String(v))}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="spend" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {/* Etykieta TYLKO na ostatnim i najwyższym słupku — liczba przy
                        każdym słupku to szum, a oś i tooltip niosą resztę.
                        Własny `content`, bo `formatter` w LabelList nie dostaje
                        indeksu i nie dałoby się wybrać konkretnych słupków. */}
                    <LabelList
                      dataKey="spend"
                      content={(props: {
                        x?: string | number; y?: string | number; width?: string | number;
                        value?: string | number; index?: number;
                      }) => {
                        const { x, y, width, value, index } = props;
                        const v = Number(value ?? 0);
                        const isLast = index === rows.length - 1;
                        if (!v || (!isLast && v !== maxSpend)) return null;
                        return (
                          <text
                            x={Number(x ?? 0) + Number(width ?? 0) / 2}
                            y={Number(y ?? 0) - 6}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={isLast ? 600 : 400}
                            fill="hsl(var(--foreground))"
                          >
                            {formatPrice(v)}
                          </text>
                        );
                      }}
                    />
                    {rows.map((r) => (
                      // Emfaza: bieżący miesiąc pełnym kolorem kategorii,
                      // wcześniejsze przygaszone — kontekst, nie bohater.
                      <Cell
                        key={r.ym}
                        fill={color}
                        fillOpacity={r.ym === last?.ym ? 1 : 0.45}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {showTable ? "Ukryj tabelę" : "Pokaż jako tabelę"}
              </button>
              <Link
                href={`/products?category=${categoryId}`}
                onClick={onClose}
                className="text-xs text-primary hover:underline underline-offset-2 flex items-center gap-1"
              >
                Produkty w tej kategorii <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Widok tabelaryczny — każda wartość osiągalna bez najeżdżania na wykres. */}
            {showTable && (
              <div className="max-h-56 overflow-y-auto border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-semibold">Miesiąc</th>
                      <th className="text-right px-3 py-1.5 font-semibold">Wydatki</th>
                    </tr>
                  </thead>
                  <tbody className="rule-list">
                    {[...rows].reverse().map((r) => (
                      <tr key={r.ym}>
                        <td className="px-3 py-1.5 text-muted-foreground">{monthLong(r.ym)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{formatPrice(r.spend)}</td>
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
