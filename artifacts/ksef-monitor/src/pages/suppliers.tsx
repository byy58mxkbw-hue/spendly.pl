import { useState } from "react";
import { useLocation } from "wouter";
import { Layout, PageHeader } from "@/components/layout";
import { useCostCenter } from "@/contexts/cost-center-context";
import {
  useListSuppliers,
  useCreateSupplier,
  useDeleteSupplier,
  useRestoreSupplier,
  useSetSupplierDefaultCostCenter,
  useListCostCenters,
  getListSuppliersQueryKey,
  useGetSupplierCostCenterSuggestion,
  getGetSupplierCostCenterSuggestionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Building2, Phone, Mail, ChevronRight, Trash2, Layers, RotateCcw } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const supplierSchema = z.object({
  name: z.string().min(1, "Nazwa jest wymagana"),
  taxId: z.string().min(1, "NIP jest wymagany"),
  email: z.string().email("Nieprawidłowy email").optional().or(z.literal("")),
  phone: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

function SupplierSuggestionBanner({
  supplierId,
  onApply,
}: {
  supplierId: number;
  onApply: (ccId: number, ccName: string) => void;
}) {
  const { data } = useGetSupplierCostCenterSuggestion(supplierId, {
    query: { queryKey: getGetSupplierCostCenterSuggestionQueryKey(supplierId) },
  });
  if (!data || data.confidence < 0.9 || !data.suggestedCostCenterId || !data.suggestedCostCenterName) return null;
  return (
    <div
      className="mt-2 px-3 py-2 rounded-lg flex items-center justify-between gap-2"
      style={{ background: "rgba(20,184,166,0.07)", border: "1px solid rgba(20,184,166,0.2)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs text-muted-foreground leading-snug">
        <span className="text-primary font-medium">{Math.round(data.confidence * 100)}%</span>{" "}
        faktur trafia do <span className="text-foreground font-medium">{data.suggestedCostCenterName}</span>
      </p>
      <button
        onClick={() => onApply(data.suggestedCostCenterId!, data.suggestedCostCenterName!)}
        className="text-xs font-medium text-primary hover:underline whitespace-nowrap shrink-0"
      >
        Ustaw domyślne
      </button>
    </div>
  );
}

export default function Suppliers() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const [tab, setTab] = useState<"active" | "deleted">("active");

  const { data: suppliers, isLoading, isError } = useListSuppliers(
    tab === "deleted"
      ? { includeInactive: true }
      : costCenterSelectedId !== null
        ? { costCenterId: costCenterSelectedId }
        : {}
  );

  const createSupplier = useCreateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const restoreSupplier = useRestoreSupplier();
  const setDefaultCostCenter = useSetSupplierDefaultCostCenter();
  const { data: costCenters = [] } = useListCostCenters();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [restoreId, setRestoreId] = useState<number | null>(null);

  function handleSetDefaultCostCenter(supplierId: number, ccId: number | null) {
    setDefaultCostCenter.mutate(
      { id: supplierId, data: { defaultCostCenterId: ccId } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() }) },
    );
  }

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", taxId: "", email: "", phone: "" },
  });

  function onSubmit(values: SupplierFormValues) {
    createSupplier.mutate(
      {
        data: {
          name: values.name,
          taxId: values.taxId,
          email: values.email || null,
          phone: values.phone || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setShowAddDialog(false);
          form.reset();
        },
      }
    );
  }

  function handleDelete() {
    if (deleteId == null) return;
    deleteSupplier.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setDeleteId(null);
          toast({
            title: "Dostawca usunięty",
            description: "Dostawca i jego faktury zostały przeniesione do sekcji Usunięci.",
          });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się usunąć dostawcy." });
        },
      }
    );
  }

  function handleRestore() {
    if (restoreId == null) return;
    restoreSupplier.mutate(
      { id: restoreId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setRestoreId(null);
          toast({
            title: "Dostawca przywrócony",
            description: "Dostawca i jego faktury są znów aktywne.",
          });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się przywrócić dostawcy." });
        },
      }
    );
  }

  const deletedSupplierName = suppliers?.find((s) => s.id === deleteId)?.name;
  const restoreSupplierName = suppliers?.find((s) => s.id === restoreId)?.name;

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Dostawcy"
          subtitle="Zarządzaj stałymi dostawcami restauracji"
          action={
            tab === "active" ? (
              <Button onClick={() => setShowAddDialog(true)} className="gap-2" data-testid="btn-add-supplier">
                <Plus className="w-4 h-4" /> Dodaj dostawcę
              </Button>
            ) : null
          }
        />

        <div className="flex gap-1 mb-5 bg-secondary/50 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("active")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "active"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Aktywni
          </button>
          <button
            onClick={() => setTab("deleted")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "deleted"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Usunięci
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center text-sm text-destructive">
            Nie udało się załadować dostawców. Odśwież stronę lub spróbuj ponownie później.
          </div>
        ) : suppliers && suppliers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className={cn(
                  "bg-card border border-border rounded-xl p-6 transition-colors group relative",
                  tab === "active" && "hover:border-primary/40",
                  tab === "deleted" && "opacity-75"
                )}
                data-testid={`supplier-card-${supplier.id}`}
              >
                {tab === "active" ? (
                  <button
                    className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(supplier.id); }}
                    data-testid={`btn-delete-supplier-${supplier.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                    onClick={(e) => { e.stopPropagation(); setRestoreId(supplier.id); }}
                    data-testid={`btn-restore-supplier-${supplier.id}`}
                    title="Przywróć dostawcę"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  className={cn("w-full text-left", tab === "deleted" && "cursor-default")}
                  onClick={() => tab === "active" && setLocation(`/suppliers/${supplier.id}`)}
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      tab === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground leading-tight truncate pr-6">{supplier.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">NIP: {supplier.taxId}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{supplier.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Faktury</p>
                      <p className="text-sm font-semibold text-foreground">{supplier.invoiceCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Wydatki</p>
                      <p className="text-sm font-semibold text-foreground">{formatPrice(supplier.totalSpend)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ostatnia faktura</p>
                      <p className="text-sm font-semibold text-foreground">{formatDate(supplier.lastInvoiceDate)}</p>
                    </div>
                  </div>

                  {tab === "active" && costCenters.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Layers className="w-3 h-3 shrink-0" />
                            {supplier.defaultCostCenterName ? (
                              <>
                                <div
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ background: supplier.defaultCostCenterColor ?? "#14B8A6" }}
                                />
                                <span className="truncate max-w-[120px]">{supplier.defaultCostCenterName}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">Brak centrum kosztów</span>
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            className={cn(!supplier.defaultCostCenterId && "text-primary")}
                            onClick={() => handleSetDefaultCostCenter(supplier.id, null)}
                          >
                            <div className="w-3 h-3 rounded-full bg-muted-foreground/30 mr-2" />
                            Brak centrum
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {costCenters.map((cc) => (
                            <DropdownMenuItem
                              key={cc.id}
                              className={cn(supplier.defaultCostCenterId === cc.id && "text-primary")}
                              onClick={() => handleSetDefaultCostCenter(supplier.id, cc.id)}
                            >
                              <div className="w-3 h-3 rounded-full mr-2" style={{ background: cc.color }} />
                              {cc.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  {tab === "active" && !supplier.defaultCostCenterId && costCenters.length > 0 && (
                    <SupplierSuggestionBanner
                      supplierId={supplier.id}
                      onApply={(ccId) => handleSetDefaultCostCenter(supplier.id, ccId)}
                    />
                  )}

                  {tab === "active" && (
                    <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                      Zobacz szczegóły <ChevronRight className="w-3 h-3" />
                    </div>
                  )}

                  {tab === "deleted" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setRestoreId(supplier.id); }}
                      className="mt-3 flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" /> Przywróć dostawcę
                    </button>
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            {tab === "active" ? (
              <>
                <p className="text-foreground font-medium mb-1">Brak dostawców</p>
                <p className="text-sm text-muted-foreground mb-4">Dodaj pierwszego dostawcę, aby zacząć śledzić ceny.</p>
                <Button onClick={() => setShowAddDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Dodaj dostawcę
                </Button>
              </>
            ) : (
              <>
                <p className="text-foreground font-medium mb-1">Brak usuniętych dostawców</p>
                <p className="text-sm text-muted-foreground">Usunięci dostawcy pojawią się tutaj i można ich przywrócić.</p>
              </>
            )}
          </div>
        )}

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent data-testid="dialog-add-supplier">
            <DialogHeader>
              <DialogTitle>Dodaj dostawcę</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nazwa dostawcy</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Makro Cash & Carry Polska" {...field} data-testid="input-supplier-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIP</FormLabel>
                      <FormControl>
                        <Input placeholder="np. 5262759053" {...field} data-testid="input-supplier-taxid" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (opcjonalny)</FormLabel>
                      <FormControl>
                        <Input placeholder="faktury@dostawca.pl" type="email" {...field} data-testid="input-supplier-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon (opcjonalny)</FormLabel>
                      <FormControl>
                        <Input placeholder="+48 22 123 45 67" {...field} data-testid="input-supplier-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Anuluj</Button>
                  <Button type="submit" disabled={createSupplier.isPending} data-testid="btn-submit-supplier">
                    {createSupplier.isPending ? "Zapisywanie..." : "Dodaj dostawcę"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usuń dostawcę</AlertDialogTitle>
              <AlertDialogDescription>
                Czy na pewno chcesz usunąć dostawcę{" "}
                {deletedSupplierName && (
                  <span className="font-medium text-foreground">{deletedSupplierName}</span>
                )}
                ? Dostawca i wszystkie jego faktury zostaną przeniesione do sekcji "Usunięci" — możesz je później przywrócić.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteSupplier.isPending}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="btn-confirm-delete-supplier"
              >
                {deleteSupplier.isPending ? "Usuwanie..." : "Usuń"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={restoreId != null} onOpenChange={(open) => { if (!open) setRestoreId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Przywróć dostawcę</AlertDialogTitle>
              <AlertDialogDescription>
                Czy chcesz przywrócić dostawcę{" "}
                {restoreSupplierName && (
                  <span className="font-medium text-foreground">{restoreSupplierName}</span>
                )}
                ? Dostawca i jego faktury staną się ponownie aktywne i będą widoczne w statystykach.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRestore}
                disabled={restoreSupplier.isPending}
                data-testid="btn-confirm-restore-supplier"
              >
                {restoreSupplier.isPending ? "Przywracanie..." : "Przywróć"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
