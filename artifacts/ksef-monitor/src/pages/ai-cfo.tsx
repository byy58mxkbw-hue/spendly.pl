import { useState, useRef, useEffect, useId, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useGetAiCfoInsights,
  usePostAiCfoChat,
  usePostAiCfoFoodCost,
  useListAiCfoSessions,
  useCreateAiCfoSession,
  useUpdateAiCfoSession,
  useDeleteAiCfoSession,
  useGetAiCfoSession,
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
  Plus,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
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
  productId?: number | null;
  supplierId?: number | null;
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
  sales?: number | null;
  ingredientCost: number;
  salePrice: number;
  marginPct: number;
  grossProfit?: number | null;
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
    card.productId
      ? `/products?id=${card.productId}`
      : card.supplierId
        ? `/suppliers/${card.supplierId}`
        : "/invoices";

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

// ─── SessionSidebar ────────────────────────────────────────────────────────────

type SessionSummary = {
  id: number;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  loading,
}: {
  sessions: SessionSummary[];
  activeSessionId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (sessions.length === 0 && !loading) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onNew}
          className="gap-1.5 text-xs h-8"
        >
          <Plus className="w-3.5 h-3.5" />
          Nowa sesja
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((p) => !p)}
          className="gap-1.5 text-xs h-8 max-w-[220px]"
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {activeSessionId
              ? (sessions.find((s) => s.id === activeSessionId)?.title ?? "Sesja")
              : "Historia sesji"}
          </span>
          {open ? (
            <ChevronUp className="w-3 h-3 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 shrink-0" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNew}
          className="gap-1 text-xs h-8 px-2.5"
          title="Nowa sesja"
        >
          <Plus className="w-3.5 h-3.5" />
          Nowa
        </Button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Ostatnie sesje (90 dni)
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-xs text-gray-400 text-center">
                Brak zapisanych sesji
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors group border-b border-gray-50 last:border-0",
                    activeSessionId === s.id && "bg-primary/5",
                  )}
                  onClick={() => { onSelect(s.id); setOpen(false); }}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs font-medium truncate",
                      activeSessionId === s.id ? "text-primary" : "text-gray-800",
                    )}>
                      {s.title}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(s.updatedAt).toLocaleDateString("pl-PL")}
                      {" · "}
                      {s.messageCount} wiad.
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ChatCfo ─────────────────────────────────────────────────────────────────

function ChatCfo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = usePostAiCfoChat();
  const sessionsQuery = useListAiCfoSessions();
  const createSessionMutation = useCreateAiCfoSession();
  const updateSessionMutation = useUpdateAiCfoSession();
  const deleteSessionMutation = useDeleteAiCfoSession();
  const getSessionQuery = useGetAiCfoSession(
    loadingSessionId ?? 0,
    { query: { queryKey: ["ai-cfo-session", loadingSessionId], enabled: loadingSessionId !== null } }
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (loadingSessionId === null) return;
    if (getSessionQuery.data) {
      const session = getSessionQuery.data as {
        id: number;
        title: string;
        messages: Array<{ id: string; role: "user" | "assistant"; text?: string | null; data?: unknown | null }>;
      };
      const restored: ChatMessage[] = session.messages.map((m) => {
        if (m.role === "user") {
          return { id: m.id, role: "user" as const, text: m.text ?? "" };
        }
        return { id: m.id, role: "assistant" as const, data: (m.data ?? {}) as ChatReply };
      });
      setMessages(restored);
      setActiveSessionId(session.id);
      setLoadingSessionId(null);
    } else if (getSessionQuery.isError) {
      // Failed to load session — reset to new session state
      setLoadingSessionId(null);
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [getSessionQuery.data, getSessionQuery.isError, loadingSessionId]);

  function serializeMessages(msgs: ChatMessage[]) {
    return msgs.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.role === "user" ? m.text : null,
      data: m.role === "assistant" ? m.data : null,
    }));
  }

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
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    chatMutation.mutate(
      { data: { question: q, history: buildHistory() } },
      {
        onSuccess(data) {
          const replyMsg: ChatMessage = {
            id: `${uid}-${Date.now()}-r`,
            role: "assistant",
            data: data as ChatReply,
          };
          const updatedMessages = [...newMessages, replyMsg];
          setMessages(updatedMessages);

          const serialized = serializeMessages(updatedMessages);

          if (activeSessionId === null) {
            createSessionMutation.mutate(
              { data: { title: q.slice(0, 120), messages: serialized } },
              {
                onSuccess(session) {
                  const s = session as { id: number };
                  setActiveSessionId(s.id);
                  sessionsQuery.refetch();
                },
              }
            );
          } else {
            updateSessionMutation.mutate(
              { id: activeSessionId, data: { messages: serialized } },
              { onSuccess: () => sessionsQuery.refetch() }
            );
          }
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

  function handleNewSession() {
    setMessages([]);
    setActiveSessionId(null);
    setLoadingSessionId(null);
  }

  function handleSelectSession(id: number) {
    if (id === activeSessionId) return;
    setMessages([]);
    setActiveSessionId(null);
    setLoadingSessionId(id);
  }

  function handleDeleteSession(id: number) {
    deleteSessionMutation.mutate(
      { id },
      {
        onSuccess: () => {
          if (activeSessionId === id) {
            setMessages([]);
            setActiveSessionId(null);
          }
          sessionsQuery.refetch();
        },
      }
    );
  }

  const sessions = (sessionsQuery.data ?? []) as SessionSummary[];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
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
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
          loading={sessionsQuery.isLoading}
        />
      </div>

      {/* Loading session */}
      {loadingSessionId !== null && getSessionQuery.isLoading && (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-sm text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Wczytywanie sesji…
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && loadingSessionId === null && (
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
      {messages.length === 0 && loadingSessionId === null && (
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
              disabled={chatMutation.isPending || loadingSessionId !== null}
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
            disabled={!input.trim() || chatMutation.isPending || loadingSessionId !== null}
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
            onClick={handleNewSession}
            className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Nowa sesja
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
                      "text-2xl font-bold",
                      marginColor(result.avgMarginPct),
                    )}
                  >
                    {PCT(result.avgMarginPct)}
                  </p>
                </div>
              )}
              {result.summary && (
                <div className="flex-1 min-w-[200px] bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-1">
                    Ocena
                  </p>
                  <p className="text-xs text-teal-800 leading-relaxed">
                    {result.summary}
                  </p>
                </div>
              )}
            </div>

            {/* Dishes table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">
                      Danie
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Koszt sk.
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Cena menu
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Marza
                    </th>
                    {result.dishes.some((d) => d.sales != null) && (
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                        Sprzedaz
                      </th>
                    )}
                    {result.dishes.some((d) => d.grossProfit != null) && (
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                        Zysk brutto
                      </th>
                    )}
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-600">
                      Sugerowana cena
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.dishes.map((d, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2.5 font-medium text-gray-800">
                        {d.name}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {PLN(d.ingredientCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {PLN(d.salePrice)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-semibold",
                          marginColor(d.marginPct),
                        )}
                      >
                        {PCT(d.marginPct)}
                      </td>
                      {result.dishes.some((x) => x.sales != null) && (
                        <td className="px-3 py-2.5 text-right text-gray-700">
                          {d.sales != null ? `${d.sales} szt.` : "—"}
                        </td>
                      )}
                      {result.dishes.some((x) => x.grossProfit != null) && (
                        <td className="px-3 py-2.5 text-right text-gray-700">
                          {d.grossProfit != null ? PLN(d.grossProfit) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        {d.suggestedPrice != null ? (
                          <span className="font-semibold text-rose-600">
                            {PLN(d.suggestedPrice)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium">OK</span>
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
  const insightsQuery = useGetAiCfoInsights();
  const [tab, setTab] = useState<"chat" | "food-cost">("chat");

  const cards = (insightsQuery.data ?? []) as InsightCardData[];

  return (
    <Layout>
      <div className="px-6 py-8 max-w-6xl mx-auto space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI CFO</h1>
          <p className="text-sm text-gray-500 mt-1">
            Analizy AI, chat z danymi i kalkulator food cost
          </p>
        </div>

        {/* Top insights */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Kluczowe sygnaly (ostatnie 90 dni)
            </h2>
          </div>
          {insightsQuery.isLoading ? (
            <InsightsSkeleton />
          ) : cards.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl border border-gray-200 px-6 py-8 text-center">
              <p className="text-sm text-gray-500">
                Brak danych do analizy. Importuj faktury, aby zobaczyc sygnaly cenowe.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cards.map((card, i) => (
                <InsightCard key={i} card={card} />
              ))}
            </div>
          )}
        </section>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setTab("chat")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === "chat"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            Chat CFO
          </button>
          <button
            onClick={() => setTab("food-cost")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === "food-cost"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            Food Cost AI
          </button>
        </div>

        {/* Tab content */}
        {tab === "chat" ? <ChatCfo /> : <FoodCostAi />}
      </div>
    </Layout>
  );
}
