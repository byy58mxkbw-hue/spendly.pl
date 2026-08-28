import { eq } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";

/**
 * Klucz dopasowania nazwy produktu do alertu cenowego.
 *
 * Alerty trzymają NAZWĘ produktu (bez FK), więc drobna różnica — inna wielkość
 * liter, spacja na końcu, podwójna spacja w środku — decydowała o tym, czy alert
 * w ogóle kiedykolwiek się odpali. Front rozwiązywał nazwę tolerancyjnie
 * (`toLowerCase().trim()`), a `alert-checker` porównywał znak w znak, więc alert
 * z literówką wyglądał na aktywny i milczał w nieskończoność.
 *
 * Ten helper jest jednym źródłem prawdy dla obu stron.
 */
export function productNameKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export interface MatchedProduct {
  id: number;
  name: string;
}

/**
 * Mapa `klucz → produkt` dla jednego użytkownika. Jedno zapytanie zamiast
 * osobnego SELECT-a per alert (było N+1 w `computeTriggeredAlerts`).
 */
export async function buildProductNameIndex(userId: string): Promise<Map<string, MatchedProduct>> {
  const rows = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.userId, userId));

  const index = new Map<string, MatchedProduct>();
  for (const row of rows) {
    const key = productNameKey(row.name);
    const prev = index.get(key);
    // Gdy dwa produkty normalizują się do tego samego klucza, wygrywa najniższe
    // id — stabilnie, żeby alert nie „przeskakiwał" między nimi przy kolejnych
    // przeliczeniach.
    if (!prev || row.id < prev.id) index.set(key, row);
  }
  return index;
}
