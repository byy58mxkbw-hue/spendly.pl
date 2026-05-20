import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useGetPredictiveReport } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const HORIZONS = [
  { days: 14, label: "2 tygodnie" },
  { days: 30, label: "30 dni" },
  { days: 60, label: "60 dni" },
  { days: 90, label: "90 dni" },
];

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "up" | "down";
  icon: React.ElementType;
}) {
  const toneClasses =
    tone === "up"
      ? "bg-red-50 text-red-600"
      : tone === "down"
      ? "bg-emerald-50 text-emerald-600"
      : "bg-primary/10 text-primary";
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", toneClasses)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-xl font-bold text-foreground truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "low" | "medium" | "high" }) {
  const map = {
    low: { label: "niska", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    medium: { label: "średnia", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    high: { label: "wysoka", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  } as const;
  const c = map[confidence];
  return (
    <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded border", c.cls)}>
      pewność: {c.label}
    </span>
  );
}

type Row = {
  productName: string;
  unit: string;
  supplierName: string | null;
  currentPrice: number;
  projectedPrice: number;
  priceChangePercent: number;
  recentMonthlyQuantity: number;
  projectedMonthlyDelta: number;
  dataPoints: number;
  confidence: "low" | "medium" | "high";
};

function ProductTable({ rows, direction }: { rows: Row[]; direction: "up" | "down" }) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
        Brak danych — za mało historii cen, aby przewidzieć zmiany w tym kierunku.
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Produkt</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Dostawca</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Cena teraz</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Prognoza</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Zmiana</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Wpływ na koszt / mc</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Pewność</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{r.productName}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.recentMonthlyQuantity.toFixed(1)} {r.unit} / mc · {r.dataPoints} obs.
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">
                  {r.supplierName ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatPrice(r.currentPrice)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{formatPrice(r.projectedPrice)}</td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 tabular-nums font-medium",
                      direction === "up" ? "text-red-600" : "text-emerald-600",
                    )}
                  >
                    {direction === "up" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {r.priceChangePercent > 0 ? "+" : ""}
                    {r.priceChangePercent.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={cn(direction === "up" ? "text-red-600" : "text-emerald-600")}>
                    {r.projectedMonthlyDelta > 0 ? "+" : ""}
                    {formatPrice(r.projectedMonthlyDelta)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ConfidenceBadge confidence={r.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Predictive() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isError } = useGetPredictiveReport({ horizonDays });

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Analiza predyktywna"
          subtitle="Prognozy zmian cen i wpływu na food cost na podstawie historii zakupów"
          action={
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {HORIZONS.map((h) => (
                <button
                  key={h.days}
                  onClick={() => setHorizonDays(h.days)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    horizonDays === h.days
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {h.label}
                </button>
              ))}
            </div>
          }
        />

        {isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive">
            Nie udało się załadować prognozy. Odśwież stronę lub spróbuj ponownie później.
          </div>
        ) : isLoading || !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Baza (śr. mc, ost. 90 dni)"
                value={formatPrice(data.recentMonthlySpend)}
                icon={Sparkles}
              />
              <StatCard
                label={`Prognoza za ${horizonDays} dni`}
                value={formatPrice(data.projectedMonthlySpend)}
                icon={data.projectedDelta >= 0 ? TrendingUp : TrendingDown}
                tone={data.projectedDelta >= 0 ? "up" : "down"}
              />
              <StatCard
                label="Różnica miesięczna"
                value={`${data.projectedDelta >= 0 ? "+" : ""}${formatPrice(data.projectedDelta)}`}
                sub={`${data.projectedDeltaPercent >= 0 ? "+" : ""}${data.projectedDeltaPercent.toFixed(1)}% wobec bazy`}
                icon={AlertTriangle}
                tone={data.projectedDelta >= 0 ? "up" : "down"}
              />
              <StatCard
                label="Przeanalizowanych produktów"
                value={String(data.productsAnalyzed)}
                sub="z historią cen ≥ 2 obs."
                icon={Sparkles}
              />
            </div>

            {/* Methodology note */}
            <div className="bg-muted/40 border border-border rounded-xl p-4 mb-8 text-xs text-muted-foreground leading-relaxed">
              <p className="mb-1 font-medium text-foreground">Jak liczymy prognozy</p>
              <p>
                Dla każdego produktu z minimum dwoma obserwacjami z ostatnich 12 miesięcy
                dopasowujemy prostą regresję liniową (cena w funkcji daty) i ekstrapolujemy
                cenę o {horizonDays} dni do przodu. Wpływ na miesięczny koszt = średnia
                ilość kupowana miesięcznie (ostatnie 90 dni) × prognozowana zmiana ceny.
                Pewność rośnie wraz z liczbą i rozpiętością obserwacji — przy niskiej pewności
                traktuj wyniki jako sygnał ostrzegawczy, nie pewną prognozę.
              </p>
            </div>

            {/* Top increases */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-foreground">Największe spodziewane podwyżki</h2>
              </div>
              <ProductTable rows={data.topIncreases as Row[]} direction="up" />
            </div>

            {/* Top decreases */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-semibold text-foreground">Spodziewane spadki cen</h2>
              </div>
              <ProductTable rows={data.topDecreases as Row[]} direction="down" />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
