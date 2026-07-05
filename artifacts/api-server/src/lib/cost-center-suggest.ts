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

/** Dominujące centrum kosztów dostawcy z historii przypisań. */
export async function dominantCostCenterForSupplier(
  userId: string,
  supplierId: number,
): Promise<{ id: number; share: number; count: number } | null> {
  const res = await db.execute(sql`
    SELECT cost_center_id, COUNT(*)::int AS cnt
    FROM invoices
    WHERE user_id = ${userId} AND supplier_id = ${supplierId} AND cost_center_id IS NOT NULL
    GROUP BY cost_center_id
    ORDER BY cnt DESC
  `);
  const rows = res.rows as { cost_center_id: number; cnt: number }[];
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
  const top = rows[0];
  return { id: top.cost_center_id, share: total > 0 ? Number(top.cnt) / total : 0, count: total };
}

/**
 * Pełna sugestia centrum: XML → domyślne centrum dostawcy → historia dostawcy.
 * Zwraca id centrum lub null (bez auto-przypisania — użytkownik potwierdza).
 */
export async function computeCostCenterSuggestion(params: {
  userId: string;
  supplierId: number | null;
  xml: string | null;
  centers: Array<{ id: number; aliases: string[] }>;
  supplierDefaultCostCenterId?: number | null;
}): Promise<number | null> {
  const { userId, supplierId, xml, centers, supplierDefaultCostCenterId } = params;

  // 1. Sygnał z faktury (kod jednostki / opis).
  if (xml) {
    const byXml = suggestCostCenterId(xml, centers);
    if (byXml != null) return byXml;
  }
  // 2. Domyślne centrum dostawcy (ustawione przez użytkownika).
  if (supplierDefaultCostCenterId != null) return supplierDefaultCostCenterId;
  // 3. Dominujące centrum dostawcy z historii (min. 2 faktury, przewaga ≥ 60%).
  if (supplierId != null) {
    const dom = await dominantCostCenterForSupplier(userId, supplierId);
    if (dom && dom.count >= 2 && dom.share >= 0.6) return dom.id;
  }
  return null;
}
