import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { db, posSalesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { toNum } from "../lib/parse";
import { periodFromQuery, previousPeriod, periodLabel, monthsInRange, type Period } from "../lib/period";
import { captureServer } from "../lib/telemetry";

// Sprzedaż per pozycja menu z POS (pos_sales) dla wybranego okresu, z porównaniem
// do poprzedniego równego okresu — zasila podstronę „Sprzedaż" (ile sztuk i za ile,
// vs poprzedni miesiąc). Źródło danych wypełnia sync GoPOS.
const router: IRouter = Router();

type Agg = { qty: number; net: number };

async function aggregate(userId: string, periods: string[]): Promise<Map<string, Agg>> {
  if (periods.length === 0) return new Map();
  const rows = await db
    .select({
      productName: posSalesTable.productName,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
    .groupBy(posSalesTable.productName);
  return new Map(rows.map((r) => [r.productName, { qty: toNum(r.qty), net: toNum(r.net) }]));
}

// Procentowa zmiana względem poprzedniego okresu. `null` = brak bazy porównania
// (pozycja nowa), a NIE „0%" — zero znaczyłoby „bez zmian", co byłoby kłamstwem.
function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export type SalesRow = {
  productName: string;
  qty: number;
  netValue: number;
  prevQty: number | null;
  prevNet: number | null;
  qtyChangePct: number | null;
  netChangePct: number | null;
};

async function buildSalesRows(userId: string, period: Period): Promise<{ items: SalesRow[]; prev: Period }> {
  const prev = previousPeriod(period);
  const [cur, prv] = await Promise.all([
    aggregate(userId, monthsInRange(period)),
    aggregate(userId, monthsInRange(prev)),
  ]);

  const names = new Set<string>([...cur.keys(), ...prv.keys()]);
  const items: SalesRow[] = [...names]
    .map((productName) => {
      const c = cur.get(productName) ?? { qty: 0, net: 0 };
      const p = prv.get(productName);
      return {
        productName,
        qty: c.qty,
        netValue: c.net,
        prevQty: p?.qty ?? null,
        prevNet: p?.net ?? null,
        qtyChangePct: changePct(c.qty, p?.qty),
        netChangePct: changePct(c.net, p?.net),
      };
    })
    // Sortowanie po WARTOŚCI, nie po ilości — pozycja sprzedana 300 razy po 4 zł
    // znaczy dla wyniku mniej niż 40 dań po 90 zł.
    .sort((a, b) => b.netValue - a.netValue);

  return { items, prev };
}

router.get("/sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const { items } = await buildSalesRows(userId, period);

  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalNet = items.reduce((s, i) => s + i.netValue, 0);
  const prevTotalQty = items.reduce((s, i) => s + (i.prevQty ?? 0), 0);
  const prevTotalNet = items.reduce((s, i) => s + (i.prevNet ?? 0), 0);

  res.json({
    from: period.from,
    to: period.to,
    totalQty,
    totalNet,
    prevTotalQty,
    prevTotalNet,
    totalQtyChangePct: changePct(totalQty, prevTotalQty),
    totalNetChangePct: changePct(totalNet, prevTotalNet),
    items,
  });
});

// ─── Historia jednej pozycji menu, miesiąc po miesiącu ────────────────────────
// Zasila wykres otwierany kliknięciem w wiersz. Osobny endpoint, bo lista zna
// tylko dwa okresy — tu chcemy pełny przebieg, żeby zobaczyć sezonowość.
router.get("/sales/trend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const productName = req.query.productName != null ? String(req.query.productName) : "";
  if (!productName.trim()) {
    res.status(400).json({ error: "Podaj productName" });
    return;
  }

  const monthsRaw = parseInt(String(req.query.months ?? ""), 10);
  const monthCount = Number.isFinite(monthsRaw) && monthsRaw >= 2 && monthsRaw <= 24 ? monthsRaw : 12;

  // Lista ostatnich N miesięcy — miesiąc BEZ sprzedaży ma pokazać zero, a nie
  // zniknąć z wykresu. Dziura w danych wyglądałaby jak ciągłość.
  const now = new Date();
  const periods: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const rows = await db
    .select({
      period: posSalesTable.period,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(
      and(
        eq(posSalesTable.userId, userId),
        eq(posSalesTable.productName, productName),
        inArray(posSalesTable.period, periods),
      ),
    )
    .groupBy(posSalesTable.period);

  const byPeriod = new Map(rows.map((r) => [r.period, { qty: toNum(r.qty), net: toNum(r.net) }]));

  res.json({
    productName,
    months: periods.map((month) => {
      const v = byPeriod.get(month);
      const qty = v?.qty ?? 0;
      const net = v?.net ?? 0;
      return {
        month,
        qty,
        netValue: net,
        // Średnia cena sprzedaży — kontekst do słupków ilości: pokazuje, czy
        // rośnie sprzedaż, czy tylko cena.
        avgPrice: qty > 0 ? Math.round((net / qty) * 100) / 100 : null,
      };
    }),
  });
});

// ─── Eksport Excel ────────────────────────────────────────────────────────────
// Formaty i układ celowo takie same jak w raporcie zakupów (`reports-workbook.ts`),
// żeby oba pliki wyglądały jak z jednego systemu.
const CUR = '#,##0.00" zł"';
const QTY = "#,##0.00";
const PCT = "+0.0%;-0.0%";
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

router.get("/sales.xlsx", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const { items, prev } = await buildSalesRows(userId, period);

  const label = periodLabel(period);
  const prevLabel = periodLabel(prev);

  const headers = [
    "Pozycja",
    "Sprzedano",
    `Sprzedano (${prevLabel})`,
    "Zmiana ilości",
    "Wartość netto",
    `Wartość netto (${prevLabel})`,
    "Zmiana wartości",
  ];
  const widths = [46, 12, 18, 14, 16, 20, 16];
  const nCols = headers.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Spendly";
  wb.created = new Date();
  const ws = wb.addWorksheet("Sprzedaż", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = widths.map((w) => ({ width: w }));
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: "3:3",
  };
  ws.headerFooter = { oddFooter: "&C&P / &N", evenFooter: "&C&P / &N" };

  const titleRow = ws.addRow([`Sprzedaż — ${label}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, nCols);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 22;

  // Kwoty NETTO — POS raportuje sprzedaż netto (`pos_sales.net_value`). To inna
  // podstawa niż wydatki z faktur (BRUTTO, reguła 29). Piszemy to na arkuszu,
  // żeby nikt nie zestawił tych dwóch liczb wprost ze sobą.
  const subRow = ws.addRow([`Kwoty netto ze sprzedaży POS · porównanie z okresem: ${prevLabel}`]);
  ws.mergeCells(subRow.number, 1, subRow.number, nCols);
  subRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  const header = ws.addRow(headers);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });

  if (items.length === 0) {
    const empty = ws.addRow([`Brak danych sprzedaży w okresie ${label}.`]);
    ws.mergeCells(empty.number, 1, empty.number, nCols);
    empty.getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
  }

  for (const it of items) {
    const row = ws.addRow([
      it.productName,
      round(it.qty, 2),
      it.prevQty != null ? round(it.prevQty, 2) : null,
      it.qtyChangePct != null ? round(it.qtyChangePct / 100, 6) : "nowa",
      round(it.netValue, 2),
      it.prevNet != null ? round(it.prevNet, 2) : null,
      it.netChangePct != null ? round(it.netChangePct / 100, 6) : "nowa",
    ]);
    row.getCell(2).numFmt = QTY;
    row.getCell(3).numFmt = QTY;
    row.getCell(4).numFmt = PCT;
    row.getCell(5).numFmt = CUR;
    row.getCell(6).numFmt = CUR;
    row.getCell(7).numFmt = PCT;
  }

  if (items.length > 0) {
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const prevQty = items.reduce((s, i) => s + (i.prevQty ?? 0), 0);
    const totalNet = items.reduce((s, i) => s + i.netValue, 0);
    const prevNet = items.reduce((s, i) => s + (i.prevNet ?? 0), 0);
    const sum = ws.addRow([
      "SUMA",
      round(totalQty, 2),
      round(prevQty, 2),
      prevQty > 0 ? round((totalQty - prevQty) / prevQty, 6) : null,
      round(totalNet, 2),
      round(prevNet, 2),
      prevNet > 0 ? round((totalNet - prevNet) / prevNet, 6) : null,
    ]);
    sum.eachCell({ includeEmpty: true }, (c) => {
      c.font = { bold: true };
      c.border = { top: { style: "thin", color: { argb: "FF1F2937" } } };
    });
    sum.getCell(2).numFmt = QTY;
    sum.getCell(3).numFmt = QTY;
    sum.getCell(4).numFmt = PCT;
    sum.getCell(5).numFmt = CUR;
    sum.getCell(6).numFmt = CUR;
    sum.getCell(7).numFmt = PCT;
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: nCols } };

  const buffer = await wb.xlsx.writeBuffer();
  captureServer(userId, "report_exported", { format: "xlsx", report: "sales" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sprzedaz-${period.from}_${period.to}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(Buffer.from(buffer));
});

export default router;
