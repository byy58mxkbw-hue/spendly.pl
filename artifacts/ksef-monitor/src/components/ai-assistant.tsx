import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth, useUser } from "@clerk/react";
import {
  usePostAiCfoChat,
  type AiCfoChatResponse,
} from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";
import {
  Bot,
  Send,
  Sparkles,
  Lightbulb,
  ArrowRight,
  Trash2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ─── Typy wiadomości ──────────────────────────────────────────────────────────

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; data: AiCfoChatResponse }
  | { role: "error"; text: string };

const SUGGESTIONS = [
  "Który dostawca podrożał najbardziej w tym miesiącu?",
  "Na których produktach mogę zaoszczędzić?",
  "Jak zmieniały się moje wydatki w ostatnich miesiącach?",
  "Porównaj wydatki według kategorii",
];

// Historia rozmowy trzymana per użytkownik na czas sesji przeglądarki —
// przetrwa nawigację między stronami, znika po zamknięciu karty.
function storageKey(userId: string) {
  return `spendly_assistant_${userId}`;
}

function loadMessages(userId: string): Msg[] {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

function saveMessages(userId: string, msgs: Msg[]) {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(msgs.slice(-30)));
  } catch {
    // pełny storage / tryb prywatny — rozmowa po prostu nie przetrwa nawigacji
  }
}

// ─── Bąbelek odpowiedzi asystenta ────────────────────────────────────────────

function AssistantBubble({ data, onNavigate }: { data: AiCfoChatResponse; onNavigate: () => void }) {
  const kpis = (data.kpiCards ?? []).slice(0, 4);
  const table = data.table && data.table.headers?.length ? data.table : null;
  const rows = table ? table.rows.slice(0, 8) : [];

  return (
    <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-secondary px-3.5 py-3 space-y-2.5">
      {data.summary && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{data.summary}</p>
      )}

      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {kpis.map((k, i) => (
            <div key={i} className="rounded-lg bg-background/70 border border-border px-2.5 py-2">
              <p className="text-[10px] text-muted-foreground truncate">{k.label}</p>
              <p className="text-sm font-bold text-foreground tabular-nums truncate">{k.value}</p>
              {k.delta && (
                <p className={cn(
                  "text-[10px] font-semibold flex items-center gap-0.5",
                  k.deltaPositive ? "text-emerald-600" : "text-destructive",
                )}>
                  {k.deltaPositive ? <TrendingDown className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                  {k.delta}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {table && (
        <div className="overflow-x-auto rounded-lg border border-border bg-background/70">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                {table.headers.map((h, i) => (
                  <th key={i} className={cn("px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={cn("px-2 py-1.5 whitespace-nowrap", ci === 0 ? "text-left text-foreground" : "text-right text-muted-foreground tabular-nums")}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > rows.length && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              +{table.rows.length - rows.length} kolejnych wierszy
            </p>
          )}
        </div>
      )}

      {data.recommendation && (
        <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-primary/5 px-2.5 py-2">
          <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground leading-relaxed">{data.recommendation}</p>
        </div>
      )}

      {(data.actions ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {data.actions.slice(0, 3).map((a, i) => (
            <Link key={i} href={a.href} onClick={onNavigate}>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                {a.label}
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Główny komponent ─────────────────────────────────────────────────────────

export function AiAssistant() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const chat = usePostAiCfoChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userId = user?.id;
  const { getToken } = useAuth();
  const [usage, setUsage] = useState<{ plan: string; used: number; limit: number | null } | null>(null);

  // Zużycie AI w tym miesiącu (wspólna pula czat + OCR) — do licznika w nagłówku.
  const refreshUsage = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(apiUrl("/api/ai-cfo/usage"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setUsage(await res.json());
    } catch { /* licznik jest pomocniczy — brak nie blokuje czatu */ }
  }, [getToken]);

  useEffect(() => { if (open) void refreshUsage(); }, [open, refreshUsage]);

  useEffect(() => {
    if (userId) setMessages(loadMessages(userId));
  }, [userId]);

  useEffect(() => {
    if (userId) saveMessages(userId, messages);
    // Autoscroll na dół po każdej wiadomości
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages, userId, open, chat.isPending]);

  // Historia dla API — ostatnie wymiany jako zwykły tekst (odpowiedzi skracamy do summary).
  const apiHistory = useMemo(
    () =>
      messages
        .filter((m): m is Exclude<Msg, { role: "error" }> => m.role !== "error")
        .slice(-8)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.role === "user" ? m.text : (m.data.summary ?? "").slice(0, 1000),
        })),
    [messages],
  );

  function ask(question: string) {
    const q = question.trim();
    if (!q || chat.isPending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    chat.mutate(
      { data: { question: q, history: apiHistory } },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "assistant", data }]);
          void refreshUsage();
        },
        onError: (err: unknown) => {
          // ApiError z customFetch niesie sparsowane body błędu w .data (też komunikat 429 o limicie planu)
          const serverMsg = (err as { data?: { error?: string } })?.data?.error;
          setMessages((prev) => [
            ...prev,
            { role: "error", text: serverMsg ?? "Nie udało się uzyskać odpowiedzi. Spróbuj ponownie za chwilę." },
          ]);
          void refreshUsage();
        },
      },
    );
  }

  function clearChat() {
    setMessages([]);
    if (userId) {
      try { sessionStorage.removeItem(storageKey(userId)); } catch { /* ignore */ }
    }
  }

  return (
    <>
      {/* FAB — nad dolną nawigacją na mobile, w rogu na desktopie */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 px-4 h-12 font-semibold text-sm hover:bg-primary/90 active:scale-95 transition-all"
          aria-label="Otwórz asystenta AI"
          data-testid="ai-assistant-fab"
        >
          <Bot className="w-5 h-5" />
          <span className="hidden md:inline">AI Asystent</span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col gap-0"
        >
          {/* Nagłówek */}
          <div className="shrink-0 px-4 py-3.5 border-b border-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold text-foreground leading-tight">
                AI Asystent
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Analizuje Twoje faktury i ceny
              </p>
            </div>
            {usage && usage.limit != null && (
              <span
                className={cn(
                  "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full tabular-nums",
                  usage.used >= usage.limit
                    ? "bg-destructive/15 text-destructive"
                    : usage.used / usage.limit >= 0.8
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-secondary text-muted-foreground",
                )}
                title="Zużycie AI w tym miesiącu (czat + skany faktur)"
              >
                {usage.used}/{usage.limit}
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="shrink-0 mr-7 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Wyczyść rozmowę"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Wiadomości */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
            {/* Powitanie */}
            <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-secondary px-3.5 py-3">
              <p className="text-sm text-foreground leading-relaxed">
                Cześć{user?.firstName ? `, ${user.firstName}` : ""}! Jestem Twoim asystentem kosztów.
                Zapytaj o ceny surowców, dostawców, wydatki albo food cost — analizuję dane z Twoich faktur.
              </p>
            </div>

            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary text-primary-foreground px-3.5 py-2.5">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ) : msg.role === "assistant" ? (
                <AssistantBubble key={i} data={msg.data} onNavigate={() => setOpen(false)} />
              ) : (
                <div key={i} className="max-w-[92%] rounded-2xl rounded-tl-md bg-destructive/10 border border-destructive/20 px-3.5 py-2.5">
                  <p className="text-xs text-destructive">{msg.text}</p>
                </div>
              ),
            )}

            {/* Wskaźnik pisania */}
            {chat.isPending && (
              <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-secondary px-4 py-3 inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                <span className="text-xs text-muted-foreground">Analizuję dane…</span>
              </div>
            )}

            {/* Sugestie — tylko na starcie rozmowy */}
            {messages.length === 0 && !chat.isPending && (
              <div className="pt-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Sugestie
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="w-full text-left text-sm text-foreground bg-background border border-border rounded-xl px-3.5 py-2.5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pole pytania */}
          <form
            className="shrink-0 border-t border-border px-3 py-3 flex items-center gap-2"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Zapytaj o koszty, ceny, dostawców…"
              maxLength={500}
              className="flex-1 rounded-full bg-secondary/60 border-transparent focus-visible:ring-primary/40"
              data-testid="ai-assistant-input"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || chat.isPending}
              className="rounded-full shrink-0"
              aria-label="Wyślij pytanie"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
