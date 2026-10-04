// Dopasowanie dostawcy z OCR do istniejących dostawców użytkownika.
//
// Realny przypadek (przegląd kont 2026-10-05): lokal wgrał zdjęcia faktur Chefs
// Culinar. OCR raz odczytał NIP 5172930715, raz 5272930715 (błąd jednej cyfry),
// a nazwa raz brzmiała „Chefs Culinar Sp. z o.o.”, raz „Chefs Culinar oddział
// Warszawa”. Front dopasowywał tylko „nazwa zawiera nazwę”, więc powstały TRZY
// rekordy tego samego dostawcy — a dedup faktur działa per dostawca, więc te
// same faktury zapisały się dwa razy.

/** Suma kontrolna polskiego NIP (wagi 6,5,7,2,3,4,5,6,7; mod 11). */
export function isValidNip(raw: string | null | undefined): boolean {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length !== 10 || /^(\d)\1{9}$/.test(d)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, wi, i) => s + wi * Number(d[i]), 0);
  const check = sum % 11;
  return check !== 10 && check === Number(d[9]);
}

// Formy prawne i słowa, które nie odróżniają firm (oddziały, kraj, miasto oddziału).
const NOISE = new Set([
  "sp", "z", "o", "oo", "spółka", "spolka", "sa", "s", "a", "sk", "ska", "sj", "spj", "komandytowa", "jawna",
  "akcyjna", "cywilna", "ograniczoną", "ograniczona", "odpowiedzialnością", "odpowiedzialnoscia",
  "oddział", "oddzial", "filia", "w", "polska", "poland", "pl", "the", "i", "oraz",
]);

/** Znaczące słowa nazwy firmy: małe litery, bez interpunkcji, form prawnych i szumu. */
export function companyTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NOISE.has(t));
}

/**
 * Czy dwie nazwy firm to (prawdopodobnie) ta sama firma: zgodne pierwsze dwa
 * znaczące słowa (albo jedno, gdy nazwa ma tylko jedno). „Chefs Culinar Sp. z o.o.”
 * = „CHEFS CULINAR POLSKA Sp. z o.o.” = „Chefs Culinar oddział Warszawa”.
 */
export function sameCompanyName(a: string, b: string): boolean {
  const ta = companyTokens(a);
  const tb = companyTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const n = Math.min(2, ta.length, tb.length);
  // Jednowyrazowa nazwa musi być wystarczająco charakterystyczna (nie „Dostawca”).
  if (n === 1 && (ta[0].length < 4 || ta[0] !== tb[0])) return false;
  for (let i = 0; i < n; i++) if (ta[i] !== tb[i]) return false;
  return true;
}

function digitDiff(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export type SupplierCandidate = { id: number; name: string; taxId: string | null };
export type SupplierMatch = { id: number; reason: "nip" | "name" | "nip_typo" };

/**
 * Dostawca pasujący do danych z OCR, w kolejności pewności:
 * 1) ten sam NIP; 2) ta sama firma po nazwie; 3) NIP różny o JEDNĄ cyfrę
 * (typowy błąd OCR) — tylko gdy odczytany NIP nie przechodzi sumy kontrolnej,
 * żeby nie skleić dwóch prawdziwych firm o podobnych numerach.
 */
export function findSupplierMatch(
  ocr: { nip: string | null; name: string | null },
  suppliers: SupplierCandidate[],
): SupplierMatch | null {
  const nip = (ocr.nip ?? "").replace(/\D/g, "");
  if (nip.length === 10) {
    const byNip = suppliers.find((s) => (s.taxId ?? "").replace(/\D/g, "") === nip);
    if (byNip) return { id: byNip.id, reason: "nip" };
  }
  if (ocr.name) {
    const byName = suppliers.find((s) => sameCompanyName(ocr.name!, s.name));
    if (byName) return { id: byName.id, reason: "name" };
  }
  if (nip.length === 10 && !isValidNip(nip)) {
    const near = suppliers.filter((s) => digitDiff((s.taxId ?? "").replace(/\D/g, ""), nip) === 1);
    if (near.length === 1) return { id: near[0].id, reason: "nip_typo" };
  }
  return null;
}
