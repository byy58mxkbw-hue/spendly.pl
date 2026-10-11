// Progi anonimowości porównania cen (spec benchmark v2, etap 1) — JEDYNE miejsce, gdzie są
// zdefiniowane. Nadpisywalne env, ale nigdy poniżej wartości minimalnych: przy 3 cenach
// a < b < c mediana i percentyle zdradzały dokładne ceny pozostałych lokali (realny wyciek
// do 2026-10-11), więc za niskie env (np. pozostałe na produkcji BENCHMARK_MIN_USERS=3)
// jest ignorowane.

function envAtLeast(name: string, fallback: number, floor: number): number {
  const v = Number(process.env[name]);
  return Math.max(floor, Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback);
}

/** Mediana dla oglądającego: co najmniej tyle INNYCH restauracji (bez niego). */
export function medianMinOthers(): number {
  return envAtLeast("BENCHMARK_MIN_USERS", 5, 5);
}

/** …z czego co najmniej tyle z fakturami pobranymi z KSeF (trudne do podrobienia). */
export function medianMinKsef(): number {
  return envAtLeast("BENCHMARK_MIN_KSEF", 2, 2);
}

/** Środkowa połowa rynku (p25–p75): co najmniej tyle innych restauracji, inaczej ukryta. */
export function spreadMinOthers(): number {
  return envAtLeast("BENCHMARK_MIN_SPREAD", 8, 8);
}

/** Publiczny agregat (strona cen rynkowych, lista grup): restauracji łącznie. */
export function publicMinUsers(): number {
  return envAtLeast("BENCHMARK_PUBLIC_MIN", 5, 5);
}

/** Zaokrąglenie publikowanych cen do 10 gr — ostatnie grosze nie zdradzają pojedynczej ceny. */
export function roundPublished(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}

/** Liczba restauracji tylko w przedziałach — nigdy dokładnie. */
export function sourceBucket(n: number): "5-9" | "10-19" | "20+" {
  return n >= 20 ? "20+" : n >= 10 ? "10-19" : "5-9";
}

export function contributionBucket(n: number): "<5" | "5-9" | "10+" {
  return n >= 10 ? "10+" : n >= 5 ? "5-9" : "<5";
}
