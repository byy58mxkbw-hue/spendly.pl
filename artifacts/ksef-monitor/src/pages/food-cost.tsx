import { Link } from "wouter";
import { Check, ArrowRight, TrendingDown, Bell, BarChart3, ChevronRight, FileBarChart2 } from "lucide-react";

const C = {
  bg: "#0B0F14",
  card: "#131A22",
  border: "rgba(255,255,255,0.08)",
  text: "#F5F7FA",
  muted: "#9BA6B2",
  accent: "#3DDC97",
  accentHover: "#5BFFB5",
  accentDim: "rgba(61,220,151,0.12)",
  red: "#F87171",
  redDim: "rgba(248,113,113,0.1)",
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

export default function FoodCostPage() {
  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh" }}>
      <NavBar />

      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 80px" }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 20 }}>
            <TrendingDown size={12} style={{ color: C.accent }} />
            Kontrola food cost dla gastronomii
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20, color: C.text }}>
            Monitoruj food cost<br />
            <span style={{ color: C.accent }}>zanim uderzy w marżę</span>
          </h1>
          <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
            Spendly automatycznie wylicza food cost na podstawie zaimportowanych faktur, śledzi zmiany cen surowców i alarmuje, gdy koszty zbliżają się do Twojego progu rentowności.
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

      {/* STATS */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { stat: "28–35%", label: "Typowy food cost w gastronomii" },
            { stat: "-18%", label: "Redukcja strat kosztowych z Spendly" },
            { stat: "100%", label: "Automatycznych danych — zero ręcznych wyliczeń" },
          ].map(({ stat, label }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 24px" }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>{stat}</p>
              <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Funkcje</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
            Pełna kontrola food cost w jednym miejscu
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {[
            { icon: TrendingDown, title: "Śledzenie food cost %", desc: "Spendly wylicza udział kosztów surowców w przychodach restauracji na podstawie faktur zakupowych. Widzisz trend dzienny, tygodniowy i miesięczny." },
            { icon: Bell, title: "Alerty o podwyżkach", desc: "Ustawiasz progi procentowe lub kwotowe dla kluczowych składników. Gdy dostawca podniesie cenę, dostajesz alert zanim wpłynie to na wynik miesiąca." },
            { icon: BarChart3, title: "Historia cen surowców", desc: "Dla każdego produktu — mąka, mięso, nabiał, warzywa — widzisz pełną historię cen z podziałem na dostawców i okresy." },
            { icon: FileBarChart2, title: "Raporty miesięczne", desc: "Automatyczne zestawienie wydatków per-dostawca i per-kategoria. Eksport do CSV gotowy do przekazania do księgowości." },
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

      {/* COMPARISON */}
      <section style={{ borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
              Dlaczego warto kontrolować food cost automatycznie?
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.red, textTransform: "uppercase", marginBottom: 20 }}>Bez automatyzacji</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "Ręczne liczenie food cost raz w miesiącu — za późno na reakcję",
                  "Podwyżki dostawców odkrywasz dopiero przy rozliczeniu",
                  "Arkusze Excel z błędami i brakami danych",
                  "Brak porównania kosztów między dostawcami",
                ].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 14, color: C.red, flexShrink: 0, marginTop: 1 }}>—</span>
                    <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.accent, textTransform: "uppercase", marginBottom: 20 }}>Z Spendly</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "Food cost aktualizowany automatycznie po każdej nowej fakturze",
                  "Alert o podwyżce trafia do Ciebie natychmiast",
                  "Dane z KSeF i OCR — bez ręcznego wpisywania",
                  "Porównanie cen per-dostawca dla każdego surowca",
                ].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <Check size={14} style={{ color: C.accent, marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEO CONTENT */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Co to jest food cost i jak go liczyć?</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Food cost to stosunek kosztów surowców do przychodów ze sprzedaży, wyrażony w procentach. Dla restauracji pełnoserwisowej optymalny food cost wynosi 28–35%. Tradycyjnie liczony raz w miesiącu na podstawie faktur i inwentaryzacji. Spendly automatyzuje to obliczenie — każda faktura zakupowa trafia do systemu przez KSeF lub OCR i jest natychmiast uwzględniana w bieżącym food cost.</p>
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Monitoring cen dostawców i analiza trendu</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Kontrola food cost to nie tylko bieżący wskaźnik, ale też historia. Spendly śledzi cenę każdego surowca od pierwszej faktury, pokazuje wykres trendu i porównuje dostawców. Gdy jeden dostawca podnosi cenę mąki, a inny trzyma ją stałą — system wskazuje najlepszą opcję i alarmuje o anomaliach cenowych.</p>
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Automatyzacja food cost dla sieci restauracji</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Dla sieci lokali gastronomicznych kontrola food cost wymaga agregacji danych z wielu punktów. Spendly obsługuje wiele lokali z jednego panelu — z możliwością porównania kosztów między obiektami i śledzenia wspólnych dostawców. Integracja z KSeF pobiera faktury dla każdego NIP-u osobno, a system konsoliduje raporty.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)", border: "1px solid rgba(61,220,151,0.2)", borderRadius: 24, padding: "60px 40px", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 16 }}>
            Zacznij kontrolować food cost automatycznie
          </h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Dołącz do restauratorów, którzy wiedzą dokładnie ile kosztuje każde danie — w czasie rzeczywistym.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/sign-up">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer" }}>
                Wypróbuj za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/ocr-faktur">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                OCR faktur <ChevronRight size={16} />
              </button>
            </Link>
          </div>
        </div>
      </section>

      <PageFooter />
    </div>
  );
}
