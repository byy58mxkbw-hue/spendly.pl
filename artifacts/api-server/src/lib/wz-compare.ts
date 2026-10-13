import { normalizeForMatch } from "@workspace/category-rules";
import { normalizeUnit } from "./units.js";

// Porównanie pozycji z WZ (wydanie zewnętrzne, odczytane OCR) z pozycjami faktury.
// Cel: wyłapać różnice dostawy — towar zafakturowany, a nie wydany (albo w innej ilości).
// Nazwy na WZ i na fakturze tego samego dostawcy są zwykle niemal identyczne (ten sam
// system magazynowy), więc wystarcza dopasowanie po wspólnych słowach — bez AI.

export type WzLine = { productName: string; quantity: number; unit: string };
export type InvoiceLine = { productName: string; quantity: number; unit: string };

export type WzCompareRow = {
  invoiceName: string;
  invoiceQuantity: number;
  unit: string;
  wzName: string | null;
  wzQuantity: number | null;
  difference: number | null;
  status: "ok" | "difference" | "missing_on_wz" | "unit_mismatch";
};

export type WzCompareResult = {
  rows: WzCompareRow[];
  /** Pozycje z WZ, których nie ma na fakturze. */
  notInvoiced: WzLine[];
  summary: { ok: number; differences: number; missingOnWz: number; notInvoiced: number };
};

const STOP = new Set(["szt", "kg", "op", "opak", "kart", "x", "l", "g", "ml", "i", "z", "w", "na", "do"]);

function tokens(name: string): Set<string> {
  return new Set(
    normalizeForMatch(name)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 2 && !STOP.has(t)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / Math.min(a.size, b.size) * (common / Math.max(a.size, b.size)) ** 0.25;
}

const MATCH_THRESHOLD = 0.5;
/** Różnica ilości poniżej tej części (0,5%) albo 0,01 j. to zaokrąglenia, nie brak. */
const QTY_TOLERANCE = 0.005;

export function compareWzWithInvoice(invoice: InvoiceLine[], wz: WzLine[]): WzCompareResult {
  const inv = invoice.map((l) => ({ ...l, unitN: normalizeUnit(l.unit), tok: tokens(l.productName) }));
  const wzl = wz
    .filter((l) => l.productName && Number.isFinite(l.quantity))
    .map((l) => ({ ...l, unitN: normalizeUnit(l.unit), tok: tokens(l.productName), used: false }));

  // Zachłannie: najpierw najlepsze pary (nazwa), każda linia WZ trafia do jednej pozycji
  // faktury, ale jedna pozycja faktury może zebrać kilka linii WZ (kilka dostaw).
  const pairs: Array<{ i: number; w: number; s: number }> = [];
  inv.forEach((a, i) => wzl.forEach((b, w) => {
    const s = similarity(a.tok, b.tok);
    if (s >= MATCH_THRESHOLD) pairs.push({ i, w, s });
  }));
  pairs.sort((x, y) => y.s - x.s);
  const matched = new Map<number, number[]>();
  for (const p of pairs) {
    if (wzl[p.w]!.used) continue;
    wzl[p.w]!.used = true;
    matched.set(p.i, [...(matched.get(p.i) ?? []), p.w]);
  }

  const rows: WzCompareRow[] = inv.map((a, i) => {
    const ws = (matched.get(i) ?? []).map((w) => wzl[w]!);
    if (ws.length === 0) {
      return { invoiceName: a.productName, invoiceQuantity: a.quantity, unit: a.unit, wzName: null, wzQuantity: null, difference: null, status: "missing_on_wz" };
    }
    if (ws.some((w) => w.unitN && a.unitN && w.unitN !== a.unitN)) {
      const w0 = ws[0]!;
      return { invoiceName: a.productName, invoiceQuantity: a.quantity, unit: a.unit, wzName: w0.productName, wzQuantity: ws.reduce((s, w) => s + w.quantity, 0), difference: null, status: "unit_mismatch" };
    }
    const wzQty = ws.reduce((s, w) => s + w.quantity, 0);
    const diff = wzQty - a.quantity;
    const ok = Math.abs(diff) <= Math.max(0.01, Math.abs(a.quantity) * QTY_TOLERANCE);
    return {
      invoiceName: a.productName,
      invoiceQuantity: a.quantity,
      unit: a.unit,
      wzName: ws.map((w) => w.productName).join(" + "),
      wzQuantity: wzQty,
      difference: ok ? 0 : Math.round(diff * 1000) / 1000,
      status: ok ? "ok" : "difference",
    };
  });

  const notInvoiced = wzl.filter((w) => !w.used).map(({ productName, quantity, unit }) => ({ productName, quantity, unit }));
  return {
    rows,
    notInvoiced,
    summary: {
      ok: rows.filter((r) => r.status === "ok").length,
      differences: rows.filter((r) => r.status === "difference" || r.status === "unit_mismatch").length,
      missingOnWz: rows.filter((r) => r.status === "missing_on_wz").length,
      notInvoiced: notInvoiced.length,
    },
  };
}
