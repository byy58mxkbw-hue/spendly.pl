import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListPriceAlerts,
  useCreatePriceAlert,
  useDeletePriceAlert,
  useGetDashboardActiveAlerts,
  useListSuppliers,
  getListPriceAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Bell, Trash2, TrendingUp, AlertTriangle } from "lucide-react";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const alertSchema = z.object({
  productName: z.string().min(1, "Nazwa produktu jest wymagana"),
  supplierId: z.string().optional(),
  thresholdPercent: z.coerce.number().min(0.1, "Próg musi być większy niż 0").max(1000),
});

type AlertFormValues = z.infer<typeof alertSchema>;

export default function PriceAlerts() {
  const queryClient = useQueryClient();
  const { data: alerts, isLoading } = useListPriceAlerts();
  const { data: triggered } = useGetDashboardActiveAlerts();
  const { data: suppliers } = useListSuppliers();
  const createAlert = useCreatePriceAlert();
  const deleteAlert = useDeletePriceAlert();

  const [showAdd, setShowAdd] = useState(false);

  const form = useForm<AlertFormValues>({
    resolver: zodResolver(alertSchema),
    defaultValues: { productName: "", supplierId: "", thresholdPercent: 10 },
  });

  function onSubmit(values: AlertFormValues) {
    createAlert.mutate(
      {
        data: {
          productName: values.productName,
          supplierId: values.supplierId ? parseInt(values.supplierId, 10) : null,
          thresholdPercent: values.thresholdPercent,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPriceAlertsQueryKey() });
          setShowAdd(false);
          form.reset();
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteAlert.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPriceAlertsQueryKey() });
        },
      }
    );
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Alerty cenowe"
          subtitle="Monitoruj przekroczenia progów cenowych"
          action={
            <Button onClick={() => setShowAdd(true)} className="gap-2" data-testid="btn-add-alert">
              <Plus className="w-4 h-4" /> Dodaj alert
            </Button>
          }
        />

        {/* Triggered alerts */}
        {triggered && triggered.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Przekroczone alerty ({triggered.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {triggered.map((alert, i) => (
                <div
                  key={i}
                  className="bg-destructive/5 border border-destructive/20 rounded-xl p-4"
                  data-testid={`triggered-alert-${i}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-foreground text-sm">{alert.productName}</p>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {formatPercent(alert.changePercent)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {alert.supplierName ?? "Wszyscy dostawcy"} · {formatDate(alert.alertDate)}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">{formatPrice(alert.currentPrice)}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="text-muted-foreground line-through">{formatPrice(alert.previousPrice)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Próg: {alert.thresholdPercent}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All alerts */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Skonfigurowane alerty</h2>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="w-8 h-8 rounded-md" />
                </div>
              ))}
            </div>
          ) : alerts && alerts.length > 0 ? (
            <div className="divide-y divide-border">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="px-6 py-4 flex items-center gap-4 group"
                  data-testid={`alert-row-${alert.id}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{alert.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.supplierName ?? "Wszyscy dostawcy"} · Dodany {formatDate(alert.createdAt)}
                    </p>
                  </div>
                  <span className="text-sm font-medium px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 shrink-0">
                    Próg: {alert.thresholdPercent}%
                  </span>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    onClick={() => handleDelete(alert.id)}
                    data-testid={`btn-delete-alert-${alert.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">Brak alertów</p>
              <p className="text-sm text-muted-foreground mb-4">
                Dodaj alert, aby otrzymywać powiadomienia o zmianach cen.
              </p>
              <Button onClick={() => setShowAdd(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Dodaj alert
              </Button>
            </div>
          )}
        </div>

        {/* Add alert dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent data-testid="dialog-add-alert">
            <DialogHeader>
              <DialogTitle>Dodaj alert cenowy</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="productName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nazwa produktu</FormLabel>
                      <FormControl>
                        <Input placeholder="np. Masło extra 82%" {...field} data-testid="input-alert-product" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dostawca (opcjonalnie)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-alert-supplier">
                            <SelectValue placeholder="Wszyscy dostawcy" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value=" ">Wszyscy dostawcy</SelectItem>
                          {suppliers?.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="thresholdPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próg zmiany (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          min="0.1"
                          placeholder="np. 10"
                          {...field}
                          data-testid="input-alert-threshold"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Anuluj</Button>
                  <Button type="submit" disabled={createAlert.isPending} data-testid="btn-submit-alert">
                    {createAlert.isPending ? "Zapisuję..." : "Dodaj alert"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
