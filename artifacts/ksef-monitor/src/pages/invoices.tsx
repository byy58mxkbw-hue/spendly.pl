import { useState, useCallback, useRef } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListInvoices,
  useImportInvoice,
  useScanReceipt,
  useListSuppliers,
  useDeleteInvoice,
  useDeleteAllInvoices,
  useGetKsefConfig,
  useGetInvoice,
  useToggleInvoiceExcluded,
  useGetInvoicesTimeline,
  useGetInvoicesCalendar,
  useGetInvoicesPayments,
  useMarkInvoicePaid,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getGetInvoicesTimelineQueryKey,
  getGetInvoicesCalendarQueryKey,
  getGetInvoicesPaymentsQueryKey,
  type ScannedReceiptData,
} from "@workspace/api-client-react";
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
  ChevronLeft, ChevronRight, Plus, FileText, Trash2, Download,
  RefreshCw, Camera, Loader2, CheckCircle2, Package,
  X, Search, Eye, EyeOff, ScanLine,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
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
    <div className="inline-flex bg-muted rounded-xl p-1 gap-0.5">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
            active === t.id
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
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
  biggestDay?: { date: string; totalAmount: number } | null;
  avgDailyAmount: number;
  loading: boolean;
}

function MonthHero({ month, onPrev, onNext, totalAmount, invoiceCount, supplierCount, prevMonthTotalAmount, biggestDay, avgDailyAmount, loading }: HeroProps) {
  const changePercent = prevMonthTotalAmount > 0
    ? Math.round(((totalAmount - prevMonthTotalAmount) / prevMonthTotalAmount) * 100)
    : null;
  const isUp = changePercent !== null && changePercent >= 0;

  return (
    <div className="bg-gradient-to-br from-teal-600 to-teal-700 text-white rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onPrev} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold capitalize flex-1">{monthLabel(month)}</h2>
        <button
          onClick={onNext}
          disabled={month >= todayMonth()}
          className="p-1.5 rounded-full hover:bg-white/20 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-12 w-56 bg-white/20 rounded-xl" />
          <div className="h-4 w-72 bg-white/15 rounded-lg" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="h-16 bg-white/10 rounded-xl" />
            <div className="h-16 bg-white/10 rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums mb-2">
              {formatPrice(totalAmount)}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-teal-100 text-sm">
              <span>{invoiceCount} {invoiceCount === 1 ? "zakup" : "zakupów"}</span>
              <span>{supplierCount} {supplierCount === 1 ? "dostawca" : "dostawców"}</span>
              {changePercent !== null && (
                <span className={cn("font-semibold", isUp ? "text-orange-200" : "text-emerald-200")}>
                  {isUp ? "+" : ""}{changePercent}% vs poprzedni miesiąc
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {biggestDay && (
              <div className="bg-white/10 rounded-xl px-4 py-3">
                <p className="text-teal-200 text-xs font-medium mb-1">Największe zakupy</p>
                <p className="font-semibold text-sm capitalize">{dayLabel(biggestDay.date)}</p>
                <p className="text-teal-100 text-xs tabular-nums mt-0.5">{formatPrice(biggestDay.totalAmount)}</p>
              </div>
            )}
            {avgDailyAmount > 0 && (
              <div className="bg-white/10 rounded-xl px-4 py-3">
                <p className="text-teal-200 text-xs font-medium mb-1">Średnio dziennie</p>
                <p className="font-semibold text-sm tabular-nums">{formatPrice(avgDailyAmount)}</p>
                <p className="text-teal-100 text-xs mt-0.5">w dni zakupowe</p>
              </div>
            )}
          </div>
        </>
      )}
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
  const { data: timeline } = useGetInvoicesTimeline(
    { month },
    { query: { queryKey: getGetInvoicesTimelineQueryKey({ month }), enabled: !!date } },
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
        <InvoiceDetailModal invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
      )}
    </>
  );
}

// ─── Zakupy (timeline) view ────────────────────────────────────────────────────

function ZakupyView({ month, onDayClick }: { month: string; onDayClick: (date: string) => void }) {
  const { data, isLoading } = useGetInvoicesTimeline(
    { month },
    { query: { queryKey: getGetInvoicesTimelineQueryKey({ month }) } },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (!data || data.days.length === 0) {
    return (
      <div className="py-20 text-center">
        <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground font-medium">Brak zakupów w tym miesiącu</p>
        <p className="text-sm text-muted-foreground mt-1">Zaimportuj faktury lub zsynchronizuj z KSeF</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.days.map((day) => (
        <button
          key={day.date}
          onClick={() => onDayClick(day.date)}
          className="w-full text-left bg-card border border-border rounded-2xl p-5 hover:shadow-md hover:border-teal-200 transition-all duration-200"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-semibold text-foreground capitalize">{dayLabel(day.date)}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{dayOfWeek(day.date)}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg tabular-nums text-foreground">{formatPrice(day.totalAmount)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {day.invoiceCount} {day.invoiceCount === 1 ? "zakup" : "zakupów"} · {day.supplierCount} {day.supplierCount === 1 ? "dostawca" : "dostawców"}
              </p>
            </div>
          </div>

          {day.categories.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                {day.categories.slice(0, 5).map((cat, i) => (
                  <div
                    key={cat.category}
                    className={cn("h-full", CAT_COLORS[i % CAT_COLORS.length])}
                    style={{ width: `${cat.percent}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {day.categories.slice(0, 4).map((cat, i) => (
                  <span key={cat.category} className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", CAT_COLORS[i % CAT_COLORS.length])} />
                    {catLabel(cat.category)} {cat.percent}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Kalendarz (heatmap) view ──────────────────────────────────────────────────

const HEAT_CLASSES = ["bg-muted", "bg-teal-100", "bg-teal-200", "bg-teal-400", "bg-teal-600"];
const DOW_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

function KalendarzView({ month, onDayClick }: { month: string; onDayClick: (date: string) => void }) {
  const { data, isLoading } = useGetInvoicesCalendar(
    { month },
    { query: { queryKey: getGetInvoicesCalendarQueryKey({ month }) } },
  );

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_LABELS.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={`pad-${i}`} className="aspect-square" />;
          const info = dayMap.get(cell.date);
          const amount = info?.totalAmount ?? 0;
          const level = amount === 0 ? 0 : Math.min(4, Math.ceil((amount / maxAmount) * 4));

          return (
            <button
              key={cell.date}
              onClick={() => info ? onDayClick(cell.date!) : undefined}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-150",
                HEAT_CLASSES[level],
                info ? "hover:scale-110 hover:shadow-md cursor-pointer" : "cursor-default",
              )}
              title={info ? `${dayLabel(cell.date)}: ${formatPrice(info.totalAmount)}` : undefined}
            >
              <span className={cn("text-xs font-medium", level >= 3 ? "text-white" : "text-muted-foreground")}>
                {cell.dayNum}
              </span>
              {info && info.invoiceCount > 0 && (
                <span className={cn("text-[9px] font-bold mt-0.5", level >= 3 ? "text-white/80" : "text-teal-600")}>
                  {info.invoiceCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-5 justify-end">
        <span className="text-xs text-muted-foreground">Mniej</span>
        {HEAT_CLASSES.map((cls, i) => (
          <div key={i} className={cn("w-4 h-4 rounded", cls, i === 0 && "border border-border")} />
        ))}
        <span className="text-xs text-muted-foreground">Więcej</span>
      </div>
    </div>
  );
}

// ─── Płatności view ────────────────────────────────────────────────────────────

function PlatnosciView({ onMarkPaid }: { onMarkPaid: (id: number, isPaid: boolean) => void }) {
  const { data, isLoading } = useGetInvoicesPayments({
    query: { queryKey: getGetInvoicesPaymentsQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
      </div>
    );
  }

  const total = (data?.overdueCount ?? 0) + (data?.dueTodayCount ?? 0) + (data?.dueIn7DaysCount ?? 0);

  if (total === 0) {
    return (
      <div className="py-24 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-emerald-500" />
        <p className="text-foreground font-semibold text-lg">Wszystkie płatności uregulowane</p>
        <p className="text-sm text-muted-foreground mt-1">Brak zaległych przelewów bankowych</p>
      </div>
    );
  }

  const sections = [
    {
      key: "overdue",
      label: "Po terminie",
      amount: data?.overdueAmount ?? 0,
      count: data?.overdueCount ?? 0,
      invoices: data?.overdue ?? [],
      amountColor: "text-destructive",
      cardClass: "border-destructive/20 bg-destructive/[0.03]",
      badgeClass: "bg-destructive/10 text-destructive",
      btnClass: "bg-destructive text-white hover:bg-destructive/90",
    },
    {
      key: "today",
      label: "Do zapłaty dzisiaj",
      amount: data?.dueTodayAmount ?? 0,
      count: data?.dueTodayCount ?? 0,
      invoices: data?.dueToday ?? [],
      amountColor: "text-orange-600",
      cardClass: "border-orange-100 bg-orange-50/50",
      badgeClass: "bg-orange-100 text-orange-700",
      btnClass: "bg-orange-500 text-white hover:bg-orange-600",
    },
    {
      key: "week",
      label: "Najbliższe 7 dni",
      amount: data?.dueIn7DaysAmount ?? 0,
      count: data?.dueIn7DaysCount ?? 0,
      invoices: data?.dueIn7Days ?? [],
      amountColor: "text-foreground",
      cardClass: "border-border bg-card",
      badgeClass: "bg-muted text-muted-foreground",
      btnClass: "bg-teal-600 text-white hover:bg-teal-700",
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.key} className={cn("border rounded-2xl overflow-hidden", s.cardClass)}>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{s.label}</p>
              <p className={cn("text-3xl font-bold tabular-nums", s.amountColor)}>{formatPrice(s.amount)}</p>
            </div>
            <span className={cn("text-xs font-semibold px-3 py-1.5 rounded-full", s.badgeClass)}>
              {s.count} {s.count === 1 ? "faktura" : "faktur"}
            </span>
          </div>

          {s.invoices.length > 0 && (
            <div className="border-t border-border/60 divide-y divide-border/40">
              {s.invoices.map((inv) => (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-3 bg-white/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.supplierName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {inv.invoiceNumber}
                      {inv.paymentDueDate && ` · termin: ${formatDate(inv.paymentDueDate)}`}
                      {inv.daysOverdue != null && inv.daysOverdue > 0 && (
                        <span className="text-destructive font-medium"> ({inv.daysOverdue} dni po terminie)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{formatPrice(inv.totalAmount)}</p>
                    <button
                      onClick={() => onMarkPaid(inv.id, true)}
                      className={cn("text-xs px-3 py-1.5 rounded-full font-medium transition-colors", s.btnClass)}
                    >
                      Zapłacono
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Invoice detail modal ──────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { data, isLoading } = useGetInvoice(invoiceId, {
    query: { queryKey: getGetInvoiceQueryKey(invoiceId) },
  });
  const total = data?.items.reduce((s, i) => s + i.totalPrice, 0) ?? 0;

  return (
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
              {[
                { label: "Dostawca", value: data.supplierName },
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
            {data.items.length > 0 ? (
              <div className="flex-1 min-h-0 border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground bg-secondary/30 border-b border-border">
                  <div>Produkt</div>
                  <div className="text-right w-20 hidden sm:block">Ilość</div>
                  <div className="text-right w-24">Cena jedn.</div>
                  <div className="text-right w-24">Wartość</div>
                </div>
                <div className="divide-y divide-border overflow-y-auto max-h-[340px]">
                  {data.items.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
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
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 border-t border-border bg-secondary/20">
                  <p className="text-xs font-medium text-muted-foreground">Razem</p>
                  <div className="w-20 hidden sm:block" />
                  <div className="w-24" />
                  <p className="text-sm font-bold text-right w-24 tabular-nums">{formatPrice(total)}</p>
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
  );
}

// ─── Faktury archive view ──────────────────────────────────────────────────────

function FakturyView({ onImportClick, onDeleteAllClick }: { onImportClick: () => void; onDeleteAllClick: () => void }) {
  const { data: invoices, isLoading } = useListInvoices({ limit: 1000 });
  const deleteInvoice = useDeleteInvoice();
  const toggleExcluded = useToggleInvoiceExcluded();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = (invoices ?? []).filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return inv.supplierName.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q);
  });

  function handleExport() {
    if (!invoices?.length) return;
    exportToCsv(
      [
        ["Dostawca", "Numer", "Data", "Wartość", "Pozycji"],
        ...invoices.map((inv) => [inv.supplierName, inv.invoiceNumber, inv.invoiceDate, inv.totalAmount, inv.itemCount]),
      ],
      `faktury-${todaySlug()}.csv`,
    );
  }

  async function handleDelete(id: number) {
    await deleteInvoice.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    setDeleteId(null);
    toast({ title: "Usunięto", description: "Faktura została usunięta." });
  }

  async function handleToggleExcluded(id: number, excluded: boolean) {
    await toggleExcluded.mutateAsync({ id, data: { excluded: !excluded } });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj po dostawcy lub numerze..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon" onClick={handleExport} title="Eksportuj CSV">
          <Download className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onDeleteAllClick} className="text-destructive border-destructive/30 hover:bg-destructive/10">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="font-medium">Brak faktur w archiwum</p>
          <Button className="mt-4" onClick={onImportClick}>
            <Plus className="w-4 h-4 mr-2" />
            Importuj pierwszą fakturę
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border">
            <div>Dostawca / Numer</div>
            <div className="hidden sm:block text-right w-24">Data</div>
            <div className="text-right w-24">Wartość</div>
            <div className="w-8" />
            <div className="w-8" />
          </div>
          <div className="divide-y divide-border">
            {filtered.map((inv) => (
              <div
                key={inv.id}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors",
                  inv.excluded && "opacity-50",
                )}
              >
                <div className="min-w-0 cursor-pointer" onClick={() => setViewInvoiceId(inv.id)}>
                  <p className="text-sm font-medium truncate">{inv.supplierName}</p>
                  <p className="text-xs text-muted-foreground truncate">{inv.invoiceNumber}</p>
                </div>
                <div className="hidden sm:block text-right w-24">
                  <p className="text-sm text-muted-foreground tabular-nums">{formatDate(inv.invoiceDate)}</p>
                </div>
                <div className="text-right w-24">
                  <p className="text-sm font-semibold tabular-nums">{formatPrice(inv.totalAmount)}</p>
                </div>
                <button
                  onClick={() => handleToggleExcluded(inv.id, inv.excluded)}
                  className="w-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  title={inv.excluded ? "Uwzględnij" : "Wyklucz ze statystyk"}
                >
                  {inv.excluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setDeleteId(inv.id)}
                  className="w-8 flex items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewInvoiceId && <InvoiceDetailModal invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />}

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      toast({ title: "Skan gotowy", description: `Rozpoznano ${data.items.length} pozycji.` });
    } catch {
      toast({ variant: "destructive", title: "Błąd skanowania", description: "Nie udało się przetworzyć obrazu." });
    }
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
        },
      });
      queryClient.invalidateQueries();
      toast({ title: "Dodano zakup" });
      form.reset({ supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], xmlContent: "", paymentMethod: undefined, paymentDueDate: "" });
      setXmlPreview(null); setScannedData(null); setReceiptPreviewUrl(null);
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
                  <FormLabel>Dostawca</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Wybierz dostawcę" /></SelectTrigger></FormControl>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

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

  const [activeTab, setActiveTab] = useState<Tab>("zakupy");
  const [month, setMonth] = useState(todayMonth());
  const [showImport, setShowImport] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: timelineData, isLoading: timelineLoading } = useGetInvoicesTimeline(
    { month },
    { query: { queryKey: getGetInvoicesTimelineQueryKey({ month }) } },
  );

  async function handleMarkPaid(id: number, isPaid: boolean) {
    await markPaid.mutateAsync({ id, data: { isPaid } });
    queryClient.invalidateQueries({ queryKey: getGetInvoicesTimelineQueryKey({ month }) });
    queryClient.invalidateQueries({ queryKey: getGetInvoicesPaymentsQueryKey() });
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
      <PageHeader
        title="Zakupy"
        action={
          <div className="flex items-center gap-2">
            {config ? (
              <div className="flex flex-col items-end gap-0.5">
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncPending} className="gap-1.5">
                  <RefreshCw className={cn("w-3.5 h-3.5", syncPending && "animate-spin")} />
                  <span className="hidden sm:inline">{syncPhaseLabel(phase)}</span>
                </Button>
                {syncPending && <Progress value={syncPhaseProgress(phase) ?? 0} className="h-0.5 w-full" />}
              </div>
            ) : (
              <Link href="/settings/ksef">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Skonfiguruj KSeF</span>
                </Button>
              </Link>
            )}
            <Button size="sm" onClick={() => setShowImport(true)} className="gap-1.5" data-testid="btn-import-invoice">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dodaj zakup</span>
              <span className="sm:hidden">Dodaj</span>
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        {(activeTab === "zakupy" || activeTab === "kalendarz") && (
          <MonthHero
            month={month}
            onPrev={() => setMonth(prevMonth(month))}
            onNext={() => setMonth(nextMonth(month))}
            totalAmount={timelineData?.totalAmount ?? 0}
            invoiceCount={timelineData?.invoiceCount ?? 0}
            supplierCount={timelineData?.supplierCount ?? 0}
            prevMonthTotalAmount={timelineData?.prevMonthTotalAmount ?? 0}
            biggestDay={timelineData?.biggestDay}
            avgDailyAmount={timelineData?.avgDailyAmount ?? 0}
            loading={timelineLoading}
          />
        )}

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
    </Layout>
  );
}
