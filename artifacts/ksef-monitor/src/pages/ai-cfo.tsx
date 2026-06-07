import { useState, useRef, useEffect, useId } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useGetAiCfoInsights,
  usePostAiCfoChat,
  usePostAiCfoFoodCost,
} from "@workspace/api-client-react";
import {
  TrendingUp,
  PackageSearch,
  ArrowDownRight,
  Sparkles,
  Send,
  RefreshCw,
  ChevronRight,
  BarChart2,
  UtensilsCrossed,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";

// ─── Inline types ─────────────────────────────────────────────────────────────

type InsightCardData = {
  type: "price_spike" | "quantity_anomaly" | "savings_opportunity";
  title: string;
  description: string;
  impactAmount: number;
  impactLabel: string;
  productId?: number | null;
  supplierId?: number | null;
  productName?: string | null;
  supplierName?: string | null;
};

type KpiCard = {
  label: string;
  value: string;
  delta?: string | null;
  deltaPositive?: boolean | null;
};

type TableData = {
  headers: string[];
  rows: string[][];
};

type Action = {
  label: string;
  href: string;
};

type ChatReply = {
  type: string;
  summary: string;
  kpiCards: KpiCard[];
  table?: TableData | null;
  recommendation?: string;
  actions: Action[];
};

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; data: ChatReply };

type FoodCostDish = {
  name: string;
  weeklySales?: number | null;
  ingredientCostPerPortion: number;
  salePricePerPortion: number;
  marginPct: number;
  weeklyGrossProfit?: number | null;
  suggestedPrice?: number | null;
};

type FoodCostResult = {
  dishes: FoodCostDish[];
  summary?: string;
  avgMarginPct?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLN = (n: number) =>
  new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(n);

const PCT = (n: number) => `${n.toFixed(1)}%`;

const INSIGHT_CONFIG = {
  price_spike: {
    icon: TrendingUp,
    color: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
    badge: "bg-rose-100 text-rose-600",
    label: "Podwyzka ceny",
  },
  quantity_anomaly: {
    icon: PackageSearch,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    label: "Anomalia ilosci",
  },
  savings_opportunity: {
    icon: ArrowDownRight,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    label: "Szansa oszczednosci",
  },
} as const;

const QUICK_CHIPS: Array<{ group: string; chips: string[] }> = [
  {
    group: "Produkty",
    chips: [
      "Ktore produkty drozaly w ostatnim miesiacu?",
      "Pokaz 5 produktow z najwyzszym spendem",
      "Co podrozalo najbardziej procentowo?",
    ],
  },
  {
    group: "Koszty",
    chips: [
      "Jaki jest moj laczny food cost?",
      "Porownaj wydatki miesiac do miesiaca",
      "Gdzie trace najwiecej przez podwyzki?",
    ],
  },
  {
    group: "Ilosci",
    chips: [
      "Gdzie zamawiamy nadmiernie duzo?",
      "Anomalie ilosciowe w ostatnim miesiacu",
    ],
  },
  {
    group: "Dostawcy",
    chips: [
      "Ktory dostawca jest najdrozszy?",
      "Porownaj ceny tego samego produktu u roznych dostawcow",
      "Gdzie moge wynegocjowac lepsza cene?",
    ],
  },
];

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({ card }: { card: InsightCardData }) {
  const cfg = INSIGHT_CONFIG[card.type] ?? INSIGHT_CONFIG.price_spike;
  const Icon = cfg.icon;
  const isPositive = card.type === "savings_opportunity";

  const href =
    card.productId ? "/produkty" : card.supplierId ? "/dostawcy" : "/faktury";

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow",
        cfg.border,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            cfg.bg,
          )}
        >
          <Icon className={cn("w-[18px] h-[18px]", cfg.color)} />
        </div>
        <span
          className={cn(
            "text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0",
            cfg.badge,
          )}
        >
          {cfg.label}
        </span>
      </div>

      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-900 mb-1 leading-snug">
          {card.title}
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span
          className={cn(
            "text-base font-bold",
            isPositive ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {card.impactLabel}
        </span>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Szczegoly
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-sm"
        >
          <div className="flex justify-between">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <Skeleton className="w-24 h-5 rounded-full" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex justify-between pt-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AiReplyCard ──────────────────────────────────────────────────────────────

function AiReplyCard({ data }: { data: ChatReply }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-800 leading-relaxed">{data.summary}</p>

      {data.kpiCards && data.kpiCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.kpiCards.map((kpi, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-3 border border-gray-200"
            >
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
                {kpi.label}
              </p>
              <p className="text-lg font-bold text-gray-900 leading-none">
                {kpi.value}
              </p>
              {kpi.delta && (
                <p
                  className={cn(
                    "text-[11px] font-medium mt-1",
                    kpi.deltaPositive ? "text-emerald-600" : "text-rose-500",
                  )}
                >
                  {kpi.delta}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {data.table &&
        data.table.headers.length > 0 &&
        data.table.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {data.table.headers.map((h, i) => (
                    <th
                      key={i}
                      className="text-left px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.table.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2.5 text-gray-700 whitespace-nowrap"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {data.recommendation && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-1">
            Rekomendacja
          </p>
          <p className="text-sm text-teal-800 leading-relaxed">
            {data.recommendation}
          </p>
        </div>
      )}

      {data.actions && data.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.actions.map((a, i) => (
            <Link key={i} href={a.href}>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                {a.label}
                <ArrowUpRight className="w-3 h-3" />
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ChatCfo ─────────────────────────────────────────────────────────────────

function ChatCfo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = usePostAiCfoChat();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function buildHistory() {
    return messages.slice(-10).map((m) => ({
      role: m.role,
      content:
        m.role === "user"
          ? m.text
          : (m.data.summary ?? "").slice(0, 500),
    }));
  }

  function sendMessage(question: string) {
    if (!question.trim() || chatMutation.isPending) return;
    const q = question.trim();
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: ChatMessage = {
      id: `${uid}-${Date.now()}`,
      role: "user",
      text: q,
    };
    setMessages((prev) => [...prev, userMsg]);

    chatMutation.mutate(
      { data: { question: q, history: buildHistory() } },
      {
        onSuccess(data) {
          const replyMsg: ChatMessage = {
            id: `${uid}-${Date.now()}-r`,
            role: "assistant",
            data: data as ChatReply,
          };
          setMessages((prev) => [...prev, replyMsg]);
        },
        onError() {
          const errMsg: ChatMessage = {
            id: `${uid}-${Date.now()}-err`,
            role: "assistant",
            data: {
              type: "general",
              summary:
                "Przepraszam, wystapil problem z polaczeniem. Sprobuj ponownie.",
              kpiCards: [],
              actions: [],
            },
          };
          setMessages((prev) => [...prev, errMsg]);
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Chat CFO</h2>
          <p className="text-[11px] text-gray-400">
            Zadaj pytanie o koszty, ceny lub dostawcow
          </p>
        </div>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="px-5 py-4 space-y-5 max-h-[520px] overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-md text-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-100">
                    <AiReplyCard data={msg.data} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-100">
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Quick chips — only when no messages */}
      {messages.length === 0 && (
        <div className="px-5 pt-5 pb-3 space-y-4">
          {QUICK_CHIPS.map((group) => (
            <div key={group.group}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.chips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    disabled={chatMutation.isPending}
                    className="text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-primary/10 hover:text-primary text-gray-700 transition-colors border border-transparent hover:border-primary/20 disabled:opacity-50 text-left"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Sparkles className="absolute left-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Zapytaj o produkty, ceny, ilosci, dostawcow lub marze…"
              rows={1}
              disabled={chatMutation.isPending}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none transition-all disabled:opacity-50"
              style={{ maxHeight: "120px", overflowY: "auto" }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height =
                  Math.min(t.scrollHeight, 120) + "px";
              }}
            />
          </div>
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || chatMutation.isPending}
            size="icon"
            className="rounded-xl h-10 w-10 shrink-0"
          >
            {chatMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Wyczysc historie
          </button>
        )}
      </div>
    </div>
  );
}

// ─── FoodCostAi ──────────────────────────────────────────────────────────────

function marginColor(pct: number) {
  if (pct >= 65) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rose-600";
}

function marginBg(pct: number) {
  if (pct >= 65) return "bg-emerald-50";
  if (pct >= 50) return "bg-amber-50";
  return "bg-rose-50";
}

function FoodCostAi() {
  const [menuText, setMenuText] = useState("");
  const [salesText, setSalesText] = useState("");
  const [result, setResult] = useState<FoodCostResult | null>(null);

  const mutation = usePostAiCfoFoodCost();

  function analyze() {
    if (!menuText.trim()) return;
    setResult(null);
    mutation.mutate(
      { data: { menuText: menuText.trim(), salesText: salesText.trim() } },
      {
        onSuccess(data) {
          setResult(data as FoodCostResult);
        },
      },
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
          <UtensilsCrossed className="w-4 h-4 text-orange-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Food Cost AI</h2>
          <p className="text-[11px] text-gray-400">
            Wklej menu z recepturami i dane sprzedazy — AI obliczy marze
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Menu i receptury
              <span className="font-normal text-gray-400 ml-1">
                (skladniki + ilosci)
              </span>
            </label>
            <textarea
              value={menuText}
              onChange={(e) => setMenuText(e.target.value)}
              placeholder={`np.\nMakaron carbonara (2 porcje):\n- 200g spaghetti\n- 100g boczek wedzony\n- 2 jajka\n- 30g parmezan\nCena menu: 32 zl`}
              rows={9}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Sprzedaz tygodniowa
              <span className="font-normal text-gray-400 ml-1">
                (opcjonalnie)
              </span>
            </label>
            <textarea
              value={salesText}
              onChange={(e) => setSalesText(e.target.value)}
              placeholder={`np.\nMakaron carbonara: 45 porcji\nBurger wolowy: 62 porcje\nSalatka grecka: 28 porcji`}
              rows={9}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none font-mono"
            />
          </div>
        </div>

        <Button
          onClick={analyze}
          disabled={!menuText.trim() || mutation.isPending}
          className="gap-2"
        >
          {mutation.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Analizuje food cost…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analizuj food cost
            </>
          )}
        </Button>

        {mutation.isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
            Nie udalo sie przetworzyc danych. Sprawdz format receptur i sprobuj
            ponownie.
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-2">
            {/* Summary KPIs */}
            <div className="flex flex-wrap gap-3">
              {result.avgMarginPct != null && (
                <div
                  className={cn(
                    "rounded-xl px-4 py-3 border border-gray-200",
                    marginBg(result.avgMarginPct),
                  )}
                >
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
                    Srednia marza
                  </p>
                  <p
                    className={cn(
                      "text-xl font-bold",
                      marginColor(result.avgMarginPct),
                    )}
                  >
                    {PCT(result.avgMarginPct)}
                  </p>
                </div>
              )}
              <div className="rounded-xl px-4 py-3 border border-gray-200 bg-gray-50">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
                  Analizowanych dan
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {result.dishes.length}
                </p>
              </div>
              {result.dishes.filter((d) => d.suggestedPrice != null).length >
                0 && (
                <div className="rounded-xl px-4 py-3 border border-amber-200 bg-amber-50">
                  <p className="text-[10px] text-amber-600 uppercase tracking-wide mb-0.5">
                    Wymaga podwyzki
                  </p>
                  <p className="text-xl font-bold text-amber-700">
                    {result.dishes.filter((d) => d.suggestedPrice != null).length}
                  </p>
                </div>
              )}
            </div>

            {result.summary && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {result.summary}
              </p>
            )}

            {/* Results table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">
                      Danie
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Sprzed./tyg.
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Koszt/por.
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Cena
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Marza %
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Zysk/tyg.
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Suger. cena
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.dishes.map((dish, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-gray-100 last:border-0",
                        dish.suggestedPrice != null
                          ? "bg-amber-50/40"
                          : "hover:bg-gray-50",
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[160px] truncate">
                        {dish.name}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {dish.weeklySales != null
                          ? `${dish.weeklySales} szt.`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {PLN(dish.ingredientCostPerPortion)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {PLN(dish.salePricePerPortion)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-semibold",
                          marginColor(dish.marginPct),
                        )}
                      >
                        {PCT(dish.marginPct)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {dish.weeklyGrossProfit != null
                          ? PLN(dish.weeklyGrossProfit)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {dish.suggestedPrice != null ? (
                          <span className="font-semibold text-amber-700">
                            {PLN(dish.suggestedPrice)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiCfoPage() {
  const {
    data: insights,
    isLoading,
    refetch,
    isRefetching,
  } = useGetAiCfoInsights();

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">AI CFO</h1>
            </div>
            <p className="text-sm text-gray-500">
              Analiza kosztow, porownania cen i rekomendacje finansowe na
              podstawie Twoich faktur
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-2 shrink-0"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")}
            />
            Odswiez
          </Button>
        </div>

        {/* Top 3 insight cards */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Kluczowe obserwacje — ostatnie 90 dni
          </h2>
          {isLoading ? (
            <InsightsSkeleton />
          ) : insights && insights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.map((card, i) => (
                <InsightCard key={i} card={card as InsightCardData} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <BarChart2 className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                Brak danych do analizy
              </p>
              <p className="text-xs text-gray-500">
                Zaimportuj faktury od co najmniej 2 okresow, aby zobaczyc
                analize cen.
              </p>
            </div>
          )}
        </section>

        {/* Chat CFO */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Chat z AI CFO
          </h2>
          <ChatCfo />
        </section>

        {/* Food Cost AI */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Food Cost AI
          </h2>
          <FoodCostAi />
        </section>
      </div>
    </Layout>
  );
}
