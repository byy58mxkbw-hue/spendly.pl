/**
 * Fold znaków diakrytycznych do ich łacińskich odpowiedników: polskie
 * (ą/ć/ę/ł/ń/ó/ś/ź/ż → a/c/e/l/n/o/s/z/z) ORAZ inne akcentowane litery
 * spotykane w nazwach produktów zapożyczonych (np. francuskie "é" w "comté",
 * "crème", "gruyère") — dzięki NFD + usunięciu znaków składających.
 * "ł"/"Ł" nie mają kanonicznej dekompozycji NFD (to nie jest "l" z akcentem,
 * tylko osobny znak), więc foldujemy je jawnie.
 *
 * Robimy to RAZ, symetrycznie: i na nazwie produktu przed dopasowaniem, i na
 * słowach kluczowych przy kompilacji matcherów — dzięki temu nazwa bez ogonków
 * (częsta z OCR/ręcznego wpisu, np. "twarog" zamiast "twaróg", albo "comte"
 * zamiast "comté") trafia w keyword zapisany z ogonkami, i odwrotnie. Przed tą
 * zmianą żadna warstwa normalizacji w repo nie robiła fold diakrytyków — to była
 * jedna z głównych przyczyn, dla których nietypowe zapisy nazw nie trafiały
 * w kategorię.
 */
const COMBINING_MARKS_RE = new RegExp("[̀-ͯ]", "g");

export function foldDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS_RE, "") // combining diacritical marks left behind by NFD
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
}

/**
 * Normalizacja wspólna dla dopasowania kategorii: lowercase → fold diakrytyków
 * → usuń wiodący "#" (stare oznaczenie w danych) → trim.
 * To jest KANONICZNA normalizacja do matchowania — używana zarówno po stronie
 * przygotowania nazwy produktu, jak i przy kompilacji słów kluczowych.
 */
export function normalizeForMatch(s: string): string {
  return foldDiacritics(s.toLowerCase()).replace(/^#/, "").trim();
}
