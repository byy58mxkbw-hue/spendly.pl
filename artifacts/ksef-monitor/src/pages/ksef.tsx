import { Link } from "wouter";
import { Check, ArrowRight, RefreshCw, ChevronRight, FileText, ShieldCheck, Zap } from "lucide-react";

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
                <span style={{ fontSize: 13, color: C.muted, cursor: "pointer", textDecoration: "none" }}>{label}</span>
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
              { href: "mailto:kontakt@spendly.pl", label: "Kontakt", external: true },
            ].map(({ href, label, external }) => external ? (
              <a key={href} href={href} style={{ fontSize: 13, color: C.muted, textDecoration: "none" }}>{label}</a>
            ) : (
              <Link key={href} href={href}>
                <span style={{ fontSize: 13, color: C.muted, cursor: "pointer" }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: C.muted }}>&copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa zastrzeżone.</span>
      </div>
    </footer>
  );
}

export default function KsefPage() {
  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh" }}>
      <NavBar />

      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 80px" }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 20 }}>
            <RefreshCw size={12} style={{ color: C.accent }} />
            Integracja KSeF dla restauracji
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20, color: C.text }}>
            Automatyczny import faktur<br />
            <span style={{ color: C.accent }}>z KSeF dla gastronomii</span>
          </h1>
          <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
            Spendly łączy się bezpośrednio z Krajowym Systemem e-Faktur i pobiera faktury zakupowe dla Twojego NIP-u — bez ręcznego wgrywania plików, bez arkuszy Excel.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/sign-up">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer" }}>
                Wypróbuj za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                Poznaj Spendly
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Jak działa integracja</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
              Trzy kroki do pełnej automatyzacji
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { num: "01", title: "Podaj NIP i token KSeF", desc: "Jednorazowa konfiguracja — wpisujesz numer NIP swojej firmy i token API wydany przez KSeF. Dane są szyfrowane AES-256 i przechowywane bezpiecznie." },
              { num: "02", title: "Automatyczne pobieranie faktur", desc: "Spendly odpytuje API KSeF i pobiera nowe faktury zakupowe od wszystkich dostawców. Synchronizacja działa w tle — nie musisz nic robić." },
              { num: "03", title: "Analiza i alerty", desc: "Każda pozycja faktury trafia do bazy produktów. Widzisz historię cen, trendy i alerty o podwyżkach kluczowych surowców." },
            ].map(({ num, title, desc }) => (
              <div key={num} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "28px 24px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.05em", display: "block", marginBottom: 12 }}>{num}</span>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Korzyści</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
            Co zyskujesz dzięki integracji KSeF
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {[
            { icon: RefreshCw, title: "Zero ręcznego wprowadzania", desc: "Faktury pobierane automatycznie z KSeF — bez skanowania, bez przepisywania, bez arkuszy Excel." },
            { icon: FileText, title: "Pełna historia zakupów", desc: "Wszystkie faktury zakupowe z KSeF w jednym miejscu. Filtruj po dostawcy, produkcie, dacie i kwocie." },
            { icon: Zap, title: "Natychmiastowa synchronizacja", desc: "Nowe faktury pojawiają się w systemie zaraz po ich wystawieniu — zawsze aktualne dane o kosztach." },
            { icon: ShieldCheck, title: "Bezpieczeństwo danych", desc: "Token KSeF szyfrowany AES-256-GCM. Każdy użytkownik widzi wyłącznie własne faktury — pełna izolacja danych." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "24px" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon size={18} style={{ color: C.accent }} />
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEO CONTENT */}
      <section style={{ borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>KSeF dla restauracji — co to jest?</h2>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Krajowy System e-Faktur (KSeF) to rządowa platforma do wystawiania i odbierania faktur elektronicznych w Polsce. Od 2026 roku KSeF jest obowiązkowy dla firm powyżej określonego progu przychodów. Restauracje i firmy gastronomiczne mogą już teraz korzystać z KSeF, by automatycznie pobierać faktury zakupowe od swoich dostawców.</p>
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Jak Spendly integruje się z KSeF?</h2>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Spendly używa oficjalnego API KSeF do pobierania faktur zakupowych. Po jednorazowym podaniu NIP-u i tokenu autoryzacyjnego, system samodzielnie synchronizuje faktury w tle. Każda faktura jest automatycznie parsowana — produkty, ceny, dostawcy — i trafia do Twojej bazy danych bez żadnego ręcznego działania.</p>
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>KSeF a kontrola kosztów restauracji</h2>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Automatyczny import faktur z KSeF to fundament kontroli kosztów. Gdy wszystkie zakupy trafiają do systemu bez ręcznego przepisywania, można w czasie rzeczywistym śledzić food cost, wykrywać podwyżki dostawców i analizować trendy cenowe. Spendly łączy integrację KSeF z analityką kosztów gastronomicznych w jednym narzędziu.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px", paddingTop: 80 }}>
        <div style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)", border: "1px solid rgba(61,220,151,0.2)", borderRadius: 24, padding: "60px 40px", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 16 }}>
            Zacznij pobierać faktury z KSeF automatycznie
          </h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Rejestracja zajmuje mniej niż 2 minuty. Integracja z KSeF działa od pierwszego logowania.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/sign-up">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer" }}>
                Wypróbuj za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/food-cost">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                Kontrola food cost <ChevronRight size={16} />
              </button>
            </Link>
          </div>
        </div>
      </section>

      <PageFooter />
    </div>
  );
}
