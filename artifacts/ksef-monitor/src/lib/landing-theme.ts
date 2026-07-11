// Motyw stron publicznych i zalogowanego panelu — jeden wspólny klucz localStorage,
// żeby wybór (jasny/ciemny) przenosił się między landingiem, stronami marketingowymi
// (marketing-theme.ts), stronami prawnymi i panelem po zalogowaniu (hooks/use-theme.ts).
// Domyślnie ciemny.

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "spendly_site_theme";
// Przed scaleniem kluczy panel po zalogowaniu i strony prawne trzymały motyw pod
// tym starym kluczem. Migrujemy istniejący wybór, żeby użytkownicy, którzy już go
// ustawili, nie stracili preferencji po przejściu na wspólny klucz.
const LEGACY_THEME_STORAGE_KEY = "spendly_theme";

/** Odczytuje zapisaną preferencję motywu (lub null, gdy brak). */
export function readSavedTheme(): ThemeMode | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;

    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === "dark" || legacy === "light") {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch { /* brak dostępu do localStorage */ }
  return null;
}

/** Zapisuje preferencję motywu. */
export function saveTheme(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* ignore */ }
}
