import { Link } from "wouter";
import { ArrowLeft, Sun, Moon } from "lucide-react";
import { type Palette, useLandingTheme } from "@/lib/landing-theme";

/**
 * Wspólny szkielet stron prawnych (regulamin, polityka prywatności):
 * nagłówek z logo i przełącznikiem motywu, wyśrodkowana treść, stopka.
 * Motyw współdzielony z landingiem (ten sam localStorage).
 */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: (c: Palette) => React.ReactNode;
}) {
  const { theme, toggle, c } = useLandingTheme();

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh" }}>
      {/* Nagłówek */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: c.bg, borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <Link href="/">
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", color: c.accent, cursor: "pointer" }}>
              SPENDLY<span style={{ color: c.text }}>.</span>
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggle}
              aria-label={theme === "light" ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
              title={theme === "light" ? "Tryb ciemny" : "Tryb jasny"}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 8,
                background: "none", border: `1px solid ${c.border}`, color: c.muted, cursor: "pointer",
              }}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <Link href="/">
              <button style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: "none", border: `1px solid ${c.border}`, color: c.muted, cursor: "pointer",
              }}>
                <ArrowLeft size={14} /> Strona główna
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Treść */}
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 8 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: c.muted, marginBottom: 40 }}>Ostatnia aktualizacja: {updated}</p>

        <div className="legal-body" style={{ fontSize: 15, lineHeight: 1.75, color: c.muted }}>
          {children(c)}
        </div>
      </main>

      {/* Stopka */}
      <footer style={{ borderTop: `1px solid ${c.border}`, padding: "28px 24px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: c.muted }}>&copy; {new Date().getFullYear()} SPENDLY</span>
          <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
            <Link href="/regulamin"><span style={{ color: c.muted, cursor: "pointer" }}>Regulamin</span></Link>
            <Link href="/polityka-prywatnosci"><span style={{ color: c.muted, cursor: "pointer" }}>Polityka prywatności</span></Link>
            <a href="mailto:kontakt@spendly.pl" style={{ color: c.muted, textDecoration: "none" }}>Kontakt</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Nagłówek sekcji w treści prawnej. */
export function LegalSection({ n, title, c, children }: { n: string; title: string; c: { text: string }; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: c.text, marginBottom: 10 }}>
        §{n}. {title}
      </h2>
      {children}
    </section>
  );
}
