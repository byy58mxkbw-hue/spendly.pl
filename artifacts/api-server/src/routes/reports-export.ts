import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { periodFromQuery, previousPeriod, periodLabel, type Period } from "../lib/period";

const router: IRouter = Router();

// #RRGGBB -> AARRGGBB (exceljs). Fallback szary, gdy kolor nietypowy.
function hexToArgb(hex: string | null | undefined): string {
  const h = (hex ?? "").replace(/[^0-9a-fA-F]/g, "");
  if (h.length !== 6) return "FF64748B";
  return "FF" + h.toUpperCase();
}

// Znormalizowany wiersz agregatu: grupa (centrum LUB dostawca) + produkt.
type AggRow = {
  group_id: number | null;
  group_name: string | null;
  group_color: string | null;
  product_name: string;
  unit: string;
  qty: number;
  gross_total: number; // brutto = suma(total_price netto × (1+VAT))
};

// Tryb ogólny: agregacja per (centrum kosztów, produkt, jednostka) w okresie [from, to].
async function fetchByCostCenter(userId: string, p: Period): Promise<AggRow[]> {
  const result = await db.execute(sql`
    SELECT i.cost_center_id AS group_id,
           cc.name AS group_name,
           cc.color AS group_color,
           ii.product_name,
           ii.unit,
           SUM(ii.quantity::numeric)::float AS qty,
           SUM(ii.total_price::numeric * (1 + COALESCE(ii.vat_rate, 0) / 100))::float AS gross_total
    FROM invoices i
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    LEFT JOIN cost_centers cc ON cc.id = i.cost_center_id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      AND i.invoice_date >= ${p.from} AND i.invoice_date <= ${p.to}
    GROUP BY 1, 2, 3, 4, 5
  `);
  return result.rows as AggRow[];
}

// Tryb pojedynczego centrum: agregacja per (dostawca, produkt, jednostka) w okresie,
// zawężona do wybranego centrum kosztów. Kolor grupy = kolor centrum (dodany w JS).
async function fetchBySupplier(userId: string, p: Period, costCenterId: number): Promise<AggRow[]> {
  const result = await db.execute(sql`
    SELECT i.supplier_id AS group_id,
           s.name AS group_name,
           NULL::text AS group_color,
           ii.product_name,
           ii.unit,
           SUM(ii.quantity::numeric)::float AS qty,
           SUM(ii.total_price::numeric * (1 + COALESCE(ii.vat_rate, 0) / 100))::float AS gross_total
    FROM invoices i
    INNER JOIN invoice_items ii ON ii.invoice_id = i.id
    INNER JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.user_id = ${userId}
      AND i.excluded = false
      AND i.invoice_date >= ${p.from} AND i.invoice_date <= ${p.to}
      AND i.cost_center_id = ${costCenterId}
    GROUP BY 1, 2, 4, 5
  `);
  return result.rows as AggRow[];
}

type Group = { id: number | null; name: string; color: string; rows: AggRow[] };

function buildGroups(rows: AggRow[], fallbackName: string, colorOverride?: string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = String(r.group_id ?? "null");
    let g = map.get(key);
    if (!g) {
      g = {
        id: r.group_id,
        name: r.group_name ?? fallbackName,
        color: colorOverride ?? r.group_color ?? "#64748B",
        rows: [],
      };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  // Grupy alfabetycznie, null (np. „bez centrum") na końcu.
  return [...map.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.name.localeCompare(b.name, "pl");
  });
}

// Buduje mapę `groupId|produkt|jednostka` → wartość (śr. cena lub ilość) z wierszy.
function indexBy(rows: AggRow[], value: (r: AggRow) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.qty > 0) m.set(`${r.group_id ?? "null"}|${r.product_name}|${r.unit}`, value(r));
  }
  return m;
}

// Suma wartości brutto per grupa (groupId) — do porównania SUMA z poprz. miesiącem.
function groupTotals(rows: AggRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.group_id ?? "null");
    m.set(k, (m.get(k) ?? 0) + r.gross_total);
  }
  return m;
}

const CUR = '#,##0.00" zł"';
const QTY = "#,##0.00";
const QTY_DELTA = '+#,##0.00;-#,##0.00';
const PCT = "+0.0%;-0.0%";

type Compare = {
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
// withQtyCompare (tryb szczegółowy per dostawca) dokłada kolumny porównania ILOŚCI
// do poprzedniego miesiąca. Ogólny raport wg centrów zostaje bez tych kolumn.
function buildWorkbook(
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

router.get("/reports/products-by-cost-center.xlsx", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const prev = previousPeriod(period);
  const label = periodLabel(period);
  const prevLabel = periodLabel(prev);
  const sheetName = `Zakupy ${period.from}`;

  const ccRaw = req.query.costCenterId;
  const costCenterId = ccRaw != null && ccRaw !== "" ? parseInt(String(ccRaw), 10) : null;
  const singleMode = costCenterId != null && !isNaN(costCenterId);

  let groups: Group[];
  let cmp: Compare;
  let opts: { sheetName: string; title: string; subtitle: string; emptyMsg: string };

  if (singleMode) {
    // Nazwa/kolor centrum (tenant-safe: tylko z danych usera).
    const ccRes = await db.execute(sql`
      SELECT name, color FROM cost_centers WHERE id = ${costCenterId} AND user_id = ${userId} LIMIT 1
    `);
    const cc = ccRes.rows[0] as { name: string; color: string } | undefined;
    const ccName = cc?.name ?? "Centrum kosztów";
    const ccColor = cc?.color ?? "#14B8A6";

    const [curr, prevRows] = await Promise.all([
      fetchBySupplier(userId, period, costCenterId!),
      fetchBySupplier(userId, prev, costCenterId!),
    ]);
    cmp = {
      prevAvg: indexBy(prevRows, (r) => r.gross_total / r.qty),
      prevQty: indexBy(prevRows, (r) => r.qty),
      prevGroupTotal: groupTotals(prevRows),
    };
    groups = buildGroups(curr, "Nieznany dostawca", ccColor);
    opts = {
      sheetName,
      title: `Zakupy — ${ccName} wg dostawców — ${label}`,
      subtitle: `Ceny brutto · porównanie cen i ilości z: ${prevLabel}`,
      emptyMsg: `Brak zakupów dla „${ccName}" w okresie ${label}.`,
    };
    const wb = buildWorkbook(groups, cmp, true, opts);
    await send(res, wb, period);
    return;
  }

  const [curr, prevRows] = await Promise.all([
    fetchByCostCenter(userId, period),
    fetchByCostCenter(userId, prev),
  ]);
  cmp = {
    prevAvg: indexBy(prevRows, (r) => r.gross_total / r.qty),
    prevQty: indexBy(prevRows, (r) => r.qty),
    prevGroupTotal: groupTotals(prevRows),
  };
  groups = buildGroups(curr, "Bez centrum kosztów");
  opts = {
    sheetName,
    title: `Zakupy wg centrów kosztów — ${label}`,
    subtitle: `Ceny brutto · porównanie z: ${prevLabel}`,
    emptyMsg: `Brak zakupów w okresie ${label}.`,
  };
  const wb = buildWorkbook(groups, cmp, false, opts);
  await send(res, wb, period);
});

async function send(res: import("express").Response, wb: ExcelJS.Workbook, period: Period): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="raport-zakupy-${period.from}_${period.to}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(Buffer.from(buffer));
}

export default router;
