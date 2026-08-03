import ExcelJS from "exceljs";

// #RRGGBB -> AARRGGBB (exceljs). Fallback szary, gdy kolor nietypowy.
function hexToArgb(hex: string | null | undefined): string {
  const h = (hex ?? "").replace(/[^0-9a-fA-F]/g, "");
  if (h.length !== 6) return "FF64748B";
  return "FF" + h.toUpperCase();
}

// Znormalizowany wiersz agregatu: grupa (centrum LUB dostawca) + produkt.
export type AggRow = {
  group_id: number | null;
  group_name: string | null;
  group_color: string | null;
  product_name: string;
  unit: string;
  qty: number;
  gross_total: number; // brutto = suma(total_price netto × (1+VAT))
};

export type Group = { id: number | null; name: string; color: string; rows: AggRow[] };

const CUR = '#,##0.00" zł"';
const QTY = "#,##0.00";
const QTY_DELTA = '+#,##0.00;-#,##0.00';
const PCT = "+0.0%;-0.0%";

export type Compare = {
  prevAvg: Map<string, number>;
  prevQty: Map<string, number>;
  prevGroupTotal: Map<string, number>;
};
type ColMap = {
  product: number; qty: number; unit: number; avg: number; value: number;
  pricePrev: number; priceDelta: number; pricePct: number;
  qtyPrev?: number; qtyDelta?: number;
};


// Buduje arkusz: tytuł + podtytuł, nagłówek kolumn (zamrożony), a potem grupy
// (centrum LUB dostawca) pod sobą: nagłówek grupy → produkty → wiersz SUMA.
// withQtyCompare dokłada kolumny porównania ILOŚCI do poprzedniego okresu
// (obok „Ilość"). Włączone w obu wariantach: wg centrów i per dostawca.
export function buildWorkbook(
  groups: Group[],
  cmp: Compare,
  withQtyCompare: boolean,
  opts: { sheetName: string; title: string; subtitle: string; emptyMsg: string },
): ExcelJS.Workbook {
  const headers = withQtyCompare
    ? ["Produkt", "Ilość", "Ilość poprz. okres", "Zmiana ilości", "Jedn.", "Śr. cena brutto", "Wartość brutto", "Śr. cena poprz. okres", "Zmiana", "Zmiana %"]
    : ["Produkt", "Ilość", "Jedn.", "Śr. cena brutto", "Wartość brutto", "Śr. cena poprz. okres", "Zmiana", "Zmiana %"];
  const widths = withQtyCompare
    ? [42, 11, 15, 13, 8, 15, 15, 18, 12, 10]
    : [42, 11, 8, 16, 16, 20, 13, 11];
  // Nazwane, 1-indeksowane kolumny — żeby nie pomylić pozycji.
  const C: ColMap = withQtyCompare
    ? { product: 1, qty: 2, qtyPrev: 3, qtyDelta: 4, unit: 5, avg: 6, value: 7, pricePrev: 8, priceDelta: 9, pricePct: 10 }
    : { product: 1, qty: 2, unit: 3, avg: 4, value: 5, pricePrev: 6, priceDelta: 7, pricePct: 8 };
  const nCols = headers.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Spendly";
  wb.created = new Date();
  const ws = wb.addWorksheet(opts.sheetName, { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = widths.map((w) => ({ width: w }));

  // Ustawienia druku (Ctrl+P w Excelu): poziomo, dopasowane do szerokości strony,
  // nagłówek kolumn (wiersz 3) powtarzany na każdej stronie, numeracja stron.
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: "3:3",
  };
  ws.headerFooter = { oddFooter: "&C&P / &N", evenFooter: "&C&P / &N" };

  const titleRow = ws.addRow([opts.title]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, nCols);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 22;

  const subRow = ws.addRow([opts.subtitle]);
  ws.mergeCells(subRow.number, 1, subRow.number, nCols);
  subRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  const header = ws.addRow(headers);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });

  for (const g of groups) {
    const gRow = ws.addRow([g.name.toUpperCase()]);
    ws.mergeCells(gRow.number, 1, gRow.number, nCols);
    const gc = gRow.getCell(1);
    gc.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexToArgb(g.color) } };
    gc.alignment = { vertical: "middle" };
    gRow.height = 18;

    let total = 0;
    const rows = [...g.rows].sort((a, b) => b.gross_total - a.gross_total);
    for (const r of rows) {
      const key = `${r.group_id ?? "null"}|${r.product_name}|${r.unit}`;
      const avg = r.qty > 0 ? r.gross_total / r.qty : 0;
      const prevA = cmp.prevAvg.get(key);
      const prevQ = cmp.prevQty.get(key);
      total += r.gross_total;

      const vals: (string | number | null)[] = new Array(nCols).fill(null);
      vals[C.product - 1] = r.product_name;
      vals[C.qty - 1] = r.qty;
      vals[C.unit - 1] = r.unit;
      vals[C.avg - 1] = avg;
      vals[C.value - 1] = r.gross_total;
      vals[C.pricePrev - 1] = prevA ?? null;
      vals[C.priceDelta - 1] = prevA != null ? avg - prevA : "nowy";
      vals[C.pricePct - 1] = prevA != null && prevA > 0 ? (avg - prevA) / prevA : null;
      if (withQtyCompare) {
        vals[C.qtyPrev! - 1] = prevQ ?? null;
        vals[C.qtyDelta! - 1] = prevQ != null ? r.qty - prevQ : null;
      }

      const dataRow = ws.addRow(vals);
      dataRow.getCell(C.qty).numFmt = QTY;
      dataRow.getCell(C.avg).numFmt = CUR;
      dataRow.getCell(C.value).numFmt = CUR;

      if (withQtyCompare) {
        dataRow.getCell(C.qtyPrev!).numFmt = QTY;
        dataRow.getCell(C.qtyDelta!).numFmt = QTY_DELTA;
        if (prevQ == null) {
          // Produkt nie kupowany w poprzednim miesiącu — brak porównania ilości.
          dataRow.getCell(C.qtyPrev!).value = "—";
          dataRow.getCell(C.qtyPrev!).alignment = { horizontal: "right" };
          dataRow.getCell(C.qtyPrev!).font = { color: { argb: "FF94A3B8" } };
        }
      }

      if (prevA != null) {
        dataRow.getCell(C.pricePrev).numFmt = CUR;
        dataRow.getCell(C.priceDelta).numFmt = CUR;
        dataRow.getCell(C.pricePct).numFmt = PCT;
        const delta = avg - prevA;
        const color = delta > 0 ? "FFDC2626" : delta < 0 ? "FF16A34A" : "FF64748B";
        dataRow.getCell(C.priceDelta).font = { color: { argb: color } };
        dataRow.getCell(C.pricePct).font = { color: { argb: color } };
      } else {
        dataRow.getCell(C.priceDelta).font = { italic: true, color: { argb: "FF94A3B8" } };
        dataRow.getCell(C.priceDelta).alignment = { horizontal: "right" };
      }
    }

    const sumVals: (string | number | null)[] = new Array(nCols).fill(null);
    sumVals[0] = `Suma — ${g.name}`;
    sumVals[C.value - 1] = total;
    // Porównanie SUMY do poprzedniego miesiąca (kolumny „poprz."/„zmiana"/„%").
    const prevTotal = cmp.prevGroupTotal.get(String(g.id ?? "null"));
    if (prevTotal != null) {
      sumVals[C.pricePrev - 1] = prevTotal;
      sumVals[C.priceDelta - 1] = total - prevTotal;
      sumVals[C.pricePct - 1] = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;
    }
    const sumRow = ws.addRow(sumVals);
    sumRow.getCell(1).font = { bold: true };
    sumRow.getCell(C.value).numFmt = CUR;
    sumRow.getCell(C.value).font = { bold: true };
    if (prevTotal != null) {
      sumRow.getCell(C.pricePrev).numFmt = CUR;
      sumRow.getCell(C.priceDelta).numFmt = CUR;
      sumRow.getCell(C.pricePct).numFmt = PCT;
      const d = total - prevTotal;
      const col = d > 0 ? "FFDC2626" : d < 0 ? "FF16A34A" : "FF64748B";
      sumRow.getCell(C.pricePrev).font = { bold: true };
      sumRow.getCell(C.priceDelta).font = { bold: true, color: { argb: col } };
      sumRow.getCell(C.pricePct).font = { bold: true, color: { argb: col } };
    }
    sumRow.eachCell((c) => {
      c.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });
    ws.addRow([]);
  }

  if (groups.length === 0) ws.addRow([opts.emptyMsg]);
  return wb;
}
