import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Check, ArrowRight, ChevronRight, Sun, Moon } from "lucide-react";

// Palety spójne z landingiem (landing.css). Strona respektuje motyw wybrany na
// landingu (ten sam klucz localStorage `spendly_site_theme`) + własny przełącznik.
const DARK = {
  bg: "#0B0F14",
  card: "#131A22",
  border: "rgba(255,255,255,0.08)",
  text: "#F5F7FA",
  muted: "#9BA6B2",
  accent: "#3DDC97",
  accentDim: "rgba(61,220,151,0.12)",
  navBg: "rgba(11,15,20,0.9)",
};
const LIGHT = {
  bg: "#F4F7F9",
  card: "#FFFFFF",
  border: "rgba(11,15,20,0.09)",
  text: "#0B0F14",
  muted: "#5A6673",
  accent: "#14B8A6",
  accentDim: "rgba(20,184,166,0.12)",
  navBg: "rgba(244,247,249,0.85)",
};
type Palette = typeof DARK;
type Theme = "dark" | "light";

// Plany spójne z landingiem (home.tsx) i backendem (free/pro/business).
const PLANS = [
  {
    name: "Start",
    price: "0",
    period: "/mies.",
    highlight: false,
    desc: "Dla jednego lokalu, który dopiero zaczyna porządkować faktury.",
    features: ["1 lokal", "Import z KSeF", "OCR do 50 faktur / mies.", "Podstawowe alerty cenowe"],
    cta: "Zacznij za darmo",
    href: "/sign-up",
  },
  {
    name: "Pro",
    price: "199",
    period: "/mies.",
    highlight: true,
    desc: "Dla restauracji, które chcą realnie kontrolować food cost.",
    features: ["Do 3 lokali", "Nielimitowany OCR", "Porównanie dostawców", "Food cost i receptury", "Asystent AI"],
    cta: "Wybierz Pro",
    href: "/sign-up",
  },
  {
    name: "Sieć",
    price: "Wycena",
    period: "",
    highlight: false,
    desc: "Dla grup gastronomicznych i hoteli z wieloma lokalami.",
    features: ["Nielimitowane lokale", "Centra kosztów i role", "Raporty konsolidowane", "Dedykowany opiekun"],
    cta: "Umów rozmowę",
    href: "mailto:kontakt@spendly.pl",
  },
];

const FAQS = [
  { q: "Ile kosztuje Spendly?", a: "Plan Start jest darmowy bezterminowo. Plan Pro to 199 zł / miesiąc za pełną kontrolę food cost, porównania dostawców i asystenta AI. Dla sieci lokali przygotowujemy wycenę indywidualną." },
  { q: "Czy mogę anulować w dowolnym momencie?", a: "Tak. Brak długoterminowych umów ani opłat za rezygnację. Anulujesz kiedy chcesz, bez żadnych konsekwencji." },
  { q: "Jak długo trwa okres testowy?", a: "Każdy płatny plan zaczynasz od 14 dni za darmo — bez podawania karty kredytowej. Plan Start pozostaje bezpłatny na stałe." },
  { q: "Czy jest możliwość dostosowania planu dla sieci restauracji?", a: "Tak. Skontaktuj się z nami pod adresem kontakt@spendly.pl — przygotujemy ofertę dedykowaną dla sieci lokali gastronomicznych." },
];

function NavBar({ c, theme, onToggle }: { c: Palette; theme: Theme; onToggle: () => void }) {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: c.navBg, borderBottom: `1px solid ${c.border}`, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <Link href="/">
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", color: c.accent, cursor: "pointer" }}>
            SPENDLY<span style={{ color: c.text }}>.</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onToggle}
            aria-label={theme === "light" ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
            style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 8, background: "none", border: `1px solid ${c.border}`, color: c.muted, cursor: "pointer" }}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <Link href="/sign-in">
            <button style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.muted, cursor: "pointer" }}>
              Zaloguj
            </button>
          </Link>
          <Link href="/sign-up">
            <button style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: c.accent, border: "none", color: "#06231a", cursor: "pointer" }}>
              Rozpocznij za darmo
            </button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function PageFooter({ c }: { c: Palette }) {
  return (
    <footer style={{ borderTop: `1px solid ${c.border}`, padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32, marginBottom: 32 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", color: c.accent }}>
            SPENDLY<span style={{ color: c.text }}>.</span>
          </span>
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
      <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 20, borderTop: `1px solid ${c.border}`, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: c.muted }}>&copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa zastrzeżone.</span>
      </div>
    </footer>
  );
}

export default function CennikPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const s = localStorage.getItem("spendly_site_theme");
      if (s === "light" || s === "dark") return s;
    } catch { /* ignore */ }
    return "dark";
  });
  useEffect(() => {
    try { localStorage.setItem("spendly_site_theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const c = theme === "light" ? LIGHT : DARK;

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>
      <NavBar c={c} theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />

      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 64px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${c.accentDim}`, background: c.accentDim, color: c.accent, fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
          Bez ukrytych opłat
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16, color: c.text }}>
          Prosty cennik.<br />
          <span style={{ color: c.accent }}>Pełna kontrola kosztów.</span>
        </h1>
        <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.7, maxWidth: 480, margin: "0 auto 0" }}>
          Zacznij za darmo. Każdy płatny plan z 14 dniami próbnymi, bez karty. Anuluj w dowolnym momencie.
        </p>
      </section>

      {/* PRICING — 3 plany (spójne z landingiem) */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, alignItems: "stretch" }}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              style={{
                position: "relative",
                background: c.card,
                border: plan.highlight ? `1.5px solid ${c.accent}` : `1px solid ${c.border}`,
                borderRadius: 20,
                padding: "32px 28px",
                display: "flex",
                flexDirection: "column",
                boxShadow: plan.highlight ? "0 24px 48px rgba(0,0,0,0.18)" : "none",
              }}
            >
              {plan.highlight && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, padding: "5px 13px", borderRadius: 999, background: c.accent, color: "#06231a", whiteSpace: "nowrap" }}>
                  Najpopularniejszy
                </div>
              )}
              <p style={{ fontSize: 15, fontWeight: 700, color: c.text, margin: 0 }}>{plan.name}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "14px 0 4px" }}>
                <span style={{ fontSize: 44, fontWeight: 800, color: c.accent, letterSpacing: "-0.03em", lineHeight: 1 }}>{plan.price}</span>
                {plan.price !== "Wycena" && <span style={{ fontSize: 15, color: c.muted }}>zł{plan.period}</span>}
              </div>
              <p style={{ fontSize: 13, color: c.muted, margin: "0 0 20px", minHeight: 38 }}>{plan.desc}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24, flex: 1 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: c.text }}>
                    <Check size={16} style={{ color: c.accent, flexShrink: 0, marginTop: 1 }} />{f}
                  </div>
                ))}
              </div>
              {plan.href.startsWith("mailto:") ? (
                <a href={plan.href} style={{ textDecoration: "none" }}>
                  <button style={{ width: "100%", padding: "13px", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${c.border}`, background: "none", color: c.text }}>
                    {plan.cta}
                  </button>
                </a>
              ) : (
                <Link href={plan.href}>
                  <button style={{ width: "100%", padding: "13px", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", border: plan.highlight ? "none" : `1px solid ${c.border}`, background: plan.highlight ? c.accent : "none", color: plan.highlight ? "#06231a" : c.text }}>
                    {plan.cta}
                  </button>
                </Link>
              )}
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: c.muted, marginTop: 28 }}>
          Potrzebujesz dedykowanej integracji lub wsparcia dla sieci lokali?{" "}
          <a href="mailto:kontakt@spendly.pl" style={{ color: c.accent, textDecoration: "none" }}>Napisz do nas</a>
        </p>
      </section>

      {/* FAQ */}
      <section style={{ borderTop: `1px solid ${c.border}` }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accent, textTransform: "uppercase", marginBottom: 12 }}>FAQ</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: c.text, margin: 0 }}>
              Pytania o cennik i warunki
            </h2>
          </div>
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            {FAQS.map((item, i) => (
              <div key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: c.text, lineHeight: 1.4 }}>{item.q}</span>
                  <ChevronRight size={16} style={{ color: c.muted, flexShrink: 0, transform: openFaq === i ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                </button>
                {openFaq === i && (
                  <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.7, paddingBottom: 20, margin: 0 }}>{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)", border: `1px solid ${c.accentDim}`, borderRadius: 24, padding: "60px 40px", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: c.text, marginBottom: 16 }}>
            Zacznij korzystać za darmo już teraz
          </h2>
          <p style={{ fontSize: 15, color: c.muted, maxWidth: 440, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Rejestracja trwa mniej niż 2 minuty. Nie wymagamy karty kredytowej.
          </p>
          <Link href="/sign-up">
            <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: c.accent, color: "#06231a", border: "none", cursor: "pointer" }}>
              Utwórz darmowe konto <ArrowRight size={16} />
            </button>
          </Link>
        </div>
      </section>

      <PageFooter c={c} />
    </div>
  );
}
