import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListInvoices,
  useImportInvoice,
  useListSuppliers,
  useDeleteInvoice,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
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
  DialogFooter,
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FileText, Trash2, Upload } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";

const importSchema = z.object({
  supplierId: z.string().min(1, "Wybierz dostawcę"),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1, "Data jest wymagana"),
  xmlContent: z.string().optional(),
});

type ImportFormValues = z.infer<typeof importSchema>;

export default function Invoices() {
  const queryClient = useQueryClient();
  const { data: invoices, isLoading } = useListInvoices();
  const { data: suppliers } = useListSuppliers();
  const importInvoice = useImportInvoice();
  const deleteInvoice = useDeleteInvoice();

  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      supplierId: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      xmlContent: "",
    },
  });

  function onSubmit(values: ImportFormValues) {
    importInvoice.mutate(
      {
        data: {
          supplierId: parseInt(values.supplierId, 10),
          invoiceNumber: values.invoiceNumber || undefined,
          invoiceDate: values.invoiceDate,
          xmlContent: values.xmlContent || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          setShowImport(false);
          form.reset();
        },
      }
    );
  }

  function handleDelete() {
    if (deleteId == null) return;
    deleteInvoice.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          setDeleteId(null);
        },
      }
    );
  }

  return (
    <Layout>
      <div className="px-8 py-8">
        <PageHeader
          title="Faktury"
          subtitle="Historia zaimportowanych faktur KSeF"
          action={
            <Button onClick={() => setShowImport(true)} className="gap-2" data-testid="btn-import-invoice">
              <Plus className="w-4 h-4" /> Importuj fakturę
            </Button>
          }
        />

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-6 py-3 border-b border-border text-xs font-medium text-muted-foreground bg-secondary/30">
            <div className="w-8"></div>
            <div>Faktura</div>
            <div className="text-right w-36">Dostawca</div>
            <div className="text-right w-24">Data</div>
            <div className="text-right w-28">Kwota</div>
            <div className="w-8"></div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-6 py-4 items-center">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="w-6 h-6 rounded" />
                </div>
              ))}
            </div>
          ) : invoices && invoices.length > 0 ? (
            <div className="divide-y divide-border">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-secondary/40 transition-colors group"
                  data-testid={`invoice-row-${invoice.id}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{invoice.itemCount} pozycji</p>
                  </div>
                  <div className="text-right w-36">
                    <p className="text-sm text-foreground truncate max-w-[140px]">{invoice.supplierName}</p>
                  </div>
                  <div className="text-right w-24">
                    <p className="text-sm text-muted-foreground">{formatDate(invoice.invoiceDate)}</p>
                  </div>
                  <div className="text-right w-28">
                    <p className="text-sm font-semibold text-foreground">{formatPrice(invoice.totalAmount)}</p>
                  </div>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    onClick={() => setDeleteId(invoice.id)}
                    data-testid={`btn-delete-invoice-${invoice.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">Brak faktur</p>
              <p className="text-sm text-muted-foreground mb-4">
                Zaimportuj pierwszą fakturę XML z KSeF, aby zacząć śledzić ceny.
              </p>
              <Button onClick={() => setShowImport(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Importuj fakturę
              </Button>
            </div>
          )}
        </div>

        {/* Import dialog */}
        <Dialog open={showImport} onOpenChange={setShowImport}>
          <DialogContent className="max-w-lg" data-testid="dialog-import-invoice">
            <DialogHeader>
              <DialogTitle>Importuj fakturę KSeF</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dostawca</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-supplier">
                            <SelectValue placeholder="Wybierz dostawcę" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers?.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numer faktury (opcjonalny)</FormLabel>
                      <FormControl>
                        <Input placeholder="np. FV/2025/05/001" {...field} data-testid="input-invoice-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data faktury</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-invoice-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="xmlContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zawartość XML KSeF (opcjonalnie)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Wklej tutaj zawartość pliku XML z KSeF, aby automatycznie wyodrębnić pozycje faktury..."
                          className="h-28 text-xs font-mono"
                          {...field}
                          data-testid="textarea-xml"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowImport(false)}>Anuluj</Button>
                  <Button type="submit" disabled={importInvoice.isPending} data-testid="btn-submit-import">
                    {importInvoice.isPending ? "Importuję..." : "Importuj"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usuń fakturę</AlertDialogTitle>
              <AlertDialogDescription>
                Czy na pewno chcesz usunąć tę fakturę? Usunięcie faktury usunie też wszystkie pozycje i wpłynie na historię cen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Usuń</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
