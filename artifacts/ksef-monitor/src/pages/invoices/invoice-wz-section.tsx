import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoiceWz,
  useScanInvoiceWz,
  useDeleteInvoiceWz,
  getGetInvoiceWzQueryKey,
  type InvoiceWz,
  type WzCompareRow,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Trash2, Upload, CheckCircle2, AlertTriangle } from "@/lib/icons";
import { fileToImages } from "@/lib/file-to-images";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { plural } from "@/lib/plural";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

// Dokumenty WZ przy fakturze: numery z XML KSeF (np. Stelma podaje, z których WZ składa
// się faktura), odczyt WZ ze zdjęcia/PDF (OCR, raz na dokument) i porównanie ilości
// z fakturą — wyłapuje towar zafakturowany, a niewydany.

const MAX_PAGES = 6;
const qtyFmt = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 });

const STATUS: Record<WzCompareRow["status"], { label: string; cls: string }> = {
  ok: { label: "zgodne", cls: "text-positive" },
  difference: { label: "różnica", cls: "text-negative" },
  unit_mismatch: { label: "inna jednostka", cls: "text-warning" },
  missing_on_wz: { label: "brak na WZ", cls: "text-warning" },
};
const ORDER: Record<WzCompareRow["status"], number> = { difference: 0, unit_mismatch: 1, missing_on_wz: 2, ok: 3 };

export function InvoiceWzSection({ invoiceId }: { invoiceId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetInvoiceWz(invoiceId, { query: { queryKey: getGetInvoiceWzQueryKey(invoiceId) } });
  const scan = useScanInvoiceWz();
  const del = useDeleteInvoiceWz();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const setData = (d: InvoiceWz) => qc.setQueryData(getGetInvoiceWzQueryKey(invoiceId), d);

  function pick(wzNumber: string) {
    setTarget(wzNumber);
    fileRef.current?.click();
  }

  async function onFiles(files: FileList | null) {
    const wzNumber = target;
    if (!files?.length || !wzNumber) return;
    setBusy(wzNumber);
    try {
      const pages: string[] = [];
      for (const f of Array.from(files)) {
        if (pages.length >= MAX_PAGES) break;
        pages.push(...(await fileToImages(f, MAX_PAGES - pages.length)));
      }
      if (pages.length === 0) throw new Error("empty");
      const res = await scan.mutateAsync({
        id: invoiceId,
        data: {
          wzNumber,
          pages: pages.map((p) => ({ imageBase64: p, mimeType: p.slice(5, p.indexOf(";")) || "image/jpeg" })),
        },
      });
      setData(res);
      setManual("");
      track("wz_scanned", { pages: pages.length });
      toast({ title: `Odczytano ${wzNumber}` });
    } catch (err) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      toast({ variant: "destructive", title: "Nie udało się odczytać WZ", description: msg ?? "Użyj wyraźnego zdjęcia JPG/PNG albo pliku PDF." });
    } finally {
      setBusy(null);
      setTarget(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: number) {
    try {
      setData(await del.mutateAsync({ id: invoiceId, wzId: id }));
    } catch {
      toast({ variant: "destructive", title: "Nie udało się odpiąć WZ" });
    }
  }

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!data) return null;

  const docByNumber = new Map(data.documents.map((d) => [d.wzNumber.toLowerCase(), d]));
  const unread = data.wzNumbers.filter((n) => !docByNumber.has(n.toLowerCase()));
  const cmp = data.comparison;
  const rows = cmp ? [...cmp.rows].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];

  return (
    <section className="glass p-4 shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Dokumenty WZ</p>
        <span className="text-xs text-muted-foreground">
          {data.wzNumbers.length > 0
            ? `${data.wzNumbers.length} ${plural(data.wzNumbers.length, ["dokument", "dokumenty", "dokumentów"])} · odczytane ${data.documents.length}`
            : "faktura nie podaje numerów WZ"}
        </span>
      </div>

      {data.wzNumbers.length > 0 && (
        <ul className="rule-list mt-2">
          {data.wzNumbers.map((n) => {
            const doc = docByNumber.get(n.toLowerCase());
            return (
              <li key={n} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium num">{n}</span>
                  {doc && (
                    <span className="block text-xs text-muted-foreground">
                      {doc.items.length} {plural(doc.items.length, ["pozycja", "pozycje", "pozycji"])}
                      {doc.wzDate ? ` · ${formatDate(doc.wzDate)}` : ""}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {doc ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-positive" aria-label="odczytano" />
                      <button type="button" onClick={() => pick(n)} disabled={busy != null} className="text-xs text-muted-foreground hover:text-foreground">
                        Odczytaj ponownie
                      </button>
                      <button type="button" onClick={() => void remove(doc.id)} title="Odepnij WZ" className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pick(n)}
                      disabled={busy != null}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 border border-border hover:bg-secondary disabled:opacity-50"
                    >
                      {busy === n ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {busy === n ? "Odczytuję…" : "Dodaj WZ (zdjęcie/PDF)"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Numer spoza faktury (faktura ze zdjęcia, dostawca nie podaje WZ w KSeF). */}
      <div className="flex items-center gap-2 mt-3">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Inny numer WZ, np. WZ/123/10/2026"
          maxLength={80}
          className="flex-1 min-w-0 h-8 px-2.5 text-sm bg-background border border-border"
        />
        <button
          type="button"
          disabled={!manual.trim() || busy != null}
          onClick={() => pick(manual.trim())}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 h-8 border border-border hover:bg-secondary disabled:opacity-50"
        >
          {busy && busy === manual.trim() ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Dodaj
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Zdjęcie albo PDF (do {MAX_PAGES} stron). Odczyt korzysta z miesięcznego limitu AI, jak skan faktury.
      </p>

      {cmp && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-positive font-medium">Zgodne: {cmp.summary.ok}</span>
            <span className={cn("font-medium", cmp.summary.differences ? "text-negative" : "text-muted-foreground")}>Różnice: {cmp.summary.differences}</span>
            <span className={cn("font-medium", cmp.summary.missingOnWz ? "text-warning" : "text-muted-foreground")}>Brak na WZ: {cmp.summary.missingOnWz}</span>
            {cmp.summary.notInvoiced > 0 && <span className="text-warning font-medium">Na WZ, nie na fakturze: {cmp.summary.notInvoiced}</span>}
          </div>
          {unread.length > 0 && cmp.summary.missingOnWz > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-warning" />
              Nieodczytane WZ: {unread.join(", ")} — „brak na WZ” może dotyczyć towaru z tych dokumentów.
            </p>
          )}
          <div className="mt-2 border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Produkt na fakturze</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Faktura</th>
                  <th className="text-right px-3 py-1.5 font-semibold">WZ</th>
                </tr>
              </thead>
              <tbody className="rule-list">
                {rows.map((r, i) => (
                  <tr key={`${r.invoiceName}-${i}`}>
                    <td className="px-3 py-1.5">
                      {r.invoiceName}
                      <span className={cn("block text-[10px] font-semibold", STATUS[r.status].cls)}>
                        {r.status === "difference" && r.difference != null
                          ? `różnica ${r.difference > 0 ? "+" : "−"}${qtyFmt.format(Math.abs(r.difference))} ${r.unit}`
                          : STATUS[r.status].label}
                      </span>
                      {r.wzName && r.wzName.toLowerCase() !== r.invoiceName.toLowerCase() && (
                        <span className="block text-[10px] text-muted-foreground">na WZ: {r.wzName}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap align-top">{qtyFmt.format(r.invoiceQuantity)} {r.unit}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap align-top">{r.wzQuantity != null ? qtyFmt.format(r.wzQuantity) : "—"}</td>
                  </tr>
                ))}
                {cmp.notInvoiced.map((w, i) => (
                  <tr key={`extra-${i}`}>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {w.productName}
                      <span className="block text-[10px] font-semibold text-warning">na WZ, nie na fakturze</span>
                    </td>
                    <td className="px-3 py-1.5 text-right align-top">—</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap align-top">{qtyFmt.format(w.quantity)} {w.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
