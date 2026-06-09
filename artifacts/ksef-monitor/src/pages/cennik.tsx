import React from "react";
import { Link } from "wouter";
import { Check, ArrowRight, ChevronRight } from "lucide-react";

const C = {
  bg: "#0B0F14",
  card: "#131A22",
  border: "rgba(255,255,255,0.08)",
  text: "#F5F7FA",
  muted: "#9BA6B2",
  accent: "#3DDC97",
  accentHover: "#5BFFB5",
  accentDim: "rgba(61,220,151,0.12)",
};

const FEATURES = [
  "Integracja z KSeF",
  "OCR faktur (zdjęcie lub PDF)",
  "Kontrola food cost w czasie rzeczywistym",
  "Analiza kosztów per-dostawca i per-produkt",
  "Alerty o zmianach cen surowców",
  "Dashboard wydatków",
  "Raporty miesięczne (eksport CSV)",
  "Monitoring cen dostawców",
  "Zbiorcze zarządzanie płatnościami",
  "Obsługa wielu lokali",
  "AI CFO — analiza zakupowa",
  "Bezpieczeństwo AES-256",
];

const FAQS = [
  { q: "Ile kosztuje Spendly po okresie testowym?", a: "Regularna cena to 200 zł / miesiąc za nielimitowany dostęp do wszystkich funkcji. W trakcie okresu testowego korzystasz ze wszystkiego bezpłatnie — bez podawania karty kredytowej." },
  { q: "Czy mogę anulować w dowolnym momencie?", a: "Tak. Brak długoterminowych umów ani opłat za rezygnację. Anulujesz kiedy chcesz, bez żadnych konsekwencji." },
  { q: "Jak długo trwa okres testowy?", a: "Obecnie Spendly jest bezpłatny dla wszystkich nowych użytkowników w ramach otwartego okresu testowego. Poinformujemy Cię z wyprzedzeniem, gdy zmienią się warunki." },
  { q: "Czy jest możliwość dostosowania planu dla sieci restauracji?", a: "Tak. Skontaktuj się z nami pod adresem kontakt@spendly.pl — przygotujemy ofertę dedykowaną dla sieci lokali gastronomicznych." },
];

function NavBar() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(11,15,20,0.9)", borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(12px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <Link href="/">
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", color: C.accent, cursor: "pointer" }}>
            SPENDLY<span style={{ color: C.text }}>.</span>
          </span>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/sign-in">
            <button style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "none", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer" }}>
              Zaloguj
            </button>
          </Link>
          <Link href="/sign-up">
            <button style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: C.accent, border: "none", color: "#0B0F14", cursor: "pointer" }}>
              Rozpocznij za darmo
            </button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function PageFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32, marginBottom: 32 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", color: C.accent }}>
            SPENDLY<span style={{ color: C.text }}>.</span>
          </span>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>Kontrola kosztów restauracji z integracją KSeF i OCR faktur.</p>
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Rozwiązania</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { href: "/ksef", label: "Integracja KSeF" },
              { href: "/food-cost", label: "Kontrola food cost" },
              { href: "/ocr-faktur", label: "OCR faktur" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}>
                <span style={{ fontSize: 13, color: C.muted, cursor: "pointer" }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Firma</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { href: "/cennik", label: "Cennik" },
              { href: "/sign-up", label: "Rejestracja" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}>
                <span style={{ fontSize: 13, color: C.muted, cursor: "pointer" }}>{label}</span>
              </Link>
            ))}
            <a href="mailto:kontakt@spendly.pl" style={{ fontSize: 13, color: C.muted, textDecoration: "none" }}>Kontakt</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: C.muted }}>&copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa zastrzeżone.</span>
      </div>
    </footer>
  );
}

export default function CennikPage() {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh" }}>
      <NavBar />

      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 64px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${C.accentDim}`, background: C.accentDim, color: C.accent, fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
          Okres testowy — bezpłatnie
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 16, color: C.text }}>
          Prosta cena.<br />
          <span style={{ color: C.accent }}>Pełna kontrola kosztów.</span>
        </h1>
        <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 480, margin: "0 auto 0" }}>
          Okres testowy bezpłatny dla każdego. Bez karty kredytowej. Anuluj w dowolnym momencie.
        </p>
      </section>

      {/* PRICING CARD */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ background: C.card, border: "1px solid rgba(61,220,151,0.25)", borderRadius: 24, padding: "40px 36px", boxShadow: "0 0 0 1px rgba(61,220,151,0.08), 0 32px 64px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Spendly Pro</p>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: C.accentDim, color: C.accent, padding: "4px 10px", borderRadius: 999 }}>
                Okres testowy
              </div>
            </div>

            {/* Price */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 56, fontWeight: 800, color: C.accent, letterSpacing: "-0.03em", lineHeight: 1 }}>0</span>
                <span style={{ fontSize: 16, color: C.muted }}>zł / mies.</span>
                <span style={{ fontSize: 14, color: C.muted, textDecoration: "line-through", alignSelf: "center", marginLeft: 4, opacity: 0.6 }}>200 zł</span>
              </div>
              <p style={{ fontSize: 13, color: C.muted, marginTop: 8, marginBottom: 0 }}>
                Bezpłatnie w całym okresie testowym — dla każdego.
              </p>
            </div>

            <div style={{ height: 1, background: C.border, margin: "24px 0" }} />

            {/* Features */}
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Co zawiera plan</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                {FEATURES.map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text }}>
                    <Check size={13} style={{ color: C.accent, flexShrink: 0 }} />{f}
                  </div>
                ))}
              </div>
            </div>

            <Link href="/sign-up">
              <button style={{ width: "100%", padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 700, background: C.accent, border: "none", color: "#0B0F14", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                Rozpocznij za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <p style={{ textAlign: "center", fontSize: 12, color: C.muted, margin: 0 }}>
              Bez umowy. Bez wdrożenia. Bez ukrytych kosztów.
            </p>
          </div>

          <p style={{ textAlign: "center", fontSize: 13, color: C.muted, marginTop: 24 }}>
            Potrzebujesz dedykowanej integracji lub wsparcia dla sieci lokali?{" "}
            <a href="mailto:kontakt@spendly.pl" style={{ color: C.accent, textDecoration: "none" }}>Napisz do nas</a>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>FAQ</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
              Pytania o cennik i warunki
            </h2>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {FAQS.map((item, i) => (
              <div key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>{item.q}</span>
                  <ChevronRight size={16} style={{ color: C.muted, flexShrink: 0, transform: openFaq === i ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                </button>
                {openFaq === i && (
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, paddingBottom: 20, margin: 0 }}>{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)", border: "1px solid rgba(61,220,151,0.2)", borderRadius: 24, padding: "60px 40px", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 16 }}>
            Zacznij korzystać za darmo już teraz
          </h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 440, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Rejestracja trwa mniej niż 2 minuty. Nie wymagamy karty kredytowej.
          </p>
          <Link href="/sign-up">
            <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer" }}>
              Utwórz darmowe konto <ArrowRight size={16} />
            </button>
          </Link>
        </div>
      </section>

      <PageFooter />
    </div>
  );
}
