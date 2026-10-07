// Wynik importu faktury z publicznego podglądu XML (ustawiany przez /start, czytany
// przez powitanie i baner na /benchmark?z=podglad). Same metadane, bez treści faktury.
// localStorage + try/catch: brak storage oznacza tylko brak „odhaczonego” kroku w UI.

const KEY = "spendly_viewer_import";

export type ViewerImport = {
  invoiceId: number;
  invoiceNumber: string;
  supplierName: string;
  itemsCount: number;
  invoiceDate: string;
  duplicate: boolean;
};

export function saveViewerImport(v: ViewerImport): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function readViewerImport(): ViewerImport | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ViewerImport>;
    return typeof v.invoiceId === "number" ? (v as ViewerImport) : null;
  } catch {
    return null;
  }
}
