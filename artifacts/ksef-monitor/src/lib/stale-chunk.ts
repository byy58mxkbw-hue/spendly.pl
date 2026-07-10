// Obsługa nieaktualnych chunków po deployu: gdy otwarta karta ma stary index.html,
// lazy-importy wskazują na chunki, których hashe już się zmieniły → 404. Zamiast
// pokazywać błąd, przeładowujemy stronę raz (świeży index.html z nowymi hashami).

const CHUNK_RELOAD_KEY = "spendly_chunk_reload_at";

/** Przeładuj stronę raz na ~10 s (guard przed pętlą przeładowań). */
export function reloadOnceForStaleChunks(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    /* brak sessionStorage — i tak spróbuj przeładować */
  }
  window.location.reload();
  return true;
}

/** Czy błąd to nieudany dynamiczny import (stary chunk po deployu), a nie realny bug. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|loading chunk [\w-]+ failed|importing a module script failed/i.test(
    msg,
  );
}
