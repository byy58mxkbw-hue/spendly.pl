import ExcelJS from "exceljs";

// #RRGGBB -> AARRGGBB (exceljs). Fallback szary, gdy kolor nietypowy.
// Zaokrąglenie do n miejsc — chroni przed artefaktami float w porównaniach
// (np. 26,64 − 26,64 = 3,55e-15, co Excel pokazuje w notacji naukowej).
function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// Kolejność produktów w grupie: blokami jednostek (kg razem, szt razem…),
// bloki wg wartości zakupów, a wewnątrz bloku od największej ILOŚCI.
// Dzięki temu 200 kg mięsa nie miesza się z 6 kartonami.
function sortRowsByUnitThenQty(rows: AggRow[]): AggRow[] {
  const unitKey = (u: string) => (u ?? "").trim().toLowerCase();
  const unitValue = new Map<string, number>();
  for (const r of rows) {
    const k = unitKey(r.unit);
    unitValue.set(k, (unitValue.get(k) ?? 0) + r.gross_total);
  }
  return [...rows].sort((a, b) => {
    const ka = unitKey(a.unit);
    const kb = unitKey(b.unit);
    if (ka !== kb) {
      const d = (unitValue.get(kb) ?? 0) - (unitValue.get(ka) ?? 0);
      return d !== 0 ? d : ka.localeCompare(kb, "pl");
    }
    return b.qty - a.qty;
  });
}

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
    const rows = sortRowsByUnitThenQty(g.rows);
    let prevUnit: string | null = null;
    for (const r of rows) {
      const key = `${r.group_id ?? "null"}|${r.product_name}|${r.unit}`;
      // Wszystko zaokrąglone PRZED porównaniem — inaczej float daje śmieci
      // typu 3,55271E-15 zamiast zera i czerwone „+0,0%" przy braku zmiany.
      const qty = round(r.qty, 3);
      const avg = r.qty > 0 ? round(r.gross_total / r.qty, 2) : 0;
      const prevARaw = cmp.prevAvg.get(key);
      const prevA = prevARaw != null ? round(prevARaw, 2) : undefined;
      const prevQRaw = cmp.prevQty.get(key);
      const prevQ = prevQRaw != null ? round(prevQRaw, 3) : undefined;
      const priceDelta = prevA != null ? round(avg - prevA, 2) : null;
      total += r.gross_total;

      const vals: (string | number | null)[] = new Array(nCols).fill(null);
      vals[C.product - 1] = r.product_name;
      vals[C.qty - 1] = qty;
      vals[C.unit - 1] = r.unit;
      vals[C.avg - 1] = avg;
      vals[C.value - 1] = round(r.gross_total, 2);
      vals[C.pricePrev - 1] = prevA ?? null;
      vals[C.priceDelta - 1] = priceDelta ?? "nowy";
      vals[C.pricePct - 1] = prevA != null && prevA > 0 ? round(priceDelta! / prevA, 6) : null;
      if (withQtyCompare) {
        vals[C.qtyPrev! - 1] = prevQ ?? null;
        vals[C.qtyDelta! - 1] = prevQ != null ? round(qty - prevQ, 3) : null;
      }

      const dataRow = ws.addRow(vals);
      // Cienka linia w miejscu zmiany jednostki — oddziela bloki kg / szt / krt
      // bez pustych wierszy (te psułyby filtrowanie i sumy w Excelu).
      const unitNow = (r.unit ?? "").trim().toLowerCase();
      if (prevUnit !== null && unitNow !== prevUnit) {
        dataRow.eachCell({ includeEmpty: true }, (c) => {
          c.border = { top: { style: "hair", color: { argb: "FFE2E8F0" } } };
        });
      }
      prevUnit = unitNow;
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
        const color = priceDelta! > 0 ? "FFDC2626" : priceDelta! < 0 ? "FF16A34A" : "FF64748B";
        dataRow.getCell(C.priceDelta).font = { color: { argb: color } };
        dataRow.getCell(C.pricePct).font = { color: { argb: color } };
      } else {
        dataRow.getCell(C.priceDelta).font = { italic: true, color: { argb: "FF94A3B8" } };
        dataRow.getCell(C.priceDelta).alignment = { horizontal: "right" };
      }
    }

    const sumVals: (string | number | null)[] = new Array(nCols).fill(null);
    const totalR = round(total, 2);
    sumVals[0] = `Suma — ${g.name}`;
    sumVals[C.value - 1] = totalR;
    // Porównanie SUMY do poprzedniego okresu (kolumny „poprz."/„zmiana"/„%").
    const prevTotalRaw = cmp.prevGroupTotal.get(String(g.id ?? "null"));
    const prevTotal = prevTotalRaw != null ? round(prevTotalRaw, 2) : undefined;
    const sumDelta = prevTotal != null ? round(totalR - prevTotal, 2) : null;
    if (prevTotal != null) {
      sumVals[C.pricePrev - 1] = prevTotal;
      sumVals[C.priceDelta - 1] = sumDelta;
      sumVals[C.pricePct - 1] = prevTotal > 0 ? round(sumDelta! / prevTotal, 6) : null;
    }
    const sumRow = ws.addRow(sumVals);
    sumRow.getCell(1).font = { bold: true };
    sumRow.getCell(C.value).numFmt = CUR;
    sumRow.getCell(C.value).font = { bold: true };
    if (prevTotal != null) {
      sumRow.getCell(C.pricePrev).numFmt = CUR;
      sumRow.getCell(C.priceDelta).numFmt = CUR;
      sumRow.getCell(C.pricePct).numFmt = PCT;
      const col = sumDelta! > 0 ? "FFDC2626" : sumDelta! < 0 ? "FF16A34A" : "FF64748B";
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
