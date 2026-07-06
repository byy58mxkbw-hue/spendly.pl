import { useEffect, useMemo, useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  useListKsefPending,
  useGetKsefPending,
  useAcceptKsefPending,
  useRejectKsefPending,
  useListSuppliers,
  useListProducts,
  useCreateSupplier,
  useCreateProduct,
  useRetryKsefPending,
  useDeleteAllKsefPending,
  useDeleteKsefPending,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatPrice, formatDate } from "@/lib/format";
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
  AlertTriangle,
  CheckCircle2,
  X,
  Inbox,
  ChevronDown,
  FileCode,
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Trash2,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function MonthNav({
  months,
  selected,
  onChange,
}: {
  months: string[];
  selected: string;
  onChange: (m: string) => void;
}) {
  const idx = months.indexOf(selected);
  const canPrev = idx < months.length - 1;
  const canNext = idx > 0;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => canPrev && onChange(months[idx + 1])}
        disabled={!canPrev}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Poprzedni miesiąc"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize">
        {selected ? formatMonth(selected) : "—"}
      </span>
      <button
        onClick={() => canNext && onChange(months[idx - 1])}
        disabled={!canNext}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Następny miesiąc"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

interface SupplierGroupData {
  key: string;
  sellerName: string;
  sellerNip: string | null;
  isKnown: boolean;
  invoices: {
    id: number;
    invoiceNumber?: string | null;
    ksefNumber: string;
    invoiceDate?: string | null;
    totalGross?: number | null;
    reason?: string | null;
    createdAt: string;
  }[];
  totalGross: number;
  // Most recent fetch time across the group's invoices — drives newest-first ordering.
  latestCreatedAt: string;
}

function SupplierTile({
  group,
  expanded,
  onToggle,
  onOpenInvoice,
  onDeleteInvoice,
  onRejectGroup,
  onImportGroup,
  importing,
}: {
  group: SupplierGroupData;
  expanded: boolean;
  onToggle: () => void;
  onOpenInvoice: (id: number) => void;
  onDeleteInvoice: (id: number, label: string) => void;
  onRejectGroup?: (ids: number[], supplierName: string) => void;
  onImportGroup?: (group: SupplierGroupData) => void;
  importing?: boolean;
}) {
  const initials =
    group.sellerName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("") || "?";

  const invoiceWord =
    group.invoices.length === 1
      ? "faktura"
      : group.invoices.length < 5
        ? "faktury"
        : "faktur";

  return (
    <div className="glass rounded-xl shadow-sm overflow-hidden">
      {/* Header — clickable div for expand, with separate action buttons */}
      <div
        className="px-4 py-3.5 md:px-5 md:py-4 flex items-start gap-3 md:gap-4 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
        data-testid={`tile-${group.key}`}
      >
        <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0 select-none">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className="text-sm md:text-[15px] font-semibold text-foreground leading-snug line-clamp-2 md:line-clamp-1">
              {group.sellerName}
            </span>
            {group.isKnown ? (
              <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">
                Znany
              </span>
            ) : (
              <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0 mt-0.5">
                Nowy
              </span>
            )}
          </div>
          {/* Mobile: meta w jednej linii. Desktop: NIP + dwukolumnowa siatka niżej. */}
          <p className="text-xs text-muted-foreground mt-1 md:mt-0.5">
            {group.sellerNip && <>NIP {group.sellerNip}</>}
            <span className="md:hidden">
              {group.sellerNip && " · "}
              <strong className="text-foreground font-semibold">{group.invoices.length} {invoiceWord}</strong>
              {" · "}
              <strong className="text-foreground font-semibold tabular-nums">{formatPrice(group.totalGross)}</strong>
            </span>
          </p>
          <div className="hidden md:grid mt-3.5 pt-3.5 border-t border-border grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Faktury</p>
              <p className="text-[15px] font-semibold text-foreground">
                {group.invoices.length} {invoiceWord}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Łącznie</p>
              <p className="text-[15px] font-semibold text-foreground tabular-nums">{formatPrice(group.totalGross)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onRejectGroup && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRejectGroup(
                  group.invoices.map((r) => r.id),
                  group.sellerName,
                );
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Odrzuć faktury dostawcy"
              title="Odrzuć wszystkie faktury tego dostawcy"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0",
              expanded && "rotate-180",
            )}
          />
        </div>
      </div>

      {onImportGroup && (
        <div className="px-4 md:px-5 pb-4 pt-0.5 md:-mt-1">
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onImportGroup(group);
            }}
            disabled={importing}
            data-testid={`btn-import-group-${group.key}`}
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {importing
              ? "Importuję…"
              : group.isKnown
                ? `Zaimportuj wszystkie (${group.invoices.length})`
                : `Utwórz dostawcę i zaimportuj (${group.invoices.length})`}
          </Button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {group.invoices.map((row) => (
            <div
              key={row.id}
              className="px-5 py-3 flex items-center gap-3"
              data-testid={`pending-row-${row.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {row.invoiceNumber ?? row.ksefNumber}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {row.invoiceDate ? formatDate(row.invoiceDate) : "—"}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>
              {row.totalGross != null && (
                <p className="text-sm font-medium text-foreground shrink-0">
                  {formatPrice(row.totalGross)}
                </p>
              )}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenInvoice(row.id)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Otwórz fakturę"
                  data-testid={`btn-open-pending-${row.id}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onDeleteInvoice(row.id, row.invoiceNumber ?? row.ksefNumber)
                  }
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Odrzuć fakturę"
                  data-testid={`btn-delete-pending-${row.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PendingInvoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">("pending");
  const { data: pending, isLoading } = useListKsefPending({ status });
  // Dedicated pending query so the "Oczekujące (N)" badge stays accurate even while
  // viewing the accepted/rejected tabs. Dedupes with `pending` when status==="pending".
  const { data: pendingForCount } = useListKsefPending({ status: "pending" });
  const pendingCount = pendingForCount?.length ?? 0;
  const { data: suppliers } = useListSuppliers();
  const [openId, setOpenId] = useState<number | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const deleteAll = useDeleteAllKsefPending();
  const deleteSingle = useDeleteKsefPending();
  const rejectSingle = useRejectKsefPending();
  const createSupplier = useCreateSupplier();
  const retryPending = useRetryKsefPending();
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: number; label: string } | null>(null);
  const [groupRejectTarget, setGroupRejectTarget] = useState<{ ids: number[]; supplierName: string } | null>(null);
  const [groupRejectPending, setGroupRejectPending] = useState(false);

  const knownNips = useMemo(() => {
    if (!suppliers) return new Set<string>();
    return new Set(
      suppliers
        .filter((s) => s.taxId)
        .map((s) => s.taxId!.replace(/[\s\-]/g, "")),
    );
  }, [suppliers]);

  const allMonths = useMemo((): string[] => {
    if (!pending) return [];
    const set = new Set<string>();
    for (const row of pending) {
      if (row.invoiceDate) set.add(row.invoiceDate.slice(0, 7));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [pending]);

  useEffect(() => {
    if (allMonths.length > 0 && (!selectedMonth || !allMonths.includes(selectedMonth))) {
      setSelectedMonth(allMonths[0]);
    }
  }, [allMonths]);

  useEffect(() => {
    setExpandedKey(null);
  }, [selectedMonth]);

  const filteredPending = useMemo(() => {
    if (!pending || !selectedMonth) return pending ?? [];
    return pending.filter((row) => row.invoiceDate?.startsWith(selectedMonth));
  }, [pending, selectedMonth]);

  const groups = useMemo((): SupplierGroupData[] => {
    if (!filteredPending) return [];
    const map = new Map<string, SupplierGroupData>();
    for (const row of filteredPending) {
      const nip = row.sellerNip?.replace(/[\s\-]/g, "") ?? null;
      const key = nip ?? row.sellerName ?? "unknown";
      if (!map.has(key)) {
        map.set(key, {
          key,
          sellerName: row.sellerName ?? "Nieznany dostawca",
          sellerNip: nip,
          isKnown: nip ? knownNips.has(nip) : false,
          invoices: [],
          totalGross: 0,
          latestCreatedAt: row.createdAt,
        });
      }
      const g = map.get(key)!;
      g.invoices.push(row);
      g.totalGross += row.totalGross ?? 0;
      if (row.createdAt > g.latestCreatedAt) g.latestCreatedAt = row.createdAt;
    }
    // Newest first: groups with the most recently synced invoice float to the top,
    // so freshly imported suppliers appear immediately. Within a group, invoices
    // are ordered newest-first too.
    for (const g of map.values()) {
      g.invoices.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? ""),
      );
    }
    return Array.from(map.values()).sort((a, b) =>
      b.latestCreatedAt.localeCompare(a.latestCreatedAt) ||
      a.sellerName.localeCompare(b.sellerName, "pl"),
    );
  }, [filteredPending, knownNips]);

  const totalAmount = useMemo(
    () => groups.reduce((sum, g) => sum + g.totalGross, 0),
    [groups],
  );

  function handleDeleteAll() {
    deleteAll.mutate(
      { params: { status } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries();
          setShowDeleteAll(false);
          const label =
            status === "pending"
              ? "oczekujących"
              : status === "accepted"
                ? "zaakceptowanych"
                : "odrzuconych";
          toast({
            title: "Usunięto faktury",
            description: `Usunięto ${data.deleted} ${label} faktur z kolejki.`,
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Błąd",
            description: "Nie udało się usunąć faktur.",
          });
        },
      },
    );
  }

  async function handleRejectGroup() {
    if (!groupRejectTarget) return;
    setGroupRejectPending(true);
    let rejected = 0;
    for (const id of groupRejectTarget.ids) {
      await new Promise<void>((resolve) => {
        rejectSingle.mutate({ id }, { onSettled: () => resolve() });
      });
      rejected++;
    }
    setGroupRejectPending(false);
    setGroupRejectTarget(null);
    queryClient.invalidateQueries();
    const word = rejected === 1 ? "faktura" : rejected < 5 ? "faktury" : "faktur";
    toast({ title: "Odrzucono faktury", description: `${rejected} ${word} przeniesiono do zakładki Odrzucone.` });
  }

  function handleRejectSingle() {
    if (!rejectTarget) return;
    rejectSingle.mutate(
      { id: rejectTarget.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          setRejectTarget(null);
          toast({ title: "Faktura odrzucona", description: "Przeniesiono do zakładki Odrzucone." });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się odrzucić faktury." });
        },
      },
    );
  }

  function handleDeleteSingle() {
    if (!deleteTarget) return;
    deleteSingle.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          setDeleteTarget(null);
          toast({ title: "Faktura usunięta" });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Błąd",
            description: "Nie udało się usunąć faktury.",
          });
        },
      },
    );
  }

  // One-click import of every pending invoice from a supplier: create the supplier
  // first if it's new (prefilled from the invoice), then run the backend retry which
  // auto-creates missing products and imports all matchable invoices at once.
  async function handleImportGroup(group: SupplierGroupData) {
    setImportingKey(group.key);
    try {
      if (!group.isKnown) {
        try {
          await createSupplier.mutateAsync({
            data: { name: group.sellerName, taxId: group.sellerNip ?? "" },
          });
        } catch (e) {
          const code = (e as { response?: { status?: number } })?.response?.status;
          if (code !== 409) throw e; // 409 = already registered → fine, go import
        }
      }
      const result = await retryPending.mutateAsync(undefined);
      queryClient.invalidateQueries();
      const imported = (result as { imported?: number } | undefined)?.imported ?? 0;
      if (imported > 0) {
        const w = imported === 1 ? "fakturę" : imported < 5 ? "faktury" : "faktur";
        toast({ title: "Zaimportowano", description: `Dodano ${imported} ${w} do bazy.` });
      } else {
        toast({
          variant: "destructive",
          title: "Nie udało się automatycznie",
          description: "Otwórz fakturę i dopasuj produkty ręcznie.",
        });
      }
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Błąd importu",
        description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zaimportować.",
      });
    } finally {
      setImportingKey(null);
    }
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Faktury do przeglądu"
          subtitle="Potwierdź dostawcę — faktury i produkty dodadzą się do aplikacji automatycznie. Pełna kontrola jest pod „Dopasuj ręcznie”."
          subtitleClassName="hidden md:block"
          action={
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex-1 md:flex-none flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
                {([
                  ["pending", `Oczekujące${pendingCount > 0 ? ` (${pendingCount})` : ""}`],
                  ["accepted", "Zaakceptowane"],
                  ["rejected", "Odrzucone"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatus(value)}
                    className={cn(
                      "flex-1 md:flex-none px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm whitespace-nowrap transition-colors",
                      status === value
                        ? "bg-card shadow-sm text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`tab-pending-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(pending?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteAll(true)}
                  className="shrink-0 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  data-testid="btn-delete-all-pending"
                  title="Usuń wszystkie"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Usuń wszystkie</span>
                </Button>
              )}
            </div>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (pending?.length ?? 0) === 0 ? (
          <div className="glass rounded-xl py-16 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">
              {status === "pending"
                ? "Brak faktur do przeglądu"
                : status === "accepted"
                  ? "Brak zaakceptowanych faktur"
                  : "Brak odrzuconych faktur"}
            </p>
            <p className="text-sm text-muted-foreground">
              {status === "pending"
                ? "Wszystkie faktury z KSeF zostały dopasowane lub jeszcze nie wykonano synchronizacji."
                : "Faktury pojawią się tu po decyzji."}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 md:mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:static sticky top-14 z-20 -mx-4 px-4 py-2 md:mx-0 md:px-0 md:py-0 bg-background/95 backdrop-blur md:bg-transparent md:backdrop-blur-none border-b border-border md:border-0">
              {/* Mobile: jeden zwarty pasek; Desktop: kafle */}
              <div className="md:hidden flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Receipt className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <strong className="text-foreground tabular-nums">{formatPrice(totalAmount)}</strong>
                <span className="text-muted-foreground/50">·</span>
                <strong className="text-foreground">{groups.length}</strong> dost.
                <span className="text-muted-foreground/50">·</span>
                <strong className="text-foreground">{filteredPending.length}</strong> fakt.
              </div>
              <div className="hidden md:flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3.5 py-2">
                  <Receipt className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{formatPrice(totalAmount)}</strong>
                  </span>
                </div>
                <div className="bg-card border border-border rounded-lg px-3.5 py-2">
                  <span className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{groups.length}</strong>{" "}
                    {groups.length === 1 ? "dostawca" : "dostawców"}
                  </span>
                </div>
                <div className="bg-card border border-border rounded-lg px-3.5 py-2">
                  <span className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{filteredPending.length}</strong>{" "}
                    {filteredPending.length === 1
                      ? "faktura"
                      : filteredPending.length < 5
                        ? "faktury"
                        : "faktur"}
                  </span>
                </div>
              </div>

              {allMonths.length > 0 && (
                <div className="flex justify-center md:block">
                  <MonthNav
                    months={allMonths}
                    selected={selectedMonth}
                    onChange={(m) => setSelectedMonth(m)}
                  />
                </div>
              )}
            </div>

            {groups.length === 0 ? (
              <div className="glass rounded-xl py-12 text-center">
                <Inbox className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">Brak faktur w tym miesiącu</p>
                <p className="text-sm text-muted-foreground">
                  Użyj nawigacji aby wybrać inny miesiąc.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {groups.map((group) => (
                  <SupplierTile
                    key={group.key}
                    group={group}
                    expanded={expandedKey === group.key}
                    onToggle={() =>
                      setExpandedKey((prev) => (prev === group.key ? null : group.key))
                    }
                    onOpenInvoice={setOpenId}
                    onDeleteInvoice={(id, label) =>
                      status === "pending"
                        ? setRejectTarget({ id, label })
                        : setDeleteTarget({ id, label })
                    }
                    onRejectGroup={
                      status === "pending"
                        ? (ids, supplierName) => setGroupRejectTarget({ ids, supplierName })
                        : undefined
                    }
                    onImportGroup={status === "pending" ? handleImportGroup : undefined}
                    importing={importingKey === group.key}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {openId != null && (
        <PendingDetailDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onActionDone={() => {
            queryClient.invalidateQueries();
            setOpenId(null);
            toast({ title: "Zaktualizowano" });
          }}
        />
      )}

      <AlertDialog
        open={showDeleteAll}
        onOpenChange={(open) => {
          if (!open) setShowDeleteAll(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń wszystkie faktury z kolejki</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Zostaną usunięte wszystkie{" "}
              {status === "pending"
                ? "oczekujące"
                : status === "accepted"
                  ? "zaakceptowane"
                  : "odrzucone"}{" "}
              faktury z kolejki "Do przeglądu".
              {(pending?.length ?? 0) > 0 && (
                <span className="block mt-2 font-medium text-foreground">
                  Liczba faktur do usunięcia: {pending!.length}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deleteAll.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="btn-confirm-delete-all-pending"
            >
              {deleteAll.isPending ? "Usuwanie..." : "Usuń wszystkie"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!groupRejectTarget}
        onOpenChange={(open) => { if (!open && !groupRejectPending) setGroupRejectTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odrzuć faktury dostawcy</AlertDialogTitle>
            <AlertDialogDescription>
              {groupRejectTarget?.ids.length === 1 ? (
                <>Faktura od <span className="font-medium text-foreground">{groupRejectTarget?.supplierName}</span> zostanie przeniesiona do zakładki <strong>Odrzucone</strong>.</>
              ) : (
                <><span className="font-medium text-foreground">{groupRejectTarget?.ids.length} faktury</span> od <span className="font-medium text-foreground">{groupRejectTarget?.supplierName}</span> zostaną przeniesione do zakładki <strong>Odrzucone</strong>.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={groupRejectPending}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleRejectGroup(); }}
              disabled={groupRejectPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {groupRejectPending ? "Odrzucanie..." : "Odrzuć"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(open) => { if (!open) setRejectTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odrzuć fakturę</AlertDialogTitle>
            <AlertDialogDescription>
              Faktura{" "}
              <span className="font-medium text-foreground">{rejectTarget?.label}</span>{" "}
              zostanie przeniesiona do zakładki <strong>Odrzucone</strong>. Możesz ją stamtąd przywrócić otwierając dialog faktury.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejectSingle}
              disabled={rejectSingle.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {rejectSingle.isPending ? "Odrzucanie..." : "Odrzuć fakturę"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń fakturę</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć fakturę{" "}
              <span className="font-medium text-foreground">{deleteTarget?.label}</span>?
              Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSingle}
              disabled={deleteSingle.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="btn-confirm-delete-pending"
            >
              {deleteSingle.isPending ? "Usuwanie..." : "Usuń fakturę"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function PendingDetailDialog({
  id,
  onClose,
  onActionDone,
}: {
  id: number;
  onClose: () => void;
  onActionDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: detail, isLoading } = useGetKsefPending(id);
  const { data: suppliers } = useListSuppliers();
  const { data: products } = useListProducts();
  const accept = useAcceptKsefPending();
  const reject = useRejectKsefPending();
  const createSupplier = useCreateSupplier();
  const createProduct = useCreateProduct();
  const retryPending = useRetryKsefPending();

  const [supplierId, setSupplierId] = useState<string>("");
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [showXml, setShowXml] = useState(false);

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierNip, setNewSupplierNip] = useState("");

  const [creatingProduct, setCreatingProduct] = useState<Set<number>>(new Set());
  const [showNewProduct, setShowNewProduct] = useState<Record<number, boolean>>({});
  const [newProductData, setNewProductData] = useState<Record<number, { name: string; unit: string }>>({});
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [showManual, setShowManual] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);

  function skipItem(index: number) {
    setSkipped((prev) => new Set(prev).add(index));
    setMapping((m) => { const next = { ...m }; delete next[index]; return next; });
    setShowNewProduct((prev) => ({ ...prev, [index]: false }));
  }

  function unskipItem(index: number) {
    setSkipped((prev) => { const next = new Set(prev); next.delete(index); return next; });
  }

  useEffect(() => {
    if (!detail) return;
    if (detail.suggestedSupplierId != null) {
      setSupplierId(String(detail.suggestedSupplierId));
    }
    const m: Record<number, string> = {};
    detail.items.forEach((it, i) => {
      if (it.suggestedProductId != null) m[i] = String(it.suggestedProductId);
    });
    setMapping(m);
    setNewSupplierName(detail.sellerName ?? "");
    setNewSupplierNip(detail.sellerNip ?? "");
  }, [detail]);

  const allMapped = useMemo(() => {
    if (!detail) return false;
    if (!supplierId) return false;
    const activeItems = detail.items.filter((_, i) => !skipped.has(i));
    if (activeItems.length === 0) return false;
    return detail.items.every((_, i) => skipped.has(i) || !!mapping[i]);
  }, [detail, supplierId, mapping, skipped]);

  const supplierKnown = detail?.suggestedSupplierId != null;
  const newProductCount = detail
    ? detail.items.filter((it) => it.suggestedProductId == null).length
    : 0;

  // Primary one-click path: create the supplier if it's new (prefilled from the
  // invoice), then run the backend retry which auto-creates missing products by name
  // and imports every now-matchable invoice. Falls back to manual on no-op.
  async function onAutoImport() {
    if (!detail) return;
    setAutoImporting(true);
    try {
      if (!supplierKnown) {
        try {
          await createSupplier.mutateAsync({
            data: {
              name: (detail.sellerName ?? "").trim() || detail.ksefNumber,
              taxId: (detail.sellerNip ?? "").trim(),
            },
          });
        } catch (e) {
          const code = (e as { response?: { status?: number } })?.response?.status;
          if (code !== 409) throw e; // 409 = already registered → proceed to import
        }
      }
      const result = await retryPending.mutateAsync(undefined);
      queryClient.invalidateQueries();
      const imported = (result as { imported?: number } | undefined)?.imported ?? 0;
      if (imported > 0) {
        toast({ title: "Faktura zaimportowana", description: "Dostawca i produkty utworzone automatycznie." });
        onActionDone();
      } else {
        toast({
          variant: "destructive",
          title: "Nie udało się automatycznie",
          description: "Dopasuj produkty ręcznie poniżej.",
        });
        setShowManual(true);
        setAutoImporting(false);
      }
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast({
        variant: "destructive",
        title: "Błąd importu",
        description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zaimportować.",
      });
      setAutoImporting(false);
    }
  }

  function onAccept() {
    if (!detail || !supplierId) return;
    accept.mutate(
      {
        id,
        data: {
          supplierId: parseInt(supplierId, 10),
          itemMappings: detail.items
            .map((_, i) => ({ index: i, productId: parseInt(mapping[i], 10) }))
            .filter((_, i) => !skipped.has(i) && mapping[i]),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Faktura zaimportowana", description: "Dodano do bazy." });
          onActionDone();
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast({
            variant: "destructive",
            title: "Błąd",
            description:
              e?.response?.data?.error ??
              e?.message ??
              "Nie udało się zaakceptować faktury.",
          });
        },
      },
    );
  }

  function onReject() {
    reject.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Odrzucono fakturę" });
          onActionDone();
        },
      },
    );
  }

  function onSaveNewSupplier() {
    if (!newSupplierName.trim()) return;
    createSupplier.mutate(
      { data: { name: newSupplierName.trim(), taxId: newSupplierNip.trim() } },
      {
        onSuccess: (created) => {
          setSupplierId(String(created.id));
          setShowNewSupplier(false);
          queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
          toast({ title: "Dostawca dodany", description: created.name });
          retryPending.mutate(undefined, {
            onSuccess: (result) => {
              queryClient.invalidateQueries({ queryKey: ["/api/ksef/pending"] });
              if (result.imported > 0) {
                toast({
                  title: "Automatyczny import",
                  description:
                    result.imported === 1
                      ? `Zaimportowano 1 fakturę od tego dostawcy.`
                      : `Zaimportowano ${result.imported} faktury od tego dostawcy.`,
                });
              }
            },
          });
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast({
            variant: "destructive",
            title: "Błąd",
            description:
              e?.response?.data?.error ?? e?.message ?? "Nie udało się dodać dostawcy.",
          });
        },
      },
    );
  }

  function toggleNewProduct(index: number, itemName: string, itemUnit: string) {
    const isOpen = showNewProduct[index];
    if (!isOpen) {
      setNewProductData((prev) => ({
        ...prev,
        [index]: { name: itemName, unit: itemUnit },
      }));
    }
    setShowNewProduct((prev) => ({ ...prev, [index]: !isOpen }));
  }

  function onCreateProductInline(index: number) {
    const data = newProductData[index];
    if (!data?.name?.trim()) return;
    setCreatingProduct((prev) => new Set(prev).add(index));
    createProduct.mutate(
      { data: { name: data.name.trim(), unit: data.unit.trim() || undefined } },
      {
        onSuccess: (created) => {
          setMapping((m) => ({ ...m, [index]: String(created.id) }));
          setShowNewProduct((prev) => ({ ...prev, [index]: false }));
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          toast({ title: "Produkt dodany", description: created.name });
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast({
            variant: "destructive",
            title: "Błąd tworzenia produktu",
            description:
              e?.response?.data?.error ?? e?.message ?? "Nie udało się dodać produktu.",
          });
        },
        onSettled: () => {
          setCreatingProduct((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {detail?.invoiceNumber ?? detail?.ksefNumber ?? "Faktura KSeF"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Numer KSeF</p>
                <p className="font-mono text-xs">{detail.ksefNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Data faktury</p>
                <p>{formatDate(detail.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Sprzedawca (z XML)</p>
                <p>{detail.sellerName ?? "—"}</p>
                {detail.sellerNip && (
                  <p className="text-xs text-muted-foreground">NIP {detail.sellerNip}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Kwota brutto</p>
                <p className="font-semibold">{formatPrice(detail.totalGross)}</p>
              </div>
            </div>

            {/* Plain-language status: what import will do, instead of the raw reason */}
            <div className="rounded-lg bg-secondary/40 border border-border px-4 py-3 space-y-1.5">
              {!supplierKnown && (
                <p className="text-sm text-foreground flex items-center gap-2">
                  <span>🆕</span> Nowy dostawca — utworzymy go automatycznie
                </p>
              )}
              {newProductCount > 0 && (
                <p className="text-sm text-foreground flex items-center gap-2">
                  <span>📦</span> {newProductCount}{" "}
                  {newProductCount === 1 ? "nowy produkt" : newProductCount < 5 ? "nowe produkty" : "nowych produktów"}{" "}
                  — utworzymy je automatycznie
                </p>
              )}
              {supplierKnown && newProductCount === 0 && (
                <p className="text-sm text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" /> Gotowe do importu
                </p>
              )}
            </div>

            {/* Primary one-click action */}
            <div className="space-y-1.5">
              <Button
                className="w-full gap-2"
                onClick={onAutoImport}
                disabled={autoImporting || detail.status !== "pending"}
                data-testid="btn-auto-import-pending"
              >
                {autoImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {autoImporting
                  ? "Importuję…"
                  : supplierKnown
                    ? "Zaimportuj automatycznie"
                    : "Utwórz dostawcę i zaimportuj"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Dostawca i produkty utworzą się automatycznie na podstawie faktury.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-toggle-manual"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showManual && "rotate-180")} />
              {showManual ? "Ukryj ręczne dopasowanie" : "Dopasuj ręcznie (zaawansowane)"}
            </button>

            {showManual && (
            <div className="space-y-5 pt-1">
            <p className="text-xs text-muted-foreground">Powód: {detail.reason}</p>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Dopasuj dostawcę</label>
              <Combobox
                value={supplierId}
                onChange={(v) => {
                  setSupplierId(v);
                  setShowNewSupplier(false);
                }}
                className="w-full"
                placeholder="Wybierz dostawcę z bazy"
                searchPlaceholder="Szukaj dostawcy..."
                emptyText="Brak dostawców."
                data-testid="select-pending-supplier"
                options={(suppliers ?? []).map((s) => ({
                  value: String(s.id),
                  label: `${s.name}${s.taxId ? ` · NIP ${s.taxId}` : ""}${detail.suggestedSupplierId === s.id ? " (sugerowany)" : ""}`,
                }))}
              />

              <button
                type="button"
                onClick={() => setShowNewSupplier((v) => !v)}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="btn-toggle-new-supplier"
              >
                <Plus className="w-3.5 h-3.5" />
                {showNewSupplier ? "Anuluj dodawanie" : "Nie ma dostawcy? Dodaj nowego"}
              </button>

              {showNewSupplier && (
                <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                  <p className="text-xs font-medium text-foreground">Nowy dostawca</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-supplier-name" className="text-xs">
                        Nazwa <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="new-supplier-name"
                        value={newSupplierName}
                        onChange={(e) => setNewSupplierName(e.target.value)}
                        placeholder="Nazwa dostawcy"
                        className="h-8 text-sm"
                        data-testid="input-new-supplier-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-supplier-nip" className="text-xs">NIP</Label>
                      <Input
                        id="new-supplier-nip"
                        value={newSupplierNip}
                        onChange={(e) => setNewSupplierNip(e.target.value)}
                        placeholder="np. 1234567890"
                        className="h-8 text-sm"
                        data-testid="input-new-supplier-nip"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={onSaveNewSupplier}
                    disabled={!newSupplierName.trim() || createSupplier.isPending}
                    data-testid="btn-save-new-supplier"
                  >
                    {createSupplier.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Zapisz dostawcę
                  </Button>
                </div>
              )}
            </div>

            <Collapsible open={showXml} onOpenChange={setShowXml}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-lg text-sm hover:bg-secondary/50"
                  data-testid="btn-toggle-raw-xml"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <FileCode className="w-4 h-4 text-muted-foreground" />
                    Podgląd surowego XML faktury
                  </span>
                  <ChevronDown
                    className={cn("w-4 h-4 transition-transform", showXml && "rotate-180")}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre
                  className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-secondary/30 p-3 text-[11px] font-mono leading-snug text-foreground whitespace-pre-wrap break-all"
                  data-testid="pre-raw-xml"
                >
                  {detail.rawXml}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Dopasuj produkty ({detail.items.length - skipped.size}{skipped.size > 0 ? ` z ${detail.items.length}` : ""})</p>
                {skipped.size > 0 && (
                  <p className="text-xs text-muted-foreground">{skipped.size} {skipped.size === 1 ? "pozycja pominięta" : "pozycje pominięte"} — nie zostaną zaimportowane</p>
                )}
              </div>
              <div className="rounded-lg border border-border divide-y divide-border">
                {detail.items.map((item, i) => {
                  const isSkipped = skipped.has(i);
                  const isMapped = !!mapping[i];
                  const isCreating = creatingProduct.has(i);
                  const isFormOpen = !!showNewProduct[i];
                  const productForm = newProductData[i] ?? { name: item.name, unit: item.unit };
                  return (
                    <div key={i} className={cn("px-4 py-3 space-y-2", isSkipped && "opacity-50 bg-secondary/20")}>
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                        <div className="min-w-0">
                          <p className={cn("text-sm font-medium text-foreground truncate", isSkipped && "line-through text-muted-foreground")}>
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} × {formatPrice(item.unitPrice)} ={" "}
                            {formatPrice(item.gross)}
                            {item.gtin ? ` · GTIN ${item.gtin}` : ""}
                          </p>
                        </div>
                        {isSkipped ? (
                          <button
                            type="button"
                            onClick={() => unskipItem(i)}
                            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors shrink-0 mt-0.5"
                          >
                            Przywróć
                          </button>
                        ) : (
                        <div className="flex flex-col gap-1.5 items-end">
                          <div className="flex items-center gap-1.5">
                            <Combobox
                              value={mapping[i] ?? ""}
                              onChange={(v) => {
                                setMapping((m) => ({ ...m, [i]: v }));
                                setShowNewProduct((prev) => ({ ...prev, [i]: false }));
                              }}
                              className={cn("w-52", !isMapped && "border-amber-300")}
                              placeholder="Wybierz produkt"
                              searchPlaceholder="Szukaj produktu..."
                              emptyText="Brak produktów."
                              data-testid={`select-product-${i}`}
                              options={(products ?? []).map((p) => ({
                                value: String(p.id),
                                label: `${p.name}${item.suggestedProductId === p.id ? " (sugerowany)" : ""}`,
                              }))}
                            />
                            <button
                              type="button"
                              onClick={() => skipItem(i)}
                              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                              title="Pomiń tę pozycję"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {!isMapped && (
                            <button
                              type="button"
                              onClick={() => toggleNewProduct(i, item.name, item.unit)}
                              disabled={isCreating}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              data-testid={`btn-toggle-new-product-${i}`}
                            >
                              <Plus className="w-3 h-3" />
                              {isFormOpen ? "Anuluj dodawanie" : "Nie ma produktu? Dodaj nowy"}
                            </button>
                          )}
                        </div>
                        )}
                      </div>

                      {isFormOpen && !isMapped && (
                        <div className="mt-2 rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
                          <p className="text-xs font-medium text-foreground">Nowy produkt</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor={`new-product-name-${i}`} className="text-xs">
                                Nazwa <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                id={`new-product-name-${i}`}
                                value={productForm.name}
                                onChange={(e) =>
                                  setNewProductData((prev) => ({
                                    ...prev,
                                    [i]: { ...productForm, name: e.target.value },
                                  }))
                                }
                                placeholder="Nazwa produktu"
                                className="h-8 text-sm"
                                data-testid={`input-new-product-name-${i}`}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`new-product-unit-${i}`} className="text-xs">
                                Jednostka
                              </Label>
                              <Input
                                id={`new-product-unit-${i}`}
                                value={productForm.unit}
                                onChange={(e) =>
                                  setNewProductData((prev) => ({
                                    ...prev,
                                    [i]: { ...productForm, unit: e.target.value },
                                  }))
                                }
                                placeholder="np. kg, szt., l"
                                className="h-8 text-sm"
                                data-testid={`input-new-product-unit-${i}`}
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => onCreateProductInline(i)}
                            disabled={!productForm.name.trim() || isCreating}
                            data-testid={`btn-save-new-product-${i}`}
                          >
                            {isCreating ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            {isCreating ? "Zapisuję..." : "Zapisz produkt"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={reject.isPending || detail?.status !== "pending"}
            data-testid="btn-reject-pending"
          >
            <X className="w-4 h-4 mr-1" /> Odrzuć
          </Button>
          {showManual && (
            <Button
              onClick={onAccept}
              disabled={!allMapped || accept.isPending || detail?.status !== "pending"}
              data-testid="btn-accept-pending"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {accept.isPending ? "Importuję..." : "Zaakceptuj i zaimportuj (ręcznie)"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
