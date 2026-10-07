import { parseFA3Xml, type ParsedFa3 } from "@workspace/ksef-xml";

// Czytanie faktury KSeF z pliku XML w PRZEGLĄDARCE (podgląd przed rejestracją).
// Nic nie idzie na serwer — ten sam parser co API (@workspace/ksef-xml).

export const MAX_XML_BYTES = 5 * 1024 * 1024;

export type ViewerErrorReason = "not_xml" | "too_large" | "dtd" | "not_invoice" | "parse" | "read";

export type ViewerResult =
  | { ok: true; xml: string; fileName: string; schema: "FA1" | "FA2" | "FA3" | "FA"; invoice: ParsedFa3 }
  | { ok: false; reason: ViewerErrorReason; message: string };

const MESSAGES: Record<ViewerErrorReason, string> = {
  not_xml: "To nie jest plik XML. Wybierz plik faktury z końcówką .xml.",
  too_large: "Plik jest za duży. Faktura XML z KSeF ma zwykle kilkadziesiąt kilobajtów, a limit to 5 MB.",
  dtd: "Ten plik zawiera deklarację DOCTYPE/ENTITY, której faktury KSeF nie mają. Ze względów bezpieczeństwa go nie otworzymy.",
  not_invoice: "To nie wygląda na fakturę z KSeF. Sprawdź, czy wybierasz plik faktury, a nie np. UPO.",
  parse: "Nie udało się odczytać tej faktury. Jeśli to plik z KSeF, napisz do nas: kontakt@spendly.pl.",
  read: "Nie udało się wczytać pliku. Spróbuj jeszcze raz.",
};

const fail = (reason: ViewerErrorReason): ViewerResult => ({ ok: false, reason, message: MESSAGES[reason] });

function detectSchema(xml: string): "FA1" | "FA2" | "FA3" | "FA" {
  const m = xml.match(/kodSystemowy\s*=\s*"FA\s*\((\d)\)"/i);
  if (m?.[1] === "3") return "FA3";
  if (m?.[1] === "2") return "FA2";
  if (m?.[1] === "1") return "FA1";
  return "FA";
}

/** Parsuje treść XML (bez File API) — wydzielone, żeby dało się testować. */
export function readInvoiceXml(xml: string, fileName: string): ViewerResult {
  // Ten sam warunek co parseFA3Xml i import ręczny (reguła 23) — odrzucamy już tutaj.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return fail("dtd");
  if (!/<(?:\w+:)?Faktura[\s>]/.test(xml)) return fail("not_invoice");
  let invoice: ParsedFa3;
  try {
    invoice = parseFA3Xml(xml);
  } catch {
    return fail("parse");
  }
  if (invoice.items.length === 0 && !invoice.header.totalGross) return fail("not_invoice");
  return { ok: true, xml, fileName, schema: detectSchema(xml), invoice };
}

export async function readInvoiceFile(file: File): Promise<ViewerResult> {
  const isXml = /\.xml$/i.test(file.name) || /xml/i.test(file.type);
  if (!isXml) return fail("not_xml");
  if (file.size > MAX_XML_BYTES) return fail("too_large");
  let xml: string;
  try {
    xml = await file.text();
  } catch {
    return fail("read");
  }
  return readInvoiceXml(xml, file.name);
}
