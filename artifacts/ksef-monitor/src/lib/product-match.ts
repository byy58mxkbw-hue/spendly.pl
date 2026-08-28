/**
 * Klucz dopasowania nazwy produktu — bliźniak
 * `artifacts/api-server/src/lib/product-match.ts`.
 *
 * Alerty cenowe trzymają nazwę produktu bez klucza obcego, więc to ta funkcja
 * decyduje, czy alert w ogóle się z czymś zepnie. Obie kopie MUSZĄ normalizować
 * identycznie — rozjazd między nimi oznacza alert, który na liście wygląda na
 * powiązany, a w `alert-checker` nie trafia w nic i milczy.
 */
export function productNameKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}
