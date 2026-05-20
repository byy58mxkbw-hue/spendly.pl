import { useState, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  RefreshCw,
  X,
  BarChart2,
  ShoppingCart,
  Star,
  Leaf,
  Globe,
  Users,
  Lightbulb,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetInsights, usePostInsightsGenerate, usePostInsightsIdDismiss, usePostInsightsIdRead } from "@workspace/api-client-react";

type Insight = {
  id: number;
  type: string;
  severity: string;
  title: string;
  body: string;
  riskScore: number;
  productId?: number | null;
  supplierId?: number | null;
  readAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
};

const SEVERITY_CONFIG = {
  critical: {
    bar: "bg-red-500",
    badge: "bg-red-50 text-red-600 border-red-100",
    dot: "bg-red-500",
    label: "Krytyczne",
  },
  high: {
    bar: "bg-orange-400",
    badge: "bg-orange-50 text-orange-600 border-orange-100",
    dot: "bg-orange-400",
    label: "Wysokie",
  },
  medium: {
    bar: "bg-amber-400",
    badge: "bg-amber-50 text-amber-600 border-amber-100",
    dot: "bg-amber-400",
    label: "Średnie",
  },
  low: {
    bar: "bg-emerald-400",
    badge: "bg-emerald-50 text-emerald-600 border-emerald-100",
    dot: "bg-emerald-400",
    label: "Niskie",
  },
} as const;

const TYPE_ICON: Record<string, React.ElementType> = {
  price_spike: TrendingUp,
  price_drop: TrendingDown,
  price_trend: BarChart2,
  supplier_pattern: ShoppingCart,
  supplier_risk: Users,
  cost_forecast: BarChart2,
  weekly_trend: TrendingUp,
  record_high: Star,
  seasonal: Leaf,
  market_outlook: Globe,
  action_required: Lightbulb,
};

const TYPE_LABEL: Record<string, string> = {
  price_spike: "Podwyżka",
  price_drop: "Obniżka",
  price_trend: "Trend cenowy",
  supplier_pattern: "Wzorzec dostawcy",
  supplier_risk: "Ryzyko dostawcy",
  cost_forecast: "Prognoza kosztów",
  weekly_trend: "Trend tygodniowy",
  record_high: "Rekord ceny",
  seasonal: "Sezonowość",
  market_outlook: "Rynek globalny",
  action_required: "Rekomendacja",
};

function RiskBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 75 ? "bg-red-500" : pct >= 50 ? "bg-orange-400" : pct >= 25 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-7 text-right">{pct}</span>
    </div>
  );
}

function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: (id: number) => void }) {
  const sev = SEVERITY_CONFIG[(insight.severity as keyof typeof SEVERITY_CONFIG) ?? "medium"];
  const Icon = TYPE_ICON[insight.type] ?? AlertTriangle;
  const isUnread = !insight.readAt;

  return (
    <div
      className={cn(
        "group relative bg-card border border-border rounded-xl p-5 transition-all hover:border-primary/30 hover:shadow-sm",
        isUnread && "border-l-2 border-l-primary",
      )}
    >
      <button
        onClick={() => onDismiss(insight.id)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Odrzuć"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-4">
        <div className={cn("mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0", sev.badge)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            {isUnread && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", sev.dot)} />}
            <p className="text-sm font-semibold text-foreground leading-snug">{insight.title}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{insight.body}</p>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-40">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">Ryzyko kosztów</p>
              <RiskBar score={insight.riskScore} />
            </div>
            <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", sev.badge)}>
              {TYPE_LABEL[insight.type] ?? sev.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onGenerate, isLoading }: { onGenerate: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Zap className="w-7 h-7" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-2">Brak insightów</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Wygeneruj analizę AI na podstawie Twoich faktur, aby zobaczyć trendy cenowe i alerty kosztowe.
      </p>
      <button
        onClick={onGenerate}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
        {isLoading ? "Analizuję…" : "Generuj analizę"}
      </button>
    </div>
  );
}

export function AiCfoPage() {
  const qc = useQueryClient();
  const { data: insights = [], isLoading, queryKey } = useGetInsights();
  const { mutateAsync: generate } = usePostInsightsGenerate();
  const { mutateAsync: dismiss } = usePostInsightsIdDismiss();
  const { mutateAsync: markRead } = usePostInsightsIdRead();
  const [generating, setGenerating] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);

    // Clear any in-flight poll
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    try {
      await generate({ data: {} });
    } catch {
      // 202 is returned immediately — error handling not needed
    }

    // Snapshot the most recent insight's createdAt before polling so we can
    // detect a true refresh even when the count stays the same.
    const currentInsights = qc.getQueryData<Insight[]>(queryKey) ?? [];
    const latestBefore = currentInsights.reduce<string>(
      (max, i) => (i.createdAt > max ? i.createdAt : max),
      "",
    );

    let attempts = 0;
    const iv = setInterval(async () => {
      attempts++;
      await qc.invalidateQueries({ queryKey });
      const fresh = qc.getQueryData<Insight[]>(queryKey) ?? [];
      const latestAfter = fresh.reduce<string>(
        (max, i) => (i.createdAt > max ? i.createdAt : max),
        "",
      );
      // Stop when new insights arrived or after 90s (30 × 3s)
      if (latestAfter > latestBefore || (fresh.length > 0 && attempts >= 5) || attempts >= 30) {
        clearInterval(iv);
        pollIntervalRef.current = null;
        setGenerating(false);
      }
    }, 3000);

    pollIntervalRef.current = iv;
  }, [generate, qc, queryKey]);

  const handleDismiss = useCallback(
    async (id: number) => {
      await dismiss({ id, data: {} });
      await qc.invalidateQueries({ queryKey });
    },
    [dismiss, qc, queryKey],
  );

  const handleRead = useCallback(
    async (id: number) => {
      await markRead({ id, data: {} });
    },
    [markRead],
  );

  const unread = insights.filter((i: Insight) => !i.readAt).length;
  const bySeverity = (s: string) => insights.filter((i: Insight) => i.severity === s);
  const critical = bySeverity("critical");
  const high = bySeverity("high");
  const rest = insights.filter((i: Insight) => i.severity !== "critical" && i.severity !== "high");

  const avgRisk =
    insights.length > 0
      ? Math.round(insights.reduce((s: number, i: Insight) => s + i.riskScore, 0) / insights.length)
      : 0;

  return (
    <Layout>
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">AI CFO</h1>
              {unread > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {unread}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Automatyczna analiza trendów cenowych z Twoich faktur</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", generating && "animate-spin")} />
            <span className="hidden sm:inline">{generating ? "Analizuję…" : "Odśwież"}</span>
          </button>
        </div>

        {insights.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{insights.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Insightów</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className={cn("text-2xl font-bold", avgRisk >= 70 ? "text-destructive" : avgRisk >= 40 ? "text-amber-500" : "text-emerald-600")}>
                {avgRisk}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Ryzyko śr.</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{critical.length + high.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pilnych</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <EmptyState onGenerate={handleGenerate} isLoading={generating} />
        ) : (
          <div className="space-y-3">
            {[...critical, ...high, ...rest].map((insight: Insight) => (
              <div key={insight.id} onClick={() => !insight.readAt && handleRead(insight.id)}>
                <InsightCard insight={insight} onDismiss={handleDismiss} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
