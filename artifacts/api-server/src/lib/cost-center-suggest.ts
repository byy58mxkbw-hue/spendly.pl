/**
 * Auto-sugerowanie centrum kosztów na podstawie KSeF XML + aliasów centrów.
 *
 * Źródła sygnału (od najpewniejszego):
 *  1. Kod jednostki nabywcy z <Podmiot3><...><Nazwa> (np. "R1", "D2") — to kody
 *     oddziałów NABYWCY, więc spójne u wszystkich dostawców którzy je podają.
 *     Dopasowanie DOKŁADNE do aliasu.
 *  2. Wolny tekst (Uwagi/StopkaFaktury/opisy) — dopasowanie "zawiera alias",
 *     dla dostawców którzy podpisują jednostkę tekstem zamiast kodu.
 *
 * Brak dopasowania → null (faktura zostaje bez centrum, user przypisze ręcznie).
 */

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
    const nazwa = m[1].match(/<Nazwa>([\s\S]*?)<\/Nazwa>/i)?.[1];
    if (nazwa && nazwa.trim()) subunits.push(nazwa.trim());
  }

  const texts: string[] = [];
  for (const tag of ["Uwagi", "StopkaFaktury", "DodatkowyOpis", "P_106E_3", "Opis"]) {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let t: RegExpExecArray | null;
    while ((t = re.exec(s)) !== null) texts.push(t[1]);
  }

  return { subunits, text: norm(texts.join(" ")) };
}

/**
 * Zwraca id sugerowanego centrum kosztów lub null.
 * `costCenters` — lista centrów użytkownika z ich aliasami.
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
