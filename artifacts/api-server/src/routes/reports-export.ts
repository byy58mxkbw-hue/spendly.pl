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

type Row = {
  cost_center_id: number | null;
  cc_name: string | null;
  cc_color: string | null;
  product_name: string;
  unit: string;
  qty: number;
  gross_total: number; // brutto = suma(total_price netto × (1+VAT))
};

// Zakupy zagregowane per (centrum kosztów, produkt, jednostka) za dany miesiąc.
// total_price to NETTO (patrz ksef.ts: totalPrice = item.net) → brutto liczymy z VAT.
async function fetchRows(userId: string, month: string): Promise<Row[]> {
  const result = await db.execute(sql`
    SELECT i.cost_center_id,
           cc.name AS cc_name,
           cc.color AS cc_color,
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
  return result.rows as Row[];
}

router.get("/reports/products-by-cost-center.xlsx", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const month = String(req.query.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month format. Use YYYY-MM" });
    return;
  }
  const prevMonth = monthMinus(month, 1);

  const [curr, prev] = await Promise.all([
    fetchRows(userId, month),
    fetchRows(userId, prevMonth),
  ]);

  // Śr. cena brutto/jedn. z poprzedniego miesiąca: klucz ccId|produkt|jednostka.
  const prevAvg = new Map<string, number>();
  for (const r of prev) {
    if (r.qty > 0) {
      prevAvg.set(`${r.cost_center_id ?? "null"}|${r.product_name}|${r.unit}`, r.gross_total / r.qty);
    }
  }

  // Grupowanie bieżącego miesiąca po centrum kosztów.
  type Group = { id: number | null; name: string; color: string; rows: Row[] };
  const groupsMap = new Map<string, Group>();
  for (const r of curr) {
    const key = String(r.cost_center_id ?? "null");
    let g = groupsMap.get(key);
    if (!g) {
      g = {
        id: r.cost_center_id,
        name: r.cc_name ?? "Bez centrum kosztów",
        color: r.cc_color ?? "#64748B",
        rows: [],
      };
      groupsMap.set(key, g);
    }
    g.rows.push(r);
  }
  // Centra alfabetycznie, "Bez centrum kosztów" (null) na końcu.
  const groups = [...groupsMap.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.name.localeCompare(b.name, "pl");
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Spendly";
  wb.created = new Date();
  const ws = wb.addWorksheet(`Zakupy ${month}`, {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  const CUR = '#,##0.00" zł"';
  const QTY = "#,##0.00";
  const PCT = "+0.0%;-0.0%";
  const HEADERS = [
    "Produkt", "Ilość", "Jedn.", "Śr. cena brutto",
    "Wartość brutto", "Śr. cena poprz. mies.", "Zmiana", "Zmiana %",
  ];

  ws.columns = [
    { width: 42 }, { width: 11 }, { width: 8 }, { width: 16 },
    { width: 16 }, { width: 20 }, { width: 13 }, { width: 11 },
  ];

  // Tytuł + podtytuł (scalone na całą szerokość).
  const titleRow = ws.addRow([`Zakupy wg centrów kosztów — ${monthLabelPl(month)}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, HEADERS.length);
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 22;

  const subRow = ws.addRow([`Ceny brutto · porównanie z ${monthLabelPl(prevMonth)}`]);
  ws.mergeCells(subRow.number, 1, subRow.number, HEADERS.length);
  subRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  // Nagłówek kolumn (zamrożony — ySplit:3).
  const header = ws.addRow(HEADERS);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });

  for (const g of groups) {
    // Nagłówek centrum kosztów — scalony, tłem kolor centrum.
    const ccRow = ws.addRow([g.name.toUpperCase()]);
    ws.mergeCells(ccRow.number, 1, ccRow.number, HEADERS.length);
    const cc = ccRow.getCell(1);
    cc.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hexToArgb(g.color) } };
    cc.alignment = { vertical: "middle" };
    ccRow.height = 18;

    let ccTotal = 0;
    const rows = [...g.rows].sort((a, b) => b.gross_total - a.gross_total);
    for (const r of rows) {
      const avg = r.qty > 0 ? r.gross_total / r.qty : 0;
      const prevA = prevAvg.get(`${r.cost_center_id ?? "null"}|${r.product_name}|${r.unit}`);
      ccTotal += r.gross_total;

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
        // Produkt nie występował w poprzednim miesiącu — brak porównania.
        dataRow.getCell(7).font = { italic: true, color: { argb: "FF94A3B8" } };
        dataRow.getCell(7).alignment = { horizontal: "right" };
      }
    }

    // Wiersz SUMA centrum (suma wartości brutto w kolumnie „Wartość brutto").
    const sumRow = ws.addRow([`Suma — ${g.name}`, null, null, null, ccTotal, null, null, null]);
    sumRow.getCell(1).font = { bold: true };
    sumRow.getCell(5).numFmt = CUR;
    sumRow.getCell(5).font = { bold: true };
    sumRow.eachCell((c) => {
      c.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });
    ws.addRow([]); // odstęp między centrami
  }

  if (groups.length === 0) {
    ws.addRow([`Brak zakupów w ${monthLabelPl(month)}.`]);
  }

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
