/**
 * Auto-sugerowanie centrum kosztów na podstawie KSeF XML + aliasów centrów,
 * z fallbackiem na historię dostawcy.
 *
 * Źródła sygnału (od najpewniejszego):
 *  1. Kod jednostki nabywcy z <Podmiot3>...<Nazwa> (np. "R1", "D2") — kody
 *     oddziałów NABYWCY. Dopasowanie DOKŁADNE do aliasu.
 *  2. Wolny tekst (DodatkowyOpis/Wartosc/Uwagi/StopkaFaktury) — "zawiera alias",
 *     np. opis dostawy "EUFORIA MYŚLENICE RESTAURACJA".
 *  3. Domyślne centrum dostawcy (ustawione przez użytkownika).
 *  4. Dominujące centrum dostawcy z historii przypisań.
 *
 * Brak sygnału → null (użytkownik przypisze ręcznie).
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

function stripNs(xml: string): string {
  return xml
    .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, "")
    .replace(/<(\w+):/g, "<")
    .replace(/<\/(\w+):/g, "</");
}

const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();

/** Wyciąga z XML kody jednostek (Podmiot3 → Nazwa) i wolny tekst opisowy. */
export function extractCostCenterSignals(xml: string): { subunits: string[]; text: string } {
  const s = stripNs(xml);

  const subunits: string[] = [];
  const blockRe = /<Podmiot3>([\s\S]*?)<\/Podmiot3>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(s)) !== null) {
    const nre = /<Nazwa>([\s\S]*?)<\/Nazwa>/gi;
    let n: RegExpExecArray | null;
    while ((n = nre.exec(m[1])) !== null) {
      if (n[1].trim()) subunits.push(n[1].trim());
    }
  }

  // Pola opisowe FA(2): DodatkowyOpis ma <Klucz>/<Wartosc>; łapiemy też same Wartosc.
  const texts: string[] = [];
  for (const tag of [
    "Uwagi", "StopkaFaktury", "DodatkowyOpis", "DodatkowaInformacja",
    "Adnotacje", "P_106E_3", "Opis", "Wartosc",
  ]) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let t: RegExpExecArray | null;
    while ((t = re.exec(s)) !== null) texts.push(t[1]);
  }

  return { subunits, text: norm(texts.join(" ")) };
}

/**
 * Sugestia wyłącznie z XML (aliasy/tekst). Zwraca id centrum lub null.
 * `costCenters` — lista centrów użytkownika z aliasami.
 */
export function suggestCostCenterId(
  xml: string,
  costCenters: Array<{ id: number; aliases: string[] }>,
): number | null {
  if (!xml || costCenters.length === 0) return null;
  const { subunits, text } = extractCostCenterSignals(xml);
  const subN = subunits.map(norm).filter(Boolean);

  // 1. Dokładne dopasowanie kodu jednostki (Podmiot3) do aliasu — najpewniejsze.
  for (const cc of costCenters) {
    for (const a of cc.aliases ?? []) {
      const an = norm(a);
      if (an && subN.includes(an)) return cc.id;
    }
  }

  // 2. Dopasowanie "zawiera alias" w wolnym tekście / nazwach jednostek.
  const haystack = norm(`${text} ${subN.join(" ")}`);
  if (haystack) {
    for (const cc of costCenters) {
      for (const a of cc.aliases ?? []) {
        const an = norm(a);
        if (an.length >= 2 && haystack.includes(an)) return cc.id;
      }
    }
  }

  return null;
}

/**
 * Model nauczony z historii przypisań użytkownika. Budowany RAZ (3 zapytania
 * agregujące), potem reużywany do klasyfikacji wielu faktur bez odpytywania bazy.
 */
export type CostCenterModel = {
  priors: Map<number, number>;                       // centerId → P(centrum) (base rate, per faktura)
  productDist: Map<string, Map<number, number>>;     // nazwa produktu (norm) → (centerId → liczba pozycji)
  itemTotal: Map<number, number>;                    // centerId → łączna liczba pozycji (mianownik P(produkt|centrum))
  vocab: number;                                     // rozmiar słownika produktów (wygładzanie Laplace'a)
  supplierDominant: Map<number, { id: number; share: number; count: number }>;
  eligibleCenters: number[];                          // centra z dość historii do klasyfikacji
};

const EMPTY_MODEL: CostCenterModel = {
  priors: new Map(), productDist: new Map(), itemTotal: new Map(), vocab: 0,
  supplierDominant: new Map(), eligibleCenters: [],
};

/** Buduje model z faktur już przypisanych (produkty, priors, dominujące centrum dostawcy). */
export async function buildCostCenterModel(userId: string): Promise<CostCenterModel> {
  // 1. Priors: liczba faktur na centrum + kwalifikacja (min. 8 faktur historii).
  const priorRes = await db.execute(sql`
    SELECT cost_center_id AS cc, COUNT(*)::int AS n
    FROM invoices WHERE user_id = ${userId} AND cost_center_id IS NOT NULL
    GROUP BY cost_center_id
  `);
  const priorRows = priorRes.rows as { cc: number; n: number }[];
  const totalAssigned = priorRows.reduce((s, r) => s + Number(r.n), 0);
  if (totalAssigned === 0) return EMPTY_MODEL;
  const priors = new Map<number, number>();
  const eligibleCenters: number[] = [];
  for (const r of priorRows) {
    priors.set(r.cc, Number(r.n) / totalAssigned);
    if (Number(r.n) >= 8) eligibleCenters.push(r.cc);
  }

  // 2. Rozkład produktów między centrami (nazwa produktu → centrum → liczba pozycji).
  const distRes = await db.execute(sql`
    SELECT lower(ii.product_name) AS pn, i.cost_center_id AS cc, COUNT(*)::int AS n
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.user_id = ${userId} AND i.cost_center_id IS NOT NULL
    GROUP BY 1, 2
  `);
  const productDist = new Map<string, Map<number, number>>();
  const itemTotal = new Map<number, number>();
  for (const r of distRes.rows as { pn: string; cc: number; n: number }[]) {
    const key = (r.pn ?? "").replace(/\s+/g, " ").trim();
    if (!key) continue;
    let m = productDist.get(key);
    if (!m) { m = new Map(); productDist.set(key, m); }
    m.set(r.cc, Number(r.n));
    itemTotal.set(r.cc, (itemTotal.get(r.cc) ?? 0) + Number(r.n));
  }
  const vocab = productDist.size;

  // 3. Dominujące centrum dostawcy (fallback, gdy brak sygnału z faktury).
  const supRes = await db.execute(sql`
    SELECT supplier_id AS sid, cost_center_id AS cc, COUNT(*)::int AS n
    FROM invoices
    WHERE user_id = ${userId} AND cost_center_id IS NOT NULL AND supplier_id IS NOT NULL
    GROUP BY 1, 2
  `);
  const supAgg = new Map<number, Map<number, number>>();
  for (const r of supRes.rows as { sid: number; cc: number; n: number }[]) {
    let m = supAgg.get(r.sid);
    if (!m) { m = new Map(); supAgg.set(r.sid, m); }
    m.set(r.cc, Number(r.n));
  }
  const supplierDominant = new Map<number, { id: number; share: number; count: number }>();
  for (const [sid, m] of supAgg) {
    let total = 0, topId = 0, topN = 0;
    for (const [cc, n] of m) { total += n; if (n > topN) { topN = n; topId = cc; } }
    if (total > 0) supplierDominant.set(sid, { id: topId, share: topN / total, count: total });
  }

  return { priors, productDist, itemTotal, vocab, supplierDominant, eligibleCenters };
}

const PRODUCT_MIN_CONFIDENCE = 0.65; // dobrane na danych: ~92% trafności, ~50% pokrycia

/**
 * Klasyfikacja centrum po produktach faktury — naive Bayes:
 *   score(C) = log P(C) + Σ_produkt log P(produkt | C),  P(produkt|C) wygładzone Laplace'em.
 * Base rate wchodzi przez log P(C), więc małe centra nie są rozdmuchiwane.
 * Zwraca centrum tylko przy pewności ≥ progu — inaczej null (brak sugestii).
 */
export function classifyByProducts(
  productNames: string[],
  model: CostCenterModel,
): { centerId: number; confidence: number } | null {
  const centers = model.eligibleCenters;
  if (productNames.length === 0 || centers.length === 0 || model.vocab === 0) return null;

  const alpha = 1; // wygładzanie Laplace'a
  const score = new Map<number, number>(centers.map((c) => [c, Math.log(model.priors.get(c) || 1e-6)]));
  let used = 0;

  for (const raw of productNames) {
    const key = (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const dist = key ? model.productDist.get(key) : undefined;
    if (!dist) continue; // produkt nieznany z historii — pomijamy
    used++;
    for (const c of centers) {
      const pGivenC = ((dist.get(c) ?? 0) + alpha) / ((model.itemTotal.get(c) ?? 0) + alpha * model.vocab);
      score.set(c, (score.get(c) ?? 0) + Math.log(pGivenC));
    }
  }
  if (used < 1) return null; // brak rozpoznanych produktów; przy 1+ o jakości decyduje próg pewności
                             // (dzięki temu 1-pozycyjne faktury, np. paliwo, też dostają sugestię)

  let bestC = centers[0], best = -Infinity;
  for (const c of centers) {
    const s = score.get(c) ?? -Infinity;
    if (s > best) { best = s; bestC = c; }
  }
  let denom = 0;
  for (const c of centers) denom += Math.exp((score.get(c) ?? -Infinity) - best);
  const confidence = 1 / denom; // softmax najlepszego centrum
  if (confidence < PRODUCT_MIN_CONFIDENCE) return null;
  return { centerId: bestC, confidence };
}

/**
 * Pełna sugestia centrum (czysta, bez zapytań — używa gotowego modelu):
 * XML (kod jednostki / opis) → produkty faktury → domyślne centrum dostawcy → historia dostawcy.
 * Zwraca id centrum lub null (bez auto-przypisania — użytkownik potwierdza).
 */
export function computeCostCenterSuggestion(params: {
  xml: string | null;
  centers: Array<{ id: number; aliases: string[] }>;
  productNames: string[];
  supplierId: number | null;
  supplierDefaultCostCenterId?: number | null;
  model: CostCenterModel;
}): number | null {
  const { xml, centers, productNames, supplierId, supplierDefaultCostCenterId, model } = params;

  // 1. Sygnał z faktury: kod jednostki (R1/D2) lub opis (restauracja/sala weselna).
  if (xml) {
    const byXml = suggestCostCenterId(xml, centers);
    if (byXml != null) return byXml;
  }
  // 2. Sygnał z produktów faktury (nauczony profil per centrum).
  const byProd = classifyByProducts(productNames, model);
  if (byProd) return byProd.centerId;
  // 3. Domyślne centrum dostawcy (ustawione przez użytkownika).
  if (supplierDefaultCostCenterId != null) return supplierDefaultCostCenterId;
  // 4. Dominujące centrum dostawcy z historii (min. 2 faktury, przewaga ≥ 60%).
  if (supplierId != null) {
    const dom = model.supplierDominant.get(supplierId);
    if (dom && dom.count >= 2 && dom.share >= 0.6) return dom.id;
  }
  return null;
}
