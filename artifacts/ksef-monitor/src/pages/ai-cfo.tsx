import { useState, useCallback, useRef, useMemo } from "react";
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
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Info,
  Sparkles,
  DollarSign,
  Store,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  useGetInsights,
  usePostInsightsGenerate,
  usePostInsightsIdDismiss,
  usePostInsightsIdRead,
} from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  metadata?: {
    estimatedImpact?: number | null;
    category?: string | null;
    productName?: string | null;
    supplierName?: string | null;
  } | null;
};

// ─── Severity config ──────────────────────────────────────────────────────────
const SEV = {
  critical: {
    label: "Krytyczne",
    badge: "bg-[#FF5C5C]/15 text-[#FF5C5C] border-[#FF5C5C]/20",
    icon: AlertTriangle,
    dot: "bg-[#FF5C5C]",
    bar: "bg-[#FF5C5C]",
    glow: "shadow-[0_0_0_1px_rgba(255,92,92,0.25)]",
  },
  high: {
    label: "Ostrzeżenie",
    badge: "bg-[#F5B942]/15 text-[#F5B942] border-[#F5B942]/20",
    icon: AlertTriangle,
    dot: "bg-[#F5B942]",
    bar: "bg-[#F5B942]",
    glow: "shadow-[0_0_0_1px_rgba(245,185,66,0.2)]",
  },
  medium: {
    label: "Szansa",
    badge: "bg-[#4ADEB3]/15 text-[#4ADEB3] border-[#4ADEB3]/20",
    icon: TrendingUp,
    dot: "bg-[#4ADEB3]",
    bar: "bg-[#4ADEB3]",
    glow: "",
  },
  low: {
    label: "Info",
    badge: "bg-muted text-muted-foreground border-border",
    icon: Info,
    dot: "bg-muted-foreground",
    bar: "bg-muted-foreground",
    glow: "",
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
  price_trend: "Trend",
  supplier_pattern: "Dostawca",
  supplier_risk: "Ryzyko dostawcy",
  cost_forecast: "Prognoza",
  weekly_trend: "Trend",
  record_high: "Rekord ceny",
  seasonal: "Sezonowość",
  market_outlook: "Rynek",
  action_required: "Rekomendacja",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatImpact(val: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(Math.abs(val));
}

function getCategory(insight: Insight): string {
  return insight.metadata?.category ?? (
    ["price_drop", "action_required"].includes(insight.type) ? "opportunity"
      : ["price_spike", "record_high", "supplier_risk"].includes(insight.type) ? "risk"
        : ["seasonal", "market_outlook"].includes(insight.type) ? "warning"
          : "info"
  );
}

// ─── Loading shimmer ──────────────────────────────────────────────────────────
function GeneratingState() {
  const steps = [
    "AI analizuje zmiany cen…",
    "Sprawdzanie rynku…",
    "Obliczanie ryzyka dostawców…",
    "Szacowanie oszczędności…",
    "Finalizowanie rekomendacji…",
  ];
  const [step] = useState(() => Math.floor(Math.random() * steps.length));
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-ping" />
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{steps[step]}</p>
      <p className="text-xs text-muted-foreground mb-8">To może potrwać do 30 sekund</p>
      <div className="w-48 space-y-2">
        {[1, 0.7, 0.5].map((opacity, i) => (
          <div key={i} className="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary rounded-full animate-pulse"
              style={{ width: `${60 + i * 15}%`, opacity }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onGenerate, isLoading }: { onGenerate: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
        <Zap className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">AI CFO gotowy do analizy</h3>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm leading-relaxed">
        Wygeneruj analizę na podstawie Twoich faktur, aby zobaczyć możliwe oszczędności, ryzyka cenowe i rekomendacje.
      </p>
      <Button onClick={onGenerate} disabled={isLoading} className="gap-2 px-6">
        <Sparkles className={cn("w-4 h-4", isLoading && "animate-spin")} />
        {isLoading ? "Analizuję…" : "Uruchom AI CFO"}
      </Button>
    </div>
  );
}

// ─── Hero block ───────────────────────────────────────────────────────────────
function HeroBlock({
  insights,
  onGenerate,
  generating,
}: {
  insights: Insight[];
  onGenerate: () => void;
  generating: boolean;
}) {
  const totalSavings = useMemo(() => {
    return insights.reduce((sum, i) => {
      const impact = i.metadata?.estimatedImpact ?? 0;
      return sum + (impact > 0 ? impact : 0);
    }, 0);
  }, [insights]);

  const totalRisk = useMemo(() => {
    return insights.reduce((sum, i) => {
      const impact = i.metadata?.estimatedImpact ?? 0;
      return sum + (impact < 0 ? Math.abs(impact) : 0);
    }, 0);
  }, [insights]);

  const topDrivers = useMemo(() => {
    return insights
      .filter((i) => i.metadata?.estimatedImpact && Math.abs(i.metadata.estimatedImpact) > 100)
      .sort((a, b) => Math.abs(b.metadata?.estimatedImpact ?? 0) - Math.abs(a.metadata?.estimatedImpact ?? 0))
      .slice(0, 3)
      .map((i) => i.metadata?.productName ?? i.title.split(" ").slice(0, 2).join(" "))
      .filter(Boolean)
      .join(", ");
  }, [insights]);

  const criticalCount = insights.filter((i) => i.severity === "critical").length;
  const opportunityCount = insights.filter((i) => getCategory(i) === "opportunity").length;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-white/8 mb-6"
      style={{ background: "linear-gradient(135deg, #0d1520 0%, #111c2a 50%, #0d1520 100%)" }}
    >
      {/* Animated glow */}
      <div
        className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(74,222,179,0.08) 0%, transparent 70%)",
          transform: "translate(30%, -30%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(74,222,179,0.05) 0%, transparent 70%)",
          transform: "translate(-30%, 30%)",
        }}
      />

      <div className="relative p-6 md:p-8">
        {/* Label */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#4ADEB3]/30 bg-[#4ADEB3]/10">
            <Sparkles className="w-3 h-3 text-[#4ADEB3]" />
            <span className="text-[11px] font-semibold text-[#4ADEB3] tracking-wider uppercase">AI CFO</span>
          </div>
          <span className="text-xs text-muted-foreground">{insights.length} insightów aktywnych</span>
        </div>

        {/* Main headline */}
        <div className="mb-2">
          {totalSavings > 0 ? (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Wykryto możliwe oszczędności</p>
              <p className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {formatImpact(totalSavings)}
                <span className="text-base font-normal text-muted-foreground ml-2">/ miesiąc</span>
              </p>
            </>
          ) : totalRisk > 0 ? (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Wykryte ryzyko finansowe</p>
              <p className="text-3xl md:text-4xl font-bold text-[#FF5C5C] leading-tight">
                {formatImpact(totalRisk)}
                <span className="text-base font-normal text-muted-foreground ml-2">/ miesiąc</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Analiza kosztów restauracji</p>
              <p className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {insights.length} insightów
              </p>
            </>
          )}
        </div>

        {/* Subtext */}
        {topDrivers && (
          <p className="text-sm text-muted-foreground mb-6 max-w-lg leading-relaxed">
            Największy wpływ: {topDrivers}.{" "}
            {criticalCount > 0 && <span className="text-[#FF5C5C] font-medium">{criticalCount} krytycznych alertów.</span>}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          {totalRisk > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FF5C5C]" />
              <span className="text-sm text-white/70">Ryzyko: <strong className="text-white">{formatImpact(totalRisk)}/mies.</strong></span>
            </div>
          )}
          {totalSavings > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#4ADEB3]" />
              <span className="text-sm text-white/70">Oszczędności: <strong className="text-[#4ADEB3]">{formatImpact(totalSavings)}/mies.</strong></span>
            </div>
          )}
          {opportunityCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-sm text-white/70"><strong className="text-white">{opportunityCount}</strong> szans do wykorzystania</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "#4ADEB3", color: "#0B0F14" }}
          >
            <RefreshCw className={cn("w-4 h-4", generating && "animate-spin")} />
            {generating ? "Analizuję…" : "Odśwież analizę"}
          </button>
          <button
            onClick={() => document.getElementById("insights-list")?.scrollIntoView({ behavior: "smooth" })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-white/15 text-white/80 hover:border-white/30 hover:text-white transition-all"
          >
            Zobacz rekomendacje
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Daily Briefing ───────────────────────────────────────────────────────────
function DailyBriefing({ insights }: { insights: Insight[] }) {
  const bullets = useMemo(() => {
    const sorted = [...insights].sort((a, b) => b.riskScore - a.riskScore);
    return sorted.slice(0, 6).map((i) => {
      const impact = i.metadata?.estimatedImpact;
      const impactStr = impact && Math.abs(impact) > 50
        ? impact < 0
          ? ` — możliwa strata ${formatImpact(impact)}/mies.`
          : ` — możliwa oszczędność ${formatImpact(impact)}/mies.`
        : "";
      return { text: i.title + impactStr, severity: i.severity, type: i.type };
    });
  }, [insights]);

  if (bullets.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded-md bg-primary/15 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Dzisiejszy briefing</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
        </span>
      </div>
      <div className="space-y-2.5">
        {bullets.map((b, i) => {
          const sev = SEV[b.severity as keyof typeof SEV] ?? SEV.low;
          return (
            <div key={i} className="flex items-start gap-3">
              <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", sev.dot)} />
              <p className="text-sm text-foreground/85 leading-snug">{b.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Insight card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, onDismiss, onRead }: {
  insight: Insight;
  onDismiss: (id: number) => void;
  onRead: (id: number) => void;
}) {
  const sev = SEV[insight.severity as keyof typeof SEV] ?? SEV.low;
  const SevIcon = sev.icon;
  const TypeIcon = TYPE_ICON[insight.type] ?? AlertTriangle;
  const isUnread = !insight.readAt;
  const impact = insight.metadata?.estimatedImpact ?? null;
  const cat = getCategory(insight);
  const isOpportunity = cat === "opportunity" || (impact !== null && impact > 0);
  const isRisk = cat === "risk" || (impact !== null && impact < 0);

  return (
    <div
      className={cn(
        "group relative bg-card border border-border rounded-2xl p-5 transition-all hover:border-border/80",
        isUnread && "border-l-2",
        isUnread && insight.severity === "critical" && "border-l-[#FF5C5C]",
        isUnread && insight.severity === "high" && "border-l-[#F5B942]",
        isUnread && insight.severity === "medium" && "border-l-[#4ADEB3]",
        isUnread && insight.severity === "low" && "border-l-primary",
      )}
      onClick={() => isUnread && onRead(insight.id)}
    >
      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(insight.id); }}
        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Odrzuć"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Top row: severity badge + type */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border", sev.badge)}>
          <SevIcon className="w-3 h-3" />
          {sev.label}
        </span>
        <span className="text-[11px] text-muted-foreground font-medium">{TYPE_LABEL[insight.type] ?? insight.type}</span>
        {isUnread && <div className={cn("w-1.5 h-1.5 rounded-full ml-auto", sev.dot)} />}
      </div>

      {/* Title + financial impact */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug flex-1">{insight.title}</h3>
        {impact !== null && Math.abs(impact) > 50 && (
          <div className={cn(
            "shrink-0 text-right",
          )}>
            <p className={cn(
              "text-sm font-bold",
              isRisk && "text-[#FF5C5C]",
              isOpportunity && "text-[#4ADEB3]",
            )}>
              {isRisk ? "-" : "+"}{formatImpact(impact)}
            </p>
            <p className="text-[10px] text-muted-foreground">/miesiąc</p>
          </div>
        )}
      </div>

      {/* Body */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{insight.body}</p>

      {/* Bottom: risk bar + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-36">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full", sev.bar)}
              style={{ width: `${insight.riskScore}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium w-5">{insight.riskScore}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="text-[11px] font-medium text-primary hover:underline transition-colors">
            {isOpportunity ? "Sprawdź oszczędności" : "Pokaż historię"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Supplier risk panel ──────────────────────────────────────────────────────
function SupplierRiskPanel({ insights }: { insights: Insight[] }) {
  const supplierInsights = insights.filter((i) =>
    ["supplier_risk", "supplier_pattern"].includes(i.type) ||
    (i.metadata?.supplierName && i.severity !== "low")
  );

  if (supplierInsights.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center">
          <Users className="w-3 h-3 text-amber-500" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Ryzyko dostawców</h2>
      </div>
      <div className="space-y-3">
        {supplierInsights.slice(0, 3).map((i, idx) => {
          const sev = SEV[i.severity as keyof typeof SEV] ?? SEV.low;
          const impact = i.metadata?.estimatedImpact;
          return (
            <div key={idx} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", sev.badge)}>
                <Users className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground mb-0.5 truncate">{i.title}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{i.body}</p>
              </div>
              {impact && Math.abs(impact) > 50 && (
                <p className={cn("text-xs font-bold shrink-0", impact < 0 ? "text-[#FF5C5C]" : "text-[#4ADEB3]")}>
                  {impact < 0 ? "-" : "+"}{formatImpact(impact)}<span className="text-[10px] font-normal text-muted-foreground">/mies.</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Market intelligence ──────────────────────────────────────────────────────
function MarketIntelligence({ insights }: { insights: Insight[] }) {
  const marketInsights = insights.filter((i) =>
    ["market_outlook", "seasonal", "cost_forecast"].includes(i.type)
  );

  if (marketInsights.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Monitoring rynku</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
        {marketInsights.map((insight, i) => {
          const sev = SEV[insight.severity as keyof typeof SEV] ?? SEV.low;
          const Icon = TYPE_ICON[insight.type] ?? Globe;
          const impact = insight.metadata?.estimatedImpact;
          return (
            <div
              key={i}
              className="flex-shrink-0 w-52 bg-card border border-border rounded-2xl p-4"
            >
              <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-3", sev.badge)}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-foreground mb-1 line-clamp-2">{insight.title}</p>
              {impact && Math.abs(impact) > 50 ? (
                <p className={cn("text-sm font-bold mt-2", impact < 0 ? "text-[#FF5C5C]" : "text-[#4ADEB3]")}>
                  {impact < 0 ? "−" : "+"}{formatImpact(impact)}<span className="text-[10px] font-normal text-muted-foreground">/mies.</span>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">{insight.body.split(".")[0]}.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function AiCfoPage() {
  const qc = useQueryClient();
  const { data: insights = [], isLoading, queryKey } = useGetInsights();
  const { mutateAsync: generate } = usePostInsightsGenerate();
  const { mutateAsync: dismiss } = usePostInsightsIdDismiss();
  const { mutateAsync: markRead } = usePostInsightsIdRead();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    try {
      await generate({ data: {} });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setGenerateError(e?.response?.data?.error ?? e?.message ?? "Nie udało się uruchomić analizy.");
      setGenerating(false);
      return;
    }

    const currentInsights = qc.getQueryData<Insight[]>(queryKey) ?? [];
    const latestBefore = currentInsights.reduce<string>((max, i) => (i.createdAt > max ? i.createdAt : max), "");

    let attempts = 0;
    const iv = setInterval(async () => {
      attempts++;
      try { await qc.invalidateQueries({ queryKey }); } catch { /* keep polling */ }
      const fresh = qc.getQueryData<Insight[]>(queryKey) ?? [];
      const latestAfter = fresh.reduce<string>((max, i) => (i.createdAt > max ? i.createdAt : max), "");
      if (latestAfter > latestBefore || attempts >= 30) {
        clearInterval(iv);
        pollRef.current = null;
        await qc.invalidateQueries({ queryKey });
        setGenerating(false);
      }
    }, 3000);
    pollRef.current = iv;
  }, [generate, qc, queryKey]);

  const handleDismiss = useCallback(async (id: number) => {
    await dismiss({ id, data: {} });
    await qc.invalidateQueries({ queryKey });
  }, [dismiss, qc, queryKey]);

  const handleRead = useCallback(async (id: number) => {
    await markRead({ id, data: {} });
  }, [markRead]);

  const typedInsights = insights as Insight[];

  const sorted = useMemo(() => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...typedInsights].sort((a, b) => {
      const sevDiff = (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return b.riskScore - a.riskScore;
    });
  }, [typedInsights]);

  const mainInsights = sorted.filter(i =>
    !["market_outlook", "seasonal", "cost_forecast"].includes(i.type) ||
    i.severity === "critical"
  );

  const unread = typedInsights.filter((i) => !i.readAt).length;

  return (
    <Layout>
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-foreground">AI CFO</h1>
            {unread > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {unread}
              </span>
            )}
          </div>
          {typedInsights.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", generating && "animate-spin")} />
              <span className="hidden sm:inline">{generating ? "Analizuję…" : "Odśwież"}</span>
            </Button>
          )}
        </div>

        {generateError && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {generateError}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        ) : generating && typedInsights.length === 0 ? (
          <GeneratingState />
        ) : typedInsights.length === 0 ? (
          <EmptyState onGenerate={handleGenerate} isLoading={generating} />
        ) : (
          <>
            {/* Hero */}
            <HeroBlock insights={typedInsights} onGenerate={handleGenerate} generating={generating} />

            {/* Generating overlay on refresh */}
            {generating && (
              <div className="mb-4 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5">
                <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />
                <p className="text-sm text-foreground font-medium">AI analizuje nowe dane…</p>
              </div>
            )}

            {/* Daily briefing */}
            <DailyBriefing insights={typedInsights} />

            {/* Market intelligence horizontal scroll */}
            <MarketIntelligence insights={typedInsights} />

            {/* Supplier risk */}
            <SupplierRiskPanel insights={typedInsights} />

            {/* Main insights list */}
            <div id="insights-list">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-foreground">Priorytety</h2>
                <span className="text-xs text-muted-foreground">{mainInsights.length} insightów</span>
              </div>
              <div className="space-y-3">
                {mainInsights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onDismiss={handleDismiss}
                    onRead={handleRead}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
