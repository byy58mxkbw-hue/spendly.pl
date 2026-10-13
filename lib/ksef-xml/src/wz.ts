// Numery dokumentów WZ (wydanie zewnętrzne), z których składa się faktura.
//
// Skąd: FA(2)/FA(3) mają w <Fa> pole <WZ> (numer WZ, może wystąpić wiele razy). Część
// dostawców wpisuje je zamiast tego w <DodatkowyOpis> (Klucz „WZ…” / Wartosc) albo w
// stopce. Regexowo, bez DOM — XXE-safe (reguła 23); XML z DOCTYPE/ENTITY i tak nie
// przechodzi importu.

const WZ_INLINE_RE = /\bWZ\s*[:.\-/]?\s*(?:nr\.?\s*)?([A-Z0-9][A-Z0-9/\-_.]{2,40})/gi;

function stripNamespaces(xml: string): string {
  return xml.replace(/<(\/?)\w+:/g, "<$1");
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

/** „WZ/123/2026, WZ/124/2026” → osobne numery. */
function splitList(value: string): string[] {
  return value
    .split(/[,;\n]|\s{2,}/)
    .map((v) => decode(v).replace(/^nr\.?\s*/i, "").trim())
    .filter((v) => v.length >= 2 && v.length <= 60);
}

/**
 * Numery WZ z XML faktury KSeF — unikalne, w kolejności wystąpienia. Pusta tablica, gdy
 * faktura ich nie podaje.
 */
export function extractWzNumbers(xmlRaw: string): string[] {
  if (!xmlRaw) return [];
  const xml = stripNamespaces(xmlRaw);
  const out: string[] = [];
  const add = (v: string) => {
    const n = v.replace(/\s+/g, " ").trim();
    if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  };

  // 1. Pole <WZ> ze schematu FA.
  for (const m of xml.matchAll(/<WZ>([\s\S]*?)<\/WZ>/gi)) splitList(m[1]!).forEach(add);

  // 2. <DodatkowyOpis><Klucz>…WZ…</Klucz><Wartosc>…</Wartosc></DodatkowyOpis>
  for (const m of xml.matchAll(/<DodatkowyOpis>([\s\S]*?)<\/DodatkowyOpis>/gi)) {
    const block = m[1]!;
    const key = block.match(/<Klucz>([\s\S]*?)<\/Klucz>/i)?.[1] ?? "";
    const val = block.match(/<Wartosc>([\s\S]*?)<\/Wartosc>/i)?.[1] ?? "";
    if (/\bWZ\b|wydani/i.test(decode(key))) splitList(val).forEach(add);
    else for (const w of decode(val).matchAll(WZ_INLINE_RE)) add(`WZ ${w[1]!.replace(/[.,;]+$/, "")}`);
  }

  // 3. Stopka faktury / informacje dodatkowe: „WZ/2026/10/123”, „WZ: 123/10/26”.
  for (const tag of ["StopkaFaktury", "Informacje", "Stopka"]) {
    for (const m of xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"))) {
      for (const w of decode(m[1]!.replace(/<[^>]+>/g, " ")).matchAll(WZ_INLINE_RE)) add(`WZ ${w[1]!.replace(/[.,;]+$/, "")}`);
    }
  }
  return out.slice(0, 100);
}
