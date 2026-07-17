import { useState, useEffect } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  listInvoices,
  useListInvoicesPaged,
  getListInvoicesPagedQueryKey,
  useListSuppliers,
  useDeleteInvoice,
  useToggleInvoiceExcluded,
  useMarkInvoicePaid,
  useSetInvoiceCostCenter,
  useApplyCostCenterSuggestions,
  useListCostCenters,
  getListInvoicesQueryKey,
  getGetInvoicesPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useCostCenter } from "@/contexts/cost-center-context";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileText, Layers, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportToCsv, todaySlug } from "@/lib/export-csv";
import { ErrorState } from "@/components/error-state";
import { useToast } from "@/hooks/use-toast";
import { InvoiceDetailModal } from "./invoice-detail-modal";
import { PAYMENT_METHOD_LABELS } from "./constants";

export function FakturyView({ onImportClick, onDeleteAllClick }: { onImportClick: () => void; onDeleteAllClick: () => void }) {
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
  const { data: pagedData, isLoading, isError, refetch } = useListInvoicesPaged(pagedParams, {
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
          <Button variant="outline" size="icon" onClick={handleExport} disabled={isExporting} title="Eksportuj CSV" className="shrink-0">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
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
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} message="Nie udało się pobrać listy faktur. Spróbuj ponownie." />
      ) : paged.length === 0 ? (
        <div className="py-16 text-center text-foreground/50">
          <FileText className="w-10 h-10 mx-auto mb-2 text-foreground/20" />
          {total === 0 && !debouncedSearch && supplierFilter === "all" && !showUnassigned ? (
            <>
              <p className="font-medium">Nie masz jeszcze żadnych faktur</p>
              <p className="text-sm text-foreground/40 mt-1">Dodaj pierwszy zakup albo zsynchronizuj KSeF.</p>
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
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl mb-2" style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.25)" }}>
              <span className="text-sm text-teal-300 font-medium">{selectedIds.size} zaznaczone</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors px-2"
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
                    style={{ background: "var(--elevate-2)", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}
                  >
                    <Layers className="w-3 h-3" />
                    Przypisz do centrum
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
            {/* Header */}
            <div className="grid grid-cols-[28px_1fr_auto_auto_auto_auto_auto] gap-2 px-4 py-2.5 text-xs font-medium text-foreground/40" style={{ background: "var(--elevate-1)", borderBottom: "1px solid hsl(var(--border))" }}>
              {/* Select-all checkbox */}
              <div className="flex items-center justify-center cursor-pointer" onClick={handleSelectAll}>
                <div className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                  style={allSelected
                    ? { background: "rgba(20,184,166,0.3)", border: "1px solid rgba(20,184,166,0.6)" }
                    : { border: "1px solid hsl(var(--border))" }}>
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
            <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
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
                      borderBottomColor: "hsl(var(--border))",
                      background: isSelected ? "rgba(20,184,166,0.06)" : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--elevate-1)"; }}
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
                        <div className="w-4 h-4 rounded transition-colors hover:border-foreground/40" style={{ border: "1px solid hsl(var(--border))" }} />
                      )}
                    </div>

                    <div className="min-w-0 cursor-pointer" onClick={() => setViewInvoiceId(inv.id)}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{inv.supplierName}</p>
                        {inv.invoiceType === "KOR" && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded text-orange-300 leading-none" style={{ background: "rgba(251,146,60,0.18)" }}>
                            KOREKTA
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground/50 truncate">{inv.invoiceNumber}</p>
                      {/* Mobile-only meta: data + status (kolumny ukryte na <sm) */}
                      <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                        <span className="text-xs text-foreground/50 tabular-nums">{formatDate(inv.invoiceDate)}</span>
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
                              <span className="text-[10px] text-foreground/40 truncate">{inv.costCenterName}</span>
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
                            <span className="text-[10px] text-foreground/20">Nieprzypisane</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="hidden sm:block text-right w-24">
                      <p className="text-sm text-foreground/50 tabular-nums">{formatDate(inv.invoiceDate)}</p>
                    </div>
                    <div className="hidden sm:flex justify-center w-20">
                      {inv.paymentMethod ? (
                        <span className="text-xs px-2 py-0.5 rounded-full text-foreground/60" style={{ background: "var(--elevate-2)" }}>
                          {PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod}
                        </span>
                      ) : (
                        <span className="text-foreground/20">—</span>
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
                        <span className="text-foreground/20 text-xs">—</span>
                      )}
                    </div>
                    <div className="text-right w-24">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{formatPrice(inv.totalAmount)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 justify-end shrink-0">
                      {costCenters.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="w-7 h-7 flex items-center justify-center text-foreground/30 hover:text-foreground/70 rounded"
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
                        className="w-7 h-7 flex items-center justify-center text-foreground/30 hover:text-foreground/70 rounded"
                        title={inv.excluded ? "Uwzględnij w statystykach" : "Wyklucz ze statystyk"}
                      >
                        {inv.excluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setDeleteId(inv.id)}
                        className="w-7 h-7 flex items-center justify-center text-foreground/30 hover:text-red-400 rounded"
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
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-foreground/70 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/5 transition-colors"
                style={{ border: "1px solid hsl(var(--border))" }}
              >
                <ChevronLeft className="w-4 h-4" />
                Poprzednia
              </button>
              <span className="text-sm text-foreground/50 tabular-nums px-2">Strona {page} z {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-foreground/70 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-foreground/5 transition-colors"
                style={{ border: "1px solid hsl(var(--border))" }}
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


// ─── Main page ─────────────────────────────────────────────────────────────────

