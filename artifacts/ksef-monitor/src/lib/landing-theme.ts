import { useState } from "react";

// Wspólny motyw stron publicznych (landing, regulamin, polityka prywatności).
// Dwie palety + przełącznik z zapisem wyboru w localStorage. Domyślnie jasny.

export type Palette = {
  bg: string; card: string; cardHover: string; border: string; borderHover: string; borderStrong: string;
  text: string; muted: string; accent: string; accentHover: string; accentDim: string; accentDimHover: string;
  red: string; redDim: string; tintFaint: string; tint: string; tintStrong: string;
};

export const DARK: Palette = {
  bg: "#0B0F14", card: "#131A22", cardHover: "#171F2A",
  border: "rgba(255,255,255,0.08)", borderHover: "rgba(61,220,151,0.35)", borderStrong: "rgba(255,255,255,0.2)",
  text: "#F5F7FA", muted: "#9BA6B2",
  accent: "#3DDC97", accentHover: "#5BFFB5", accentDim: "rgba(61,220,151,0.12)", accentDimHover: "rgba(61,220,151,0.2)",
  red: "#F87171", redDim: "rgba(248,113,113,0.1)",
  tintFaint: "rgba(255,255,255,0.02)", tint: "rgba(255,255,255,0.03)", tintStrong: "rgba(255,255,255,0.04)",
};

export const LIGHT: Palette = {
  bg: "#F7FAFC", card: "#FFFFFF", cardHover: "#F1F5F9",
  border: "rgba(15,23,42,0.10)", borderHover: "rgba(13,148,136,0.45)", borderStrong: "rgba(15,23,42,0.20)",
  text: "#0F172A", muted: "#64748B",
  accent: "#0D9488", accentHover: "#0F766E", accentDim: "rgba(13,148,136,0.10)", accentDimHover: "rgba(13,148,136,0.16)",
  red: "#DC2626", redDim: "rgba(220,38,38,0.08)",
  tintFaint: "rgba(15,23,42,0.02)", tint: "rgba(15,23,42,0.035)", tintStrong: "rgba(15,23,42,0.05)",
};

// Jeden wspólny klucz preferencji motywu dla landingu i aplikacji.
export const THEME_STORAGE_KEY = "spendly_theme";

export type ThemeMode = "light" | "dark";

/** Odczytuje zapisaną preferencję motywu (lub null, gdy brak). */
export function readSavedTheme(): ThemeMode | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* brak dostępu do localStorage */ }
  return null;
}

/** Zapisuje preferencję motywu. */
export function saveTheme(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* ignore */ }
}

// Motyw stron publicznych — domyślnie jasny. Wybór współdzielony z aplikacją (ten sam klucz).
export function useLandingTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => readSavedTheme() ?? "light");
  const toggle = () =>
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      saveTheme(next);
      return next;
    });
  const c = theme === "light" ? LIGHT : DARK;
  return { theme, toggle, c };
}
