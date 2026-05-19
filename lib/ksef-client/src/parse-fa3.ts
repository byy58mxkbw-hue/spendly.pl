import { z } from "zod";
import { KsefParseError } from "./errors";

export const ParsedFa3ItemSchema = z.object({
  name: z.string(),
  gtin: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number(),
  net: z.number(),
  vatRate: z.number().nullable(),
  gross: z.number(),
});

export const ParsedFa3HeaderSchema = z.object({
  ksefNumber: z.string().nullable(),
  sellerNip: z.string().nullable(),
  sellerName: z.string().nullable(),
  buyerNip: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  totalNet: z.number().nullable(),
  totalGross: z.number().nullable(),
});

export const ParsedFa3Schema = z.object({
  header: ParsedFa3HeaderSchema,
  items: z.array(ParsedFa3ItemSchema),
});

export type ParsedFa3Item = z.infer<typeof ParsedFa3ItemSchema>;
export type ParsedFa3Header = z.infer<typeof ParsedFa3HeaderSchema>;
export type ParsedFa3 = z.infer<typeof ParsedFa3Schema>;

function stripNamespaces(xml: string): string {
  return xml
    .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "")
    .replace(/<(\w+):/g, "<")
    .replace(/<\/(\w+):/g, "</");
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function parseNum(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".").replace(/\s/g, "")) || 0;
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split(".");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Parse a KSeF FA(3) / FA(2) invoice XML into a normalized object.
 *
 * The parser is resilient to namespace prefixes. It supports both modern
 * FA(3) with <Fa><Podmiot1>/<Podmiot2>/<FaWiersz> structure as well as legacy
 * flat layouts.
 */
export function parseFA3Xml(xml: string, ksefNumber: string | null = null): ParsedFa3 {
  try {
    const stripped = stripNamespaces(xml);

    // Seller (Podmiot1) and buyer (Podmiot2)
    const podmiot1 = stripped.match(/<Podmiot1>([\s\S]*?)<\/Podmiot1>/i)?.[1] ?? "";
    const podmiot2 = stripped.match(/<Podmiot2>([\s\S]*?)<\/Podmiot2>/i)?.[1] ?? "";

    const sellerNip = (extractTag(podmiot1, "NIP") ?? extractTag(stripped, "NIP"))?.replace(/\D/g, "") || null;
    const sellerName = extractTag(podmiot1, "Nazwa") ?? extractTag(podmiot1, "PelnaNazwa") ?? null;
    const buyerNip = extractTag(podmiot2, "NIP")?.replace(/\D/g, "") || null;

    const invoiceNumber = extractTag(stripped, "P_2") ?? extractTag(stripped, "NrFa");
    const invoiceDate = normalizeDate(extractTag(stripped, "P_1") ?? extractTag(stripped, "DataWystawienia"));

    const totalNetRaw = extractTag(stripped, "P_13_1") ?? extractTag(stripped, "WartoscNetto");
    const totalGrossRaw = extractTag(stripped, "P_15") ?? extractTag(stripped, "WartoscBrutto");
    const totalNet = totalNetRaw ? parseNum(totalNetRaw) : null;
    const totalGross = totalGrossRaw ? parseNum(totalGrossRaw) : null;

    const items: ParsedFa3Item[] = [];
    const wierszeRe = /<FaWiersz>([\s\S]*?)<\/FaWiersz>/g;
    let m: RegExpExecArray | null;
    while ((m = wierszeRe.exec(stripped)) !== null) {
      const block = m[1];
      const name = extractTag(block, "P_7");
      if (!name) continue;
      const gtin = extractTag(block, "GTIN") ?? extractTag(block, "P_6A");
      const unit = extractTag(block, "P_8A") ?? "szt";
      const qty = parseNum(extractTag(block, "P_8B")) || 1;
      const unitPrice = parseNum(extractTag(block, "P_9A") ?? extractTag(block, "P_9B"));
      const net = parseNum(extractTag(block, "P_11") ?? extractTag(block, "P_11A")) || unitPrice * qty;
      const vatRaw = extractTag(block, "P_12");
      const vatRate = vatRaw && /^\d+(\.\d+)?$/.test(vatRaw.trim()) ? parseFloat(vatRaw.trim()) : null;
      const grossRaw = extractTag(block, "P_11B");
      const gross = grossRaw ? parseNum(grossRaw) : (vatRate != null ? net * (1 + vatRate / 100) : net);

      items.push({ name, gtin: gtin?.trim() || null, quantity: qty, unit, unitPrice, net, vatRate, gross });
    }

    return ParsedFa3Schema.parse({
      header: {
        ksefNumber,
        sellerNip,
        sellerName,
        buyerNip,
        invoiceNumber: invoiceNumber?.trim() ?? null,
        invoiceDate,
        totalNet,
        totalGross,
      },
      items,
    });
  } catch (err) {
    if (err instanceof KsefParseError) throw err;
    throw new KsefParseError(`Nie udało się zparsować XML FA(3): ${(err as Error).message}`, err);
  }
}
