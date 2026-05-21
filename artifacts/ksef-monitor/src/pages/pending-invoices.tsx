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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatPrice, formatDate } from "@/lib/format";
import { AlertTriangle, CheckCircle2, X, Inbox, ChevronDown, FileCode, Loader2, Plus, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 px-4 py-3 border-t border-border bg-secondary/20">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Poprzednia strona"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="w-8 text-center text-sm text-muted-foreground select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              "w-8 h-8 rounded-md text-sm font-medium transition-colors",
              p === page
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Następna strona"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function PendingInvoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">("pending");
  const { data: pending, isLoading } = useListKsefPending({ status });
  const [openId, setOpenId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [status]);

  const totalAmount = useMemo(
    () => (pending ?? []).reduce((sum, r) => sum + (r.totalGross ?? 0), 0),
    [pending]
  );
  const totalPages = Math.ceil((pending?.length ?? 0) / PAGE_SIZE);
  const paginated = (pending ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Faktury do przeglądu"
          subtitle="Faktury pobrane z KSeF, dla których brakuje dopasowania dostawcy lub produktów"
          action={
            <div className="flex items-center gap-2">
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
            </div>
          }
        />

        {/* Summary bar */}
        {!isLoading && (pending?.length ?? 0) > 0 && (
          <div className="mb-4 flex items-center gap-4 bg-card border border-border rounded-xl px-5 py-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Receipt className="w-4 h-4 shrink-0" />
              <span className="text-sm">
                Łącznie{" "}
                <strong className="text-foreground">{pending!.length}</strong>{" "}
                {pending!.length === 1
                  ? "faktura"
                  : pending!.length < 5
                    ? "faktury"
                    : "faktur"}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="text-sm text-muted-foreground">
              Wartość:{" "}
              <strong className="text-foreground">{formatPrice(totalAmount)}</strong>
            </div>
            {totalPages > 1 && (
              <>
                <div className="h-4 w-px bg-border" />
                <span className="text-xs text-muted-foreground ml-auto">
                  Strona {page} z {totalPages}
                </span>
              </>
            )}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-4 w-64" />
                </div>
              ))}
            </div>
          ) : (pending?.length ?? 0) === 0 ? (
            <div className="py-16 text-center">
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
              <div className="divide-y divide-border">
                {paginated.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="w-full px-6 py-4 flex items-start gap-4 hover:bg-secondary/40 transition-colors text-left"
                    data-testid={`pending-row-${row.id}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {row.invoiceNumber ?? row.ksefNumber}
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          KSeF: {row.ksefNumber.slice(-12)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {row.sellerName ?? "Nieznany dostawca"}
                        {row.sellerNip ? ` · NIP ${row.sellerNip}` : ""}
                        {row.invoiceDate ? ` · ${formatDate(row.invoiceDate)}` : ""}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">{row.reason}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {row.totalGross != null && (
                        <p className="text-sm font-semibold text-foreground">
                          {formatPrice(row.totalGross)}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(row.createdAt).toLocaleDateString("pl-PL")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
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
    return detail.items.every((_, i) => mapping[i]);
  }, [detail, supplierId, mapping]);

  function onAccept() {
    if (!detail || !supplierId) return;
    accept.mutate(
      {
        id,
        data: {
          supplierId: parseInt(supplierId, 10),
          itemMappings: detail.items.map((_, i) => ({
            index: i,
            productId: parseInt(mapping[i], 10),
          })),
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
            description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zaakceptować faktury.",
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
            },
          );
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast({
            variant: "destructive",
            title: "Błąd",
            description: e?.response?.data?.error ?? e?.message ?? "Nie udało się dodać dostawcy.",
          });
        },
      },
    );
  }

  function onCreateProductInline(index: number, name: string, unit: string) {
    setCreatingProduct((prev) => new Set(prev).add(index));
    createProduct.mutate(
      { data: { name: name.trim(), unit: unit.trim() || undefined } },
      {
        onSuccess: (created) => {
          setMapping((m) => ({ ...m, [index]: String(created.id) }));
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          toast({ title: "Produkt dodany", description: created.name });
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast({
            variant: "destructive",
            title: "Błąd tworzenia produktu",
            description: e?.response?.data?.error ?? e?.message ?? "Nie udało się dodać produktu.",
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
              <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setShowNewSupplier(false); }}>
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
                  <div className="grid grid-cols-2 gap-3">
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
                  <ChevronDown className={cn("w-4 h-4 transition-transform", showXml && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-secondary/30 p-3 text-[11px] font-mono leading-snug text-foreground whitespace-pre-wrap break-all" data-testid="pre-raw-xml">
                  {detail.rawXml}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            <div>
              <p className="text-sm font-medium mb-2">Dopasuj produkty ({detail.items.length})</p>
              <div className="rounded-lg border border-border divide-y divide-border">
                {detail.items.map((item, i) => {
                  const isMapped = !!mapping[i];
                  const isCreating = creatingProduct.has(i);
                  return (
                    <div key={i} className="px-4 py-3 space-y-2">
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit} × {formatPrice(item.unitPrice)} = {formatPrice(item.gross)}
                            {item.gtin ? ` · GTIN ${item.gtin}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                          <Select
                            value={mapping[i] ?? ""}
                            onValueChange={(v) => setMapping((m) => ({ ...m, [i]: v }))}
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

                          {!isMapped && (
                            <button
                              type="button"
                              onClick={() => onCreateProductInline(i, item.name, item.unit)}
                              disabled={isCreating}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              data-testid={`btn-create-product-${i}`}
                            >
                              {isCreating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              {isCreating ? "Tworzę..." : "Utwórz nowy produkt"}
                            </button>
                          )}
                        </div>
                      </div>
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
