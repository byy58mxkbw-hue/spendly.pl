import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/react";
import { Redirect, useLocation } from "wouter";
import { apiUrl } from "@/lib/api-base";
import { readPendingInvoice, clearPendingInvoice } from "@/lib/pending-invoice";
import { readInvoiceXml } from "@/lib/ksef-viewer";
import { saveViewerImport } from "@/lib/viewer-import";
import { track } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "@/lib/icons";

/**
 * /start?z=podglad — pierwszy ekran po rejestracji/logowaniu, gdy w przeglądarce czeka
 * faktura z publicznego podglądu XML. Importuje ją istniejącym POST /api/invoices/import
 * (guard XXE + deduplikacja po stronie API; dostawca po NIP sprzedawcy, source=viewer),
 * po sukcesie czyści localStorage i przechodzi na pulpit z powitaniem. Duplikat = sukces
 * („ta faktura jest już na Twoim koncie”). Błąd: komunikat, wpis zostaje, „Spróbuj ponownie”.
 */
type State =
  | { kind: "working" }
  | { kind: "error"; message: string };

export default function StartImportPage() {
  const { session } = useClerk();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<State>({ kind: "working" });
  const [attempt, setAttempt] = useState(0);
  const [pending] = useState(() => readPendingInvoice());
  const started = useRef(-1);

  useEffect(() => {
    if (!pending || !session || started.current === attempt) return;
    started.current = attempt;
    const parsed = readInvoiceXml(pending.xml, pending.fileName);
    if (!parsed.ok) {
      clearPendingInvoice(); // plik nie do odczytu — nie ma sensu trzymać go i ponawiać
      setState({ kind: "error", message: parsed.message });
      return;
    }
    const h = parsed.invoice.header;
    (async () => {
      try {
        const token = await session.getToken();
        const res = await fetch(apiUrl("/api/invoices/import"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ xmlContent: pending.xml, invoiceDate: h.invoiceDate ?? new Date().toISOString().slice(0, 10), source: "viewer" }),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: number; supplierName?: string; existingInvoiceId?: number; error?: string };
        const duplicate = res.status === 409 && typeof body.existingInvoiceId === "number";
        const invoiceId = res.ok ? body.id : duplicate ? body.existingInvoiceId : undefined;
        if (invoiceId == null) {
          setState({ kind: "error", message: body.error ?? "Nie udało się zaimportować faktury." });
          return;
        }
        saveViewerImport({
          invoiceId,
          invoiceNumber: h.invoiceNumber ?? "",
          supplierName: body.supplierName ?? h.sellerName ?? "",
          itemsCount: parsed.invoice.items.length,
          invoiceDate: h.invoiceDate ?? "",
          duplicate,
        });
        clearPendingInvoice();
        track("ksef_viewer_import_done", { duplicate });
        setLocation(`/dashboard?z=podglad&inv=${invoiceId}`, { replace: true });
      } catch {
        setState({ kind: "error", message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie." });
      }
    })();
  }, [pending, session, attempt, setLocation]);

  if (!pending) return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md border border-border bg-card p-6">
        {state.kind === "working" ? (
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="font-semibold">Importuję fakturę na Twoje konto…</p>
              <p className="text-sm text-muted-foreground">{pending.fileName}</p>
            </div>
          </div>
        ) : (
          <div role="alert">
            <p className="flex gap-2 font-semibold"><AlertTriangle className="w-5 h-5 text-negative shrink-0" /> Faktura się nie zaimportowała</p>
            <p className="text-sm text-muted-foreground mt-2">{state.message}</p>
            <div className="flex gap-2 mt-4 flex-wrap">
              {readPendingInvoice() && (
                <Button onClick={() => { setState({ kind: "working" }); setAttempt((a) => a + 1); }}>Spróbuj ponownie</Button>
              )}
              <Button variant="outline" onClick={() => setLocation("/dashboard")}>Przejdź do pulpitu</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
