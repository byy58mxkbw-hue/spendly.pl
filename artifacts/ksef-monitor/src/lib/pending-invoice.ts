// Faktura z publicznego podglądu XML (/podglad-faktury-ksef), która czeka na
// rejestrację. localStorage, NIE sessionStorage: link weryfikacyjny z maila Clerka
// otwiera nową kartę, a sessionStorage jest per karta. Ważność 1 h. Każdy dostęp w
// try/catch — tryb prywatny i zablokowane dane strony nie mogą wywrócić strony.
// Do chwili rejestracji plik NIE opuszcza przeglądarki (spec: podgląd faktury KSeF).

const KEY = "spendly_pending_invoice";
export const PENDING_INVOICE_TTL_MS = 60 * 60 * 1000;

export type PendingInvoice = {
  xml: string;
  fileName: string;
  savedAt: number;
};

export function savePendingInvoice(xml: string, fileName: string): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ xml, fileName, savedAt: Date.now() } satisfies PendingInvoice));
    return true;
  } catch {
    return false; // pełny lub zablokowany storage — UI pokaże rejestrację bez „faktura czeka"
  }
}

/** Ważna faktura albo null. Przeterminowany lub uszkodzony wpis jest od razu usuwany. */
export function readPendingInvoice(now = Date.now()): PendingInvoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingInvoice>;
    if (typeof v.xml !== "string" || typeof v.savedAt !== "number" || now - v.savedAt > PENDING_INVOICE_TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { xml: v.xml, fileName: typeof v.fileName === "string" ? v.fileName : "faktura.xml", savedAt: v.savedAt };
  } catch {
    return null;
  }
}

export function clearPendingInvoice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
