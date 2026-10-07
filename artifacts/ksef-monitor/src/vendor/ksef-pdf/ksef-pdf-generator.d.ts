// Minimalne typy dla zbudowanego generatora MF (patrz README.md w tym katalogu).
export interface AdditionalDataTypes {
  nrKSeF: string;
  acDate?: string;
  qrCode?: string;
  qr2Code?: string;
  isMobile?: boolean;
  watermark?: string;
}
export function generateInvoice(file: File, additionalData: AdditionalDataTypes, formatType: "blob"): Promise<Blob>;
