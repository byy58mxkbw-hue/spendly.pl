import { Link } from "wouter";
import { Sun, Moon } from "@/lib/icons";
import type { MarketingPalette, MarketingTheme } from "@/lib/marketing-theme";
import { Logo } from "@/components/logo";

/**
 * Nagłówek + stopka współdzielone przez statyczne strony marketingowo-SEO
 * (cennik, ksef, ocr-faktur). Wydzielone z dawnych kopii per-strona, żeby
 * zmiana w jednym miejscu nie wymagała ręcznej synchronizacji trzech plików.
 */
export function MarketingNavBar({
  c,
  theme,
  onToggle,
}: {
  c: MarketingPalette;
  theme: MarketingTheme;
  onToggle: () => void;
}) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: c.navBg, borderBottom: `1px solid ${c.border}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <Link href="/">
          <span style={{ cursor: "pointer" }}>
            <Logo size={18} accentColor={c.accent} textColor={c.text} />
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggle}
            aria-label={theme === "light" ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
            style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 3, background: "none", border: `1px solid ${c.border}`, color: c.muted, cursor: "pointer" }}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <Link href="/sign-in">
            <button style={{ padding: "7px 16px", borderRadius: 3, fontSize: 13, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.muted, cursor: "pointer" }}>
              Zaloguj
            </button>
          </Link>
          <Link href="/sign-up">
            <button style={{ padding: "7px 16px", borderRadius: 3, fontSize: 13, fontWeight: 600, background: c.accent, border: "none", color: c.onAccent, cursor: "pointer" }}>
              Rozpocznij za darmo
            </button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter({ c }: { c: MarketingPalette }) {
  return (
    <footer style={{ borderTop: `1px solid ${c.border}`, padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32, marginBottom: 32 }}>
        <div>
          <Logo size={16} accentColor={c.accent} textColor={c.text} />
          <p style={{ fontSize: 12, color: c.muted, marginTop: 8, lineHeight: 1.6 }}>Kontrola kosztów restauracji z integracją KSeF i OCR faktur.</p>
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Rozwiązania</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { href: "/ksef", label: "Integracja KSeF" },
              { href: "/food-cost", label: "Kontrola food cost" },
              { href: "/ocr-faktur", label: "OCR faktur" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}>
                <span style={{ fontSize: 13, color: c.muted, cursor: "pointer" }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Firma</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { href: "/cennik", label: "Cennik" },
              { href: "/sign-up", label: "Rejestracja" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}>
                <span style={{ fontSize: 13, color: c.muted, cursor: "pointer" }}>{label}</span>
              </Link>
            ))}
            <a href="mailto:kontakt@spendly.pl" style={{ fontSize: 13, color: c.muted, textDecoration: "none" }}>Kontakt</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 20, borderTop: `1px solid ${c.border}`, display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: c.muted }}>&copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa zastrzeżone.</span>
        <Link href="/polityka-prywatnosci"><span style={{ fontSize: 12, color: c.muted, cursor: "pointer" }}>Polityka prywatności</span></Link>
        <Link href="/regulamin"><span style={{ fontSize: 12, color: c.muted, cursor: "pointer" }}>Regulamin</span></Link>
      </div>
    </footer>
  );
}
