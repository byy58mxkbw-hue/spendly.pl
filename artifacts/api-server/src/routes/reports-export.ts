import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { periodFromQuery, previousPeriod, periodLabel, type Period } from "../lib/period";
import { buildWorkbook, type AggRow, type Group, type Compare } from "../lib/reports-workbook";

const router: IRouter = Router();

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
  // Grupy od największej wartości zakupów, null (np. „bez centrum") zawsze na końcu.
  const totalOf = (g: Group) => g.rows.reduce((s, r) => s + r.gross_total, 0);
  return [...map.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    const d = totalOf(b) - totalOf(a);
    return d !== 0 ? d : a.name.localeCompare(b.name, "pl");
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
    subtitle: `Ceny brutto · porównanie cen i ilości z: ${prevLabel}`,
    emptyMsg: `Brak zakupów w okresie ${label}.`,
  };
  const wb = buildWorkbook(groups, cmp, true, opts);
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
