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
}

function SupplierTile({
  group,
  expanded,
  onToggle,
  onOpenInvoice,
  onDeleteInvoice,
}: {
  group: SupplierGroupData;
  expanded: boolean;
  onToggle: () => void;
  onOpenInvoice: (id: number) => void;
  onDeleteInvoice: (id: number, label: string) => void;
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
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition-colors text-left"
        onClick={onToggle}
        data-testid={`tile-${group.key}`}
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0 select-none">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate leading-tight">
              {group.sellerName}
            </span>
            {group.isKnown ? (
              <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                Znany
              </span>
            ) : (
              <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                Nowy
              </span>
            )}
          </div>
          {group.sellerNip && (
            <p className="text-xs text-muted-foreground mt-0.5">NIP {group.sellerNip}</p>
          )}
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Faktury</p>
              <p className="text-sm font-semibold text-foreground">
                {group.invoices.length} {invoiceWord}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Łącznie</p>
              <p className="text-sm font-semibold text-foreground">{formatPrice(group.totalGross)}</p>
            </div>
          </div>
        </div>

        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200 mt-3 shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

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
                  aria-label="Usuń fakturę"
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
  const { data: suppliers } = useListSuppliers();
  const [openId, setOpenId] = useState<number | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const deleteAll = useDeleteAllKsefPending();
  const deleteSingle = useDeleteKsefPending();

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
        });
      }
      const g = map.get(key)!;
      g.invoices.push(row);
      g.totalGross += row.totalGross ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.isKnown !== b.isKnown) return a.isKnown ? 1 : -1;
      return a.sellerName.localeCompare(b.sellerName, "pl");
    });
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

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Faktury do przeglądu"
          subtitle="Faktury pobrane z KSeF, dla których brakuje dopasowania dostawcy lub produktów"
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Status:</span>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="w-40" data-testid="select-pending-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Oczekujące</SelectItem>
                  <SelectItem value="accepted">Zaakceptowane</SelectItem>
                  <SelectItem value="rejected">Odrzucone</SelectItem>
                </SelectContent>
              </Select>
              {(pending?.length ?? 0) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteAll(true)}
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  data-testid="btn-delete-all-pending"
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
              <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3">
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
          <div className="bg-card border border-border rounded-xl py-16 text-center">
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
            <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
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
                <MonthNav
                  months={allMonths}
                  selected={selectedMonth}
                  onChange={(m) => setSelectedMonth(m)}
                />
              )}
            </div>

            {groups.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-12 text-center">
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
                    onDeleteInvoice={(id, label) => setDeleteTarget({ id, label })}
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

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <strong>Powód:</strong> {detail.reason}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Dopasuj dostawcę</label>
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  setShowNewSupplier(false);
                }}
              >
                <SelectTrigger data-testid="select-pending-supplier">
                  <SelectValue placeholder="Wybierz dostawcę z bazy" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.taxId ? ` · NIP ${s.taxId}` : ""}
                      {detail.suggestedSupplierId === s.id ? " (sugerowany)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
                            <Select
                              value={mapping[i] ?? ""}
                              onValueChange={(v) => {
                                setMapping((m) => ({ ...m, [i]: v }));
                                setShowNewProduct((prev) => ({ ...prev, [i]: false }));
                              }}
                            >
                              <SelectTrigger
                                className={cn("w-52", !isMapped && "border-amber-300")}
                                data-testid={`select-product-${i}`}
                              >
                                <SelectValue placeholder="Wybierz produkt" />
                              </SelectTrigger>
                              <SelectContent>
                                {products?.map((p) => (
                                  <SelectItem key={p.id} value={String(p.id)}>
                                    {p.name}
                                    {item.suggestedProductId === p.id ? " (sugerowany)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={reject.isPending || detail?.status !== "pending"}
            data-testid="btn-reject-pending"
          >
            <X className="w-4 h-4 mr-1" /> Odrzuć
          </Button>
          <Button
            onClick={onAccept}
            disabled={!allMapped || accept.isPending || detail?.status !== "pending"}
            data-testid="btn-accept-pending"
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            {accept.isPending ? "Importuję..." : "Zaakceptuj i zaimportuj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
