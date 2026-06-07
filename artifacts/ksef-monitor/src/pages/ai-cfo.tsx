import { useState, useRef, useEffect, useId, useCallback } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useGetAiCfoInsights,
  usePostAiCfoChat,
  usePostAiCfoFoodCost,
  usePostAiCfoExtractMenu,
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
  Upload,
  FileImage,
  Download,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
    accentBar: "bg-rose-400",
    label: "Podwyżka ceny",
  },
  quantity_anomaly: {
    icon: PackageSearch,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    accentBar: "bg-amber-400",
    label: "Anomalia ilości",
  },
  savings_opportunity: {
    icon: ArrowDownRight,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    accentBar: "bg-emerald-400",
    label: "Szansa oszczędności",
  },
} as const;

const QUICK_CHIPS: Array<{ group: string; chips: string[] }> = [
  {
    group: "Produkty",
    chips: [
      "Które produkty drożały w ostatnim miesiącu?",
      "Pokaż 5 produktów z najwyższym spendem",
      "Co podrożało najbardziej procentowo?",
    ],
  },
  {
    group: "Koszty",
    chips: [
      "Jaki jest mój łączny food cost?",
      "Porównaj wydatki miesiąc do miesiąca",
      "Gdzie tracę najwięcej przez podwyżki?",
    ],
  },
  {
    group: "Ilości",
    chips: [
      "Gdzie zamawiamy nadmiernie dużo?",
      "Anomalie ilościowe w ostatnim miesiącu",
    ],
  },
  {
    group: "Dostawcy",
    chips: [
      "Który dostawca jest najdroższy?",
      "Porównaj ceny tego samego produktu u różnych dostawców",
      "Gdzie mogę wynegocjować lepszą cenę?",
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
        "bg-white rounded-2xl border overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-all duration-200 group",
        cfg.border,
      )}
    >
      {/* Accent top bar */}
      <div className={cn("h-1 w-full", cfg.accentBar)} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Top row: icon + badge */}
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

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1 leading-snug">
            {card.title}
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>
        </div>

        {/* Impact + CTA */}
        <div className="flex items-end justify-between pt-3 border-t border-gray-100">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
              Wpływ
            </p>
            <span
              className={cn(
                "text-xl font-bold tracking-tight",
                isPositive ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {card.impactLabel}
            </span>
          </div>
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors"
          >
            Szczegóły
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
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
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
        >
          <div className="h-1 w-full bg-gray-200" />
          <div className="p-5 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <Skeleton className="w-24 h-5 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-100">
              <div className="space-y-1">
                <Skeleton className="h-2.5 w-10" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {data.kpiCards.map((kpi, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm"
            >
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-medium">
                {kpi.label}
              </p>
              <p className="text-lg font-bold text-gray-900 leading-none">
                {kpi.value}
              </p>
              {kpi.delta && (
                <p
                  className={cn(
                    "text-[11px] font-semibold mt-1.5 flex items-center gap-0.5",
                    kpi.deltaPositive ? "text-emerald-600" : "text-rose-500",
                  )}
                >
                  {kpi.deltaPositive
                    ? <ArrowDownRight className="w-3 h-3" />
                    : <ArrowUpRight className="w-3 h-3" />}
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
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {data.table.headers.map((h, i) => (
                    <th
                      key={i}
                      className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap"
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
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/70 transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={cn(
                          "px-3 py-2.5 whitespace-nowrap",
                          ci === 0 ? "font-medium text-gray-800" : "text-gray-600",
                        )}
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
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3.5">
          <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-1.5">
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
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 gap-1 border-gray-200 hover:border-primary/40 hover:text-primary hover:bg-primary/5"
              >
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
      <Button
        variant="outline"
        size="sm"
        onClick={onNew}
        className="gap-1.5 text-xs h-8"
      >
        <Plus className="w-3.5 h-3.5" />
        Nowa sesja
      </Button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen((p) => !p)}
          className="gap-1.5 text-xs h-8 max-w-[200px]"
        >
          <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
          <span className="truncate text-gray-600">
            {activeSessionId
              ? (sessions.find((s) => s.id === activeSessionId)?.title ?? "Sesja")
              : "Historia"}
          </span>
          {open ? (
            <ChevronUp className="w-3 h-3 shrink-0 text-gray-400" />
          ) : (
            <ChevronDown className="w-3 h-3 shrink-0 text-gray-400" />
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
        </Button>
      </div>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-50 w-72 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Ostatnie sesje
            </p>
            <p className="text-[10px] text-gray-300">90 dni</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-5 text-xs text-gray-400 text-center">
                Brak zapisanych sesji
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors group border-b border-gray-50 last:border-0",
                    activeSessionId === s.id && "bg-primary/5 border-l-2 border-l-primary",
                  )}
                  onClick={() => { onSelect(s.id); setOpen(false); }}
                >
                  <MessageSquare className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    activeSessionId === s.id ? "text-primary" : "text-gray-300",
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs font-medium truncate leading-tight",
                      activeSessionId === s.id ? "text-primary" : "text-gray-700",
                    )}>
                      {s.title}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(s.updatedAt).toLocaleDateString("pl-PL")}
                      {" · "}
                      {s.messageCount} wiad.
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-rose-50 hover:text-rose-500 transition-all text-gray-300 shrink-0"
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
                onSuccess(session: unknown) {
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
              summary: "Przepraszam, wystąpił problem z połączeniem. Spróbuj ponownie.",
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Chat CFO</h2>
            <p className="text-[11px] text-gray-400">
              Zadaj pytanie o koszty, ceny lub dostawców
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
        <div className="px-5 py-10 flex items-center justify-center gap-2 text-sm text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Wczytywanie sesji…
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && loadingSessionId === null && (
        <div className="px-5 py-5 space-y-5 max-h-[520px] overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-md text-sm leading-relaxed shadow-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-primary/10">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 bg-white rounded-2xl rounded-tl-sm px-4 py-3.5 border border-gray-200 shadow-sm">
                    <AiReplyCard data={msg.data} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-primary/10">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              </div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3.5 border border-gray-200 shadow-sm">
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.18}s` }}
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
        <div className="px-5 pt-5 pb-4 space-y-4">
          {QUICK_CHIPS.map((group) => (
            <div key={group.group}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.chips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    disabled={chatMutation.isPending}
                    className="text-xs px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 hover:bg-primary/8 hover:text-primary hover:border-primary/30 text-gray-600 transition-all duration-150 disabled:opacity-50"
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
      <div className="p-4 border-t border-gray-100 bg-gray-50/30 mt-auto">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Zapytaj o produkty, ceny, ilości, dostawców lub marżę…"
              rows={1}
              disabled={chatMutation.isPending || loadingSessionId !== null}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none transition-all disabled:opacity-50 bg-white"
              style={{ maxHeight: "120px", overflowY: "auto" }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
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
            className="mt-2 text-[11px] text-gray-400 hover:text-primary transition-colors"
          >
            + Nowa sesja
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

function marginRowBg(pct: number) {
  if (pct < 50) return "bg-rose-50/50";
  if (pct < 65) return "bg-amber-50/30";
  return "";
}

const ACCEPTED_MENU_FILE_TYPES = "image/jpeg,image/jpg,image/png,image/webp,application/pdf";

function FoodCostAi() {
  const [menuText, setMenuText] = useState("");
  const [salesText, setSalesText] = useState("");
  const [result, setResult] = useState<FoodCostResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = usePostAiCfoFoodCost();
  const extractMutation = usePostAiCfoExtractMenu();

  function downloadPdf() {
    if (!result) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    const reportDate = new Date().toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20, 184, 166);
    doc.text("Raport Food Cost AI", margin, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`Wygenerowano: ${reportDate}`, margin, 27);

    doc.setDrawColor(20, 184, 166);
    doc.setLineWidth(0.5);
    doc.line(margin, 31, pageWidth - margin, 31);

    let cursorY = 38;

    if (result.avgMarginPct != null) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text("Srednia marza:", margin, cursorY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const marginPct = result.avgMarginPct;
      if (marginPct >= 65) {
        doc.setTextColor(5, 150, 105);
      } else if (marginPct >= 50) {
        doc.setTextColor(180, 120, 0);
      } else {
        doc.setTextColor(220, 38, 38);
      }
      doc.text(`${marginPct.toFixed(1)}%`, margin + 38, cursorY);
      cursorY += 7;
    }

    if (result.summary) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const summaryLines = doc.splitTextToSize(result.summary, pageWidth - margin * 2);
      doc.text(summaryLines, margin, cursorY);
      cursorY += summaryLines.length * 5 + 4;
    }

    cursorY += 3;

    const hasSales = result.dishes.some((d) => d.sales != null);
    const hasGrossProfit = result.dishes.some((d) => d.grossProfit != null);

    const head: string[][] = [["Danie", "Koszt skl.", "Cena menu", "Food cost %", "Marza %"]];
    if (hasSales) head[0].push("Sprzedaz");
    if (hasGrossProfit) head[0].push("Zysk brutto");
    head[0].push("Sug. cena");

    const pln = (n: number) =>
      new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
        maximumFractionDigits: 0,
      }).format(n);

    const foodCostPct = (d: FoodCostDish) =>
      d.salePrice > 0 ? (d.ingredientCost / d.salePrice) * 100 : 0;

    const body = result.dishes.map((d) => {
      const fc = foodCostPct(d);
      const row = [
        d.name,
        pln(d.ingredientCost),
        pln(d.salePrice),
        `${fc.toFixed(1)}%`,
        `${d.marginPct.toFixed(1)}%`,
      ];
      if (hasSales) row.push(d.sales != null ? `${d.sales} szt.` : "—");
      if (hasGrossProfit) row.push(d.grossProfit != null ? pln(d.grossProfit) : "—");
      row.push(d.suggestedPrice != null ? pln(d.suggestedPrice) : "OK");
      return row;
    });

    const marginColIndex = 4;

    autoTable(doc, {
      startY: cursorY,
      head,
      body,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        font: "helvetica",
      },
      headStyles: {
        fillColor: [20, 184, 166],
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { halign: "left" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === marginColIndex) {
          const val = parseFloat((data.cell.raw as string).replace(",", "."));
          if (!isNaN(val)) {
            if (val < 50) {
              data.cell.styles.textColor = [220, 38, 38];
            } else if (val < 65) {
              data.cell.styles.textColor = [180, 120, 0];
            } else {
              data.cell.styles.textColor = [5, 150, 105];
            }
          }
        }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.3,
    });

    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.setFont("helvetica", "italic");
    doc.text(
      "Marza >= 65% — dobra | 50–65% — do monitorowania | < 50% — niska marza",
      margin,
      finalY + 7,
    );

    const filename = `food-cost-raport-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  }

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractError(null);

    // Client-side size check: max 10 MB
    if (file.size > 10 * 1024 * 1024) {
      setExtractError("Plik jest za duży. Maksymalny rozmiar to 10 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Reset input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Pass raw File — hook wraps it in FormData automatically
    extractMutation.mutate(
      { data: { file } },
      {
        onSuccess(data) {
          const extracted = data as { menuText: string };
          setMenuText(extracted.menuText);
          setExtractError(null);
        },
        onError(err: unknown) {
          const msg =
            (err as { data?: { error?: string } })?.data?.error ??
            "Nie udało się wyciągnąć menu z pliku. Spróbuj ponownie lub wpisz tekst ręcznie.";
          setExtractError(msg);
        },
      },
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
        <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
          <UtensilsCrossed className="w-4 h-4 text-orange-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Food Cost AI</h2>
          <p className="text-[11px] text-gray-400">
            Wklej menu z recepturami i dane sprzedaży — AI obliczy marżę
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MENU_FILE_TYPES}
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            {/* Label row with upload button */}
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                Karta menu / receptury
                <span className="font-normal text-gray-400">(składniki + ilości)</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={extractMutation.isPending}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 bg-white hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
                title="Wgraj zdjęcie menu lub plik PDF — AI wyciągnie listę dań"
              >
                {extractMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Wczytuję…
                  </>
                ) : (
                  <>
                    <FileImage className="w-3 h-3" />
                    Wgraj zdjęcie / PDF
                  </>
                )}
              </button>
            </div>
            <textarea
              value={menuText}
              onChange={(e) => setMenuText(e.target.value)}
              placeholder={`np.\nMakaron carbonara (2 porcje):\n- 200g spaghetti\n- 100g boczek wędzony\n- 2 jajka\n- 30g parmezan\nCena menu: 32 zł`}
              rows={9}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none font-mono bg-gray-50/50"
            />
            {/* Extraction loading / success / error indicator */}
            {extractMutation.isPending && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-primary">
                <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                AI analizuje plik i wyciąga listę dań…
              </div>
            )}
            {extractMutation.isSuccess && !extractMutation.isPending && !extractError && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600">
                <Upload className="w-3 h-3 shrink-0" />
                Menu wyciągnięte — sprawdź i popraw jeśli potrzeba.
              </div>
            )}
            {extractError && (
              <div className="mt-2 text-[11px] text-rose-600 leading-relaxed">
                {extractError}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              Sprzedaż tygodniowa
              <span className="font-normal text-gray-400">(opcjonalnie)</span>
            </label>
            <textarea
              value={salesText}
              onChange={(e) => setSalesText(e.target.value)}
              placeholder={`np.\nMakaron carbonara: 45 porcji\nBurger wołowy: 62 porcje\nSałatka grecka: 28 porcji`}
              rows={9}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none font-mono bg-gray-50/50"
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
              Analizuję food cost…
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
            Nie udało się przetworzyć danych. Sprawdź format receptur i spróbuj ponownie.
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-1">
            {/* Download button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadPdf}
                className="gap-2 text-xs h-8 border-gray-200 hover:border-primary/40 hover:text-primary hover:bg-primary/5"
              >
                <Download className="w-3.5 h-3.5" />
                Pobierz raport PDF
              </Button>
            </div>

            {/* Summary row */}
            <div className="flex flex-wrap gap-3">
              {result.avgMarginPct != null && (
                <div
                  className={cn(
                    "rounded-xl px-5 py-3.5 border",
                    marginBg(result.avgMarginPct),
                    result.avgMarginPct >= 65
                      ? "border-emerald-200"
                      : result.avgMarginPct >= 50
                        ? "border-amber-200"
                        : "border-rose-200",
                  )}
                >
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Średnia marża
                  </p>
                  <p
                    className={cn(
                      "text-3xl font-bold leading-none",
                      marginColor(result.avgMarginPct),
                    )}
                  >
                    {PCT(result.avgMarginPct)}
                  </p>
                </div>
              )}
              {result.summary && (
                <div className="flex-1 min-w-[200px] bg-teal-50 border border-teal-200 rounded-xl px-4 py-3.5">
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-1.5">
                    Ocena AI
                  </p>
                  <p className="text-sm text-teal-800 leading-relaxed">
                    {result.summary}
                  </p>
                </div>
              )}
            </div>

            {/* Dishes table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Danie
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Koszt skł.
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Cena menu
                    </th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Marża
                    </th>
                    {result.dishes.some((d) => d.sales != null) && (
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                        Sprzedaż
                      </th>
                    )}
                    {result.dishes.some((d) => d.grossProfit != null) && (
                      <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                        Zysk brutto
                      </th>
                    )}
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">
                      Sugerowana cena
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.dishes.map((d, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-gray-100 last:border-0 transition-colors",
                        marginRowBg(d.marginPct),
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[180px] truncate">
                        {d.name}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 font-mono">
                        {PLN(d.ingredientCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 font-mono">
                        {PLN(d.salePrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={cn(
                            "font-bold",
                            marginColor(d.marginPct),
                          )}
                        >
                          {PCT(d.marginPct)}
                        </span>
                      </td>
                      {result.dishes.some((x) => x.sales != null) && (
                        <td className="px-3 py-2.5 text-right text-gray-500">
                          {d.sales != null ? `${d.sales} szt.` : "—"}
                        </td>
                      )}
                      {result.dishes.some((x) => x.grossProfit != null) && (
                        <td className="px-3 py-2.5 text-right text-gray-600 font-mono">
                          {d.grossProfit != null ? PLN(d.grossProfit) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right">
                        {d.suggestedPrice != null ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                            {PLN(d.suggestedPrice)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-200 shrink-0" />
                Marża ≥ 65% — dobra
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-200 shrink-0" />
                50–65% — do monitorowania
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-200 shrink-0" />
                {"< 50%"} — niska marża
              </span>
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
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-6xl mx-auto">
        <PageHeader
          title="AI CFO"
          subtitle="Kluczowe sygnały, chat z danymi i kalkulator food cost"
          action={
            <Button
              variant="outline"
              size="default"
              onClick={() => insightsQuery.refetch()}
              disabled={insightsQuery.isFetching}
              className="gap-2 shrink-0"
            >
              <RefreshCw className={cn("w-4 h-4", insightsQuery.isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Odśwież sygnały</span>
            </Button>
          }
        />

        <div className="space-y-6">
          {/* ── Top insights ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-gray-400" />
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Kluczowe sygnały (ostatnie 90 dni)
              </h2>
            </div>
            {insightsQuery.isLoading ? (
              <InsightsSkeleton />
            ) : cards.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 px-6 py-10 text-center">
                <BarChart2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500 mb-1">Brak danych do analizy</p>
                <p className="text-xs text-gray-400">Importuj faktury, aby zobaczyć sygnały cenowe.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((card, i) => (
                  <InsightCard key={i} card={card} />
                ))}
              </div>
            )}
          </section>

          {/* ── Tab section ── */}
          <section>
            {/* Tab switcher */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
              <button
                onClick={() => setTab("chat")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tab === "chat"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Chat CFO
              </button>
              <button
                onClick={() => setTab("food-cost")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tab === "food-cost"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                Food Cost AI
              </button>
            </div>

            {tab === "chat" ? <ChatCfo /> : <FoodCostAi />}
          </section>
        </div>
      </div>
    </Layout>
  );
}
