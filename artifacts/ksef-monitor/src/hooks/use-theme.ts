import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { type ThemeMode, readSavedTheme, saveTheme } from "@/lib/landing-theme";

// Motyw aplikacji (po zalogowaniu). Domyślnie CIEMNY. Preferencja współdzielona
// z landingiem przez ten sam klucz localStorage. Zmiana nakłada klasę `light`/`dark`
// na <html>, co przełącza tokeny CSS (index.css: :root = ciemny, .light = jasny).

function applyThemeClass(mode: ThemeMode): void {
  const el = document.documentElement;
  el.classList.toggle("light", mode === "light");
  el.classList.toggle("dark", mode === "dark");
}

type ThemeContextValue = { theme: ThemeMode; toggle: () => void; setTheme: (m: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readSavedTheme() ?? "dark");

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    saveTheme(mode);
    setThemeState(mode);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      saveTheme(next);
      return next;
    });
  }, []);

  return createElement(ThemeContext.Provider, { value: { theme, toggle, setTheme } }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
