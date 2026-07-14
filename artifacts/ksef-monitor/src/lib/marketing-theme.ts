import { useState, useEffect } from "react";

/**
 * Wspólny motyw statycznych stron marketingowo-SEO (cennik, ksef, ocr-faktur).
 * Ten sam localStorage co landing (home.tsx), żeby wybór motywu przenosił się
 * między stronami. Domyślnie ciemny — zgodnie z landingiem.
 */
export const MARKETING_DARK = {
  bg: "#0B0F14",
  card: "#131A22",
  border: "rgba(255,255,255,0.08)",
  text: "#F5F7FA",
  muted: "#9BA6B2",
  accent: "#3DDC97",
  // accentText = akcent do TEKSTU (WCAG AA). W dark = accent (kontrast 10.9:1 OK);
  // w light accent #14B8A6 na tekście ma tylko 2.3:1, więc tam ciemniejszy teal.
  accentText: "#3DDC97",
  accentDim: "rgba(61,220,151,0.12)",
  navBg: "rgba(11,15,20,0.9)",
  panel: "rgba(255,255,255,0.02)",
  onAccent: "#06231a",
};

export const MARKETING_LIGHT = {
  bg: "#F4F7F9",
  card: "#FFFFFF",
  border: "rgba(11,15,20,0.09)",
  text: "#0B0F14",
  muted: "#5A6673",
  accent: "#14B8A6",
  accentText: "#0F766E", // ciemniejszy teal do tekstu — kontrast 5.1:1 na jasnym tle (AA)
  accentDim: "rgba(20,184,166,0.12)",
  navBg: "rgba(244,247,249,0.85)",
  panel: "rgba(11,15,20,0.02)",
  onAccent: "#06231a",
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
