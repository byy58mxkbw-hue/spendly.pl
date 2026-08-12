import { useState, useEffect } from "react";

/**
 * Wspólny motyw statycznych stron marketingowo-SEO (cennik, ksef, ocr-faktur).
 * Ten sam localStorage co landing (home.tsx), żeby wybór motywu przenosił się
 * między stronami. Domyślnie ciemny — zgodnie z landingiem.
 */
// Paleta „edytorski gastro" — ciemny papier / papier kremowy, akcent terakota.
// Te same wartości co tokeny w index.css i zmienne w landing.css.
export const MARKETING_DARK = {
  bg: "#17130E",
  card: "#201A13",
  border: "#392F22",
  text: "#F0E9DB",
  muted: "#9C8F79",
  accent: "#E06A3C",
  // accentText = akcent do TEKSTU (WCAG AA). W dark terakota #E06A3C na ciemnym
  // papierze daje 5,6:1. W light #C4562F na kremie to tylko 3,8:1 — za mało na
  // drobny tekst, więc tam idzie ciemniejszy wariant.
  accentText: "#E06A3C",
  accentDim: "#33251A",
  navBg: "#17130E",
  panel: "#2A2318",
  onAccent: "#17130E",
};

export const MARKETING_LIGHT = {
  bg: "#F4EDE0",
  card: "#FBF7EF",
  border: "#E2D8C6",
  text: "#211B12",
  muted: "#8A7C63",
  accent: "#A8431F", // ciemniejsza terakota — na tym tle daje 6:1 z białym tekstem
  accentText: "#A8431F", // kontrast 5,2:1 na kremowym tle (AA)
  accentDim: "#EFE0C6",
  navBg: "#F4EDE0",
  panel: "#FFFFFF",
  onAccent: "#FFFFFF",
};

export type MarketingPalette = typeof MARKETING_DARK;
export type MarketingTheme = "dark" | "light";

const STORAGE_KEY = "spendly_site_theme";

export function useMarketingTheme() {
  const [theme, setTheme] = useState<MarketingTheme>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === "light" || s === "dark") return s;
    } catch { /* ignore */ }
    return "dark";
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const c = theme === "light" ? MARKETING_LIGHT : MARKETING_DARK;
  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, c, toggle };
}
