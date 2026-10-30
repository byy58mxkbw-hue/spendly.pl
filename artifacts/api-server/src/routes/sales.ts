import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { db, posSalesTable, posSalesDailyTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { toNum } from "../lib/parse";
import { periodFromQuery, previousPeriod, yearAgoPeriod, periodLabel, monthsInRange, type Period } from "../lib/period";
import { categoryForSaleName, commonWordPrefix, normalizeName, posGroupKey, sharesCommonPrefix, umbrellaFor } from "../lib/pos-group";
import { captureServer } from "../lib/telemetry";
import { ensureDailySalesForMonth } from "../services/gopos-daily";
import { buildDishCategoryIndex } from "./food-cost.js";

// Sprzedaż per pozycja menu z POS (pos_sales) dla wybranego okresu, z porównaniem
// do poprzedniego równego okresu — zasila podstronę „Sprzedaż".
//
// Pozycje są GRUPOWANE po id produktu z POS: stopnie wysmażenia steka („medium",
// „well done") to warianty jednej pozycji menu i mają wspólne id, a osobne nazwy.
// Rozbite na wiersze rozdrabniały listę i ukrywały fakt, że stek jako danie
// sprzedaje się świetnie. Warianty zostają dostępne po rozwinięciu grupy.
const router: IRouter = Router();

type RawRow = { name: string; posProductId: string | null; category: string | null; qty: number; net: number };

async function fetchRows(userId: string, periods: string[]): Promise<RawRow[]> {
  if (periods.length === 0) return [];
  const rows = await db
    .select({
      name: posSalesTable.productName,
      posProductId: posSalesTable.posProductId,
      // MAX (nie do GROUP BY): kategoria jest stała dla tego produktu przez cały okres,
      // MAX daje jedną wartość zamiast rozbijania sumy na wiersz per miesiąc.
      category: sql<string | null>`MAX(${posSalesTable.category})`,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
    .groupBy(posSalesTable.productName, posSalesTable.posProductId);
  return rows.map((r) => ({ name: r.name, posProductId: r.posProductId, category: r.category, qty: toNum(r.qty), net: toNum(r.net) }));
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
  /** Ten sam okres, rok wcześniej — porównanie sezonowe (grudzień do grudnia). */
  prevYearQty: number | null;
  prevYearNet: number | null;
  qtyYearChangePct: number | null;
  netYearChangePct: number | null;
  /**
   * Klucz do /sales/trend TEGO KONKRETNEGO wariantu — bez niego front pytał
   * trend po samej `productName`, a to dopasowuje WSZYSTKIE wiersze o tej
   * nazwie w całej bazie, niezależnie od id produktu w POS. Realny przypadek:
   * "Schabowy" jako pozycja á la carte i "Schabowy" jako część zestawu
   * lunchowego to w GoPOS DWA różne produkty (różne id) o tej samej nazwie —
   * bez klucza ich historie zlepiały się w jeden, mylący wykres.
   */
  key?: string;
};
export type SalesGroup = SalesLeaf & {
  /** Stabilny klucz grupy (id produktu z POS) — do wykresu i porównań. */
  key: string;
  /** Warianty (stopnie wysmażenia, smaki). Puste, gdy pozycja nie ma wariantów. */
  variants: SalesLeaf[];
  /** Kategoria dania (z Food Cost, dopasowana po nazwie) — `null` = brak dopasowania. */
  category: string | null;
};

type Leaf = {
  name: string; qty: number; net: number;
  prevQty: number | null; prevNet: number | null;
  prevYearQty: number | null; prevYearNet: number | null;
  category: string | null;
};

// Sumy grupy liści + zmiany procentowe. `prev`/`prevYear` zostają `null`, gdy ŻADEN
// liść nie miał sprzedaży w tamtym okresie — inaczej nowa pozycja pokazywałaby
// spadek z zera zamiast „nowa".
function totalsOf(members: Leaf[]): Omit<SalesLeaf, "productName"> {
  const qty = members.reduce((s, m) => s + m.qty, 0);
  const net = members.reduce((s, m) => s + m.net, 0);
  const hasPrev = members.some((m) => m.prevQty != null || m.prevNet != null);
  const prevQty = hasPrev ? members.reduce((s, m) => s + (m.prevQty ?? 0), 0) : null;
  const prevNet = hasPrev ? members.reduce((s, m) => s + (m.prevNet ?? 0), 0) : null;
  const hasPrevYear = members.some((m) => m.prevYearQty != null || m.prevYearNet != null);
  const prevYearQty = hasPrevYear ? members.reduce((s, m) => s + (m.prevYearQty ?? 0), 0) : null;
  const prevYearNet = hasPrevYear ? members.reduce((s, m) => s + (m.prevYearNet ?? 0), 0) : null;
  return {
    qty, netValue: net, prevQty, prevNet,
    qtyChangePct: changePct(qty, prevQty), netChangePct: changePct(net, prevNet),
    prevYearQty, prevYearNet,
    qtyYearChangePct: changePct(qty, prevYearQty), netYearChangePct: changePct(net, prevYearNet),
  };
}

function makeLeaf(l: Leaf, parentKey: string): SalesLeaf {
  return {
    productName: l.name,
    qty: l.qty,
    netValue: l.net,
    prevQty: l.prevQty,
    prevNet: l.prevNet,
    qtyChangePct: changePct(l.qty, l.prevQty),
    netChangePct: changePct(l.net, l.prevNet),
    prevYearQty: l.prevYearQty,
    prevYearNet: l.prevYearNet,
    qtyYearChangePct: changePct(l.qty, l.prevYearQty),
    netYearChangePct: changePct(l.net, l.prevYearNet),
    key: `${parentKey}#${normalizeName(l.name)}`,
  };
}

async function buildSalesGroups(userId: string, period: Period): Promise<{ groups: SalesGroup[]; prev: Period; prevYear: Period }> {
  const prev = previousPeriod(period);
  const prevYear = yearAgoPeriod(period);
  const [curRows, prevRows, prevYearRows, dishIndex] = await Promise.all([
    fetchRows(userId, monthsInRange(period)),
    fetchRows(userId, monthsInRange(prev)),
    fetchRows(userId, monthsInRange(prevYear)),
    buildDishCategoryIndex(userId),
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
    if (!leaf) { leaf = { name: r.name, qty: 0, net: 0, prevQty: null, prevNet: null, prevYearQty: null, prevYearNet: null, category: null }; members.set(nk, leaf); }
    return leaf;
  };

  for (const r of curRows) {
    const leaf = leafFor(r);
    leaf.qty += r.qty;
    leaf.net += r.net;
    leaf.category = leaf.category ?? r.category;
  }
  for (const r of prevRows) {
    const leaf = leafFor(r);
    leaf.prevQty = (leaf.prevQty ?? 0) + r.qty;
    leaf.prevNet = (leaf.prevNet ?? 0) + r.net;
    leaf.category = leaf.category ?? r.category;
  }
  for (const r of prevYearRows) {
    const leaf = leafFor(r);
    leaf.prevYearQty = (leaf.prevYearQty ?? 0) + r.qty;
    leaf.prevYearNet = (leaf.prevYearNet ?? 0) + r.net;
    leaf.category = leaf.category ?? r.category;
  }

  // Poziom 1: pozycja POS (warianty = stopnie wysmażenia itp.).
  // Różne nazwy pod wspólnym id POS bez wspólnego rdzenia słownego NIE są
  // wariantami — to sygnał, że GoPOS ponownie użył id po zmianie karty na
  // zupełnie inne danie (realny przypadek: „Zrazy wołowe" i „Risotto" pod tym
  // samym id — zlepienie sum dwóch różnych dań w jedną pozycję). W takim razie
  // pokazujemy je osobno, zamiast fałszywie sumować ich sprzedaż w jedną liczbę.
  const subGroups: Array<{ key: string; name: string; members: Leaf[]; category: string | null }> = [];
  for (const [key, membersMap] of buckets.entries()) {
    const members = [...membersMap.values()];
    if (members.length > 1 && !sharesCommonPrefix(members.map((m) => m.name))) {
      for (const m of members) {
        subGroups.push({ key: `${key}#${normalizeName(m.name)}`, name: m.name, members: [m], category: m.category });
      }
      continue;
    }
    subGroups.push({
      key,
      // Nazwa z UNII wariantów obu okresów — nie zmienia się, gdy w jednym
      // miesiącu sprzedał się tylko jeden stopień wysmażenia.
      name: commonWordPrefix(members.map((m) => m.name)),
      members,
      // Warianty tego samego produktu POS dzielą kategorię — wystarczy jeden nośnik.
      category: members.find((m) => m.category)?.category ?? null,
    });
  }

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
      variants: sg.members.length > 1 ? sg.members.map((l) => makeLeaf(l, sg.key)).sort((a, b) => b.netValue - a.netValue) : [],
      // Kategoria z samego GoPOS (zakładka „Konfiguracja Menu") ma priorytet — to
      // prawda z POS, nie zgadywanka po nazwie. Dopasowanie do Food Cost to fallback
      // (starsze zsynchronizowane dane bez kategorii, albo źródło inne niż GoPOS).
      category: sg.category ?? categoryForSaleName(sg.name, dishIndex),
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
        variants: sg.members.length > 1 ? sg.members.map((l) => makeLeaf(l, sg.key)).sort((a, b) => b.netValue - a.netValue) : [],
        category: sg.category ?? categoryForSaleName(sg.name, dishIndex),
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
      // `key: sg.key` (nie sama nazwa!) — patrz komentarz przy `SalesLeaf.key`.
      variants: list
        .map((sg) => ({ ...totalsOf(sg.members), productName: sg.name, key: sg.key }))
        .sort((a, b) => b.netValue - a.netValue),
      // Kategoria parasola = jego WŁASNA etykieta ("Lunch"), NIGDY dziedziczona
      // po dzieciach. Realny przypadek zgłoszony przez użytkownika: dania
      // "X lunch" mają w GoPOS kategorię „Wkładka" (nazwa sekcji menu w POS, nie
      // "Lunch") — dziedziczenie po pierwszym dziecku z kategorią wrzucało cały
      // obrót parasola do „Wkładka" na wykresie „Sprzedaż wg kategorii", mimo że
      // parasol z definicji reprezentuje jedną ofertę "Lunch" dla właściciela.
      category: label,
    });
  }

  // Kategorie z GoPOS bywają w RÓŻNEJ wielkości liter dla pojęciowo tej samej
  // kategorii — np. "LUNCH" z Konfiguracji Menu GoPOS i "Lunch" z etykiety
  // parasola dań lunchowych (linia wyżej: `category: label`). Bez ujednolicenia
  // rozjeżdżały się na dwie osobne pozycje wykresu „Sprzedaż wg kategorii".
  // Normalizujemy do JEDNEGO reprezentanta (pierwszy napotkany) na WSZYSTKICH
  // grupach — nie tylko w rozkładzie, bo front dopasowuje klik w kategorię do
  // pozycji na liście dokładnym stringiem (`i.category === categoryFilter`,
  // sprzedaz.tsx) — gdyby zostały różne napisy, klik złapałby tylko połowę.
  const categoryLabelByKey = new Map<string, string>();
  for (const g of groups) {
    if (g.category == null) continue;
    const key = normalizeName(g.category);
    if (!categoryLabelByKey.has(key)) categoryLabelByKey.set(key, g.category);
    g.category = categoryLabelByKey.get(key)!;
  }

  // Sortowanie po WARTOŚCI, nie ilości — 300 kaw po 4 zł znaczy dla wyniku
  // mniej niż 40 dań po 90 zł. Front i tak pozwala przesortować.
  groups.sort((a, b) => b.netValue - a.netValue);
  return { groups, prev, prevYear };
}

export type CategoryBreakdownEntry = { category: string; label: string; netValue: number; qty: number; pct: number };

const UNCATEGORIZED = "__uncategorized__";

// Rozkład wartości sprzedaży wg kategorii dania — grupy bez dopasowania trafiają
// pod jeden stały klucz, żeby front mógł je zawsze pokazać na końcu listy.
function buildCategoryBreakdown(groups: SalesGroup[]): CategoryBreakdownEntry[] {
  const byCategory = new Map<string, { label: string; netValue: number; qty: number }>();
  for (const g of groups) {
    const key = g.category ?? UNCATEGORIZED;
    const cur = byCategory.get(key) ?? { label: g.category ?? "Niezakategoryzowane", netValue: 0, qty: 0 };
    cur.netValue += g.netValue;
    cur.qty += g.qty;
    byCategory.set(key, cur);
  }
  const totalNet = [...byCategory.values()].reduce((s, v) => s + v.netValue, 0);
  return [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      label: v.label,
      netValue: v.netValue,
      qty: v.qty,
      pct: totalNet > 0 ? Math.round((v.netValue / totalNet) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.netValue - a.netValue);
}

router.get("/sales", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = periodFromQuery(req.query);
  const { groups } = await buildSalesGroups(userId, period);

  const totalQty = groups.reduce((s, g) => s + g.qty, 0);
  const totalNet = groups.reduce((s, g) => s + g.netValue, 0);
  const prevTotalQty = groups.reduce((s, g) => s + (g.prevQty ?? 0), 0);
  const prevTotalNet = groups.reduce((s, g) => s + (g.prevNet ?? 0), 0);
  const prevYearTotalQty = groups.reduce((s, g) => s + (g.prevYearQty ?? 0), 0);
  const prevYearTotalNet = groups.reduce((s, g) => s + (g.prevYearNet ?? 0), 0);

  res.json({
    from: period.from,
    to: period.to,
    totalQty,
    totalNet,
    prevTotalQty,
    prevTotalNet,
    totalQtyChangePct: changePct(totalQty, prevTotalQty),
    totalNetChangePct: changePct(totalNet, prevTotalNet),
    prevYearTotalQty,
    prevYearTotalNet,
    totalQtyYearChangePct: changePct(totalQty, prevYearTotalQty),
    totalNetYearChangePct: changePct(totalNet, prevYearTotalNet),
    items: groups,
    categoryBreakdown: buildCategoryBreakdown(groups),
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
  // Klucz rozdzielonej pozycji ("id:123#nazwa") — dwa różne dania pod tym samym
  // id POS bez wspólnego rdzenia (patrz `sharesCommonPrefix`), pokazane osobno
  // na liście. Trend musi dopasować i id, I nazwę — samo id złapałoby oba dania.
  const hashIdx = wantKey.indexOf("#");
  const wantSplit = hashIdx > 0 ? { groupKey: wantKey.slice(0, hashIdx), name: wantKey.slice(hashIdx + 1) } : null;
  const byPeriod = new Map<string, { qty: number; net: number }>();
  const names = new Set<string>();
  for (const r of rows) {
    const match = wantUmbrella
      ? normalizeName(umbrellaFor(r.name) ?? "") === wantUmbrella
      : wantSplit
        ? posGroupKey({ name: r.name, posProductId: r.posProductId }) === wantSplit.groupKey && normalizeName(r.name) === wantSplit.name
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
      : wantSplit
        ? ([...names][0] ?? productName)
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

// ─── Trend kategorii dania w czasie ────────────────────────────────────────────
// Rozkład „Sprzedaż wg kategorii" na stronie pokazuje tylko BIEŻĄCY miesiąc —
// ten endpoint dokłada oś czasu (ostatnie N miesięcy), żeby zobaczyć, czy dana
// kategoria rośnie, czy maleje, nie tylko jaki ma udział teraz.
//
// Kategorię per wiersz sprzedaży ustalamy TAK SAMO jak w buildSalesGroups:
// kategoria wprost z POS ma priorytet, dopasowanie do Food Cost (categoryForSaleName)
// to fallback. Żeby wykres nie rozjechał się w 20 cienkich linii, bierzemy TOP 6
// kategorii (wg sumy netto w całym zakresie) + resztę sumujemy jako „Pozostałe".
// „Niezakategoryzowane" zostaje zawsze widoczne osobno (podpowiedź do uzupełnienia).
const CATEGORY_TREND_TOP_N = 10;
const OTHER_LABEL = "Pozostałe";

router.get("/sales/category-trend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthsRaw = parseInt(String(req.query.months ?? ""), 10);
  const monthCount = Number.isFinite(monthsRaw) && monthsRaw >= 2 && monthsRaw <= 24 ? monthsRaw : 12;

  const now = new Date();
  const periods: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const [rows, dishIndex] = await Promise.all([
    db
      .select({
        period: posSalesTable.period,
        name: posSalesTable.productName,
        category: posSalesTable.category,
        net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
      })
      .from(posSalesTable)
      .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
      .groupBy(posSalesTable.period, posSalesTable.productName, posSalesTable.category),
    buildDishCategoryIndex(userId),
  ]);

  // Kategoria per wiersz (POS → fallback Food Cost), z normalizacją wielkości liter
  // tak jak w buildSalesGroups — inaczej "LUNCH" i "Lunch" rozjechałyby się na dwie serie.
  const labelByNorm = new Map<string, string>();
  const canonicalLabel = (raw: string | null): string => {
    const label = raw?.trim() || UNCATEGORIZED;
    if (label === UNCATEGORIZED) return UNCATEGORIZED;
    const norm = normalizeName(label);
    if (!labelByNorm.has(norm)) labelByNorm.set(norm, label);
    return labelByNorm.get(norm)!;
  };

  const byMonthCategory = new Map<string, Map<string, number>>();
  const totalByCategory = new Map<string, number>();
  for (const r of rows) {
    const label = canonicalLabel(r.category?.trim() || categoryForSaleName(r.name, dishIndex));
    const net = toNum(r.net);
    let monthMap = byMonthCategory.get(r.period);
    if (!monthMap) { monthMap = new Map(); byMonthCategory.set(r.period, monthMap); }
    monthMap.set(label, (monthMap.get(label) ?? 0) + net);
    totalByCategory.set(label, (totalByCategory.get(label) ?? 0) + net);
  }

  // TOP N (bez „Niezakategoryzowane", które zawsze zostaje osobno) + reszta → "Pozostałe".
  const ranked = [...totalByCategory.entries()]
    .filter(([label]) => label !== UNCATEGORIZED)
    .sort((a, b) => b[1] - a[1]);
  const topLabels = new Set(ranked.slice(0, CATEGORY_TREND_TOP_N).map(([label]) => label));
  const hasOther = ranked.length > CATEGORY_TREND_TOP_N;
  const hasUncategorized = totalByCategory.has(UNCATEGORIZED);

  const seriesLabels = [
    ...ranked.filter(([label]) => topLabels.has(label)).map(([label]) => label),
    ...(hasOther ? [OTHER_LABEL] : []),
    ...(hasUncategorized ? ["Niezakategoryzowane"] : []),
  ];

  const series = seriesLabels.map((label) => ({
    label,
    data: periods.map((period) => {
      const monthMap = byMonthCategory.get(period);
      if (!monthMap) return 0;
      if (label === OTHER_LABEL) {
        let sum = 0;
        for (const [cat, net] of monthMap) if (cat !== UNCATEGORIZED && !topLabels.has(cat)) sum += net;
        return Math.round(sum * 100) / 100;
      }
      if (label === "Niezakategoryzowane") return Math.round((monthMap.get(UNCATEGORIZED) ?? 0) * 100) / 100;
      return Math.round((monthMap.get(label) ?? 0) * 100) / 100;
    }),
  }));

  res.json({ months: periods, series });
});

// ─── Trend koncentracji sprzedaży w czasie ─────────────────────────────────────
// Karta „Koncentracja" na stronie pokazuje tylko BIEŻĄCY miesiąc (% obrotu z TOP10
// pozycji). Ten endpoint dokłada oś czasu — czy restauracja z czasem robi się
// coraz bardziej zależna od wąskiej oferty, czy się dywersyfikuje.
router.get("/sales/concentration-trend", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthsRaw = parseInt(String(req.query.months ?? ""), 10);
  const monthCount = Number.isFinite(monthsRaw) && monthsRaw >= 2 && monthsRaw <= 24 ? monthsRaw : 12;

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
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
    .groupBy(posSalesTable.period, posSalesTable.productName, posSalesTable.posProductId);

  const byPeriod = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let monthMap = byPeriod.get(r.period);
    if (!monthMap) { monthMap = new Map(); byPeriod.set(r.period, monthMap); }
    const key = posGroupKey(r);
    monthMap.set(key, (monthMap.get(key) ?? 0) + toNum(r.net));
  }

  // `null` (nie 0) dla miesiąca bez sprzedaży — zero udziału wyglądałoby na
  // „zdywersyfikowany", a to po prostu brak danych za ten miesiąc.
  const pct = periods.map((period) => {
    const monthMap = byPeriod.get(period);
    if (!monthMap || monthMap.size === 0) return null;
    const values = [...monthMap.values()].sort((a, b) => b - a);
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 0) return null;
    const top10 = values.slice(0, 10).reduce((s, v) => s + v, 0);
    return Math.round((top10 / total) * 1000) / 10;
  });

  res.json({ months: periods, pct });
});

// ─── Nowości w karcie — jak się przyjęły ────────────────────────────────────────
// Pozycja, która pojawiła się po raz PIERWSZY w całej historii sprzedaży w ciągu
// ostatnich `months` miesięcy. Pokazujemy do 3 miesięcy trajektorii od debiutu —
// restaurator zwykle nie wie, czy nowość „się przyjęła", dopóki nie minie kwartał.
router.get("/sales/new-items", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthsRaw = parseInt(String(req.query.months ?? ""), 10);
  const lookback = Number.isFinite(monthsRaw) && monthsRaw >= 1 && monthsRaw <= 12 ? monthsRaw : 6;

  // Pierwsze pojawienie się KAŻDEJ pozycji w CAŁEJ historii (bez filtra okresu) —
  // inaczej pozycja sprzedawana od lat, ale akurat bez wiersza w oknie lookback,
  // wyglądałaby na nową.
  const firstSeenRows = await db
    .select({
      name: posSalesTable.productName,
      posProductId: posSalesTable.posProductId,
      category: sql<string | null>`MAX(${posSalesTable.category})`,
      firstPeriod: sql<string>`MIN(${posSalesTable.period})`,
    })
    .from(posSalesTable)
    .where(eq(posSalesTable.userId, userId))
    .groupBy(posSalesTable.productName, posSalesTable.posProductId);

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - lookback + 1, 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const newOnes = firstSeenRows.filter((r) => r.firstPeriod >= cutoffKey);
  if (newOnes.length === 0) { res.json({ items: [] }); return; }

  const neededPeriods = new Set<string>();
  for (const r of newOnes) {
    const [y, m] = r.firstPeriod.split("-").map(Number);
    for (let i = 0; i < 3; i++) {
      const d = new Date(y, m - 1 + i, 1);
      neededPeriods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
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
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, [...neededPeriods])))
    .groupBy(posSalesTable.period, posSalesTable.productName, posSalesTable.posProductId);

  const byProductPeriod = new Map<string, { qty: number; net: number }>();
  for (const r of rows) {
    byProductPeriod.set(`${posGroupKey(r)}#${r.period}`, { qty: toNum(r.qty), net: toNum(r.net) });
  }

  const items = newOnes
    .map((r) => {
      const groupKey = posGroupKey(r);
      const [y, m] = r.firstPeriod.split("-").map(Number);
      const trajectory = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(y, m - 1 + i, 1);
        const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const v = byProductPeriod.get(`${groupKey}#${period}`);
        return { period, qty: v?.qty ?? 0, netValue: v?.net ?? 0 };
      });
      const withSales = trajectory.filter((t) => t.netValue > 0);
      // Trend tylko przy min. 2 miesiącach z realną sprzedażą — jeden punkt to
      // debiut, nie trend. Próg 15% odcina szum przy groszowych wahaniach.
      let trend: "rosnie" | "spada" | "stabilnie" | null = null;
      if (withSales.length >= 2 && trajectory[0].netValue > 0) {
        const delta = (trajectory[trajectory.length - 1].netValue - trajectory[0].netValue) / trajectory[0].netValue;
        trend = delta > 0.15 ? "rosnie" : delta < -0.15 ? "spada" : "stabilnie";
      }
      return { key: groupKey, name: r.name, category: r.category, firstPeriod: r.firstPeriod, trajectory, trend };
    })
    .sort((a, b) => b.firstPeriod.localeCompare(a.firstPeriod) || b.trajectory[0].netValue - a.trajectory[0].netValue);

  res.json({ items });
});

// ─── Spadająca sprzedaż ────────────────────────────────────────────────────────
// Pozycje ze spadkiem ilości sprzedanej 3+ miesiące z rzędu — kandydaci do
// usunięcia z karty albo promocji. Próg minimalnego udziału w obrocie odcina
// pozycje, które nigdy nie miały realnego znaczenia (nie ma co „wykrywać"
// spadku groszowego dania sprzedanego raz w roku).
router.get("/sales/declining-items", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const monthsRaw = parseInt(String(req.query.months ?? ""), 10);
  const monthCount = Number.isFinite(monthsRaw) && monthsRaw >= 4 && monthsRaw <= 12 ? monthsRaw : 6;

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
      category: sql<string | null>`MAX(${posSalesTable.category})`,
      qty: sql<number>`SUM(${posSalesTable.qty}::numeric)::float`,
      net: sql<number>`SUM(${posSalesTable.netValue}::numeric)::float`,
    })
    .from(posSalesTable)
    .where(and(eq(posSalesTable.userId, userId), inArray(posSalesTable.period, periods)))
    .groupBy(posSalesTable.period, posSalesTable.productName, posSalesTable.posProductId);

  type Agg = { name: string; category: string | null; byPeriod: Map<string, { qty: number; net: number }>; totalNet: number };
  const byProduct = new Map<string, Agg>();
  let totalNetAll = 0;
  for (const r of rows) {
    const key = posGroupKey(r);
    let a = byProduct.get(key);
    if (!a) { a = { name: r.name, category: r.category, byPeriod: new Map(), totalNet: 0 }; byProduct.set(key, a); }
    a.byPeriod.set(r.period, { qty: toNum(r.qty), net: toNum(r.net) });
    a.totalNet += toNum(r.net);
    a.category = a.category ?? r.category;
    totalNetAll += toNum(r.net);
  }
  // Próg: 0,5% obrotu CAŁEGO okna (luźniejszy niż 1% w „Najmocniejsze zmiany",
  // bo to trend wieloMIESIĘCZNY, nie pojedynczy miesiąc).
  const minTotalNet = totalNetAll * 0.005;

  const items = [...byProduct.entries()]
    .map(([key, a]) => {
      const series = periods.map((period) => ({ period, ...(a.byPeriod.get(period) ?? { qty: 0, net: 0 }) }));
      // Najdłuższa seria spadków licząc OD KOŃCA — tylko realny spadek z
      // dodatniej wartości, nie plateau zer.
      let streak = 0;
      for (let i = series.length - 1; i > 0; i--) {
        if (series[i - 1].qty > 0 && series[i].qty < series[i - 1].qty) streak++;
        else break;
      }
      return { key, name: a.name, category: a.category, streak, totalNet: a.totalNet, series };
    })
    .filter((i) => i.streak >= 3 && i.totalNet >= minTotalNet)
    .sort((a, b) => b.streak - a.streak || b.totalNet - a.totalNet)
    .slice(0, 10);

  res.json({
    items: items.map((i) => ({
      key: i.key,
      name: i.name,
      category: i.category,
      streak: i.streak,
      totalNet: i.totalNet,
      series: i.series.map((s) => ({ period: s.period, qty: s.qty, netValue: s.net })),
    })),
  });
});

// ─── Rozbicie dzienne jednego miesiąca (drill-down z trendu sprzedaży) ─────────
// GoPOS nie ma wymiaru grupowania po dniu w jednym zapytaniu (Stage B spike,
// 2026-10) — dociągamy to LENIWIE, dzień po dniu, dopiero gdy user kliknie
// w słupek konkretnego miesiąca. Wynik cache'owany w pos_sales_daily
// (ensureDailySalesForMonth), więc kolejne wejścia w ten sam zamknięty
// miesiąc nie odpytują już GoPOS.
router.get("/sales/trend/daily", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const key = req.query.key != null ? String(req.query.key) : "";
  const productName = req.query.productName != null ? String(req.query.productName) : "";
  const month = String(req.query.month ?? "");
  if (!key.trim() && !productName.trim()) {
    res.status(400).json({ error: "Podaj key albo productName" });
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Podaj month w formacie YYYY-MM" });
    return;
  }

  try {
    await ensureDailySalesForMonth(userId, month, req.log);
  } catch (err) {
    req.log.error({ err: String(err), userId, month }, "sales/trend/daily: dociąganie z GoPOS nieudane");
    res.status(502).json({ error: "Nie udało się pobrać rozbicia dziennego z GoPOS." });
    return;
  }

  const rows = await db
    .select({
      date: posSalesDailyTable.date,
      name: posSalesDailyTable.productName,
      posProductId: posSalesDailyTable.posProductId,
      qty: posSalesDailyTable.qty,
      net: posSalesDailyTable.netValue,
    })
    .from(posSalesDailyTable)
    .where(and(eq(posSalesDailyTable.userId, userId), sql`${posSalesDailyTable.date} LIKE ${month + "-%"}`));

  const wantKey = key.trim();
  const wantName = normalizeName(productName);
  const wantUmbrella = wantKey.startsWith("um:") ? wantKey.slice(3) : null;
  const hashIdx = wantKey.indexOf("#");
  const wantSplit = hashIdx > 0 ? { groupKey: wantKey.slice(0, hashIdx), name: wantKey.slice(hashIdx + 1) } : null;

  const byDate = new Map<string, { qty: number; net: number }>();
  for (const r of rows) {
    const match = wantUmbrella
      ? normalizeName(umbrellaFor(r.name) ?? "") === wantUmbrella
      : wantSplit
        ? posGroupKey({ name: r.name, posProductId: r.posProductId }) === wantSplit.groupKey && normalizeName(r.name) === wantSplit.name
        : wantKey
          ? posGroupKey({ name: r.name, posProductId: r.posProductId }) === wantKey
          : normalizeName(r.name) === wantName;
    if (!match) continue;
    const cur = byDate.get(r.date) ?? { qty: 0, net: 0 };
    cur.qty += toNum(r.qty);
    cur.net += toNum(r.net);
    byDate.set(r.date, cur);
  }

  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  const lastDay = isCurrentMonth ? now.getDate() : new Date(Date.UTC(y, m, 0)).getUTCDate();

  const days = Array.from({ length: lastDay }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const v = byDate.get(date);
    return { date, qty: v?.qty ?? 0, netValue: v?.net ?? 0 };
  });

  res.json({ days });
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
    "Kategoria",
    "Sprzedano",
    `Sprzedano (${prevLabel})`,
    "Zmiana ilości",
    "Wartość netto",
    `Wartość netto (${prevLabel})`,
    "Zmiana wartości",
  ];
  const widths = [46, 20, 12, 18, 14, 16, 20, 16];
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
    `Kwoty netto ze sprzedaży POS · porównanie z okresem: ${prevLabel} · pozycje pogrupowane wg kategorii z sumą każdej · warianty (np. stopnie wysmażenia) wcięte pod pozycją · zestawienie kategorii w arkuszu „Kategorie”`,
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

  function addLeafRow(l: SalesLeaf, variant: boolean, category?: string) {
    const row = ws.addRow([
      l.productName,
      category ?? "",
      round(l.qty, 2),
      l.prevQty != null ? round(l.prevQty, 2) : null,
      l.qtyChangePct != null ? round(l.qtyChangePct / 100, 6) : "nowa",
      round(l.netValue, 2),
      l.prevNet != null ? round(l.prevNet, 2) : null,
      l.netChangePct != null ? round(l.netChangePct / 100, 6) : "nowa",
    ]);
    row.getCell(3).numFmt = QTY;
    row.getCell(4).numFmt = QTY;
    row.getCell(5).numFmt = PCT;
    row.getCell(6).numFmt = CUR;
    row.getCell(7).numFmt = CUR;
    row.getCell(8).numFmt = PCT;
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

  // Wiersz sumy (kategorii albo całości). Zmiana % liczona z sum, nie średnia
  // z pozycji — inaczej mała pozycja z +300% zawyżałaby wynik kategorii.
  function addSumRow(text: string, members: SalesGroup[], strong: boolean) {
    const qty = members.reduce((s, g) => s + g.qty, 0);
    const net = members.reduce((s, g) => s + g.netValue, 0);
    const hasPrev = members.some((g) => g.prevQty != null || g.prevNet != null);
    const prevQty = members.reduce((s, g) => s + (g.prevQty ?? 0), 0);
    const prevNet = members.reduce((s, g) => s + (g.prevNet ?? 0), 0);
    const row = ws.addRow([
      text,
      "",
      round(qty, 2),
      hasPrev ? round(prevQty, 2) : null,
      prevQty > 0 ? round((qty - prevQty) / prevQty, 6) : hasPrev ? null : "nowa",
      round(net, 2),
      hasPrev ? round(prevNet, 2) : null,
      prevNet > 0 ? round((net - prevNet) / prevNet, 6) : hasPrev ? null : "nowa",
    ]);
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { bold: true, size: strong ? 12 : 11 };
      c.border = { top: { style: strong ? "medium" : "thin", color: { argb: "FF1F2937" } } };
    });
    row.getCell(3).numFmt = QTY;
    row.getCell(4).numFmt = QTY;
    row.getCell(5).numFmt = PCT;
    row.getCell(6).numFmt = CUR;
    row.getCell(7).numFmt = CUR;
    row.getCell(8).numFmt = PCT;
    return row;
  }

  // Sekcje wg kategorii — w tej samej kolejności i z tym samym kluczowaniem co
  // wykres „Sprzedaż wg kategorii" (`buildCategoryBreakdown`), żeby plik i ekran
  // pokazywały to samo. „Niezakategoryzowane" zawsze na końcu.
  const breakdown = buildCategoryBreakdown(groups);
  const sections = breakdown
    .slice()
    .sort((a, b) => Number(a.category === UNCATEGORIZED) - Number(b.category === UNCATEGORIZED))
    .map((c) => ({ ...c, groups: groups.filter((g) => (g.category ?? UNCATEGORIZED) === c.category) }));

  for (const s of sections) {
    const uncategorized = s.category === UNCATEGORIZED;
    const head = ws.addRow([`${s.label} · ${s.pct.toLocaleString("pl-PL")}% wartości sprzedaży`]);
    ws.mergeCells(head.number, 1, head.number, nCols);
    const hc = head.getCell(1);
    hc.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    // Terakota marki dla kategorii, szarość dla „Niezakategoryzowane" — od razu
    // widać, który blok wymaga uporządkowania kategorii w POS.
    hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: uncategorized ? "FF8A7C63" : "FFC4562F" } };
    head.height = 20;

    for (const g of s.groups) {
      addLeafRow(g, false, s.label);
      for (const v of g.variants) addLeafRow(v, true);
    }
    addSumRow(`Suma: ${s.label}`, s.groups, false);
    ws.addRow([]);
  }

  if (groups.length > 0) addSumRow("SUMA CAŁOŚCI (bez wierszy wciętych)", groups, true);

  // ─── Arkusz 2: zestawienie kategorii (jedna linia = jedna kategoria) ─────────
  if (sections.length > 0) {
    const cs = wb.addWorksheet("Kategorie", { views: [{ state: "frozen", ySplit: 2 }] });
    cs.columns = [30, 12, 18, 14, 16, 20, 16, 12].map((w) => ({ width: w }));
    const t = cs.addRow([`Sprzedaż wg kategorii — ${label}`]);
    cs.mergeCells(t.number, 1, t.number, 8);
    t.getCell(1).font = { bold: true, size: 14 };
    const h = cs.addRow([
      "Kategoria",
      "Sprzedano",
      `Sprzedano (${prevLabel})`,
      "Zmiana ilości",
      "Wartość netto",
      `Wartość netto (${prevLabel})`,
      "Zmiana wartości",
      "Udział",
    ]);
    h.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      c.alignment = { vertical: "middle", wrapText: true };
    });
    const totalNet = groups.reduce((s, g) => s + g.netValue, 0);
    const addCatRow = (text: string, members: SalesGroup[], bold: boolean) => {
      const qty = members.reduce((s, g) => s + g.qty, 0);
      const net = members.reduce((s, g) => s + g.netValue, 0);
      const hasPrev = members.some((g) => g.prevQty != null || g.prevNet != null);
      const prevQty = members.reduce((s, g) => s + (g.prevQty ?? 0), 0);
      const prevNet = members.reduce((s, g) => s + (g.prevNet ?? 0), 0);
      const r = cs.addRow([
        text,
        round(qty, 2),
        hasPrev ? round(prevQty, 2) : null,
        prevQty > 0 ? round((qty - prevQty) / prevQty, 6) : hasPrev ? null : "nowa",
        round(net, 2),
        hasPrev ? round(prevNet, 2) : null,
        prevNet > 0 ? round((net - prevNet) / prevNet, 6) : hasPrev ? null : "nowa",
        totalNet > 0 ? round(net / totalNet, 6) : null,
      ]);
      r.getCell(2).numFmt = QTY;
      r.getCell(3).numFmt = QTY;
      r.getCell(4).numFmt = PCT;
      r.getCell(5).numFmt = CUR;
      r.getCell(6).numFmt = CUR;
      r.getCell(7).numFmt = PCT;
      r.getCell(8).numFmt = "0.0%";
      if (bold) {
        r.eachCell({ includeEmpty: true }, (c) => {
          c.font = { bold: true };
          c.border = { top: { style: "thin", color: { argb: "FF1F2937" } } };
        });
      }
    };
    for (const s of sections) addCatRow(s.label, s.groups, false);
    addCatRow("SUMA", groups, true);
  }

  const buffer = await wb.xlsx.writeBuffer();
  captureServer(userId, "report_exported", { format: "xlsx", report: "sales" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sprzedaz-${period.from}_${period.to}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(Buffer.from(buffer));
});

export default router;
