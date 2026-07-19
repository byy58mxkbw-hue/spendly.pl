// Regexowy parser faktury KSeF FA (import ręczny). BEZ DOM — nie rozwija encji
// (XXE-safe by design); guard na DOCTYPE/ENTITY i tak jest w route importu (rule 23).
// Wydzielony z routes/invoices.ts — ciała 1:1, zero zmiany zachowania.

export type ParsedInvoiceItem = {
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  vatRate: number | null;
};

export type ParsedInvoice = {
  items: ParsedInvoiceItem[];
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalGross: number | null;
  invoiceType: string | null;
  correctedInvoiceNumber: string | null;
};

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseNum(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}

export function parseKSeFXml(xml: string): ParsedInvoice {
  const items: ParsedInvoiceItem[] = [];

  const stripped = xml.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "").replace(/<(\w+):/g, "<").replace(/<\/(\w+):/g, "</");

  const invoiceNumber = extractTag(stripped, "P_2") ?? extractTag(stripped, "NrFa");
  const rawDate = extractTag(stripped, "P_1") ?? extractTag(stripped, "DataWystawienia");
  let invoiceDate: string | null = null;
  if (rawDate) {
    const d = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      invoiceDate = d;
    } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split(".");
      invoiceDate = `${yyyy}-${mm}-${dd}`;
    }
  }
  const totalGrossRaw = extractTag(stripped, "P_15") ?? extractTag(stripped, "WartoscBrutto");
  const totalGross = totalGrossRaw ? parseNum(totalGrossRaw) : null;
  const totalNetRaw = extractTag(stripped, "P_13_1");
  const totalNet = totalNetRaw ? parseNum(totalNetRaw) : null;
  const invoiceType = extractTag(stripped, "RodzajFaktury")?.trim().toUpperCase() ?? null;

  // Extract corrected invoice number from KOR (correction) invoices.
  // In KSeF FA(3) XML the corrected invoice number lives inside <FaKorygowana>
  // as <NrFaKorygowanej> or as the P_3C field.
  const correctedInvoiceNumber =
    extractTag(stripped, "NrFaKorygowanej") ??
    extractTag(stripped, "P_3C") ??
    null;

  const headerIsNegative =
    invoiceType === "KOR" &&
    ((totalNet != null && totalNet < 0) || (totalGross != null && totalGross < 0));

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

    const baseQty = qty || 1;
    const baseTotal = total || unitPrice * baseQty;
    items.push({
      productName: name,
      quantity: baseQty,
      unit,
      unitPrice,
      totalPrice: baseTotal,
      vatRate,
    });
  }

  if (items.length === 0) {
    const pozRegex = /<P_7>([\s\S]*?)<\/P_7>[\s\S]*?<P_8A>([\s\S]*?)<\/P_8A>[\s\S]*?<P_8B>([\s\S]*?)<\/P_8B>[\s\S]*?<P_9A>([\s\S]*?)<\/P_9A>[\s\S]*?<P_11>([\s\S]*?)<\/P_11>/g;
    let m: RegExpExecArray | null;
    while ((m = pozRegex.exec(stripped)) !== null) {
      const qty = parseNum(m[3]);
      const unitPrice = parseNum(m[4]);
      const total = parseNum(m[5]);
      const baseQty = qty || 1;
      const baseTotal = total || unitPrice * baseQty;
      items.push({
        productName: m[1].trim(),
        quantity: baseQty,
        unit: m[2].trim() || "szt",
        unitPrice,
        totalPrice: baseTotal,
        vatRate: null,
      });
    }
  }

  const linesAlreadyNegative = items.some((it) => it.totalPrice < 0 || it.quantity < 0);
  if (headerIsNegative && !linesAlreadyNegative) {
    for (const it of items) {
      it.quantity = -it.quantity;
      it.totalPrice = -it.totalPrice;
    }
  }

  return { items, invoiceNumber: invoiceNumber?.trim() ?? null, invoiceDate, totalGross, invoiceType, correctedInvoiceNumber: correctedInvoiceNumber?.trim() ?? null };
}
