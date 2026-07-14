import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoice,
  useDeleteInvoiceItem,
  useMarkInvoicePaid,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { PAYMENT_METHOD_LABELS } from "./constants";
import { Button } from "@/components/ui/button";
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
import { CheckCircle2, ChevronRight, Copy, Download, FileText, LineChart, Loader2, Package, Trash2 } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { PriceHistoryModal } from "../products";
import { useToast } from "@/hooks/use-toast";

export function InvoiceDetailModal({ invoiceId, onClose, onOpenInvoice }: { invoiceId: number; onClose: () => void; onOpenInvoice?: (id: number) => void }) {
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
              <>
              {/* Desktop: tabela */}
              <div className="hidden sm:block flex-1 min-h-0 glass rounded-xl overflow-hidden">
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

              {/* Mobile: lista 2-liniowa (nazwa produktu w pełnej szerokości) */}
              <div className="sm:hidden flex-1 min-h-0 glass rounded-xl overflow-hidden flex flex-col">
                <div className="divide-y divide-border overflow-y-auto">
                  {data.items.map((item) => (
                    <div key={item.id} className="px-3.5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {item.productId != null ? (
                          <button
                            onClick={() => setHistoryProduct({ id: item.productId!, name: item.productName })}
                            className="flex items-start gap-1 text-left text-sm font-medium text-primary"
                          >
                            <span className="line-clamp-2 leading-snug">{item.productName}</span>
                            <LineChart className="w-3.5 h-3.5 shrink-0 opacity-60 mt-0.5" />
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{item.productName}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(3)} {item.unit} × {formatPrice(item.unitPrice)}
                          {item.vatRate != null && ` · VAT ${item.vatRate}%`}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <p className="text-sm font-semibold tabular-nums whitespace-nowrap">{formatPrice(item.totalPrice)}</p>
                        <button
                          onClick={() => setDeleteItemId(item.id)}
                          className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                          title="Usuń pozycję"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-3.5 py-2.5 border-t border-border bg-secondary/20 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Razem</span>
                  <span className="text-sm font-bold tabular-nums">{formatPrice(total)}</span>
                </div>
              </div>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground glass rounded-xl">
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


