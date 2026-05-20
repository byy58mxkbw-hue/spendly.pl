import { useState } from "react";
import { useLocation } from "wouter";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListSuppliers,
  useCreateSupplier,
  useDeleteSupplier,
  getListSuppliersQueryKey,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Building2, Phone, Mail, ChevronRight, Trash2 } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";

const supplierSchema = z.object({
  name: z.string().min(1, "Nazwa jest wymagana"),
  taxId: z.string().min(1, "NIP jest wymagany"),
  email: z.string().email("Nieprawidłowy email").optional().or(z.literal("")),
  phone: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export default function Suppliers() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: suppliers, isLoading } = useListSuppliers();
  const createSupplier = useCreateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

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
        },
      }
    );
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Dostawcy"
          subtitle="Zarządzaj stałymi dostawcami restauracji"
          action={
            <Button onClick={() => setShowAddDialog(true)} className="gap-2" data-testid="btn-add-supplier">
              <Plus className="w-4 h-4" /> Dodaj dostawcę
            </Button>
          }
        />

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
        ) : suppliers && suppliers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors group relative"
                data-testid={`supplier-card-${supplier.id}`}
              >
                <button
                  className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(supplier.id); }}
                  data-testid={`btn-delete-supplier-${supplier.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  className="w-full text-left"
                  onClick={() => setLocation(`/suppliers/${supplier.id}`)}
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
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

                  <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                    Zobacz szczegóły <ChevronRight className="w-3 h-3" />
                  </div>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Brak dostawców</p>
            <p className="text-sm text-muted-foreground mb-4">Dodaj pierwszego dostawcę, aby zacząć śledzić ceny.</p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Dodaj dostawcę
            </Button>
          </div>
        )}

        {/* Add supplier dialog */}
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

        {/* Delete confirmation */}
        <AlertDialog open={deleteId != null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usuń dostawcę</AlertDialogTitle>
              <AlertDialogDescription>
                Czy na pewno chcesz usunąć tego dostawcę? Ta akcja jest nieodwracalna i usunie wszystkie powiązane faktury.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Usuń
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
