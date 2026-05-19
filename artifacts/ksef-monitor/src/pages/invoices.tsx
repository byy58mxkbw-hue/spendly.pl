import { useState, useCallback, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListInvoices,
  useImportInvoice,
  useListSuppliers,
  useDeleteInvoice,
  useSyncKsefInvoices,
  useGetKsefConfig,
} from "@workspace/api-client-react";
import { Link } from "wouter";
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
import {
  Plus, FileText, Trash2, Upload, CheckCircle2, AlertCircle, Package,
  ChevronUp, ChevronDown, ChevronsUpDown, Search, X, RefreshCw,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── KSeF sync button ───────────────────────────────────────────────────────

function InvoicesHeaderActions({ onImportClick }: { onImportClick: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: config } = useGetKsefConfig();
  const sync = useSyncKsefInvoices();

  function handleSync() {
    if (!config) {
      toast({
        variant: "destructive",
        title: "Brak konfiguracji",
        description: "Przejdź do Ustawień KSeF i wpisz NIP oraz token.",
      });
      return;
    }
    sync.mutate(undefined, {
      onSuccess: (res) => {
        queryClient.invalidateQueries();
        const errs = res.errors && res.errors.length > 0 ? ` Błędów: ${res.errors.length}.` : "";
        toast({
          title: "Synchronizacja zakończona",
          description: `Zaimportowano: ${res.imported}, do przeglądu: ${res.pending}, nieudanych: ${res.failed}.${errs}`,
        });
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast({
          variant: "destructive",
          title: "Błąd synchronizacji",
          description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zsynchronizować z KSeF.",
        });
      },
    });
  }

  return (
    <div className="flex items-center gap-3">
      {config && (
        <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-last-sync">
          Ostatnia synchronizacja:{" "}
          <span className="font-medium text-foreground">
            {config.lastSyncedAt
              ? new Date(config.lastSyncedAt).toLocaleString("pl-PL")
              : "nigdy"}
          </span>
        </span>
      )}
      {config ? (
        <Button
          variant="outline"
          onClick={handleSync}
          disabled={sync.isPending}
          className="gap-2"
          data-testid="btn-sync-ksef"
        >
          <RefreshCw className={cn("w-4 h-4", sync.isPending && "animate-spin")} />
          {sync.isPending ? "Synchronizuję..." : "Synchronizuj z KSeF"}
        </Button>
      ) : (
        <Link href="/settings/ksef">
          <Button variant="outline" className="gap-2" data-testid="btn-configure-ksef">
            <RefreshCw className="w-4 h-4" /> Skonfiguruj KSeF
          </Button>
        </Link>
      )}
      <Button onClick={onImportClick} className="gap-2" data-testid="btn-import-invoice">
        <Plus className="w-4 h-4" /> Importuj fakturę
      </Button>
    </div>
  );
}

// ─── Client-side KSeF XML preview parser ────────────────────────────────────

interface ParsedItem {
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  vatRate: number | null;
}

interface XmlPreview {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  items: ParsedItem[];
  totalGross: number | null;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseNum(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}

function parseXmlPreview(xml: string): XmlPreview | null {
  if (!xml.trim()) return null;
  try {
    const stripped = xml
      .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "")
      .replace(/<(\w+):/g, "<")
      .replace(/<\/(\w+):/g, "</");

    const invoiceNumber = extractTag(stripped, "P_2") ?? extractTag(stripped, "NrFa");
    const rawDate = extractTag(stripped, "P_1") ?? extractTag(stripped, "DataWystawienia");
    let invoiceDate: string | null = null;
    if (rawDate) {
      const d = rawDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) invoiceDate = d;
      else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
        const [dd, mm, yyyy] = d.split(".");
        invoiceDate = `${yyyy}-${mm}-${dd}`;
      }
    }
    const totalGrossRaw = extractTag(stripped, "P_15") ?? extractTag(stripped, "WartoscBrutto");
    const totalGross = totalGrossRaw ? parseNum(totalGrossRaw) : null;

    const items: ParsedItem[] = [];
    const wierszeRe = /<FaWiersz>([\s\S]*?)<\/FaWiersz>/g;
    let wiersz: RegExpExecArray | null;
    while ((wiersz = wierszeRe.exec(stripped)) !== null) {
      const block = wiersz[1];
      const name = extractTag(block, "P_7");
      if (!name) continue;
      const unit = extractTag(block, "P_8A") ?? "szt";
      const qty = parseNum(extractTag(block, "P_8B"));
      const unitPrice = parseNum(extractTag(block, "P_9A") ?? extractTag(block, "P_9B"));
      const total = parseNum(extractTag(block, "P_11") ?? extractTag(block, "P_11A"));
      const vatRaw = extractTag(block, "P_12");
      const vatRate = vatRaw && /^\d+$/.test(vatRaw.trim()) ? parseInt(vatRaw.trim(), 10) : null;
      items.push({ productName: name, quantity: qty || 1, unit, unitPrice, totalPrice: total || unitPrice * (qty || 1), vatRate });
    }

    if (items.length === 0) {
      const pozRegex = /<P_7>([\s\S]*?)<\/P_7>[\s\S]*?<P_8A>([\s\S]*?)<\/P_8A>[\s\S]*?<P_8B>([\s\S]*?)<\/P_8B>[\s\S]*?<P_9A>([\s\S]*?)<\/P_9A>[\s\S]*?<P_11>([\s\S]*?)<\/P_11>/g;
      let m: RegExpExecArray | null;
      while ((m = pozRegex.exec(stripped)) !== null) {
        const qty = parseNum(m[3]);
        const unitPrice = parseNum(m[4]);
        const total = parseNum(m[5]);
        items.push({ productName: m[1].trim(), quantity: qty || 1, unit: m[2].trim() || "szt", unitPrice, totalPrice: total || unitPrice * (qty || 1), vatRate: null });
      }
    }

    return { invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, items, totalGross };
  } catch {
    return null;
  }
}

// ─── Sorting ────────────────────────────────────────────────────────────────

type SortField = "invoiceDate" | "importedAt" | "supplierName" | "totalAmount";
type SortDir = "asc" | "desc";

function SortIcon({ field, activeField, dir }: { field: SortField; activeField: SortField; dir: SortDir }) {
  if (field !== activeField) return <ChevronsUpDown className="w-3 h-3 ml-0.5 text-muted-foreground/40 inline" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-0.5 text-primary inline" />
    : <ChevronDown className="w-3 h-3 ml-0.5 text-primary inline" />;
}

// ─── Form schema ─────────────────────────────────────────────────────────────

const importSchema = z.object({
  supplierId: z.string().min(1, "Wybierz dostawcę"),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1, "Data jest wymagana"),
  xmlContent: z.string().optional(),
});

type ImportFormValues = z.infer<typeof importSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Invoices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: invoices, isLoading } = useListInvoices({ limit: 1000 });
  const { data: suppliers } = useListSuppliers();
  const importInvoice = useImportInvoice();
  const deleteInvoice = useDeleteInvoice();

  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [xmlPreview, setXmlPreview] = useState<XmlPreview | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    message: string;
    values: ImportFormValues;
  } | null>(null);

  // Filter & sort state
  const [activeSupplier, setActiveSupplier] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      supplierId: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      xmlContent: "",
    },
  });

  const handleXmlChange = useCallback((xml: string) => {
    if (!xml.trim()) { setXmlPreview(null); return; }
    const preview = parseXmlPreview(xml);
    setXmlPreview(preview);
    if (preview) {
      if (preview.invoiceNumber && !form.getValues("invoiceNumber")) {
        form.setValue("invoiceNumber", preview.invoiceNumber);
      }
      if (preview.invoiceDate && form.getValues("invoiceDate") === new Date().toISOString().split("T")[0]) {
        form.setValue("invoiceDate", preview.invoiceDate);
      }
    }
  }, [form]);

  function submitImport(values: ImportFormValues, force: boolean) {
    importInvoice.mutate(
      {
        data: {
          supplierId: parseInt(values.supplierId, 10),
          invoiceNumber: values.invoiceNumber || undefined,
          invoiceDate: values.invoiceDate,
          xmlContent: values.xmlContent || undefined,
          force: force || undefined,
        },
      },
      {
        onSuccess: () => {
          // Importing an invoice affects suppliers (invoice counts), products,
          // dashboard summary, reports etc. — invalidate everything to be safe.
          queryClient.invalidateQueries();
          setShowImport(false);
          setXmlPreview(null);
          setDuplicateConflict(null);
          form.reset();
          toast({
            title: force ? "Faktura zaimportowana (kopia)" : "Faktura zaimportowana",
            description: "Pozycje zostały dodane do bazy.",
          });
        },
        onError: (err: unknown) => {
          const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
          const message = e?.response?.data?.error ?? e?.message ?? "Nie udało się zaimportować faktury. Spróbuj ponownie.";

          // 409 = duplicate — show a confirmation dialog instead of just a toast
          if (e?.response?.status === 409) {
            setDuplicateConflict({ message, values });
            return;
          }

          toast({
            variant: "destructive",
            title: "Błąd importu",
            description: message,
          });
        },
      }
    );
  }

  function onSubmit(values: ImportFormValues) {
    submitImport(values, false);
  }

  function handleDelete() {
    if (deleteId == null) return;
    deleteInvoice.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          // Deleting affects suppliers, products, dashboard, reports etc.
          queryClient.invalidateQueries();
          setDeleteId(null);
        },
      }
    );
  }

  // Unique suppliers from invoice list (preserves order by name)
  const supplierList = useMemo(() => {
    if (!invoices) return [];
    const seen = new Map<number, string>();
    invoices.forEach((inv) => {
      if (!seen.has(inv.supplierId)) seen.set(inv.supplierId, inv.supplierName);
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [invoices]);

  // Filtered + sorted invoices
  const displayedInvoices = useMemo(() => {
    if (!invoices) return [];
    let list = activeSupplier != null
      ? invoices.filter((inv) => inv.supplierId === activeSupplier)
      : invoices;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.supplierName.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "invoiceDate") {
        cmp = a.invoiceDate.localeCompare(b.invoiceDate);
      } else if (sortField === "importedAt") {
        cmp = a.importedAt.localeCompare(b.importedAt);
      } else if (sortField === "supplierName") {
        cmp = a.supplierName.localeCompare(b.supplierName, "pl");
      } else if (sortField === "totalAmount") {
        cmp = a.totalAmount - b.totalAmount;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [invoices, activeSupplier, searchQuery, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const xmlContent = form.watch("xmlContent");
  const isValidXml = xmlContent && xmlContent.trim().length > 0;

  return (
    <Layout>
      <div className="px-8 py-8">
        <PageHeader
          title="Faktury"
          subtitle="Historia zaimportowanych faktur KSeF"
          action={<InvoicesHeaderActions onImportClick={() => setShowImport(true)} />}
        />

        {/* Search by invoice number or supplier */}
        {!isLoading && (invoices?.length ?? 0) > 0 && (
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Szukaj po numerze faktury lub dostawcy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-search-invoices"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Wyczyść wyszukiwanie"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Supplier filter pills */}
        {!isLoading && supplierList.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            <button
              onClick={() => setActiveSupplier(null)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeSupplier === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              Wszyscy
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full",
                activeSupplier === null ? "bg-white/20" : "bg-muted"
              )}>
                {invoices?.length ?? 0}
              </span>
            </button>

            {supplierList.map((s) => {
              const count = invoices?.filter((inv) => inv.supplierId === s.id).length ?? 0;
              const isActive = activeSupplier === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSupplier(isActive ? null : s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {s.name}
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-white/20" : "bg-muted"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Column headers with sort */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 px-6 py-3 border-b border-border text-xs font-medium text-muted-foreground bg-secondary/30 select-none">
            <div className="w-8"></div>
            <div>Faktura</div>
            <button
              className="text-right w-32 hover:text-foreground transition-colors cursor-pointer flex items-center justify-end gap-0.5"
              onClick={() => toggleSort("supplierName")}
            >
              Dostawca <SortIcon field="supplierName" activeField={sortField} dir={sortDir} />
            </button>
            <button
              className="text-right w-24 hover:text-foreground transition-colors cursor-pointer flex items-center justify-end gap-0.5"
              onClick={() => toggleSort("invoiceDate")}
            >
              Data faktury <SortIcon field="invoiceDate" activeField={sortField} dir={sortDir} />
            </button>
            <button
              className="text-right w-32 hover:text-foreground transition-colors cursor-pointer flex items-center justify-end gap-0.5"
              onClick={() => toggleSort("importedAt")}
            >
              Dodano <SortIcon field="importedAt" activeField={sortField} dir={sortDir} />
            </button>
            <button
              className="text-right w-28 hover:text-foreground transition-colors cursor-pointer flex items-center justify-end gap-0.5"
              onClick={() => toggleSort("totalAmount")}
            >
              Kwota <SortIcon field="totalAmount" activeField={sortField} dir={sortDir} />
            </button>
            <div className="w-8"></div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 px-6 py-4 items-center">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="w-6 h-6 rounded" />
                </div>
              ))}
            </div>
          ) : displayedInvoices.length > 0 ? (
            <div className="divide-y divide-border">
              {displayedInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-secondary/40 transition-colors group"
                  data-testid={`invoice-row-${invoice.id}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{invoice.itemCount} pozycji</p>
                  </div>

                  <div className="text-right w-32">
                    <p className="text-sm text-foreground truncate max-w-[128px]">{invoice.supplierName}</p>
                  </div>

                  <div className="text-right w-24">
                    <p className="text-sm text-muted-foreground">{formatDate(invoice.invoiceDate)}</p>
                  </div>

                  <div className="text-right w-32">
                    <p className="text-sm text-muted-foreground">
                      {new Date(invoice.importedAt).toLocaleDateString("pl-PL")}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">
                      {new Date(invoice.importedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="text-right w-28">
                    <p className="text-sm font-semibold text-foreground">{formatPrice(invoice.totalAmount)}</p>
                  </div>

                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    onClick={() => setDeleteId(invoice.id)}
                    data-testid={`btn-delete-invoice-${invoice.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : invoices && invoices.length > 0 ? (
            // Has invoices but none match the active supplier filter
            <div className="py-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-foreground font-medium mb-1">Brak faktur dla tego dostawcy</p>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setActiveSupplier(null)}
              >
                Pokaż wszystkie
              </button>
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

          {/* Footer summary */}
          {!isLoading && displayedInvoices.length > 0 && (
            <div className="px-6 py-3 border-t border-border bg-secondary/20 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {displayedInvoices.length} {displayedInvoices.length === 1 ? "faktura" : displayedInvoices.length < 5 ? "faktury" : "faktur"}
                {activeSupplier != null && (
                  <> · <button className="text-primary hover:underline" onClick={() => setActiveSupplier(null)}>wyczyść filtr</button></>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Łącznie:{" "}
                <span className="font-semibold text-foreground">
                  {formatPrice(displayedInvoices.reduce((s, inv) => s + inv.totalAmount, 0))}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Import dialog */}
        <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setXmlPreview(null); form.reset(); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-import-invoice">
            <DialogHeader>
              <DialogTitle>Importuj fakturę KSeF</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="xmlContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Zawartość XML KSeF
                        {isValidXml && xmlPreview && (
                          <span className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded",
                            xmlPreview.items.length > 0
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-amber-500/10 text-amber-600"
                          )}>
                            {xmlPreview.items.length > 0
                              ? <><CheckCircle2 className="w-3 h-3" />{xmlPreview.items.length} pozycji</>
                              : <><AlertCircle className="w-3 h-3" />brak pozycji</>}
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Wklej tutaj zawartość pliku XML z KSeF (FA2)..."
                          className="h-36 text-xs font-mono resize-none"
                          {...field}
                          onChange={(e) => { field.onChange(e); handleXmlChange(e.target.value); }}
                          data-testid="textarea-xml"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {xmlPreview && xmlPreview.items.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-primary" />
                        Podgląd pozycji z XML
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {xmlPreview.items.length} pozycji · łącznie {formatPrice(xmlPreview.items.reduce((s, i) => s + i.totalPrice, 0))}
                      </p>
                    </div>
                    <div className="divide-y divide-border max-h-48 overflow-y-auto">
                      {xmlPreview.items.map((item, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} {item.unit} × {formatPrice(item.unitPrice)}
                              {item.vatRate != null && ` · VAT ${item.vatRate}%`}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-foreground shrink-0">{formatPrice(item.totalPrice)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isValidXml && xmlPreview && xmlPreview.items.length === 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Nie wykryto pozycji</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        XML zostanie zapisany, ale bez pozycji linii. Upewnij się, że to jest faktura w formacie KSeF FA2 z blokami &lt;FaWiersz&gt;.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="invoiceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numer faktury</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={xmlPreview?.invoiceNumber ?? "np. FV/2025/05/001"}
                            {...field}
                            data-testid="input-invoice-number"
                          />
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
                </div>

                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dostawca</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-supplier">
                            <SelectValue placeholder="Wybierz dostawcę z listy" />
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

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => { setShowImport(false); setXmlPreview(null); form.reset(); }}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={importInvoice.isPending} data-testid="btn-submit-import">
                    {importInvoice.isPending
                      ? "Importuję..."
                      : xmlPreview && xmlPreview.items.length > 0
                        ? `Importuj (${xmlPreview.items.length} pozycji)`
                        : "Importuj"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Duplicate-invoice confirmation */}
        <AlertDialog open={duplicateConflict != null} onOpenChange={(open) => { if (!open) setDuplicateConflict(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Faktura już istnieje w bazie</AlertDialogTitle>
              <AlertDialogDescription>
                {duplicateConflict?.message}
                <br /><br />
                Jeśli to faktura korygująca, duplikat numeracji albo świadomie chcesz dodać kolejną kopię — kliknij <strong>Importuj mimo to</strong>. W przeciwnym razie anuluj.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDuplicateConflict(null)}>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (duplicateConflict) submitImport(duplicateConflict.values, true);
                }}
                disabled={importInvoice.isPending}
              >
                Importuj mimo to
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
