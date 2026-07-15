import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";

const router: IRouter = Router();

// YYYY-MM przesunięte o n miesięcy wstecz (jak w reports.ts).
function monthMinus(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const PL_MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];
function monthLabelPl(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${PL_MONTHS[m - 1]} ${y}`;
}

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

// Tryb ogólny: agregacja per (centrum kosztów, produkt, jednostka).
async function fetchByCostCenter(userId: string, month: string): Promise<AggRow[]> {
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
      AND i.invoice_date LIKE ${month + "-%"}
    GROUP BY 1, 2, 3, 4, 5
  `);
  return result.rows as AggRow[];
}

// Tryb pojedynczego centrum: agregacja per (dostawca, produkt, jednostka),
// zawężona do wybranego centrum kosztów. Kolor grupy = kolor centrum (dodany w JS).
async function fetchBySupplier(userId: string, month: string, costCenterId: number): Promise<AggRow[]> {
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
      AND i.invoice_date LIKE ${month + "-%"}
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

const CUR = '#,##0.00" zł"';
const QTY = "#,##0.00";
const PCT = "+0.0%;-0.0%";
const HEADERS = [
  "Produkt", "Ilość", "Jedn.", "Śr. cena brutto",
  "Wartość brutto", "Śr. cena poprz. mies.", "Zmiana", "Zmiana %",
];

// Buduje arkusz: tytuł + podtytuł, nagłówek kolumn (zamrożony), a potem grupy
// (centrum LUB dostawca) pod sobą: nagłówek grupy → produkty → wiersz SUMA.
// prevAvg: mapa `groupId|produkt|jednostka` → śr. cena brutto z poprz. miesiąca.
function buildWorkbook(
  groups: Group[],
  prevAvg: Map<string, number>,
  opts: { sheetName: string; title: string; subtitle: string; emptyMsg: string },
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Spendly";
  wb.created = new Date();
  const ws = wb.addWorksheet(opts.sheetName, { views: [{ state: "frozen", ySplit: 3 }] });

  ws.columns = [
    { width: 42 }, { width: 11 }, { width: 8 }, { width: 16 },
    { width: 16 }, { width: 20 }, { width: 13 }, { width: 11 },
  ];

  const titleRow = ws.addRow([opts.title]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, HEADERS.length);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 22;

  const subRow = ws.addRow([opts.subtitle]);
  ws.mergeCells(subRow.number, 1, subRow.number, HEADERS.length);
  subRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  const header = ws.addRow(HEADERS);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });

  for (const g of groups) {
    const gRow = ws.addRow([g.name.toUpperCase()]);
    ws.mergeCells(gRow.number, 1, gRow.number, HEADERS.length);
    const gc = gRow.getCell(1);
    gc.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexToArgb(g.color) } };
    gc.alignment = { vertical: "middle" };
    gRow.height = 18;

    let total = 0;
    const rows = [...g.rows].sort((a, b) => b.gross_total - a.gross_total);
    for (const r of rows) {
      const avg = r.qty > 0 ? r.gross_total / r.qty : 0;
      const prevA = prevAvg.get(`${r.group_id ?? "null"}|${r.product_name}|${r.unit}`);
      total += r.gross_total;

      const dataRow = ws.addRow([
        r.product_name,
        r.qty,
        r.unit,
        avg,
        r.gross_total,
        prevA ?? null,
        prevA != null ? avg - prevA : "nowy",
        prevA != null && prevA > 0 ? (avg - prevA) / prevA : null,
      ]);
      dataRow.getCell(2).numFmt = QTY;
      dataRow.getCell(4).numFmt = CUR;
      dataRow.getCell(5).numFmt = CUR;

      if (prevA != null) {
        dataRow.getCell(6).numFmt = CUR;
        dataRow.getCell(7).numFmt = CUR;
        dataRow.getCell(8).numFmt = PCT;
        const delta = avg - prevA;
        const color = delta > 0 ? "FFDC2626" : delta < 0 ? "FF16A34A" : "FF64748B";
        dataRow.getCell(7).font = { color: { argb: color } };
        dataRow.getCell(8).font = { color: { argb: color } };
      } else {
        dataRow.getCell(7).font = { italic: true, color: { argb: "FF94A3B8" } };
        dataRow.getCell(7).alignment = { horizontal: "right" };
      }
    }

    const sumRow = ws.addRow([`Suma — ${g.name}`, null, null, null, total, null, null, null]);
    sumRow.getCell(1).font = { bold: true };
    sumRow.getCell(5).numFmt = CUR;
    sumRow.getCell(5).font = { bold: true };
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
  const month = String(req.query.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month format. Use YYYY-MM" });
    return;
  }
  const prevMonth = monthMinus(month, 1);

  const ccRaw = req.query.costCenterId;
  const costCenterId = ccRaw != null && ccRaw !== "" ? parseInt(String(ccRaw), 10) : null;
  const singleMode = costCenterId != null && !isNaN(costCenterId);

  let groups: Group[];
  let prevAvg: Map<string, number>;
  let opts: { sheetName: string; title: string; subtitle: string; emptyMsg: string };

  if (singleMode) {
    // Nazwa/kolor centrum (tenant-safe: tylko z danych usera).
    const ccRes = await db.execute(sql`
      SELECT name, color FROM cost_centers WHERE id = ${costCenterId} AND user_id = ${userId} LIMIT 1
    `);
    const cc = ccRes.rows[0] as { name: string; color: string } | undefined;
    const ccName = cc?.name ?? "Centrum kosztów";
    const ccColor = cc?.color ?? "#14B8A6";

    const [curr, prev] = await Promise.all([
      fetchBySupplier(userId, month, costCenterId!),
      fetchBySupplier(userId, prevMonth, costCenterId!),
    ]);
    prevAvg = new Map();
    for (const r of prev) {
      if (r.qty > 0) prevAvg.set(`${r.group_id ?? "null"}|${r.product_name}|${r.unit}`, r.gross_total / r.qty);
    }
    groups = buildGroups(curr, "Nieznany dostawca", ccColor);
    opts = {
      sheetName: `Zakupy ${month}`,
      title: `Zakupy — ${ccName} wg dostawców — ${monthLabelPl(month)}`,
      subtitle: `Ceny brutto · porównanie z ${monthLabelPl(prevMonth)}`,
      emptyMsg: `Brak zakupów dla „${ccName}" w ${monthLabelPl(month)}.`,
    };
  } else {
    const [curr, prev] = await Promise.all([
      fetchByCostCenter(userId, month),
      fetchByCostCenter(userId, prevMonth),
    ]);
    prevAvg = new Map();
    for (const r of prev) {
      if (r.qty > 0) prevAvg.set(`${r.group_id ?? "null"}|${r.product_name}|${r.unit}`, r.gross_total / r.qty);
    }
    groups = buildGroups(curr, "Bez centrum kosztów");
    opts = {
      sheetName: `Zakupy ${month}`,
      title: `Zakupy wg centrów kosztów — ${monthLabelPl(month)}`,
      subtitle: `Ceny brutto · porównanie z ${monthLabelPl(prevMonth)}`,
      emptyMsg: `Brak zakupów w ${monthLabelPl(month)}.`,
    };
  }

  const wb = buildWorkbook(groups, prevAvg, opts);
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="raport-zakupy-${month}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(Buffer.from(buffer));
});

export default router;
