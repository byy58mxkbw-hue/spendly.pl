import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListInvoices,
  useImportInvoice,
  useListSuppliers,
  useDeleteAllInvoices,
  useGetKsefConfig,
  useGetInvoicesTimeline,
  useGetInvoicesCalendar,
  useGetInvoicesPayments,
  useMarkInvoicePaid,
  getListInvoicesQueryKey,
  getGetInvoicesTimelineQueryKey,
  getGetInvoicesCalendarQueryKey,
  getGetInvoicesPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useCostCenter } from "@/contexts/cost-center-context";
import { useSyncKsefProgress, syncPhaseProgress, describeSyncResult, type SyncPhase } from "@/hooks/use-sync-progress";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft, ChevronRight, Plus, FileText, Trash2, Download,
  RefreshCw, Camera, Loader2, CheckCircle2, Package,
  X, Search, Eye, EyeOff, Check, Layers, ArrowUpDown, LineChart, Copy,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { PriceHistoryModal } from "./products";
import { ImportInvoiceDialog } from "./invoices/import-invoice-dialog";
import { InvoiceDetailModal } from "./invoices/invoice-detail-modal";
import { FakturyView } from "./invoices/faktury-view";
import { cn } from "@/lib/utils";
import { track } from "@/lib/posthog";
import { useToast } from "@/hooks/use-toast";

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  mieso: "Mięso", ryby: "Ryby", nabiał: "Nabiał", sery: "Sery", warzywa: "Warzywa",
  owoce: "Owoce", pieczywo: "Pieczywo", napoje: "Napoje", alkohol: "Alkohol",
  suche: "Suche", inne: "Inne",
};
function catLabel(c: string) { return CATEGORY_LABELS[c] ?? c; }

const CAT_COLORS = [
  "bg-teal-500", "bg-blue-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500",
];

// ─── Month helpers ─────────────────────────────────────────────────────────────

function todayMonth() { return new Date().toISOString().slice(0, 7); }
function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}
function dayLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
}
function dayOfWeek(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pl-PL", { weekday: "long" });
}

// ─── Segment control (Apple style) ────────────────────────────────────────────

type Tab = "zakupy" | "kalendarz" | "platnosci" | "faktury";
const TABS: { id: Tab; label: string }[] = [
  { id: "zakupy", label: "Zakupy" },
  { id: "kalendarz", label: "Kalendarz" },
  { id: "platnosci", label: "Płatności" },
  { id: "faktury", label: "Faktury" },
];

function SegmentControl({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto scrollbar-none p-1 gap-0.5 rounded-full" style={{ background: "var(--elevate-2)", border: "1px solid hsl(var(--border))" }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "shrink-0 whitespace-nowrap px-3.5 sm:px-4 h-8 rounded-full text-sm font-medium transition-all duration-200",
            active === t.id
              ? "bg-white text-[#08111f] shadow-md"
              : "text-foreground/50 hover:text-foreground/80",
          )}
          style={active === t.id ? { boxShadow: "0 0 12px rgba(20,184,166,0.35)" } : undefined}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── KSeF sync label ──────────────────────────────────────────────────────────

function syncPhaseLabel(phase: SyncPhase): string {
  switch (phase.type) {
    case "connecting": return "Łączę z KSeF...";
    case "scanning": return `Skanuję ${phase.windowsDone}/${phase.windowsTotal}`;
    case "fetching": return phase.total > 0 ? `${phase.fetched}/${phase.total}` : "Pobieranie...";
    default: return "Synchronizuj z KSeF";
  }
}

// ─── Hero month header ─────────────────────────────────────────────────────────

interface HeroProps {
  month: string;
  onPrev: () => void;
  onNext: () => void;
  totalAmount: number;
  invoiceCount: number;
  supplierCount: number;
  prevMonthTotalAmount: number;
  biggestDay?: { date: string; totalAmount: number; invoiceCount?: number; supplierCount?: number } | null;
  avgDailyAmount: number;
  activeDaysCount?: number;
  daysInMonth?: number;
  loading: boolean;
  allTime?: boolean;
}

const CARD_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "20px",
} as const;

function MonthHero({ month, onPrev, onNext, totalAmount, invoiceCount, supplierCount, prevMonthTotalAmount, biggestDay, avgDailyAmount, activeDaysCount, daysInMonth, loading, allTime }: HeroProps) {
  const changePercent = prevMonthTotalAmount > 0
    ? Math.round(((totalAmount - prevMonthTotalAmount) / prevMonthTotalAmount) * 100)
    : null;
  const isUp = changePercent !== null && changePercent >= 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
      {/* Card 1: Month summary */}
      <div className="col-span-2 sm:col-span-1 p-4 sm:p-5" style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-3">
          {!allTime && (
            <button onClick={onPrev} className="p-1 rounded-full transition-colors" style={{ background: "var(--elevate-2)" }}>
              <ChevronLeft className="w-3.5 h-3.5 text-foreground/70" />
            </button>
          )}
          <span className="text-foreground/60 text-xs font-medium flex-1 capitalize">
            {allTime ? "Wszystkie faktury" : monthLabel(month)}
          </span>
          {!allTime && (
            <button
              onClick={onNext}
              disabled={month >= todayMonth()}
              className="p-1 rounded-full transition-colors disabled:opacity-30"
              style={{ background: "var(--elevate-2)" }}
            >
              <ChevronRight className="w-3.5 h-3.5 text-foreground/70" />
            </button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-8 w-36 rounded-lg" style={{ background: "var(--elevate-2)" }} />
            <div className="h-3 w-28 rounded" style={{ background: "var(--elevate-1)" }} />
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums text-foreground mb-1">{formatPrice(totalAmount)}</p>
            <p className="text-foreground/50 text-xs">Łączne wydatki</p>
            <div className="mt-3 space-y-1">
              <p className="text-foreground/70 text-xs">{invoiceCount} {invoiceCount === 1 ? "zakup" : "zakupów"} · {supplierCount} {supplierCount === 1 ? "dostawca" : "dostawców"}</p>
              {changePercent !== null && (
                <p className={cn("text-xs font-semibold", isUp ? "text-orange-400" : "text-emerald-400")}>
                  {isUp ? "+" : ""}{changePercent}% vs poprzedni miesiąc
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Card 2: Biggest day */}
      <div className="p-4 sm:p-5" style={CARD_STYLE}>
        <p className="text-foreground/40 text-xs font-medium uppercase tracking-wider mb-3">Największy dzień</p>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-24 rounded" style={{ background: "var(--elevate-2)" }} />
            <div className="h-7 w-32 rounded-lg" style={{ background: "var(--elevate-2)" }} />
          </div>
        ) : biggestDay ? (
          <>
            <p className="text-foreground/80 text-sm font-semibold capitalize mb-1">{dayLabel(biggestDay.date)}</p>
            <p className="text-foreground text-lg sm:text-xl font-bold tabular-nums mb-2">{formatPrice(biggestDay.totalAmount)}</p>
            {(biggestDay.invoiceCount != null || biggestDay.supplierCount != null) && (
              <p className="text-foreground/50 text-xs">
                {biggestDay.invoiceCount != null && `${biggestDay.invoiceCount} ${biggestDay.invoiceCount === 1 ? "faktura" : "faktur"}`}
                {biggestDay.invoiceCount != null && biggestDay.supplierCount != null && " · "}
                {biggestDay.supplierCount != null && `${biggestDay.supplierCount} ${biggestDay.supplierCount === 1 ? "dostawca" : "dostawców"}`}
              </p>
            )}
          </>
        ) : (
          <p className="text-foreground/30 text-sm">Brak danych</p>
        )}
      </div>

      {/* Card 3: Daily average */}
      <div className="p-4 sm:p-5" style={CARD_STYLE}>
        <p className="text-foreground/40 text-xs font-medium uppercase tracking-wider mb-3">Średnio dziennie</p>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-7 w-32 rounded-lg" style={{ background: "var(--elevate-2)" }} />
            <div className="h-3 w-20 rounded" style={{ background: "var(--elevate-1)" }} />
          </div>
        ) : avgDailyAmount > 0 ? (
          <>
            <p className="text-foreground text-lg sm:text-xl font-bold tabular-nums mb-2">{formatPrice(avgDailyAmount)}</p>
            {!allTime && daysInMonth != null && (
              <p className="text-foreground/50 text-xs">przez {daysInMonth} {daysInMonth === 1 ? "dzień" : "dni"} miesiąca</p>
            )}
            {activeDaysCount != null && (
              <p className="text-foreground/50 text-xs mt-1">zakupy w {activeDaysCount} {activeDaysCount === 1 ? "dniu" : "dniach"}</p>
            )}
          </>
        ) : (
          <p className="text-foreground/30 text-sm">Brak zakupów</p>
        )}
      </div>
    </div>
  );
}

// ─── Day Drawer (Apple Wallet style) ──────────────────────────────────────────

function DayDrawer({
  date,
  month,
  onClose,
  onMarkPaid,
}: {
  date: string | null;
  month: string;
  onClose: () => void;
  onMarkPaid: (invoiceId: number, isPaid: boolean) => void;
}) {
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const ccParam = costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {};
  const { data: timeline } = useGetInvoicesTimeline(
    { month, ...ccParam },
    { query: { queryKey: getGetInvoicesTimelineQueryKey({ month, ...ccParam }), enabled: !!date } },
  );
  const day = date ? timeline?.days.find((d) => d.date === date) : null;
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);

  return (
    <>
      <Sheet open={!!date} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col overflow-hidden">
          <div className="bg-gradient-to-br from-teal-600 to-teal-700 text-white px-6 pt-8 pb-6 shrink-0">
            <SheetHeader className="text-left mb-0">
              <p className="text-teal-200 text-sm font-normal capitalize">{date ? dayOfWeek(date) : ""}</p>
              <SheetTitle className="text-white text-2xl font-bold capitalize">
                {date ? dayLabel(date) : ""}
              </SheetTitle>
            </SheetHeader>
            {day && (
              <div className="flex gap-5 mt-4 text-sm">
                <div>
                  <p className="text-teal-200 text-xs">Wydatki</p>
                  <p className="font-bold text-xl tabular-nums">{formatPrice(day.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-teal-200 text-xs">Zakupów</p>
                  <p className="font-bold text-xl">{day.invoiceCount}</p>
                </div>
                <div>
                  <p className="text-teal-200 text-xs">Dostawców</p>
                  <p className="font-bold text-xl">{day.supplierCount}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!day ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {day.categories.length > 0 && (
                  <div className="px-6 py-5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Kategorie</p>
                    <div className="space-y-3">
                      {day.categories.map((cat, i) => (
                        <div key={cat.category}>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="font-medium">{catLabel(cat.category)}</span>
                            <span className="text-muted-foreground tabular-nums">{cat.percent}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", CAT_COLORS[i % CAT_COLORS.length])}
                              style={{ width: `${cat.percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {day.suppliers.length > 0 && (
                  <div className="px-6 py-5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Dostawcy</p>
                    <div className="space-y-2.5">
                      {day.suppliers.map((s, i) => (
                        <div key={s.supplierId} className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                            {i + 1}
                          </span>
                          <span className="flex-1 text-sm font-medium truncate">{s.supplierName}</span>
                          <span className="text-sm tabular-nums text-muted-foreground">{formatPrice(s.totalAmount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-6 py-5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Zakupy</p>
                  <div className="space-y-2">
                    {day.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                        onClick={() => setViewInvoiceId(inv.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inv.supplierName}</p>
                          <p className="text-xs text-muted-foreground truncate">{inv.invoiceNumber}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">{formatPrice(inv.totalAmount)}</p>
                          {inv.paymentMethod === "przelew" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onMarkPaid(inv.id, !inv.isPaid); }}
                              className={cn(
                                "text-xs mt-0.5 px-2 py-0.5 rounded-full font-medium transition-colors",
                                inv.isPaid ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700",
                              )}
                            >
                              {inv.isPaid ? "Opłacone" : "Nieopłacone"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {viewInvoiceId && (
        <InvoiceDetailModal invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} onOpenInvoice={setViewInvoiceId} />
      )}
    </>
  );
}

// ─── Zakupy (timeline) view ────────────────────────────────────────────────────

function dayComparisonComment(dayAmount: number, avgDailyAmount: number): { text: string; positive: boolean } | null {
  if (avgDailyAmount <= 0 || dayAmount <= 0) return null;
  const pct = Math.round(((dayAmount - avgDailyAmount) / avgDailyAmount) * 100);
  if (Math.abs(pct) < 5) return { text: "Zbliżone do średniej", positive: true };
  if (pct > 0) return { text: `${pct}% wyższe od średniej`, positive: false };
  return { text: `${Math.abs(pct)}% niższe od średniej`, positive: true };
}

function ZakupyView({ month, onDayClick }: { month: string; onDayClick: (date: string) => void }) {
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const ccParam = costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {};
  const { data, isLoading } = useGetInvoicesTimeline(
    { month, ...ccParam },
    { query: { queryKey: getGetInvoicesTimelineQueryKey({ month, ...ccParam }) } },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 w-full rounded-2xl animate-pulse" style={{ background: "var(--elevate-1)" }} />
        ))}
      </div>
    );
  }

  if (!data || data.days.length === 0) {
    return (
      <div className="py-20 text-center">
        <Package className="w-12 h-12 mx-auto mb-3 text-foreground/20" />
        <p className="text-foreground/60 font-medium">Brak zakupów w tym miesiącu</p>
        <p className="text-sm text-foreground/40 mt-1">Zaimportuj faktury lub zsynchronizuj z KSeF</p>
      </div>
    );
  }

  const avgDailyAmount = data.avgDailyAmount;

  return (
    <div className="space-y-3">
      {data.days.map((day) => {
        const comment = dayComparisonComment(day.totalAmount, avgDailyAmount);
        return (
          <button
            key={day.date}
            onClick={() => onDayClick(day.date)}
            className="w-full text-left rounded-2xl p-5 transition-all duration-200 hover:brightness-110"
            style={{ ...CARD_STYLE, cursor: "pointer" }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-foreground capitalize">{dayLabel(day.date)}</p>
                <p className="text-xs text-foreground/50 capitalize mt-0.5">{dayOfWeek(day.date)}</p>
                {comment && (
                  <span className={cn(
                    "inline-block text-[11px] font-medium mt-1.5 px-2 py-0.5 rounded-full",
                    comment.positive
                      ? "text-emerald-400"
                      : "text-orange-400",
                  )}
                    style={comment.positive ? { background: "rgba(52,211,153,0.12)" } : { background: "rgba(251,146,60,0.12)" }}
                  >
                    {comment.text}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="font-bold text-lg tabular-nums text-foreground">{formatPrice(day.totalAmount)}</p>
                <p className="text-xs text-foreground/40 mt-0.5">
                  {day.invoiceCount} {day.invoiceCount === 1 ? "zakup" : "zakupów"} · {day.supplierCount} {day.supplierCount === 1 ? "dostawca" : "dostawców"}
                </p>
              </div>
            </div>

            {day.categories.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5">
                  {day.categories.slice(0, 4).map((cat, i) => (
                    <span key={cat.category} className="text-xs text-foreground/60 flex items-center gap-1">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", CAT_COLORS[i % CAT_COLORS.length])} />
                      {catLabel(cat.category)} {cat.percent}%
                    </span>
                  ))}
                </div>
                <div className="flex h-1 rounded-full overflow-hidden gap-0.5">
                  {day.categories.slice(0, 5).map((cat, i) => (
                    <div
                      key={cat.category}
                      className={cn("h-full", CAT_COLORS[i % CAT_COLORS.length])}
                      style={{ width: `${cat.percent}%` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Kalendarz (heatmap) view ──────────────────────────────────────────────────

const HEAT_CLASSES = [
  "bg-foreground/[0.04]",
  "bg-teal-900/70",
  "bg-teal-700/80",
  "bg-teal-500/90",
  "bg-teal-400",
];
const DOW_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function KalendarzView({ month, onDayClick }: { month: string; onDayClick: (date: string) => void }) {
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const ccParam = costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {};
  const { data, isLoading } = useGetInvoicesCalendar(
    { month, ...ccParam },
    { query: { queryKey: getGetInvoicesCalendarQueryKey({ month, ...ccParam }) } },
  );

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-foreground/40" />
      </div>
    );
  }

  const [year, mo] = month.split("-").map(Number);
  const firstDay = new Date(year, mo - 1, 1);
  const daysInMonth = new Date(year, mo, 0).getDate();
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const dayMap = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const maxAmount = data?.maxAmount ?? 1;

  const cells: Array<{ date: string | null; dayNum: number | null }> = [
    ...Array(startDow).fill({ date: null, dayNum: null }),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return { date: `${month}-${String(d).padStart(2, "0")}`, dayNum: d };
    }),
  ];

  function formatAmountShort(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
    return `${Math.round(n)}`;
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_LABELS.map((d) => (
          <div key={d} className="text-center text-xs text-foreground/40 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={`pad-${i}`} className="h-14 sm:h-16" />;
          const info = dayMap.get(cell.date);
          const amount = info?.totalAmount ?? 0;
          const level = amount === 0 ? 0 : Math.min(4, Math.ceil((amount / maxAmount) * 4));

          return (
            <button
              key={cell.date}
              onClick={() => info ? onDayClick(cell.date!) : undefined}
              className={cn(
                "h-14 sm:h-16 rounded-lg flex flex-col items-center justify-center gap-0 transition-all duration-150 px-0.5",
                HEAT_CLASSES[level],
                info ? "hover:scale-105 hover:shadow-md cursor-pointer" : "cursor-default",
              )}
            >
              <span className={cn("text-xs font-semibold leading-tight", level >= 3 ? "text-white" : "text-foreground/50")}>
                {cell.dayNum}
              </span>
              {info && info.invoiceCount > 0 && (
                <>
                  <span className={cn("text-[9px] font-bold leading-tight", level >= 3 ? "text-foreground/80" : "text-teal-600")}>
                    {info.invoiceCount} zak.
                  </span>
                  <span className={cn("text-[9px] leading-tight tabular-nums", level >= 2 ? "text-foreground/70" : "text-foreground/40")}>
                    {formatAmountShort(info.totalAmount)}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-5 justify-end">
        <span className="text-xs text-foreground/30">Mniej</span>
        {HEAT_CLASSES.map((cls, i) => (
          <div key={i} className={cn("w-4 h-4 rounded", cls, i === 0 && "border border-border")} />
        ))}
        <span className="text-xs text-foreground/30">Więcej</span>
      </div>
    </div>
  );
}

// ─── Płatności view ────────────────────────────────────────────────────────────

function PlatnosciView({ onMarkPaid }: { onMarkPaid: (id: number, isPaid: boolean) => void }) {
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const ccParam = costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {};
  const { data, isLoading } = useGetInvoicesPayments(
    Object.keys(ccParam).length > 0 ? ccParam : undefined,
    { query: { queryKey: getGetInvoicesPaymentsQueryKey(ccParam) } },
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--elevate-1)" }} />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--elevate-1)" }} />
        ))}
      </div>
    );
  }

  const total = (data?.overdueCount ?? 0) + (data?.dueTodayCount ?? 0) + (data?.dueIn7DaysCount ?? 0)
    + (data?.upcomingCount ?? 0) + (data?.noDueDateCount ?? 0);

  if (total === 0) {
    return (
      <div className="py-24 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-emerald-400" />
        <p className="text-foreground font-semibold text-lg">Wszystkie płatności uregulowane</p>
        <p className="text-sm text-foreground/40 mt-1">Brak zaległych przelewów bankowych</p>
      </div>
    );
  }

  const tiles = [
    {
      label: "Dzisiaj",
      amount: data?.dueTodayAmount ?? 0,
      count: data?.dueTodayCount ?? 0,
      color: "#f97316",
      bg: "rgba(249,115,22,0.1)",
      border: "rgba(249,115,22,0.22)",
    },
    {
      label: "W ciągu 7 dni",
      amount: data?.dueIn7DaysAmount ?? 0,
      count: data?.dueIn7DaysCount ?? 0,
      color: "#14b8a6",
      bg: "rgba(20,184,166,0.1)",
      border: "rgba(20,184,166,0.22)",
    },
    {
      label: "Po terminie",
      amount: data?.overdueAmount ?? 0,
      count: data?.overdueCount ?? 0,
      color: "#ef4444",
      bg: "rgba(239,68,68,0.1)",
      border: "rgba(239,68,68,0.22)",
    },
  ];

  const timeline = [
    ...(data?.overdue ?? []).map((inv) => ({ ...inv, urgency: 0 })),
    ...(data?.dueToday ?? []).map((inv) => ({ ...inv, urgency: 1 })),
    ...(data?.dueIn7Days ?? []).map((inv) => ({ ...inv, urgency: 2 })),
    ...(data?.upcoming ?? []).map((inv) => ({ ...inv, urgency: 3 })),
  ];

  function timelineLabel(inv: { urgency: number; daysOverdue?: number | null; paymentDueDate?: string | null }): string {
    if (inv.urgency === 0) {
      return inv.daysOverdue != null && inv.daysOverdue > 0 ? `${inv.daysOverdue} dni po terminie` : "Po terminie";
    }
    if (inv.urgency === 1) return "Dzisiaj";
    if (!inv.paymentDueDate) return "Wkrótce";
    const days = Math.round((new Date(inv.paymentDueDate).getTime() - Date.now()) / 86400000);
    if (days === 1) return "Jutro";
    if (days <= 7) return `Za ${days} dni`;
    return formatDate(inv.paymentDueDate);
  }

  function labelColor(urgency: number): string {

    if (urgency === 0) return "#ef4444";
    if (urgency === 1) return "#f97316";
    return "#14b8a6";
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="p-3 md:p-4 rounded-xl md:rounded-2xl" style={{ background: tile.bg, border: `1px solid ${tile.border}` }}>
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide mb-1.5 md:mb-2 leading-tight" style={{ color: tile.color }}>{tile.label}</p>
            <p className="text-base md:text-xl font-bold text-foreground tabular-nums leading-tight">{formatPrice(tile.amount)}</p>
            {tile.count > 0 && (
              <p className="text-[11px] md:text-xs mt-1 md:mt-1.5" style={{ color: tile.color + "99" }}>
                {tile.count} {tile.count === 1 ? "faktura" : "faktur"}
              </p>
            )}
          </div>
        ))}
      </div>

      {timeline.length > 0 && (
        <div className="space-y-2">
          {timeline.map((inv) => (
            <div key={inv.id} className="px-3.5 md:px-4 py-3 rounded-xl" style={CARD_STYLE}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{inv.supplierName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span className="text-[11px] font-semibold shrink-0" style={{ color: labelColor(inv.urgency) }}>
                      {timelineLabel(inv)}
                    </span>
                    <span className="text-foreground/20 shrink-0">·</span>
                    <span className="text-xs text-foreground/40 truncate">{inv.invoiceNumber}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(inv.totalAmount)}</span>
                  <button
                    onClick={() => onMarkPaid(inv.id, true)}
                    className="text-xs px-3 py-1 rounded-full font-medium transition-colors text-primary"
                    style={{ background: "rgba(20,184,166,0.18)", border: "1px solid rgba(20,184,166,0.3)" }}
                  >
                    Zapłacono
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(data?.noDueDateCount ?? 0) > 0 && (
        <div className="px-4 py-3 rounded-xl space-y-2" style={{ background: "var(--elevate-1)", border: "1px solid hsl(var(--border))" }}>
          <p className="text-xs text-foreground/40">Bez terminu ({data?.noDueDateCount})</p>
          {(data?.noDueDate ?? []).map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground/70 truncate">{inv.supplierName}</p>
                <p className="text-xs text-foreground/30 truncate">{inv.invoiceNumber}</p>
              </div>
              <p className="text-sm font-semibold text-foreground/60 tabular-nums shrink-0">{formatPrice(inv.totalAmount)}</p>
              <button
                onClick={() => onMarkPaid(inv.id, true)}
                className="text-xs px-3 py-1.5 rounded-full font-medium text-foreground/50"
                style={{ background: "var(--elevate-2)", border: "1px solid hsl(var(--border))" }}
              >
                Zapłacono
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Invoice detail modal ──────────────────────────────────────────────────────

export default function Invoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: suppliers } = useListSuppliers();
  const deleteAllInvoices = useDeleteAllInvoices();
  const markPaid = useMarkInvoicePaid();
  const { data: config } = useGetKsefConfig();
  const { phase, startSync, isPending: syncPending } = useSyncKsefProgress();
  const { selectedId: costCenterSelectedId } = useCostCenter();

  const [activeTab, setActiveTab] = useState<Tab>("zakupy");
  const [month, setMonth] = useState(todayMonth());
  const [showImport, setShowImport] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const ccParam = costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {};
  const { data: timelineData, isLoading: timelineLoading } = useGetInvoicesTimeline(
    { month, ...ccParam },
    { query: { queryKey: getGetInvoicesTimelineQueryKey({ month, ...ccParam }) } },
  );
  const allInvoicesParams = { limit: 5000, ...ccParam };
  const { data: allInvoicesData } = useListInvoices(
    allInvoicesParams,
    { query: { queryKey: getListInvoicesQueryKey(allInvoicesParams), enabled: activeTab === "faktury" } },
  );
  const allTimeStats = useMemo(() => {
    if (!allInvoicesData) return { totalAmount: 0, invoiceCount: 0, supplierCount: 0 };
    const totalAmount = allInvoicesData.reduce((s, inv) => s + Number(inv.totalAmount ?? 0), 0);
    const uniqueSuppliers = new Set(allInvoicesData.map((inv) => inv.supplierId)).size;
    return { totalAmount, invoiceCount: allInvoicesData.length, supplierCount: uniqueSuppliers };
  }, [allInvoicesData]);

  async function handleMarkPaid(id: number, isPaid: boolean) {
    await markPaid.mutateAsync({ id, data: { isPaid } });
    queryClient.invalidateQueries({ queryKey: getGetInvoicesTimelineQueryKey({ month, ...ccParam }) });
    queryClient.invalidateQueries({ queryKey: getGetInvoicesPaymentsQueryKey(Object.keys(ccParam).length > 0 ? ccParam : undefined) });
    toast({ title: isPaid ? "Oznaczono jako opłacone" : "Cofnięto oznaczenie" });
  }

  async function handleDeleteAll() {
    await deleteAllInvoices.mutateAsync();
    queryClient.invalidateQueries();
    setShowDeleteAll(false);
    toast({ title: "Usunięto", description: "Wszystkie zakupy zostały usunięte." });
  }

  async function handleSync() {
    if (!config) {
      toast({ variant: "destructive", title: "Brak konfiguracji", description: "Przejdź do Ustawień KSeF." });
      return;
    }
    try {
      const res = await startSync();
      queryClient.invalidateQueries();
      toast(describeSyncResult(res));
    } catch (err) {
      toast({ variant: "destructive", title: "Błąd synchronizacji", description: err instanceof Error ? err.message : "Nie udało się zsynchronizować." });
    }
  }

  return (
    <Layout>
      <div className="min-h-full bg-background">
        {/* Custom dark header */}
        <div className="px-4 sm:px-6 pt-6 pb-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Zakupy</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config ? (
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={handleSync}
                  disabled={syncPending}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
                  style={{ background: "var(--elevate-2)", border: "1px solid hsl(var(--border))" }}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", syncPending && "animate-spin")} />
                  <span className="hidden sm:inline">{syncPhaseLabel(phase)}</span>
                </button>
                {syncPending && <Progress value={syncPhaseProgress(phase) ?? 0} className="h-0.5 w-full" />}
              </div>
            ) : (
              <Link href="/settings/ksef">
                <button
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
                  style={{ background: "var(--elevate-2)", border: "1px solid hsl(var(--border))" }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Skonfiguruj KSeF</span>
                </button>
              </Link>
            )}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: "#14b8a6" }}
              data-testid="btn-import-invoice"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dodaj zakup</span>
              <span className="sm:hidden">Dodaj</span>
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-10 space-y-5">
          <MonthHero
          month={month}
          onPrev={() => setMonth(prevMonth(month))}
          onNext={() => setMonth(nextMonth(month))}
          totalAmount={activeTab === "faktury" ? allTimeStats.totalAmount : (timelineData?.totalAmount ?? 0)}
          invoiceCount={activeTab === "faktury" ? allTimeStats.invoiceCount : (timelineData?.invoiceCount ?? 0)}
          supplierCount={activeTab === "faktury" ? allTimeStats.supplierCount : (timelineData?.supplierCount ?? 0)}
          prevMonthTotalAmount={activeTab === "faktury" ? 0 : (timelineData?.prevMonthTotalAmount ?? 0)}
          biggestDay={activeTab === "faktury" ? null : timelineData?.biggestDay}
          avgDailyAmount={activeTab === "faktury" ? 0 : (timelineData?.avgDailyAmount ?? 0)}
          activeDaysCount={activeTab === "faktury" ? undefined : timelineData?.activeDaysCount}
          daysInMonth={activeTab === "faktury" ? undefined : timelineData?.daysInMonth}
          loading={activeTab === "faktury" ? false : timelineLoading}
          allTime={activeTab === "faktury"}
        />

        <div className="flex justify-center">
          <SegmentControl active={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "zakupy" && (
          <ZakupyView month={month} onDayClick={setSelectedDay} />
        )}
        {activeTab === "kalendarz" && (
          <KalendarzView month={month} onDayClick={setSelectedDay} />
        )}
        {activeTab === "platnosci" && (
          <PlatnosciView onMarkPaid={handleMarkPaid} />
        )}
        {activeTab === "faktury" && (
          <FakturyView
            onImportClick={() => setShowImport(true)}
            onDeleteAllClick={() => setShowDeleteAll(true)}
          />
        )}
      </div>

      <DayDrawer
        date={selectedDay}
        month={month}
        onClose={() => setSelectedDay(null)}
        onMarkPaid={handleMarkPaid}
      />

      <ImportInvoiceDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        suppliers={suppliers ?? []}
      />

      <AlertDialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć wszystkie zakupy?</AlertDialogTitle>
            <AlertDialogDescription>
              Tej operacji nie można cofnąć. Wszystkie faktury, produkty i historia cen zostaną utracone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-all"
            >
              Usuń wszystko
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Layout>
  );
}
