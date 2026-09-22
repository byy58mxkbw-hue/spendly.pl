/**
 * Wordmark „SPENDLY." — wspólny komponent zamiast trzech niezależnych kopii
 * tekstu (marketing-shell.tsx navbar+stopka, home.tsx własny Wordmark).
 * Audyt brandingowy 2026-09: przyszła zmiana (SVG z prawdziwym liternictwem
 * Bagel Fat One, zamiast tekstu w Space Grotesk) wymaga edycji TYLKO tutaj.
 *
 * Kolory przyjmowane jako propsy (nie CSS-owy `.wm`/`.dot` z landing.css),
 * bo stron marketingowych używa DWÓCH różnych podejść do stylowania —
 * home.tsx klas CSS, /cennik i reszta stylów inline (patrz lib/pricing.ts,
 * komentarz o "stylowanie NIE jest ujednolicone"). Inline props działają
 * w obu: home.tsx może podać `var(--acc-text)` jako zwykły string koloru.
 */
export function Logo({
  size = 18,
  accentColor,
  textColor,
}: {
  size?: number;
  accentColor: string;
  textColor: string;
}) {
  return (
    <span
      style={{
        // Tymczasowo Space Grotesk (jak dawny `.wm`), NIE dziedziczone po rodzicu
        // (który od audytu brandingowego 2026-09 jest Inter) — inaczej wordmark
        // przypadkiem zmieniłby font razem z resztą strony. Do podmiany na SVG
        // z Bagel Fat One, jak tylko będą gotowe pliki.
        fontFamily: "'Space Grotesk Variable', system-ui, sans-serif",
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "-0.04em",
        lineHeight: 1,
        color: accentColor,
      }}
    >
      SPENDLY<span style={{ color: textColor }}>.</span>
    </span>
  );
}
