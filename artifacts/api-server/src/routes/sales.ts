import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { db, posSalesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { toNum } from "../lib/parse";
import { periodFromQuery, previousPeriod, periodLabel, monthsInRange, type Period } from "../lib/period";
import { commonWordPrefix, normalizeName, posGroupKey, umbrellaFor } from "../lib/pos-group";
import { captureServer } from "../lib/telemetry";

// Sprzedaż per pozycja menu z POS (pos_sales) dla wybranego okresu, z porównaniem
// do poprzedniego równego okresu — zasila podstronę „Sprzedaż".
//
// Pozycje są GRUPOWANE po id produktu z POS: stopnie wysmażenia steka („medium",
// „well done") to warianty jednej pozycji menu i mają wspólne id, a osobne nazwy.
// Rozbite na wiersze rozdrabniały listę i ukrywały fakt, że stek jako danie
// sprzedaje się świetnie. Warianty zostają dostępne po rozwinięciu grupy.
const router: IRouter = Router();

type RawRow = { name: string; posProductId: string | null; qty: number; net: number };

async function fetchRows(userId: string, periods: string[]): Promise<RawRow[]> {
  if (periods.length === 0) return [];
  const rows = await db
    .select({
      name: posSalesTable.productName,
      posProductId: posSalesTable.posProductId,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
    .groupBy(posSalesTable.productName, posSalesTable.posProductId);
  return rows.map((r) => ({ name: r.name, posProductId: r.posProductId, qty: toNum(r.qty), net: toNum(r.net) }));
}

// Procentowa zmiana względem poprzedniego okresu. `null` = brak bazy porównania
// (pozycja nowa), a NIE „0%" — zero znaczyłoby „bez zmian", co byłoby kłamstwem.
function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export type SalesLeaf = {
  productName: string;
  qty: number;
  netValue: number;
  prevQty: number | null;
  prevNet: number | null;
  qtyChangePct: number | null;
  netChangePct: number | null;
};
export type SalesGroup = SalesLeaf & {
  /** Stabilny klucz grupy (id produktu z POS) — do wykresu i porównań. */
  key: string;
  /** Warianty (stopnie wysmażenia, smaki). Puste, gdy pozycja nie ma wariantów. */
  variants: SalesLeaf[];
};

type Leaf = { name: string; qty: number; net: number; prevQty: number | null; prevNet: number | null };

// Sumy grupy liści + zmiany procentowe. `prev` zostaje `null`, gdy ŻADEN liść
// nie miał sprzedaży w poprzednim okresie — inaczej nowa pozycja pokazywałaby
// spadek z zera zamiast „nowa".
function totalsOf(members: Leaf[]): Omit<SalesLeaf, "productName"> {
  const qty = members.reduce((s, m) => s + m.qty, 0);
  const net = members.reduce((s, m) => s + m.net, 0);
  const hasPrev = members.some((m) => m.prevQty != null || m.prevNet != null);
  const prevQty = hasPrev ? members.reduce((s, m) => s + (m.prevQty ?? 0), 0) : null;
  const prevNet = hasPrev ? members.reduce((s, m) => s + (m.prevNet ?? 0), 0) : null;
  return { qty, netValue: net, prevQty, prevNet, qtyChangePct: changePct(qty, prevQty), netChangePct: changePct(net, prevNet) };
}

function makeLeaf(l: Leaf): SalesLeaf {
  return {
    productName: l.name,
    qty: l.qty,
    netValue: l.net,
    prevQty: l.prevQty,
    prevNet: l.prevNet,
    qtyChangePct: changePct(l.qty, l.prevQty),
    netChangePct: changePct(l.net, l.prevNet),
  };
}

async function buildSalesGroups(userId: string, period: Period): Promise<{ groups: SalesGroup[]; prev: Period }> {
  const prev = previousPeriod(period);
  const [curRows, prevRows] = await Promise.all([
    fetchRows(userId, monthsInRange(period)),
    fetchRows(userId, monthsInRange(prev)),
  ]);

  // key -> (znormalizowana nazwa wariantu -> liść). Warianty łączymy między
  // okresami po nazwie, grupy po kluczu POS.
  const buckets = new Map<string, Map<string, Leaf>>();
  const leafFor = (r: RawRow): Leaf => {
    const key = posGroupKey(r);
    let members = buckets.get(key);
    if (!members) { members = new Map(); buckets.set(key, members); }
    const nk = normalizeName(r.name);
    let leaf = members.get(nk);
    if (!leaf) { leaf = { name: r.name, qty: 0, net: 0, prevQty: null, prevNet: null }; members.set(nk, leaf); }
    return leaf;
  };

  for (const r of curRows) {
    const leaf = leafFor(r);
    leaf.qty += r.qty;
    leaf.net += r.net;
  }
  for (const r of prevRows) {
    const leaf = leafFor(r);
    leaf.prevQty = (leaf.prevQty ?? 0) + r.qty;
    leaf.prevNet = (leaf.prevNet ?? 0) + r.net;
  }

  // Poziom 1: pozycja POS (warianty = stopnie wysmażenia itp.).
  const subGroups = [...buckets.entries()].map(([key, membersMap]) => {
    const members = [...membersMap.values()];
    return {
      key,
      // Nazwa z UNII wariantów obu okresów — nie zmienia się, gdy w jednym
      // miesiącu sprzedał się tylko jeden stopień wysmażenia.
      name: commonWordPrefix(members.map((m) => m.name)),
      members,
    };
  });

  // Poziom 2: parasol po nazwie (zestawy lunchowe). Osobne produkty POS, ale
  // dla właściciela to jedna oferta — chce widzieć „ile zrobił lunch".
  const umbrellas = new Map<string, typeof subGroups>();
  const standalone: typeof subGroups = [];
  for (const sg of subGroups) {
    const label = umbrellaFor(sg.name);
    if (label) {
      const list = umbrellas.get(label) ?? [];
      list.push(sg);
      umbrellas.set(label, list);
    } else {
      standalone.push(sg);
    }
  }

  const groups: SalesGroup[] = [];

  for (const sg of standalone) {
    groups.push({
      key: sg.key,
      ...totalsOf(sg.members),
      productName: sg.name,
      variants: sg.members.length > 1 ? sg.members.map(makeLeaf).sort((a, b) => b.netValue - a.netValue) : [],
    });
  }

  for (const [label, list] of umbrellas) {
    // Parasol z jedną pozycją to nie parasol — pokazujemy ją normalnie,
    // żeby nie tworzyć sztucznego poziomu nad pojedynczym daniem.
    if (list.length === 1) {
      const sg = list[0];
      groups.push({
        key: sg.key,
        ...totalsOf(sg.members),
        productName: sg.name,
        variants: sg.members.length > 1 ? sg.members.map(makeLeaf).sort((a, b) => b.netValue - a.netValue) : [],
      });
      continue;
    }
    const allMembers = list.flatMap((sg) => sg.members);
    groups.push({
      key: `um:${normalizeName(label)}`,
      ...totalsOf(allMembers),
      productName: label,
      // Warianty parasola to POZYCJE MENU (Schab lunch, Pulpety lunch), a nie
      // ich własne warianty — inaczej lista miałaby trzy poziomy zagnieżdżenia.
      variants: list
        .map((sg) => ({ ...totalsOf(sg.members), productName: sg.name }))
        .sort((a, b) => b.netValue - a.netValue),
    });
  }

  // Sortowanie po WARTOŚCI, nie ilości — 300 kaw po 4 zł znaczy dla wyniku
  // mniej niż 40 dań po 90 zł. Front i tak pozwala przesortować.
  groups.sort((a, b) => b.netValue - a.netValue);
  return { groups, prev };
}

router.get("/sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const { groups } = await buildSalesGroups(userId, period);

  const totalQty = groups.reduce((s, g) => s + g.qty, 0);
  const totalNet = groups.reduce((s, g) => s + g.netValue, 0);
  const prevTotalQty = groups.reduce((s, g) => s + (g.prevQty ?? 0), 0);
  const prevTotalNet = groups.reduce((s, g) => s + (g.prevNet ?? 0), 0);

  res.json({
    from: period.from,
    to: period.to,
    totalQty,
    totalNet,
    prevTotalQty,
    prevTotalNet,
    totalQtyChangePct: changePct(totalQty, prevTotalQty),
    totalNetChangePct: changePct(totalNet, prevTotalNet),
    items: groups,
  });
});

// ─── Historia jednej pozycji menu, miesiąc po miesiącu ────────────────────────
// Zasila wykres otwierany kliknięciem w wiersz. Osobny endpoint, bo lista zna
// tylko dwa okresy — tu chcemy pełny przebieg, żeby zobaczyć sezonowość.
//
// `key` = cała grupa (stek ze wszystkimi wysmażeniami), `productName` = jeden
// wariant. Klucz, nie nazwa: nazwa grupy jest wyliczana z wariantów obecnych
// w okresie, więc jako identyfikator byłaby ruchoma.
router.get("/sales/trend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const key = req.query.key != null ? String(req.query.key) : "";
  const productName = req.query.productName != null ? String(req.query.productName) : "";
  if (!key.trim() && !productName.trim()) {
    res.status(400).json({ error: "Podaj key albo productName" });
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
      name: posSalesTable.productName,
      posProductId: posSalesTable.posProductId,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
    .groupBy(posSalesTable.period, posSalesTable.productName, posSalesTable.posProductId);

  const wantKey = key.trim();
  const wantName = normalizeName(productName);
  // Klucz parasola ("um:lunch") nie występuje na żadnym wierszu — to grupa
  // wyliczana z NAZW. Bez tej gałęzi wykres dla „Lunch" byłby pusty.
  const wantUmbrella = wantKey.startsWith("um:") ? wantKey.slice(3) : null;
  const byPeriod = new Map<string, { qty: number; net: number }>();
  const names = new Set<string>();
  for (const r of rows) {
    const match = wantUmbrella
      ? normalizeName(umbrellaFor(r.name) ?? "") === wantUmbrella
      : wantKey
        ? posGroupKey({ name: r.name, posProductId: r.posProductId }) === wantKey
        : normalizeName(r.name) === wantName;
    if (!match) continue;
    names.add(r.name);
    const cur = byPeriod.get(r.period) ?? { qty: 0, net: 0 };
    cur.qty += toNum(r.qty);
    cur.net += toNum(r.net);
    byPeriod.set(r.period, cur);
  }

  res.json({
    productName: wantUmbrella
      ? (umbrellaFor([...names][0] ?? "") ?? wantUmbrella)
      : wantKey
        ? commonWordPrefix([...names])
        : productName,
    variantCount: names.size,
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
  const { groups, prev } = await buildSalesGroups(userId, period);

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
  const subRow = ws.addRow([
    `Kwoty netto ze sprzedaży POS · porównanie z okresem: ${prevLabel} · warianty (np. stopnie wysmażenia) wcięte pod pozycją`,
  ]);
  ws.mergeCells(subRow.number, 1, subRow.number, nCols);
  subRow.getCell(1).font = { italic: true, size: 10, color: { argb: "FF64748B" } };

  const header = ws.addRow(headers);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });

  if (groups.length === 0) {
    const empty = ws.addRow([`Brak danych sprzedaży w okresie ${label}.`]);
    ws.mergeCells(empty.number, 1, empty.number, nCols);
    empty.getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
  }

  function addLeafRow(l: SalesLeaf, variant: boolean) {
    const row = ws.addRow([
      l.productName,
      round(l.qty, 2),
      l.prevQty != null ? round(l.prevQty, 2) : null,
      l.qtyChangePct != null ? round(l.qtyChangePct / 100, 6) : "nowa",
      round(l.netValue, 2),
      l.prevNet != null ? round(l.prevNet, 2) : null,
      l.netChangePct != null ? round(l.netChangePct / 100, 6) : "nowa",
    ]);
    row.getCell(2).numFmt = QTY;
    row.getCell(3).numFmt = QTY;
    row.getCell(4).numFmt = PCT;
    row.getCell(5).numFmt = CUR;
    row.getCell(6).numFmt = CUR;
    row.getCell(7).numFmt = PCT;
    if (variant) {
      // Wcięcie + szarość: wariant jest składową wiersza wyżej, nie osobną
      // pozycją. Bez tego sumy w arkuszu wyglądałyby na policzone podwójnie.
      row.getCell(1).alignment = { indent: 2 };
      row.eachCell({ includeEmpty: true }, (c) => { c.font = { size: 10, color: { argb: "FF64748B" } }; });
    } else {
      row.getCell(1).font = { bold: true };
    }
    return row;
  }

  for (const g of groups) {
    addLeafRow(g, false);
    for (const v of g.variants) addLeafRow(v, true);
  }

  if (groups.length > 0) {
    const totalQty = groups.reduce((s, g) => s + g.qty, 0);
    const prevQty = groups.reduce((s, g) => s + (g.prevQty ?? 0), 0);
    const totalNet = groups.reduce((s, g) => s + g.netValue, 0);
    const prevNet = groups.reduce((s, g) => s + (g.prevNet ?? 0), 0);
    const sum = ws.addRow([
      "SUMA (bez wierszy wciętych)",
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
