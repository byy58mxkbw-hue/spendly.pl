import { useState, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListPriceAlerts,
  useCreatePriceAlert,
  useDeletePriceAlert,
  useUpdatePriceAlert,
  useDismissPriceAlert,
  useGetPriceAlertsHistory,
  useGetDashboardActiveAlerts,
  useListSuppliers,
  getListPriceAlertsQueryKey,
  getGetDashboardActiveAlertsQueryKey,
  getGetPriceAlertsHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Bell,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
  History,
  Check,
} from "lucide-react";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const createAlertSchema = z.object({
  productName: z.string().min(1, "Nazwa produktu jest wymagana"),
  supplierId: z.string().optional(),
  thresholdPercent: z.coerce
    .number()
    .min(0.1, "Próg musi być większy niż 0")
    .max(1000),
});
type CreateAlertForm = z.infer<typeof createAlertSchema>;

const editAlertSchema = z.object({
  supplierId: z.string().optional(),
  thresholdPercent: z.coerce
    .number()
    .min(0.1, "Próg musi być większy niż 0")
    .max(1000),
});
type EditAlertForm = z.infer<typeof editAlertSchema>;

type AlertItem = {
  id: number;
  productName: string;
  supplierId?: number | null;
  supplierName?: string | null;
  thresholdPercent: number;
  isActive: boolean;
  createdAt: string;
};

type FilterTab = "all" | "active" | "inactive";
type MainTab = "alerts" | "history";

function supplierIdToForm(supplierId: number | null | undefined): string {
  return supplierId ? String(supplierId) : "";
}

function formToSupplierId(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

export default function PriceAlerts() {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading, isError } = useListPriceAlerts();
  const { data: triggered } = useGetDashboardActiveAlerts();
  const { data: history } = useGetPriceAlertsHistory();
  const { data: suppliers } = useListSuppliers();

  const createAlert = useCreatePriceAlert();
  const deleteAlert = useDeletePriceAlert();
  const updateAlert = useUpdatePriceAlert();
  const dismissAlert = useDismissPriceAlert();

  const [showAdd, setShowAdd] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertItem | null>(null);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [mainTab, setMainTab] = useState<MainTab>("alerts");
  const [dismissedLocally, setDismissedLocally] = useState<Set<string>>(new Set());

  const createForm = useForm<CreateAlertForm>({
    resolver: zodResolver(createAlertSchema),
    defaultValues: { productName: "", supplierId: "", thresholdPercent: 10 },
  });

  const editForm = useForm<EditAlertForm>({
    resolver: zodResolver(editAlertSchema),
    defaultValues: { supplierId: "", thresholdPercent: 10 },
  });

  function invalidateAlerts() {
    queryClient.invalidateQueries({ queryKey: getListPriceAlertsQueryKey() });
  }

  function onCreateSubmit(values: CreateAlertForm) {
    createAlert.mutate(
      {
        data: {
          productName: values.productName,
          supplierId: formToSupplierId(values.supplierId),
          thresholdPercent: values.thresholdPercent,
        },
      },
      {
        onSuccess: () => {
          invalidateAlerts();
          setShowAdd(false);
          createForm.reset();
        },
      }
    );
  }

  function onEditSubmit(values: EditAlertForm) {
    if (!editingAlert) return;
    updateAlert.mutate(
      {
        id: editingAlert.id,
        data: {
          supplierId: formToSupplierId(values.supplierId),
          thresholdPercent: values.thresholdPercent,
        },
      },
      {
        onSuccess: () => {
          invalidateAlerts();
          setEditingAlert(null);
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteAlert.mutate({ id }, { onSuccess: () => invalidateAlerts() });
  }

  function handleToggleActive(alert: AlertItem) {
    updateAlert.mutate(
      { id: alert.id, data: { isActive: !alert.isActive } },
      {
        onSuccess: () => {
          invalidateAlerts();
          queryClient.invalidateQueries({
            queryKey: getGetDashboardActiveAlertsQueryKey(),
          });
        },
      }
    );
  }

  function handleDismiss(alert: {
    alertId: number;
    alertDate: string;
    productName: string;
    supplierName?: string | null;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
    thresholdPercent: number;
  }) {
    const key = `${alert.alertId}__${alert.alertDate}`;
    setDismissedLocally((prev) => new Set([...prev, key]));

    dismissAlert.mutate(
      {
        id: alert.alertId,
        data: {
          alertDate: alert.alertDate,
          productName: alert.productName,
          supplierName: alert.supplierName ?? null,
          currentPrice: alert.currentPrice,
          previousPrice: alert.previousPrice,
          changePercent: alert.changePercent,
          thresholdPercent: alert.thresholdPercent,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetDashboardActiveAlertsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetPriceAlertsHistoryQueryKey(),
          });
        },
        onError: () => {
          setDismissedLocally((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        },
      }
    );
  }

  function openEdit(alert: AlertItem) {
    setEditingAlert(alert);
    editForm.reset({
      supplierId: supplierIdToForm(alert.supplierId),
      thresholdPercent: alert.thresholdPercent,
    });
  }

  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    const q = search.toLowerCase();
    return alerts.filter((alert) => {
      const matchSearch =
        q === "" ||
        alert.productName.toLowerCase().includes(q) ||
        (alert.supplierName?.toLowerCase().includes(q) ?? false);
      const matchFilter =
        filterTab === "all" ||
        (filterTab === "active" && alert.isActive) ||
        (filterTab === "inactive" && !alert.isActive);
      return matchSearch && matchFilter;
    });
  }, [alerts, search, filterTab]);

  const visibleTriggered = useMemo(() => {
    if (!triggered) return [];
    return triggered.filter(
      (t) => !dismissedLocally.has(`${t.alertId}__${t.alertDate}`)
    );
  }, [triggered, dismissedLocally]);

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "Wszystkie", count: alerts?.length ?? 0 },
    {
      key: "active",
      label: "Aktywne",
      count: alerts?.filter((a) => a.isActive).length ?? 0,
    },
    {
      key: "inactive",
      label: "Nieaktywne",
      count: alerts?.filter((a) => !a.isActive).length ?? 0,
    },
  ];

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Alerty cenowe"
          subtitle="Monitoruj przekroczenia progów cenowych"
          action={
            <Button
              onClick={() => setShowAdd(true)}
              className="gap-2"
              data-testid="btn-add-alert"
            >
              <Plus className="w-4 h-4" /> Dodaj alert
            </Button>
          }
        />

        {/* Main tabs */}
        <div className="flex gap-0 mb-6 border-b border-border">
          <button
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              mainTab === "alerts"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMainTab("alerts")}
          >
            Alerty
          </button>
          <button
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
              mainTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMainTab("history")}
          >
            <History className="w-3.5 h-3.5" />
            Historia
            {history && history.length > 0 && (
              <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {mainTab === "alerts" ? (
          <>
            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Szukaj produktu lub dostawcy..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilterTab(tab.key)}
                    className={cn(
                      "px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                      filterTab === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="ml-1 opacity-70">({tab.count})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Triggered alerts */}
            {visibleTriggered.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Przekroczone alerty ({visibleTriggered.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visibleTriggered.map((alert) => (
                    <div
                      key={`${alert.alertId}-${alert.alertDate}`}
                      className="bg-destructive/5 border border-destructive/20 rounded-xl p-4"
                      data-testid={`triggered-alert-${alert.alertId}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-semibold text-foreground text-sm leading-snug">
                          {alert.productName}
                        </p>
                        <span
                          className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ml-2 shrink-0",
                            alert.changePercent >= 0
                              ? "bg-destructive/10 text-destructive"
                              : "bg-emerald-500/10 text-emerald-600"
                          )}
                        >
                          {alert.changePercent >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {formatPercent(alert.changePercent)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {alert.supplierName ?? "Wszyscy dostawcy"} ·{" "}
                        {formatDate(alert.alertDate)}
                      </p>
                      <div className="flex items-baseline gap-2 text-sm mb-3">
                        <span className="font-semibold text-foreground">
                          {formatPrice(alert.currentPrice)}
                        </span>
                        <span className="text-muted-foreground text-xs">vs</span>
                        <span className="text-muted-foreground line-through text-xs">
                          {formatPrice(alert.previousPrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Próg: {alert.thresholdPercent}%
                        </p>
                        <button
                          className="text-xs font-medium px-2.5 py-1 rounded-md bg-foreground/8 hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 border border-border hover:border-primary"
                          onClick={() => handleDismiss(alert)}
                        >
                          <Check className="w-3 h-3" />
                          Sprawdzono
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Configured alerts list */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 md:px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-foreground">
                  Skonfigurowane alerty
                </h2>
                {filteredAlerts.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {filteredAlerts.length}{" "}
                    {filteredAlerts.length === 1 ? "alert" : "alertów"}
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="px-4 md:px-6 py-4 flex items-center gap-3"
                    >
                      <Skeleton className="w-10 h-6 rounded-full shrink-0" />
                      <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-40 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-14 rounded-full" />
                      <Skeleton className="w-8 h-8 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="px-6 py-8 text-center text-sm text-destructive">
                  Nie udało się załadować alertów.
                </div>
              ) : filteredAlerts.length > 0 ? (
                <div className="divide-y divide-border">
                  {filteredAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        "px-4 md:px-6 py-3.5 flex items-center gap-3 group transition-colors hover:bg-secondary/30",
                        !alert.isActive && "opacity-50"
                      )}
                      data-testid={`alert-row-${alert.id}`}
                    >
                      {/* Toggle */}
                      <Switch
                        checked={alert.isActive}
                        onCheckedChange={() => handleToggleActive(alert)}
                        className="shrink-0"
                        aria-label={
                          alert.isActive ? "Wyłącz alert" : "Włącz alert"
                        }
                      />

                      {/* Icon */}
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          alert.isActive
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Bell className="w-4 h-4" />
                      </div>

                      {/* Content — click to edit */}
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => openEdit(alert)}
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {alert.productName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {alert.supplierName ?? "Wszyscy dostawcy"}
                        </p>
                      </button>

                      {/* Threshold badge — also clickable to edit */}
                      <button
                        onClick={() => openEdit(alert)}
                        className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 transition-colors"
                      >
                        {alert.thresholdPercent}%
                      </button>

                      {/* Delete */}
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 active:opacity-100 transition-all shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(alert.id);
                        }}
                        data-testid={`btn-delete-alert-${alert.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : alerts && alerts.length > 0 ? (
                <div className="py-12 text-center">
                  <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-foreground font-medium mb-1">
                    Brak wyników
                  </p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setSearch("");
                      setFilterTab("all");
                    }}
                  >
                    Wyczyść filtry
                  </button>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-medium mb-1">Brak alertów</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Dodaj alert, aby monitorować zmiany cen produktów.
                  </p>
                  <Button onClick={() => setShowAdd(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> Dodaj alert
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* History tab */
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">
                Historia potwierdzonych przekroczeń
              </h2>
            </div>
            {!history || history.length === 0 ? (
              <div className="py-16 text-center">
                <History className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">Brak historii</p>
                <p className="text-sm text-muted-foreground">
                  Potwierdzone przekroczenia alertów pojawią się tutaj.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 md:px-6 py-3.5 flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        item.changePercent >= 0
                          ? "bg-destructive/10 text-destructive"
                          : "bg-emerald-500/10 text-emerald-600"
                      )}
                    >
                      {item.changePercent >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.supplierName ?? "Wszyscy dostawcy"} ·{" "}
                        {formatDate(item.alertDate)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          item.changePercent >= 0
                            ? "text-destructive"
                            : "text-emerald-600"
                        )}
                      >
                        {formatPercent(item.changePercent)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(item.currentPrice)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs text-muted-foreground">Sprawdzono</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.dismissedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add alert dialog */}
        <Dialog
          open={showAdd}
          onOpenChange={(open) => {
            setShowAdd(open);
            if (!open) createForm.reset();
          }}
        >
          <DialogContent data-testid="dialog-add-alert">
            <DialogHeader>
              <DialogTitle>Dodaj alert cenowy</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit(onCreateSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={createForm.control}
                  name="productName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nazwa produktu</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="np. Masło extra 82%"
                          {...field}
                          data-testid="input-alert-product"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
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
                  control={createForm.control}
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAdd(false)}
                  >
                    Anuluj
                  </Button>
                  <Button
                    type="submit"
                    disabled={createAlert.isPending}
                    data-testid="btn-submit-alert"
                  >
                    {createAlert.isPending ? "Zapisuję..." : "Dodaj alert"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit alert dialog */}
        <Dialog
          open={editingAlert !== null}
          onOpenChange={(open) => {
            if (!open) setEditingAlert(null);
          }}
        >
          <DialogContent data-testid="dialog-edit-alert">
            <DialogHeader>
              <DialogTitle>Edytuj alert</DialogTitle>
            </DialogHeader>
            {editingAlert && (
              <>
                <div className="rounded-lg bg-muted/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Produkt</p>
                  <p className="text-sm font-semibold text-foreground">
                    {editingAlert.productName}
                  </p>
                </div>
                <Form {...editForm}>
                  <form
                    onSubmit={editForm.handleSubmit(onEditSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={editForm.control}
                      name="supplierId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dostawca</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Wszyscy dostawcy" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value=" ">Wszyscy dostawcy</SelectItem>
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
                      control={editForm.control}
                      name="thresholdPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Próg zmiany (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.5"
                              min="0.1"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditingAlert(null)}
                      >
                        Anuluj
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateAlert.isPending}
                      >
                        {updateAlert.isPending ? "Zapisuję..." : "Zapisz zmiany"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
