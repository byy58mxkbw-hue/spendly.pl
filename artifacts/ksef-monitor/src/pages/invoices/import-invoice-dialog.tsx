import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useImportInvoice,
  useScanReceipt,
  useCreateSupplier,
  getListSuppliersQueryKey,
  type ScannedReceiptData,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Camera, Plus, X, Loader2, ScanLine, CheckCircle2 } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { track } from "@/lib/posthog";
import { useToast } from "@/hooks/use-toast";

interface ParsedItem { productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; vatRate: number | null; }
interface XmlPreview { invoiceNumber: string | null; invoiceDate: string | null; items: ParsedItem[]; totalGross: number | null; }

function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}
function parseNumStr(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}
function parseXmlPreview(xml: string): XmlPreview | null {
  if (!xml.trim()) return null;
  try {
    const stripped = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "").replace(/<(\w+):/g, "<").replace(/<\/(\w+):/g, "</");
    const invoiceNumber = extractXmlTag(stripped, "P_2") ?? extractXmlTag(stripped, "NrFa");
    const rawDate = extractXmlTag(stripped, "P_1") ?? extractXmlTag(stripped, "DataWystawienia");
    let invoiceDate: string | null = null;
    if (rawDate) {
      const d = rawDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) invoiceDate = d;
      else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
        const [dd, mm, yyyy] = d.split(".");
        invoiceDate = `${yyyy}-${mm}-${dd}`;
      }
    }
    const totalGrossRaw = extractXmlTag(stripped, "P_15") ?? extractXmlTag(stripped, "WartoscBrutto");
    const totalGross = totalGrossRaw ? parseNumStr(totalGrossRaw) : null;
    const items: ParsedItem[] = [];
    const wierszeRe = /<FaWiersz>([\s\S]*?)<\/FaWiersz>/g;
    let wiersz: RegExpExecArray | null;
    while ((wiersz = wierszeRe.exec(stripped)) !== null) {
      const block = wiersz[1];
      const name = extractXmlTag(block, "P_7");
      if (!name) continue;
      const unit = extractXmlTag(block, "P_8A") ?? "szt";
      const qty = parseNumStr(extractXmlTag(block, "P_8B"));
      const unitPrice = parseNumStr(extractXmlTag(block, "P_9A") ?? extractXmlTag(block, "P_9B"));
      const total = parseNumStr(extractXmlTag(block, "P_11") ?? extractXmlTag(block, "P_11A"));
      const vatRaw = extractXmlTag(block, "P_12");
      const vatRate = vatRaw && /^\d+$/.test(vatRaw.trim()) ? parseInt(vatRaw.trim(), 10) : null;
      items.push({ productName: name, quantity: qty || 1, unit, unitPrice, totalPrice: total || unitPrice * (qty || 1), vatRate });
    }
    return { invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, items, totalGross };
  } catch { return null; }
}

// ─── Import dialog ─────────────────────────────────────────────────────────────

const importSchema = z.object({
  supplierId: z.string().min(1, "Wybierz dostawcę"),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1, "Data jest wymagana"),
  xmlContent: z.string().optional(),
  paymentMethod: z.enum(["gotowka", "karta", "przelew"]).optional(),
  paymentDueDate: z.string().optional(),
});
type ImportFormValues = z.infer<typeof importSchema>;

export function ImportInvoiceDialog({
  open,
  onClose,
  suppliers,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Array<{ id: number; name: string }>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const importInvoice = useImportInvoice();
  const scanReceipt = useScanReceipt();

  const [importTab, setImportTab] = useState<"xml" | "photo">("xml");
  const [xmlPreview, setXmlPreview] = useState<XmlPreview | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedReceiptData | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<{ message: string; values: ImportFormValues } | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierNip, setNewSupplierNip] = useState("");
  const [isCorrection, setIsCorrection] = useState(false);
  const [correctedInvoiceNumber, setCorrectedInvoiceNumber] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSupplierMutation = useCreateSupplier();

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: { supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], xmlContent: "", paymentMethod: undefined, paymentDueDate: "" },
  });

  const paymentMethod = form.watch("paymentMethod");

  const handleXmlChange = useCallback((xml: string) => {
    if (!xml.trim()) { setXmlPreview(null); return; }
    const preview = parseXmlPreview(xml);
    setXmlPreview(preview);
    if (preview) {
      if (preview.invoiceNumber && !form.getValues("invoiceNumber")) form.setValue("invoiceNumber", preview.invoiceNumber);
      if (preview.invoiceDate && form.getValues("invoiceDate") === new Date().toISOString().split("T")[0]) form.setValue("invoiceDate", preview.invoiceDate);
    }
  }, [form]);

  function compressImage(dataUrl: string): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1800 / img.width, 1800 / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ base64: out.split(",")[1], mimeType: "image/jpeg" });
      };
      img.src = dataUrl;
    });
  }

  async function handleScanReceipt() {
    if (!receiptPreviewUrl) return;
    const { base64, mimeType } = await compressImage(receiptPreviewUrl);
    try {
      const data = await scanReceipt.mutateAsync({ data: { imageBase64: base64, mimeType } });
      track("ocr_scan");
      setScannedData(data);
      if (data.invoiceNumber && !form.getValues("invoiceNumber")) form.setValue("invoiceNumber", data.invoiceNumber);
      if (data.invoiceDate) form.setValue("invoiceDate", data.invoiceDate);
      if (data.supplierName) {
        const needle = data.supplierName.toLowerCase().trim();
        const match = suppliers.find(
          (s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()),
        );
        if (match) {
          form.setValue("supplierId", String(match.id));
        } else {
          setNewSupplierName(data.supplierName);
          setNewSupplierNip(data.supplierNip ?? "");
          setShowAddSupplier(true);
        }
      }
      if (data.isCorrection) {
        setIsCorrection(true);
        setCorrectedInvoiceNumber(data.correctedInvoiceNumber ?? "");
      }
      toast({ title: "Skan gotowy", description: `Rozpoznano ${data.items.length} pozycji.` });
    } catch (err) {
      // Komunikat serwera (m.in. 429 o wyczerpaniu miesięcznego limitu AI planu).
      const serverMsg = (err as { data?: { error?: string } })?.data?.error;
      toast({ variant: "destructive", title: "Błąd skanowania", description: serverMsg ?? "Nie udało się przetworzyć obrazu." });
    }
  }

  function handleAddSupplier() {
    if (!newSupplierName.trim()) return;
    createSupplierMutation.mutate(
      {
        data: {
          name: newSupplierName.trim(),
          taxId: newSupplierNip.trim(),
          email: null,
          phone: null,
        },
      },
      {
        onSuccess: (newS) => {
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          form.setValue("supplierId", String(newS.id));
          setShowAddSupplier(false);
          setNewSupplierName("");
          setNewSupplierNip("");
          toast({ title: "Dostawca dodany", description: newS.name });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się dodać dostawcy." });
        },
      },
    );
  }

  async function handleSubmit(values: ImportFormValues, force = false) {
    const items = importTab === "photo" && scannedData?.items.length
      ? scannedData.items.map((it) => ({ ...it, vatRate: null as number | null }))
      : undefined;
    try {
      await importInvoice.mutateAsync({
        data: {
          supplierId: parseInt(values.supplierId, 10),
          invoiceNumber: values.invoiceNumber || undefined,
          invoiceDate: values.invoiceDate,
          xmlContent: importTab === "xml" ? (values.xmlContent || undefined) : undefined,
          force,
          items,
          paymentMethod: values.paymentMethod as "gotowka" | "karta" | "przelew" | undefined,
          paymentDueDate: values.paymentMethod === "przelew" ? (values.paymentDueDate || undefined) : undefined,
          correctedInvoiceNumber: isCorrection && correctedInvoiceNumber.trim() ? correctedInvoiceNumber.trim() : undefined,
        },
      });
      queryClient.invalidateQueries();
      track("invoice_imported", { source: importTab });
      toast({ title: "Dodano zakup" });
      form.reset({ supplierId: "", invoiceNumber: "", invoiceDate: new Date().toISOString().split("T")[0], xmlContent: "", paymentMethod: undefined, paymentDueDate: "" });
      setXmlPreview(null); setScannedData(null); setReceiptPreviewUrl(null);
      setShowAddSupplier(false); setNewSupplierName(""); setNewSupplierNip("");
      setIsCorrection(false); setCorrectedInvoiceNumber("");
      onClose();
    } catch (err: unknown) {
      const body = err as { status?: number; message?: string };
      if (body?.status === 409) {
        setDuplicateConflict({ message: body.message ?? "Faktura już istnieje.", values });
      } else {
        toast({ variant: "destructive", title: "Błąd importu", description: body?.message ?? "Spróbuj ponownie." });
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dodaj zakup</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-2">
            <button onClick={() => setImportTab("xml")} className={cn("flex-1 py-1.5 text-sm font-medium rounded-lg transition-all", importTab === "xml" ? "bg-white shadow-sm" : "text-muted-foreground")}>
              XML / Ręcznie
            </button>
            <button onClick={() => setImportTab("photo")} className={cn("flex-1 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-1.5", importTab === "photo" ? "bg-white shadow-sm" : "text-muted-foreground")}>
              <Camera className="w-3.5 h-3.5" />Zdjęcie
            </button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => handleSubmit(v))} className="space-y-4">
              <FormField control={form.control} name="supplierId" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Dostawca</FormLabel>
                    {!showAddSupplier && (
                      <button
                        type="button"
                        onClick={() => { setShowAddSupplier(true); setNewSupplierName(""); setNewSupplierNip(""); }}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Nowy dostawca
                      </button>
                    )}
                  </div>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Wybierz dostawcę" /></SelectTrigger></FormControl>
                    <SelectContent className="max-h-60 overflow-y-auto">{suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {showAddSupplier && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-primary">Nowy dostawca</p>
                    <button
                      type="button"
                      onClick={() => setShowAddSupplier(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Input
                    placeholder="Nazwa dostawcy *"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="NIP (opcjonalnie)"
                    value={newSupplierNip}
                    onChange={(e) => setNewSupplierNip(e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newSupplierName.trim() || createSupplierMutation.isPending}
                    onClick={handleAddSupplier}
                    className="h-7 text-xs w-full"
                  >
                    {createSupplierMutation.isPending ? "Dodawanie..." : "Dodaj dostawcę"}
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numer faktury</FormLabel>
                    <FormControl><Input placeholder="FV/2024/001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {isCorrection ? (
                <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-orange-600">Faktura korygująca</p>
                    <button
                      type="button"
                      onClick={() => { setIsCorrection(false); setCorrectedInvoiceNumber(""); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Numer korygowanej faktury *</label>
                    <Input
                      placeholder="np. FV/2024/001"
                      value={correctedInvoiceNumber}
                      onChange={(e) => setCorrectedInvoiceNumber(e.target.value)}
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCorrection(true)}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  To jest faktura korygująca
                </button>
              )}

              <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                <FormItem>
                  <FormLabel>Metoda płatności <span className="text-muted-foreground font-normal">(opcjonalnie)</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Wybierz metodę" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gotowka">Gotówka</SelectItem>
                      <SelectItem value="karta">Karta</SelectItem>
                      <SelectItem value="przelew">Przelew bankowy</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {paymentMethod === "przelew" && (
                <FormField control={form.control} name="paymentDueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Termin płatności</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {importTab === "xml" ? (
                <FormField control={form.control} name="xmlContent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>XML KSeF <span className="text-muted-foreground font-normal">(opcjonalnie)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Wklej treść XML faktury..."
                        rows={5}
                        {...field}
                        onChange={(e) => { field.onChange(e); handleXmlChange(e.target.value); }}
                      />
                    </FormControl>
                    {xmlPreview && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Rozpoznano {xmlPreview.items.length} pozycji{xmlPreview.totalGross != null ? ` · ${formatPrice(xmlPreview.totalGross)}` : ""}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => { setReceiptPreviewUrl(ev.target?.result as string); setScannedData(null); };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {receiptPreviewUrl ? (
                    <div className="relative">
                      <img src={receiptPreviewUrl} alt="Paragon" className="w-full max-h-40 object-contain rounded-lg border border-border" />
                      <button
                        type="button"
                        onClick={() => { setReceiptPreviewUrl(null); setScannedData(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border rounded-xl py-8 text-center text-muted-foreground hover:border-primary/50 transition-colors"
                    >
                      <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm font-medium">Kliknij, aby dodać zdjęcie</p>
                      <p className="text-xs text-muted-foreground mt-1">paragon lub faktura</p>
                    </button>
                  )}
                  {receiptPreviewUrl && !scannedData && (
                    <Button type="button" variant="outline" className="w-full gap-2" onClick={handleScanReceipt} disabled={scanReceipt.isPending}>
                      {scanReceipt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                      {scanReceipt.isPending ? "Skanuję..." : "Skanuj paragon"}
                    </Button>
                  )}
                  {scannedData && (
                    <div className="text-xs text-emerald-600 flex items-center gap-1.5 bg-emerald-50 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Rozpoznano {scannedData.items.length} pozycji
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={importInvoice.isPending}>
                {importInvoice.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Dodaj zakup
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!duplicateConflict} onOpenChange={(o) => { if (!o) setDuplicateConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Faktura już istnieje</AlertDialogTitle>
            <AlertDialogDescription>{duplicateConflict?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateConflict(null)}>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (duplicateConflict) { handleSubmit(duplicateConflict.values, true); setDuplicateConflict(null); } }}>
              Importuj mimo to
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
