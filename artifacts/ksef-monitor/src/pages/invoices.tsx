import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useListInvoices,
  listInvoices,
  useListInvoicesPaged,
  getListInvoicesPagedQueryKey,
  useImportInvoice,
  useScanReceipt,
  useListSuppliers,
  useDeleteInvoice,
  useDeleteAllInvoices,
  useGetKsefConfig,
  useGetInvoice,
  useDeleteInvoiceItem,
  useToggleInvoiceExcluded,
  useGetInvoicesTimeline,
  useGetInvoicesCalendar,
  useGetInvoicesPayments,
  useMarkInvoicePaid,
  useSetInvoiceCostCenter,
  useApplyCostCenterSuggestions,
  useListCostCenters,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getGetInvoicesTimelineQueryKey,
  getGetInvoicesCalendarQueryKey,
  getGetInvoicesPaymentsQueryKey,
  type ScannedReceiptData,
  useCreateSupplier,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { useCostCenter } from "@/contexts/cost-center-context";
import { useSyncKsefProgress, syncPhaseProgress, type SyncPhase } from "@/hooks/use-sync-progress";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  X, Search, Eye, EyeOff, ScanLine, Check, Layers, ArrowUpDown, LineChart, Copy,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { PriceHistoryModal } from "./products";
import { cn } from "@/lib/utils";
import { exportToCsv, todaySlug } from "@/lib/export-csv";
import { useToast } from "@/hooks/use-toast";

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  mieso: "Mięso", ryby: "Ryby", nabiał: "Nabiał", warzywa: "Warzywa",
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
    <div className="inline-flex max-w-full overflow-x-auto scrollbar-none p-1 gap-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "shrink-0 whitespace-nowrap px-3.5 sm:px-4 h-8 rounded-full text-sm font-medium transition-all duration-200",
            active === t.id
              ? "bg-white text-[#08111f] shadow-md"
              : "text-white/50 hover:text-white/80",
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
  loading: boolean;
  allTime?: boolean;
}

const CARD_STYLE = {
  background: "#0f1b33",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "20px",
} as const;

function MonthHero({ month, onPrev, onNext, totalAmount, invoiceCount, supplierCount, prevMonthTotalAmount, biggestDay, avgDailyAmount, loading, allTime }: HeroProps) {
  const changePercent = prevMonthTotalAmount > 0
    ? Math.round(((totalAmount - prevMonthTotalAmount) / prevMonthTotalAmount) * 100)
    : null;
  const isUp = changePercent !== null && changePercent >= 0;

  const activeDaysInMonth = loading ? null : (avgDailyAmount > 0 && totalAmount > 0
    ? Math.round(totalAmount / avgDailyAmount) : null);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
      {/* Card 1: Month summary */}
      <div className="col-span-2 sm:col-span-1 p-4 sm:p-5" style={CARD_STYLE}>
        <div className="flex items-center gap-2 mb-3">
          {!allTime && (
            <button onClick={onPrev} className="p-1 rounded-full transition-colors" style={{ background: "rgba(255,255,255,0.06)" }}>
              <ChevronLeft className="w-3.5 h-3.5 text-white/70" />
            </button>
          )}
          <span className="text-white/60 text-xs font-medium flex-1 capitalize">
            {allTime ? "Wszystkie faktury" : monthLabel(month)}
          </span>
          {!allTime && (
            <button
              onClick={onNext}
              disabled={month >= todayMonth()}
              className="p-1 rounded-full transition-colors disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <ChevronRight className="w-3.5 h-3.5 text-white/70" />
            </button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-8 w-36 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-3 w-28 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums text-white mb-1">{formatPrice(totalAmount)}</p>
            <p className="text-white/50 text-xs">Łączne wydatki</p>
            <div className="mt-3 space-y-1">
              <p className="text-white/70 text-xs">{invoiceCount} {invoiceCount === 1 ? "zakup" : "zakupów"} · {supplierCount} {supplierCount === 1 ? "dostawca" : "dostawców"}</p>
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
        <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-3">Największy dzień</p>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-24 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-7 w-32 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
        ) : biggestDay ? (
          <>
            <p className="text-white/80 text-sm font-semibold capitalize mb-1">{dayLabel(biggestDay.date)}</p>
            <p className="text-white text-lg sm:text-xl font-bold tabular-nums mb-2">{formatPrice(biggestDay.totalAmount)}</p>
            {(biggestDay.invoiceCount != null || biggestDay.supplierCount != null) && (
              <p className="text-white/50 text-xs">
                {biggestDay.invoiceCount != null && `${biggestDay.invoiceCount} ${biggestDay.invoiceCount === 1 ? "faktura" : "faktur"}`}
                {biggestDay.invoiceCount != null && biggestDay.supplierCount != null && " · "}
                {biggestDay.supplierCount != null && `${biggestDay.supplierCount} ${biggestDay.supplierCount === 1 ? "dostawca" : "dostawców"}`}
              </p>
            )}
          </>
        ) : (
          <p className="text-white/30 text-sm">Brak danych</p>
        )}
      </div>

      {/* Card 3: Daily average */}
      <div className="p-4 sm:p-5" style={CARD_STYLE}>
        <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-3">Średnio dziennie</p>
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-7 w-32 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-3 w-20 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        ) : avgDailyAmount > 0 ? (
          <>
            <p className="text-white text-lg sm:text-xl font-bold tabular-nums mb-2">{formatPrice(avgDailyAmount)}</p>
            {activeDaysInMonth != null && (
              <p className="text-white/50 text-xs">{activeDaysInMonth} {activeDaysInMonth === 1 ? "aktywny dzień" : "aktywne dni"}</p>
            )}
            {invoiceCount > 0 && activeDaysInMonth != null && activeDaysInMonth > 0 && (
              <p className="text-white/50 text-xs mt-1">{Math.round(invoiceCount / activeDaysInMonth)} zakupów dziennie</p>
            )}
          </>
        ) : (
          <p className="text-white/30 text-sm">Brak zakupów</p>
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
          <div key={i} className="h-28 w-full rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
        ))}
      </div>
    );
  }

  if (!data || data.days.length === 0) {
    return (
      <div className="py-20 text-center">
        <Package className="w-12 h-12 mx-auto mb-3 text-white/20" />
        <p className="text-white/60 font-medium">Brak zakupów w tym miesiącu</p>
        <p className="text-sm text-white/40 mt-1">Zaimportuj faktury lub zsynchronizuj z KSeF</p>
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
                <p className="font-semibold text-white capitalize">{dayLabel(day.date)}</p>
                <p className="text-xs text-white/50 capitalize mt-0.5">{dayOfWeek(day.date)}</p>
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
                <p className="font-bold text-lg tabular-nums text-white">{formatPrice(day.totalAmount)}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {day.invoiceCount} {day.invoiceCount === 1 ? "zakup" : "zakupów"} · {day.supplierCount} {day.supplierCount === 1 ? "dostawca" : "dostawców"}
                </p>
              </div>
            </div>

            {day.categories.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5">
                  {day.categories.slice(0, 4).map((cat, i) => (
                    <span key={cat.category} className="text-xs text-white/60 flex items-center gap-1">
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
  "bg-white/[0.04]",
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
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
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
          <div key={d} className="text-center text-xs text-white/40 font-medium py-1">{d}</div>
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
              <span className={cn("text-xs font-semibold leading-tight", level >= 3 ? "text-white" : "text-white/50")}>
                {cell.dayNum}
              </span>
              {info && info.invoiceCount > 0 && (
                <>
                  <span className={cn("text-[9px] font-bold leading-tight", level >= 3 ? "text-white/80" : "text-teal-600")}>
                    {info.invoiceCount} zak.
                  </span>
                  <span className={cn("text-[9px] leading-tight tabular-nums", level >= 2 ? "text-white/70" : "text-white/40")}>
                    {formatAmountShort(info.totalAmount)}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-5 justify-end">
        <span className="text-xs text-white/30">Mniej</span>
        {HEAT_CLASSES.map((cls, i) => (
          <div key={i} className={cn("w-4 h-4 rounded", cls, i === 0 && "border border-white/10")} />
        ))}
        <span className="text-xs text-white/30">Więcej</span>
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
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
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
        <p className="text-white font-semibold text-lg">Wszystkie płatności uregulowane</p>
        <p className="text-sm text-white/40 mt-1">Brak zaległych przelewów bankowych</p>
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
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="p-4 rounded-2xl" style={{ background: tile.bg, border: `1px solid ${tile.border}` }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: tile.color }}>{tile.label}</p>
            <p className="text-xl font-bold text-white tabular-nums leading-tight">{formatPrice(tile.amount)}</p>
            {tile.count > 0 && (
              <p className="text-xs mt-1.5" style={{ color: tile.color + "99" }}>
                {tile.count} {tile.count === 1 ? "faktura" : "faktur"}
              </p>
            )}
          </div>
        ))}
      </div>

      {timeline.length > 0 && (
        <div className="space-y-2">
          {timeline.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={CARD_STYLE}>
              <div className="w-28 shrink-0">
                <p className="text-xs font-semibold" style={{ color: labelColor(inv.urgency) }}>
                  {timelineLabel(inv)}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{inv.supplierName}</p>
                <p className="text-xs text-white/40 truncate">{inv.invoiceNumber}</p>
              </div>
              <p className="text-sm font-semibold text-white tabular-nums shrink-0">{formatPrice(inv.totalAmount)}</p>
              <button
                onClick={() => onMarkPaid(inv.id, true)}
                className="shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors text-white"
                style={{ background: "rgba(20,184,166,0.18)", border: "1px solid rgba(20,184,166,0.3)" }}
              >
                Zapłacono
              </button>
            </div>
          ))}
        </div>
      )}

      {(data?.noDueDateCount ?? 0) > 0 && (
        <div className="px-4 py-3 rounded-xl space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-xs text-white/40">Bez terminu ({data?.noDueDateCount})</p>
          {(data?.noDueDate ?? []).map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/70 truncate">{inv.supplierName}</p>
                <p className="text-xs text-white/30 truncate">{inv.invoiceNumber}</p>
              </div>
              <p className="text-sm font-semibold text-white/60 tabular-nums shrink-0">{formatPrice(inv.totalAmount)}</p>
              <button
                onClick={() => onMarkPaid(inv.id, true)}
                className="text-xs px-3 py-1.5 rounded-full font-medium text-white/50"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
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

function InvoiceDetailModal({ invoiceId, onClose, onOpenInvoice }: { invoiceId: number; onClose: () => void; onOpenInvoice?: (id: number) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetInvoice(invoiceId, {
    query: { queryKey: getGetInvoiceQueryKey(invoiceId) },
  });
  const deleteItem = useDeleteInvoiceItem();
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [historyProduct, setHistoryProduct] = useState<{ id: number; name: string } | null>(null);
  const markPaidMut = useMarkInvoicePaid();

  function copyNumber() {
    if (!data?.invoiceNumber) return;
    navigator.clipboard.writeText(data.invoiceNumber);
    toast({ title: "Skopiowano numer faktury" });
  }

  async function handleMarkPaid() {
    try {
      await markPaidMut.mutateAsync({ id: invoiceId, data: { isPaid: true } });
      qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
      qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      toast({ title: "Oznaczono jako zapłacone" });
    } catch {
      toast({ variant: "destructive", title: "Nie udało się oznaczyć" });
    }
  }
  const total = data?.items.reduce((s, i) => s + i.totalPrice, 0) ?? 0;
  const deleteItemName = data?.items.find((i) => i.id === deleteItemId)?.productName;

  function handleDeleteItem() {
    if (deleteItemId == null) return;
    deleteItem.mutate(
      { invoiceId, itemId: deleteItemId },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
          void qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          setDeleteItemId(null);
          toast({ title: "Pozycja usunięta" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się usunąć pozycji." });
        },
      },
    );
  }

  return (
    <>
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">{data?.invoiceNumber ?? "Faktura"}</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
          </div>
        ) : data ? (
          <div className="flex flex-col min-h-0 gap-4 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <Link
                href={`/suppliers/${data.supplierId}`}
                className="block bg-secondary/40 rounded-lg px-3 py-2.5 hover:bg-secondary transition-colors"
                title="Przejdź do dostawcy"
              >
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Dostawca</p>
                <p className="text-sm font-semibold text-primary truncate flex items-center gap-1">
                  <span className="truncate">{data.supplierName}</span>
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                </p>
              </Link>
              {[
                { label: "Data", value: formatDate(data.invoiceDate) },
                { label: "Pozycji", value: String(data.items.length) },
              ].map((f) => (
                <div key={f.label} className="bg-secondary/40 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                  <p className="text-sm font-semibold text-foreground truncate">{f.value}</p>
                </div>
              ))}
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Wartość</p>
                <p className="text-sm font-bold text-primary">{formatPrice(data.totalAmount)}</p>
              </div>
            </div>

            {/* Akcje */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={copyNumber}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Kopiuj numer
              </button>
              {data.isPaid ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Opłacone
                </span>
              ) : (
                <button
                  onClick={handleMarkPaid}
                  disabled={markPaidMut.isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {markPaidMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Oznacz jako zapłacone
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Drukuj / PDF
              </button>
            </div>
            {data.items.length > 0 ? (
              <div className="flex-1 min-h-0 border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground bg-secondary/30 border-b border-border">
                  <div>Produkt</div>
                  <div className="text-right w-20 hidden sm:block">Ilość</div>
                  <div className="text-right w-24">Cena jedn.</div>
                  <div className="text-right w-24">Wartość</div>
                  <div className="w-7" />
                </div>
                <div className="divide-y divide-border overflow-y-auto max-h-[340px]">
                  {data.items.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center group hover:bg-secondary/20 transition-colors">
                      <div className="min-w-0">
                        {item.productId != null ? (
                          <button
                            onClick={() => setHistoryProduct({ id: item.productId!, name: item.productName })}
                            className="flex items-center gap-1 max-w-full text-left text-sm font-medium text-primary hover:underline transition-colors"
                            title="Pokaż historię cen"
                          >
                            <span className="truncate">{item.productName}</span>
                            <LineChart className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          </button>
                        ) : (
                          <p className="text-sm font-medium truncate">{item.productName}</p>
                        )}
                        {item.vatRate != null && <p className="text-xs text-muted-foreground">VAT {item.vatRate}%</p>}
                      </div>
                      <div className="text-right w-20 hidden sm:block">
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(3)} {item.unit}
                        </p>
                      </div>
                      <div className="text-right w-24">
                        <p className="text-sm text-muted-foreground tabular-nums">{formatPrice(item.unitPrice)}</p>
                      </div>
                      <div className="text-right w-24">
                        <p className="text-sm font-semibold tabular-nums">{formatPrice(item.totalPrice)}</p>
                      </div>
                      <div className="w-7 flex justify-end">
                        <button
                          onClick={() => setDeleteItemId(item.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Usuń pozycję"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 border-t border-border bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground">Razem</p>
                  <div className="w-20 hidden sm:block" />
                  <div className="w-24" />
                  <p className="text-sm font-bold text-right w-24 tabular-nums">{formatPrice(total)}</p>
                  <div className="w-7" />
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground border border-border rounded-xl">
                <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                Brak pozycji (zaimportowano bez XML).
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteItemId != null} onOpenChange={(open) => { if (!open) setDeleteItemId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usuń pozycję</AlertDialogTitle>
          <AlertDialogDescription>
            Czy na pewno chcesz usunąć pozycję{" "}
            {deleteItemName && <span className="font-medium text-foreground">{deleteItemName}</span>}
            ? Wartość faktury zostanie zaktualizowana.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteItem}
            disabled={deleteItem.isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {deleteItem.isPending ? "Usuwanie..." : "Usuń"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {historyProduct && (
      <PriceHistoryModal
        productId={historyProduct.id}
        productName={historyProduct.name}
        onClose={() => setHistoryProduct(null)}
        onSelectInvoice={onOpenInvoice ? (id) => { setHistoryProduct(null); onOpenInvoice(id); } : undefined}
      />
    )}
    </>
  );
}

// ─── Faktury archive view ──────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  gotowka: "Gotówka",
  karta: "Karta",
  przelew: "Przelew",
};

function FakturyView({ onImportClick, onDeleteAllClick }: { onImportClick: () => void; onDeleteAllClick: () => void }) {
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const { data: costCenters = [] } = useListCostCenters();
  const setCostCenter = useSetInvoiceCostCenter();
  const [showUnassigned, setShowUnassigned] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Server-side pagination + search. costCenterId: 0 = nieprzypisane.
  const effectiveCostCenterId = showUnassigned
    ? 0
    : costCenterSelectedId !== null
      ? costCenterSelectedId
      : undefined;
  const pagedParams = {
    page,
    limit: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(supplierFilter !== "all" ? { supplierId: Number(supplierFilter) } : {}),
    ...(effectiveCostCenterId != null ? { costCenterId: effectiveCostCenterId } : {}),
  };
  const { data: pagedData, isLoading } = useListInvoicesPaged(pagedParams, {
    query: { queryKey: getListInvoicesPagedQueryKey(pagedParams) },
  });
  const invoices = pagedData?.items;
  const total = pagedData?.total ?? 0;
  const { data: suppliers } = useListSuppliers();
  const deleteInvoice = useDeleteInvoice();
  const toggleExcluded = useToggleInvoiceExcluded();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Po mutacjach odświeżamy obie listy (paginowaną i tablicową dla innych widoków).
  function invalidateInvoices() {
    queryClient.invalidateQueries({ queryKey: getListInvoicesPagedQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  }

  function handleSetCostCenter(invoiceId: number, ccId: number | null) {
    setCostCenter.mutate(
      { id: invoiceId, data: { costCenterId: ccId } },
      { onSuccess: () => invalidateInvoices() },
    );
  }

  const applySuggestions = useApplyCostCenterSuggestions();
  const suggestionCount = pagedData?.suggestedCount ?? 0;
  function handleApplySuggestions() {
    applySuggestions.mutate(undefined, {
      onSuccess: () => invalidateInvoices(),
    });
  }

  const [isBulkAssigningCc, setIsBulkAssigningCc] = useState(false);
  const markPaid = useMarkInvoicePaid();
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignCcId, setBulkAssignCcId] = useState<string>("");

  // Strona bieżąca z serwera.
  const paged = invoices ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [debouncedSearch, supplierFilter, showUnassigned, costCenterSelectedId]);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  // Zaznaczanie działa w obrębie bieżącej strony (paginacja serwerowa).
  const selectableIds = paged.map((inv) => inv.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  async function handleBulkMarkPaid() {
    const ids = [...selectedIds].filter((id) => {
      const inv = paged.find((i) => i.id === id);
      return inv && !inv.isPaid;
    });
    if (!ids.length) return;
    setIsMarkingPaid(true);
    try {
      await Promise.all(ids.map((id) => markPaid.mutateAsync({ id, data: { isPaid: true } })));
      invalidateInvoices();
      await queryClient.invalidateQueries({ queryKey: getGetInvoicesPaymentsQueryKey() });
      setSelectedIds(new Set());
      toast({ title: "Zaktualizowano", description: `Oznaczono ${ids.length} ${ids.length === 1 ? "fakturę" : ids.length < 5 ? "faktury" : "faktur"} jako zapłacone.` });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się zaktualizować statusu.", variant: "destructive" });
    } finally {
      setIsMarkingPaid(false);
    }
  }

  const [isExporting, setIsExporting] = useState(false);
  async function handleExport() {
    // CSV obejmuje WSZYSTKIE faktury pasujące do filtra (nie tylko bieżącą stronę) —
    // pobieramy je jednorazowo z endpointu tablicowego, bez trzymania ich w pamięci na stałe.
    setIsExporting(true);
    try {
      const all = await listInvoices({
        ...(supplierFilter !== "all" ? { supplierId: Number(supplierFilter) } : {}),
        ...(effectiveCostCenterId != null ? { costCenterId: effectiveCostCenterId } : {}),
        limit: 100000,
      });
      const q = debouncedSearch.trim().toLowerCase();
      const rows = q
        ? all.filter((inv) => inv.supplierName.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q))
        : all;
      if (!rows.length) { toast({ title: "Brak faktur do eksportu" }); return; }
      exportToCsv(
        [
          ["Dostawca", "Numer", "Data", "Wartość", "Pozycji", "Metoda płatności", "Status"],
          ...rows.map((inv) => [
            inv.supplierName,
            inv.invoiceNumber,
            inv.invoiceDate,
            inv.totalAmount,
            inv.itemCount,
            inv.paymentMethod ? PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod : "",
            inv.isPaid ? "Opłacone" : "Nieopłacone",
          ]),
        ],
        `faktury-${todaySlug()}.csv`,
      );
    } catch {
      toast({ variant: "destructive", title: "Błąd eksportu", description: "Nie udało się pobrać faktur." });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteInvoice.mutateAsync({ id });
    invalidateInvoices();
    setDeleteId(null);
    toast({ title: "Usunięto", description: "Faktura została usunięta." });
  }

  async function handleToggleExcluded(id: number, excluded: boolean) {
    await toggleExcluded.mutateAsync({ id, data: { excluded: !excluded } });
    invalidateInvoices();
  }

  // Assigns the chosen cost center to ONLY the selected invoices (Promise.all over the
  // per-invoice endpoint), mirroring handleBulkMarkPaid above. Deliberately does not use
  // the all-invoices bulk endpoint — a single click must never touch unselected invoices.
  async function handleBulkAssignConfirm() {
    const ccId = bulkAssignCcId === "" ? null : parseInt(bulkAssignCcId, 10);
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setIsBulkAssigningCc(true);
    try {
      await Promise.all(ids.map((id) => setCostCenter.mutateAsync({ id, data: { costCenterId: ccId } })));
      invalidateInvoices();
      setShowBulkAssign(false);
      setBulkAssignCcId("");
      setSelectedIds(new Set());
      toast({ title: "Gotowe", description: `Przypisano ${ids.length} ${ids.length === 1 ? "fakturę" : ids.length < 5 ? "faktury" : "faktur"}.` });
    } catch {
      toast({ variant: "destructive", title: "Błąd", description: "Nie udało się przypisać centrum kosztów." });
    } finally {
      setIsBulkAssigningCc(false);
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj po dostawcy lub numerze..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {(suppliers ?? []).length > 1 && (
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Wszyscy dostawcy" />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              <SelectItem value="all">Wszyscy dostawcy</SelectItem>
              {(suppliers ?? []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {costCenters.length > 0 && (
            <Button
              variant={showUnassigned ? "default" : "outline"}
              size="sm"
              onClick={() => setShowUnassigned((v) => !v)}
              className="gap-1.5 shrink-0"
            >
              <Layers className="w-4 h-4" />
              Nieprzypisane
            </Button>
          )}
          {suggestionCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplySuggestions}
              disabled={applySuggestions.isPending}
              className="gap-1.5 shrink-0 text-primary border-primary/30 hover:bg-primary/5"
              title="Przypisz wszystkie sugerowane centra kosztów"
            >
              <Check className="w-4 h-4" />
              Zastosuj sugestie ({suggestionCount})
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleExport} title="Eksportuj CSV" className="shrink-0">
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onDeleteAllClick} title="Usuń wszystkie" className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showBulkAssign} onOpenChange={setShowBulkAssign}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Przypisz {selectedIds.size} {selectedIds.size === 1 ? "zaznaczoną fakturę" : "zaznaczonych faktur"} do centrum kosztów</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Centrum zostanie przypisane wyłącznie do faktur zaznaczonych na liście.
          </p>
          <div className="space-y-3 pt-1">
            <Select value={bulkAssignCcId} onValueChange={setBulkAssignCcId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz centrum kosztów..." />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {costCenters.map((cc) => (
                  <SelectItem key={cc.id} value={String(cc.id)}>
                    <span className="flex items-center gap-2">
                      {cc.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cc.color }} />}
                      {cc.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBulkAssign(false)}>Anuluj</Button>
              <Button
                disabled={!bulkAssignCcId || isBulkAssigningCc || selectedIds.size === 0}
                onClick={handleBulkAssignConfirm}
              >
                {isBulkAssigningCc ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Przypisz zaznaczone
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : paged.length === 0 ? (
        <div className="py-16 text-center text-white/50">
          <FileText className="w-10 h-10 mx-auto mb-2 text-white/20" />
          {total === 0 && !debouncedSearch && supplierFilter === "all" && !showUnassigned ? (
            <>
              <p className="font-medium">Nie masz jeszcze żadnych faktur</p>
              <p className="text-sm text-white/40 mt-1">Dodaj pierwszy zakup albo zsynchronizuj KSeF.</p>
              <Button className="mt-4" onClick={onImportClick}>
                <Plus className="w-4 h-4 mr-2" />
                Dodaj zakup
              </Button>
            </>
          ) : (
            <p className="font-medium">Brak faktur pasujących do filtrów</p>
          )}
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl mb-2" style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.25)" }}>
              <span className="text-sm text-teal-300 font-medium">{selectedIds.size} zaznaczone</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors px-2"
                >
                  Odznacz
                </button>
                <button
                  onClick={handleBulkMarkPaid}
                  disabled={isMarkingPaid}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                  style={{ background: "rgba(20,184,166,0.25)", color: "#5eead4", border: "1px solid rgba(20,184,166,0.35)" }}
                >
                  {isMarkingPaid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Oznacz jako zapłacone
                </button>
                {costCenters.length > 0 && (
                  <button
                    onClick={() => { setBulkAssignCcId(""); setShowBulkAssign(true); }}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <Layers className="w-3 h-3" />
                    Przypisz do centrum
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Header */}
            <div className="grid grid-cols-[28px_1fr_auto_auto_auto_auto_auto] gap-2 px-4 py-2.5 text-xs font-medium text-white/40" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Select-all checkbox */}
              <div className="flex items-center justify-center cursor-pointer" onClick={handleSelectAll}>
                <div className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                  style={allSelected
                    ? { background: "rgba(20,184,166,0.3)", border: "1px solid rgba(20,184,166,0.6)" }
                    : { border: "1px solid rgba(255,255,255,0.2)" }}>
                  {allSelected && <Check className="w-2.5 h-2.5 text-teal-300" />}
                </div>
              </div>
              <div>Dostawca / Numer</div>
              <div className="hidden sm:block text-right w-24">Data</div>
              <div className="hidden sm:block text-center w-20">Metoda</div>
              <div className="hidden sm:block text-center w-20">Status</div>
              <div className="text-right w-24">Wartość</div>
              <div className="w-16" />
            </div>

            {/* Rows */}
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {paged.map((inv) => {
                const isSelected = selectedIds.has(inv.id);
                return (
                  <div
                    key={inv.id}
                    className={cn(
                      "grid grid-cols-[28px_1fr_auto_auto_auto_auto_auto] gap-2 px-4 py-3 items-center transition-colors",
                      inv.excluded && "opacity-50",
                    )}
                    style={{
                      borderBottomColor: "rgba(255,255,255,0.04)",
                      background: isSelected ? "rgba(20,184,166,0.06)" : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "rgba(20,184,166,0.06)" : ""; }}
                  >
                    {/* Checkbox */}
                    <div
                      className="flex items-center justify-center cursor-pointer"
                      onClick={() => toggleSelect(inv.id)}
                    >
                      {isSelected ? (
                        <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: "rgba(20,184,166,0.3)", border: "1px solid rgba(20,184,166,0.6)" }}>
                          <Check className="w-2.5 h-2.5 text-teal-300" />
                        </div>
                      ) : inv.isPaid ? (
                        <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)" }}>
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded transition-colors hover:border-white/40" style={{ border: "1px solid rgba(255,255,255,0.18)" }} />
                      )}
                    </div>

                    <div className="min-w-0 cursor-pointer" onClick={() => setViewInvoiceId(inv.id)}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium truncate text-white">{inv.supplierName}</p>
                        {inv.invoiceType === "KOR" && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded text-orange-300 leading-none" style={{ background: "rgba(251,146,60,0.18)" }}>
                            KOREKTA
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/50 truncate">{inv.invoiceNumber}</p>
                      {/* Mobile-only meta: data + status (kolumny ukryte na <sm) */}
                      <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                        <span className="text-xs text-white/50 tabular-nums">{formatDate(inv.invoiceDate)}</span>
                        {inv.isPaid ? (
                          <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(52,211,153,0.12)" }}>Opłacone</span>
                        ) : inv.paymentMethod === "przelew" ? (
                          <span className="text-[10px] text-orange-400 px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(251,146,60,0.12)" }}>Oczekuje</span>
                        ) : null}
                      </div>
                      {inv.correctedInvoiceNumber && (
                        <p className="text-[10px] text-orange-400/70 truncate">do: {inv.correctedInvoiceNumber}</p>
                      )}
                      {inv.paymentMethod === "przelew" && inv.paymentDueDate && !inv.isPaid && (
                        <p className="text-xs text-orange-400">termin: {formatDate(inv.paymentDueDate)}</p>
                      )}
                      {costCenters.length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {inv.costCenterName ? (
                            <>
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: inv.costCenterColor ?? "#14B8A6" }} />
                              <span className="text-[10px] text-white/40 truncate">{inv.costCenterName}</span>
                            </>
                          ) : inv.suggestedCostCenterId != null ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSetCostCenter(inv.id, inv.suggestedCostCenterId!); }}
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full transition-colors"
                              style={{ background: "rgba(20,184,166,0.12)", color: "#5eead4", border: "1px solid rgba(20,184,166,0.3)" }}
                              title="Przypisz sugerowane centrum"
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: inv.suggestedCostCenterColor ?? "#14B8A6" }} />
                              <span className="truncate max-w-[120px]">Sugerowane: {inv.suggestedCostCenterName}</span>
                              <Check className="w-2.5 h-2.5 shrink-0" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-white/20">Nieprzypisane</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="hidden sm:block text-right w-24">
                      <p className="text-sm text-white/50 tabular-nums">{formatDate(inv.invoiceDate)}</p>
                    </div>
                    <div className="hidden sm:flex justify-center w-20">
                      {inv.paymentMethod ? (
                        <span className="text-xs px-2 py-0.5 rounded-full text-white/60" style={{ background: "rgba(255,255,255,0.08)" }}>
                          {PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod}
                        </span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </div>
                    <div className="hidden sm:flex justify-center w-20">
                      {inv.isPaid ? (
                        <span className="text-xs text-emerald-400 px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(52,211,153,0.12)" }}>
                          Opłacone
                        </span>
                      ) : inv.paymentMethod === "przelew" ? (
                        <span className="text-xs text-orange-400 px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(251,146,60,0.12)" }}>
                          Oczekuje
                        </span>
                      ) : (
                        <span className="text-white/20 text-xs">—</span>
                      )}
                    </div>
                    <div className="text-right w-24">
                      <p className="text-sm font-semibold tabular-nums text-white">{formatPrice(inv.totalAmount)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 justify-end shrink-0">
                      {costCenters.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/70 rounded"
                              title="Przypisz centrum kosztów"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className={cn(!inv.costCenterId && "text-primary")}
                              onClick={() => handleSetCostCenter(inv.id, null)}
                            >
                              <div className="w-3 h-3 rounded-full bg-muted-foreground/30 mr-2" />
                              Brak centrum
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {costCenters.map((cc) => (
                              <DropdownMenuItem
                                key={cc.id}
                                className={cn(inv.costCenterId === cc.id && "text-primary")}
                                onClick={() => handleSetCostCenter(inv.id, cc.id)}
                              >
                                <div className="w-3 h-3 rounded-full mr-2" style={{ background: cc.color }} />
                                {cc.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <button
                        onClick={() => handleToggleExcluded(inv.id, inv.excluded)}
                        className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/70 rounded"
                        title={inv.excluded ? "Uwzględnij w statystykach" : "Wyklucz ze statystyk"}
                      >
                        {inv.excluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setDeleteId(inv.id)}
                        className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-red-400 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white/70 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <ChevronLeft className="w-4 h-4" />
                Poprzednia
              </button>
              <span className="text-sm text-white/50 tabular-nums px-2">Strona {page} z {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-white/70 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Następna
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {viewInvoiceId && <InvoiceDetailModal invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} onOpenInvoice={setViewInvoiceId} />}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć fakturę?</AlertDialogTitle>
            <AlertDialogDescription>Tej operacji nie można cofnąć.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── XML preview helpers ──────────────────────────────────────────────────────

interface ParsedItem { productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate: number | null; }
interface XmlPreview { invoiceNumber: string | null; invoiceDate: string | null; items: ParsedItem[]; totalGross: number | null; }

function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}
function parseNumStr(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}
function parseXmlPreview(xml: string): XmlPreview | null {
  if (!xml.trim()) return null;
  try {
    const stripped = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "").replace(/<(\w+):/g, "<").replace(/<\/(\w+):/g, "</");
    const invoiceNumber = extractXmlTag(stripped, "P_2") ?? extractXmlTag(stripped, "NrFa");
    const rawDate = extractXmlTag(stripped, "P_1") ?? extractXmlTag(stripped, "DataWystawienia");
    let invoiceDate: string | null = null;
    if (rawDate) {
      const d = rawDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) invoiceDate = d;
      else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
        const [dd, mm, yyyy] = d.split(".");
        invoiceDate = `${yyyy}-${mm}-${dd}`;
      }
    }
    const totalGrossRaw = extractXmlTag(stripped, "P_15") ?? extractXmlTag(stripped, "WartoscBrutto");
    const totalGross = totalGrossRaw ? parseNumStr(totalGrossRaw) : null;
    const items: ParsedItem[] = [];
    const wierszeRe = /<FaWiersz>([\s\S]*?)<\/FaWiersz>/g;
    let wiersz: RegExpExecArray | null;
    while ((wiersz = wierszeRe.exec(stripped)) !== null) {
      const block = wiersz[1];
      const name = extractXmlTag(block, "P_7");
      if (!name) continue;
      const unit = extractXmlTag(block, "P_8A") ?? "szt";
      const qty = parseNumStr(extractXmlTag(block, "P_8B"));
      const unitPrice = parseNumStr(extractXmlTag(block, "P_9A") ?? extractXmlTag(block, "P_9B"));
      const total = parseNumStr(extractXmlTag(block, "P_11") ?? extractXmlTag(block, "P_11A"));
      const vatRaw = extractXmlTag(block, "P_12");
      const vatRate = vatRaw && /^\d+$/.test(vatRaw.trim()) ? parseInt(vatRaw.trim(), 10) : null;
      items.push({ productName: name, quantity: qty || 1, unit, unitPrice, totalPrice: total || unitPrice * (qty || 1), vatRate });
    }
    return { invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, items, totalGross };
  } catch { return null; }
}

// ─── Import dialog ─────────────────────────────────────────────────────────────

const importSchema = z.object({
  supplierId: z.string().min(1, "Wybierz dostawcę"),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1, "Data jest wymagana"),
  xmlContent: z.string().optional(),
  paymentMethod: z.enum(["gotowka", "karta", "przelew"]).optional(),
  paymentDueDate: z.string().optional(),
});
type ImportFormValues = z.infer<typeof importSchema>;

function ImportInvoiceDialog({
  open,
  onClose,
  suppliers,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Array<{ id: number; name: string }>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const importInvoice = useImportInvoice();
  const scanReceipt = useScanReceipt();

  const [importTab, setImportTab] = useState<"xml" | "photo">("xml");
  const [xmlPreview, setXmlPreview] = useState<XmlPreview | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedReceiptData | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<{ message: string; values: ImportFormValues } | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierNip, setNewSupplierNip] = useState("");
  const [isCorrection, setIsCorrection] = useState(false);
  const [correctedInvoiceNumber, setCorrectedInvoiceNumber] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSupplierMutation = useCreateSupplier();

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: { supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], xmlContent: "", paymentMethod: undefined, paymentDueDate: "" },
  });

  const paymentMethod = form.watch("paymentMethod");

  const handleXmlChange = useCallback((xml: string) => {
    if (!xml.trim()) { setXmlPreview(null); return; }
    const preview = parseXmlPreview(xml);
    setXmlPreview(preview);
    if (preview) {
      if (preview.invoiceNumber && !form.getValues("invoiceNumber")) form.setValue("invoiceNumber", preview.invoiceNumber);
      if (preview.invoiceDate && form.getValues("invoiceDate") === new Date().toISOString().split("T")[0]) form.setValue("invoiceDate", preview.invoiceDate);
    }
  }, [form]);

  function compressImage(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1800 / img.width, 1800 / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ base64: out.split(",")[1], mimeType: "image/jpeg" });
      };
      img.src = dataUrl;
    });
  }

  async function handleScanReceipt() {
    if (!receiptPreviewUrl) return;
    const { base64, mimeType } = await compressImage(receiptPreviewUrl);
    try {
      const data = await scanReceipt.mutateAsync({ data: { imageBase64: base64, mimeType } });
      setScannedData(data);
      if (data.invoiceNumber && !form.getValues("invoiceNumber")) form.setValue("invoiceNumber", data.invoiceNumber);
      if (data.invoiceDate) form.setValue("invoiceDate", data.invoiceDate);
      if (data.supplierName) {
        const needle = data.supplierName.toLowerCase().trim();
        const match = suppliers.find(
          (s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()),
        );
        if (match) {
          form.setValue("supplierId", String(match.id));
        } else {
          setNewSupplierName(data.supplierName);
          setNewSupplierNip(data.supplierNip ?? "");
          setShowAddSupplier(true);
        }
      }
      if (data.isCorrection) {
        setIsCorrection(true);
        setCorrectedInvoiceNumber(data.correctedInvoiceNumber ?? "");
      }
      toast({ title: "Skan gotowy", description: `Rozpoznano ${data.items.length} pozycji.` });
    } catch {
      toast({ variant: "destructive", title: "Błąd skanowania", description: "Nie udało się przetworzyć obrazu." });
    }
  }

  function handleAddSupplier() {
    if (!newSupplierName.trim()) return;
    createSupplierMutation.mutate(
      {
        data: {
          name: newSupplierName.trim(),
          taxId: newSupplierNip.trim(),
          email: null,
          phone: null,
        },
      },
      {
        onSuccess: (newS) => {
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          form.setValue("supplierId", String(newS.id));
          setShowAddSupplier(false);
          setNewSupplierName("");
          setNewSupplierNip("");
          toast({ title: "Dostawca dodany", description: newS.name });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się dodać dostawcy." });
        },
      },
    );
  }

  async function handleSubmit(values: ImportFormValues, force = false) {
    const items = importTab === "photo" && scannedData?.items.length
      ? scannedData.items.map((it) => ({ ...it, vatRate: null as number | null }))
      : undefined;
    try {
      await importInvoice.mutateAsync({
        data: {
          supplierId: parseInt(values.supplierId, 10),
          invoiceNumber: values.invoiceNumber || undefined,
          invoiceDate: values.invoiceDate,
          xmlContent: importTab === "xml" ? (values.xmlContent || undefined) : undefined,
          force,
          items,
          paymentMethod: values.paymentMethod as "gotowka" | "karta" | "przelew" | undefined,
          paymentDueDate: values.paymentMethod === "przelew" ? (values.paymentDueDate || undefined) : undefined,
          correctedInvoiceNumber: isCorrection && correctedInvoiceNumber.trim() ? correctedInvoiceNumber.trim() : undefined,
        },
      });
      queryClient.invalidateQueries();
      toast({ title: "Dodano zakup" });
      form.reset({ supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], xmlContent: "", paymentMethod: undefined, paymentDueDate: "" });
      setXmlPreview(null); setScannedData(null); setReceiptPreviewUrl(null);
      setShowAddSupplier(false); setNewSupplierName(""); setNewSupplierNip("");
      setIsCorrection(false); setCorrectedInvoiceNumber("");
      onClose();
    } catch (err: unknown) {
      const body = err as { status?: number; message?: string };
      if (body?.status === 409) {
        setDuplicateConflict({ message: body.message ?? "Faktura już istnieje.", values });
      } else {
        toast({ variant: "destructive", title: "Błąd importu", description: body?.message ?? "Spróbuj ponownie." });
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dodaj zakup</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-2">
            <button onClick={() => setImportTab("xml")} className={cn("flex-1 py-1.5 text-sm font-medium rounded-lg transition-all", importTab === "xml" ? "bg-white shadow-sm" : "text-muted-foreground")}>
              XML / Ręcznie
            </button>
            <button onClick={() => setImportTab("photo")} className={cn("flex-1 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5", importTab === "photo" ? "bg-white shadow-sm" : "text-muted-foreground")}>
              <Camera className="w-3.5 h-3.5" />Zdjęcie
            </button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => handleSubmit(v))} className="space-y-4">
              <FormField control={form.control} name="supplierId" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Dostawca</FormLabel>
                    {!showAddSupplier && (
                      <button
                        type="button"
                        onClick={() => { setShowAddSupplier(true); setNewSupplierName(""); setNewSupplierNip(""); }}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Nowy dostawca
                      </button>
                    )}
                  </div>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Wybierz dostawcę" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-60 overflow-y-auto">{suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {showAddSupplier && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-primary">Nowy dostawca</p>
                    <button
                      type="button"
                      onClick={() => setShowAddSupplier(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Input
                    placeholder="Nazwa dostawcy *"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="NIP (opcjonalnie)"
                    value={newSupplierNip}
                    onChange={(e) => setNewSupplierNip(e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newSupplierName.trim() || createSupplierMutation.isPending}
                    onClick={handleAddSupplier}
                    className="h-7 text-xs w-full"
                  >
                    {createSupplierMutation.isPending ? "Dodawanie..." : "Dodaj dostawcę"}
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numer faktury</FormLabel>
                    <FormControl><Input placeholder="FV/2024/001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {isCorrection ? (
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-orange-600">Faktura korygująca</p>
                    <button
                      type="button"
                      onClick={() => { setIsCorrection(false); setCorrectedInvoiceNumber(""); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Numer korygowanej faktury *</label>
                    <Input
                      placeholder="np. FV/2024/001"
                      value={correctedInvoiceNumber}
                      onChange={(e) => setCorrectedInvoiceNumber(e.target.value)}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCorrection(true)}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  To jest faktura korygująca
                </button>
              )}

              <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                <FormItem>
                  <FormLabel>Metoda płatności <span className="text-muted-foreground font-normal">(opcjonalnie)</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Wybierz metodę" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gotowka">Gotówka</SelectItem>
                      <SelectItem value="karta">Karta</SelectItem>
                      <SelectItem value="przelew">Przelew bankowy</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {paymentMethod === "przelew" && (
                <FormField control={form.control} name="paymentDueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Termin płatności</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {importTab === "xml" ? (
                <FormField control={form.control} name="xmlContent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>XML KSeF <span className="text-muted-foreground font-normal">(opcjonalnie)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Wklej treść XML faktury..."
                        rows={5}
                        {...field}
                        onChange={(e) => { field.onChange(e); handleXmlChange(e.target.value); }}
                      />
                    </FormControl>
                    {xmlPreview && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Rozpoznano {xmlPreview.items.length} pozycji{xmlPreview.totalGross != null ? ` · ${formatPrice(xmlPreview.totalGross)}` : ""}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => { setReceiptPreviewUrl(ev.target?.result as string); setScannedData(null); };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {receiptPreviewUrl ? (
                    <div className="relative">
                      <img src={receiptPreviewUrl} alt="Paragon" className="w-full max-h-40 object-contain rounded-lg border border-border" />
                      <button
                        type="button"
                        onClick={() => { setReceiptPreviewUrl(null); setScannedData(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border rounded-xl py-8 text-center text-muted-foreground hover:border-primary/50 transition-colors"
                    >
                      <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm font-medium">Kliknij, aby dodać zdjęcie</p>
                      <p className="text-xs text-muted-foreground mt-1">paragon lub faktura</p>
                    </button>
                  )}
                  {receiptPreviewUrl && !scannedData && (
                    <Button type="button" variant="outline" className="w-full gap-2" onClick={handleScanReceipt} disabled={scanReceipt.isPending}>
                      {scanReceipt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                      {scanReceipt.isPending ? "Skanuję..." : "Skanuj paragon"}
                    </Button>
                  )}
                  {scannedData && (
                    <div className="text-xs text-emerald-600 flex items-center gap-1.5 bg-emerald-50 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Rozpoznano {scannedData.items.length} pozycji
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={importInvoice.isPending}>
                {importInvoice.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Dodaj zakup
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!duplicateConflict} onOpenChange={(o) => { if (!o) setDuplicateConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Faktura już istnieje</AlertDialogTitle>
            <AlertDialogDescription>{duplicateConflict?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateConflict(null)}>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (duplicateConflict) { handleSubmit(duplicateConflict.values, true); setDuplicateConflict(null); } }}>
              Importuj mimo to
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

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
      const hasPending = (res.pending ?? 0) > 0;
      const hasImported = (res.imported ?? 0) > 0;
      if (hasPending && !hasImported) {
        toast({ title: "Faktury wymagają przypisania", description: `${res.pending} faktur trafiło do "Do przeglądu".`, duration: 8000 });
      } else {
        toast({ title: "Synchronizacja zakończona", description: hasImported ? `Zaimportowano ${res.imported} nowych faktur.` : "Wszystkie faktury są aktualne." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Błąd synchronizacji", description: err instanceof Error ? err.message : "Nie udało się zsynchronizować." });
    }
  }

  return (
    <Layout>
      <div className="min-h-full bg-[#08111f]">
        {/* Custom dark header */}
        <div className="px-4 sm:px-6 pt-6 pb-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Zakupy</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config ? (
              <div className="flex flex-col items-end gap-0.5">
                <button
                  onClick={handleSync}
                  disabled={syncPending}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium text-white/70 transition-colors hover:text-white"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", syncPending && "animate-spin")} />
                  <span className="hidden sm:inline">{syncPhaseLabel(phase)}</span>
                </button>
                {syncPending && <Progress value={syncPhaseProgress(phase) ?? 0} className="h-0.5 w-full" />}
              </div>
            ) : (
              <Link href="/settings/ksef">
                <button
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium text-white/70 transition-colors hover:text-white"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
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
