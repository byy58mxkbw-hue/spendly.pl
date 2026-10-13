// Numery dokumentów WZ (wydanie zewnętrzne), z których składa się faktura.
//
// Skąd: FA(2)/FA(3) mają w <Fa> pole <WZ> (numer WZ, może wystąpić wiele razy) — to źródło
// rozstrzygające. Część dostawców nie wypełnia go i wpisuje WZ w <DodatkowyOpis> albo w stopce;
// wtedy czytamy je stamtąd. Gdy pole <WZ> jest, opis IGNORUJEMY: Stelma podaje te same WZ
// w obu miejscach („Do dokumentów WZ: 05.10 WZ983 519,12 …”), a z opisu wychodziły duplikaty
// i daty brane za numery („WZ 05.10”) — realny przypadek 2026-10-13.
// Regexowo, bez DOM — XXE-safe (reguła 23).

// „WZ983”, „WZ/983/2026”, „WZ-983”, „WZ nr 983/10/26”. Numer musi zaczynać się cyfrą
// i NIE może być samą datą („05.10”, „05.10.2026”).
const WZ_INLINE_RE = /\bWZ\s*:?\s*(?:nr\.?\s*)?([/\-]?)\s*(\d[\dA-Z/\-_.]{0,40})/gi;
const DATE_RE = /^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/;

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

/** Klucz tożsamości dokumentu: pierwszy ciąg cyfr („WZ983” = „WZ/983/2026” = „983”). */
export function wzKey(n: string): string {
  return n.match(/\d+/)?.[0]?.replace(/^0+/, "") ?? n.toLowerCase();
}

function inlineNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of decode(text).matchAll(WZ_INLINE_RE)) {
    // Linia „05.10 WZ983 519,12” (data, numer, kwota): data i kwota nie są częścią numeru.
    const num = m[2]!.replace(/[.,;/\-]+$/, "");
    if (!num || DATE_RE.test(num)) continue;
    out.push(m[1] ? `WZ${m[1]}${num}` : `WZ ${num}`);
  }
  return out;
}

// Linia opisu „05.10 WZ983 519,12” — data, numer WZ, kwota (format Stelmy).
const DETAIL_LINE_RE = /(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s+WZ\s*[/\-]?\s*(\d[\dA-Z/\-_.]*)\s+(\d{1,3}(?:[  ]?\d{3})*,\d{2})/gi;

export type WzDetail = { date: string | null; amount: number | null };

/**
 * Data i kwota każdej WZ z opisu faktury (gdy dostawca je podaje), po kluczu numeru
 * (wzKey). Pusta mapa, gdy opisu w tym formacie nie ma.
 */
export function extractWzDetails(xmlRaw: string): Map<string, WzDetail> {
  const out = new Map<string, WzDetail>();
  if (!xmlRaw) return out;
  const xml = stripNamespaces(xmlRaw);
  const texts = [
    ...[...xml.matchAll(/<Wartosc>([\s\S]*?)<\/Wartosc>/gi)].map((m) => m[1]!),
    ...[...xml.matchAll(/<(StopkaFaktury|Informacje|Stopka)>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]!.replace(/<[^>]+>/g, " ")),
  ];
  for (const t of texts) {
    for (const m of decode(t).matchAll(DETAIL_LINE_RE)) {
      const amount = Number(m[3]!.replace(/[  ]/g, "").replace(",", "."));
      out.set(wzKey(m[2]!), { date: m[1]!, amount: Number.isFinite(amount) ? amount : null });
    }
  }
  return out;
}

/**
 * Numery WZ z XML faktury KSeF — unikalne (po numerze dokumentu), w kolejności wystąpienia.
 * Pusta tablica, gdy faktura ich nie podaje.
 */
export function extractWzNumbers(xmlRaw: string): string[] {
  if (!xmlRaw) return [];
  const xml = stripNamespaces(xmlRaw);
  const out: string[] = [];
  const add = (v: string) => {
    const n = v.replace(/\s+/g, " ").trim();
    if (n && !out.some((x) => wzKey(x) === wzKey(n))) out.push(n);
  };

  // 1. Pole <WZ> ze schematu FA — gdy jest, to jedyne źródło.
  for (const m of xml.matchAll(/<WZ>([\s\S]*?)<\/WZ>/gi)) splitList(m[1]!).forEach(add);
  if (out.length > 0) return out.slice(0, 100);

  // 2. <DodatkowyOpis><Klucz>…</Klucz><Wartosc>…</Wartosc></DodatkowyOpis>
  for (const m of xml.matchAll(/<DodatkowyOpis>([\s\S]*?)<\/DodatkowyOpis>/gi)) {
    const block = m[1]!;
    const key = decode(block.match(/<Klucz>([\s\S]*?)<\/Klucz>/i)?.[1] ?? "");
    const val = block.match(/<Wartosc>([\s\S]*?)<\/Wartosc>/i)?.[1] ?? "";
    const inline = inlineNumbers(val);
    if (inline.length > 0) inline.forEach(add);
    // Klucz „Dokumenty WZ” z samą listą numerów („WZ/55/26, WZ/56/26” albo „55/26, 56/26”).
    else if (/\bWZ\b|wydani/i.test(key)) splitList(val).filter((v) => /\d/.test(v) && !DATE_RE.test(v)).forEach(add);
  }

  // 3. Stopka faktury / informacje dodatkowe.
  for (const tag of ["StopkaFaktury", "Informacje", "Stopka"]) {
    for (const m of xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"))) {
      inlineNumbers(m[1]!.replace(/<[^>]+>/g, " ")).forEach(add);
    }
  }
  return out.slice(0, 100);
}
