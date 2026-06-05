import { Link } from "wouter";
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  FileBarChart2,
  ArrowRight,
  CheckCircle2,
  Bell,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Check,
  X,
  ArrowUpRight,
  FileText,
  ScanLine,
  BarChart3,
  AlertCircle,
  Menu,
  ChevronDown,
  Zap,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

// ─── Design tokens ───────────────────────────────────────────────────────────

const C = {
  bg: "#0B0F14",
  card: "#131A22",
  cardHover: "#171F2A",
  border: "rgba(255,255,255,0.08)",
  borderHover: "rgba(61,220,151,0.35)",
  text: "#F5F7FA",
  muted: "#9BA6B2",
  accent: "#3DDC97",
  accentHover: "#5BFFB5",
  accentDim: "rgba(61,220,151,0.12)",
  accentDimHover: "rgba(61,220,151,0.2)",
  red: "#F87171",
  redDim: "rgba(248,113,113,0.1)",
};

// ─── Animation helpers ────────────────────────────────────────────────────────

const ease = [0.4, 0, 0.2, 1] as const;
const vp = { once: true, amount: 0.12 } as const;
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
const fadeIn = { hidden: { opacity: 0 }, visible: { opacity: 1 } };

// ─── Floating badge ───────────────────────────────────────────────────────────

function Badge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 999,
      border: `1px solid ${C.border}`,
      background: C.accentDim,
      color: C.accent, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
    }}>
      <Icon size={12} />
      {label}
    </div>
  );
}

// ─── Dashboard mockup ─────────────────────────────────────────────────────────

function DashboardMockup() {
  const rows = [
    { name: "Łosoś atlantycki", pct: "+12,4%", up: true },
    { name: "Oliwa extra virgin", pct: "+17,6%", up: true },
    { name: "Polędwica wołowa", pct: "-1,6%", up: false },
    { name: "Mąka pszenna", pct: "+6,7%", up: true },
  ];

  return (
    <div className="relative w-full max-w-[520px]">
      {/* Radial glow */}
      <div style={{
        position: "absolute", inset: -40,
        background: "radial-gradient(ellipse at 60% 40%, rgba(61,220,151,0.12) 0%, transparent 70%)",
        borderRadius: 32, pointerEvents: "none",
      }} />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease, delay: 0.2 }}
        style={{
          position: "relative", background: C.card,
          border: `1px solid ${C.border}`, borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
          background: "rgba(255,255,255,0.03)",
        }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.03em", color: C.accent }}>
            SPENDLY<span style={{ color: C.text }}>.</span>
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {["#F87171", "#FBBF24", "#34D399"].map(c => (
              <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${C.border}` }}>
          {[["12", "Dostawcy"], ["184", "Produkty"], ["106", "Faktury"]].map(([v, l]) => (
            <div key={l} style={{ padding: "10px 14px", textAlign: "center", borderRight: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>{v}</p>
              <p style={{ fontSize: 10, color: C.muted, margin: "2px 0 0" }}>{l}</p>
            </div>
          ))}
        </div>

        {/* Price table */}
        <div style={{ padding: "12px 16px 8px" }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Zmiany cen — ten miesiąc
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {rows.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.07, duration: 0.3, ease }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 0", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: r.up ? C.red : C.accent, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: C.text }}>{r.name}</span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                  background: r.up ? C.redDim : C.accentDim,
                  color: r.up ? C.red : C.accent,
                }}>
                  {r.pct}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Alert bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.4 }}
          style={{
            margin: "0 16px 12px", display: "flex", alignItems: "center", gap: 8,
            padding: "7px 10px", borderRadius: 8,
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
          }}
        >
          <Bell size={11} style={{ color: "#FBBF24", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#FBBF24", fontWeight: 500 }}>
            2 alerty cenowe — sprawdź teraz
          </span>
        </motion.div>
      </motion.div>

      {/* Floating cards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, x: 20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 0.95, duration: 0.4, ease }}
        style={{
          position: "absolute", bottom: -12, right: -20,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "10px 14px", minWidth: 150,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          display: "none",
        }}
        className="hidden sm:block"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <CheckCircle2 size={12} style={{ color: C.accent }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Zaimportowano z KSeF</span>
        </div>
        <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>PPHU Rybex Sp. z o.o.</p>
        <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: "2px 0 0" }}>4 820,00 zł</p>
      </motion.div>
    </div>
  );
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16,
          padding: "20px 0", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>{q}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          style={{ flexShrink: 0 }}
        >
          <ChevronDown size={16} style={{ color: C.muted }} />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25, ease }}
        style={{ overflow: "hidden" }}
        aria-hidden={!open}
      >
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, paddingBottom: 20 }}>{a}</p>
      </motion.div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const FEATURES = [
  { icon: RefreshCw, title: "Integracja z KSeF", desc: "Automatyczny import faktur zakupowych z Krajowego Systemu e-Faktur. Bez ręcznego wgrywania plików." },
  { icon: ScanLine, title: "OCR faktur", desc: "System odczytuje dane z faktur kosztowych — ze zdjęcia lub PDF — w kilkanaście sekund." },
  { icon: TrendingDown, title: "Kontrola food cost", desc: "Monitoruj udział kosztów w przychodach restauracji i reaguj zanim food cost przekroczy cel." },
  { icon: BarChart3, title: "Analiza kosztów", desc: "Wykrywaj wzrosty cen surowców, porównuj dostawców i analizuj trendy zakupowe miesiąc po miesiącu." },
  { icon: FileBarChart2, title: "Raporty miesięczne", desc: "Zestawienie wydatków per-dostawca i per-kategoria z eksportem do CSV — gotowe do księgowości." },
  { icon: Bell, title: "Alerty kosztowe", desc: "Ustawiasz progi procentowe lub kwotowe dla kluczowych składników. Alert trafia do Ciebie od razu." },
  { icon: ShieldCheck, title: "Bezpieczeństwo danych", desc: "Faktury i tokeny KSeF szyfrowane AES-256 w bazie. Każdy użytkownik widzi wyłącznie swoje dane." },
  { icon: Check, title: "Zbiorcze zarządzanie płatnościami", desc: "Zaznacz wiele faktur jednocześnie i oznacz je jako zapłacone jednym kliknięciem. Pełna historia płatności w jednym miejscu." },
];

const FAQS = [
  { q: "Czy mogę anulować w dowolnym momencie?", a: "Tak. Brak długoterminowych umów — anulujesz subskrypcję kiedy chcesz, bez żadnych opłat za rezygnację." },
  { q: "Czy jest okres próbny?", a: "Tak. Obecnie Spendly jest bezpłatny dla wszystkich w ramach okresu testowego. Nie wymagamy karty kredytowej na etapie rejestracji." },
  { q: "Jak chronione są moje dane?", a: "Faktury i tokeny KSeF są szyfrowane AES-256-GCM w bazie danych. Każdy użytkownik ma dostęp wyłącznie do swoich danych — bez wyjątków. Komunikacja odbywa się wyłącznie przez szyfrowane połączenie HTTPS." },
  { q: "Czy Spendly integruje się z KSeF?", a: "Tak. Spendly łączy się bezpośrednio z API Krajowego Systemu e-Faktur i automatycznie pobiera faktury zakupowe dla Twojego NIP-u. Wystarczy jednorazowo podać NIP i token — resztą zajmuje się system." },
  { q: "Czy system działa dla wielu lokali?", a: "Tak. System obsługuje wiele lokali i dostawców z jednego panelu. Skontaktuj się z nami, jeśli masz specyficzne wymagania dla sieci restauracji." },
  { q: "Jak działa OCR faktur?", a: "System automatycznie odczytuje dane z faktur kosztowych — ze zdjęcia telefonu lub pliku PDF. Rozpoznaje dostawcę, produkty, ceny i daty bez ręcznego przepisywania." },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const navLinks = [
    ["#jak-to-dziala", "Jak to działa"],
    ["#funkcje", "Funkcje"],
    ["#cennik", "Cennik"],
    ["#faq", "FAQ"],
  ];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh" }}>

      {/* ─── NAV ──────────────────────────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(11,15,20,0.85)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", color: C.accent }}>
            SPENDLY<span style={{ color: C.text }}>.</span>
          </span>

          <nav className="hidden md:flex" style={{ gap: 28 }}>
            {navLinks.map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 13, color: C.muted, textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex" style={{ gap: 8 }}>
            <Link href="/sign-in">
              <button data-testid="btn-signin" style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: "none", border: `1px solid ${C.border}`,
                color: C.muted, cursor: "pointer", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}>
                Zaloguj
              </button>
            </Link>
            <Link href="/sign-up">
              <button data-testid="btn-signup" style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: C.accent, border: "none", color: "#0B0F14", cursor: "pointer",
                transition: "background 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = C.accentHover)}
                onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>
                Rozpocznij za darmo
              </button>
            </Link>
          </div>

          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{
            background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4,
          }}>
            <Menu size={20} />
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{ borderTop: `1px solid ${C.border}`, padding: "16px 24px 20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {navLinks.map(([href, label]) => (
                  <a key={href} href={href} onClick={() => setMenuOpen(false)}
                    style={{ fontSize: 14, color: C.muted, padding: "8px 0", textDecoration: "none" }}>
                    {label}
                  </a>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                <Link href="/sign-in">
                  <button style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                    Zaloguj
                  </button>
                </Link>
                <Link href="/sign-up">
                  <button data-testid="btn-signup-mobile" style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: C.accent, border: "none", color: "#0B0F14", cursor: "pointer" }}>
                    Rozpocznij za darmo
                  </button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 48 }} className="lg:grid-cols-2 lg:gap-20 lg:items-center">
          <div>
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.4, ease }} style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {/* Hero pill badge with green dot */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${C.border}`,
                background: "rgba(255,255,255,0.04)",
                color: C.muted, fontSize: 12, fontWeight: 500,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
                KSeF + kontrola kosztów gastronomii
              </div>
              {/* trial badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${C.accentDim}`,
                background: C.accentDim,
                color: C.accent, fontSize: 12, fontWeight: 600,
              }}>
                Okres testowy — bezpłatnie
              </div>
            </motion.div>

            <motion.h1 variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.45, ease, delay: 0.07 }}
              style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20, color: C.text }}>
              Kontroluj koszty restauracji<br />
              <span style={{ color: C.accent }}>w czasie rzeczywistym</span>
            </motion.h1>

            <motion.p variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.4, ease, delay: 0.14 }}
              style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 480, marginBottom: 36 }}>
              Spendly automatycznie importuje faktury z KSeF, kontroluje food cost i alarmuje o podwyżkach — zanim uderzą w marżę Twojej restauracji.
            </motion.p>

            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.4, ease, delay: 0.2 }}
              style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
              <Link href="/sign-up">
                <button data-testid="btn-cta-signup" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.accentHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>
                  Rozpocznij za darmo <ArrowRight size={16} />
                </button>
              </Link>
              <a href="#jak-to-dziala">
                <button data-testid="btn-cta-secondary" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500,
                  background: "none", border: `1px solid ${C.border}`,
                  color: C.text, cursor: "pointer", transition: "border-color 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                  Zobacz jak działa
                </button>
              </a>
            </motion.div>

            <motion.div variants={fadeIn} initial="hidden" animate="visible" transition={{ duration: 0.35, delay: 0.3 }}
              style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
              {["Bez wdrożenia", "Gotowe w kilka minut", "Działa z KSeF"].map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted }}>
                  <Check size={13} style={{ color: C.accent, flexShrink: 0 }} />{t}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Mockup — visible on all screen sizes; centered on mobile, right-aligned on lg+ */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.45, ease, delay: 0.15 }}
            style={{ display: "flex", justifyContent: "center" }}
            className="lg:justify-end">
            <DashboardMockup />
          </motion.div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF ─────────────────────────────────────────────────── */}
      <motion.section variants={fadeIn} initial="hidden" whileInView="visible" viewport={vp}
        style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { icon: TrendingDown, stat: "-18%", label: "Redukcja strat kosztowych" },
              { icon: Zap, stat: "15 s", label: "OCR faktury ze zdjęcia" },
              { icon: Database, stat: "100%", label: "Faktur z KSeF automatycznie" },
            ].map(({ icon: Icon, stat, label }, i) => (
              <motion.div key={label} variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp}
                transition={{ duration: 0.4, ease, delay: i * 0.08 }}
                style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
                  padding: "20px 24px", display: "flex", alignItems: "center", gap: 16,
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={18} style={{ color: C.accent }} />
                </div>
                <div>
                  <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>{stat}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: "2px 0 0" }}>{label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="jak-to-dziala" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Jak to działa</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
            Od faktury do alertu w trzech krokach
          </h2>
        </motion.div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {[
            { num: "01", icon: RefreshCw, title: "Synchronizuj z KSeF", desc: "Podajesz NIP i token KSeF. Spendly automatycznie pobiera faktury zakupowe od wszystkich dostawców — bez ręcznego wgrywania plików." },
            { num: "02", icon: TrendingUp, title: "Śledź zmiany cen", desc: "Każda pozycja trafia do bazy. Widzisz historię ceny każdego surowca, wykres trendu i który dostawca podniósł cenę i o ile." },
            { num: "03", icon: Bell, title: "Reaguj na podwyżki", desc: "Ustawiasz progi cenowe dla kluczowych składników. Spendly alarmuje cię zanim podwyżka wpłynie na marżę i food cost." },
          ].map(({ num, icon: Icon, title, desc }, i) => (
            <motion.div key={num} variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp}
              transition={{ duration: 0.4, ease, delay: i * 0.1 }}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "28px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} style={{ color: C.accent }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.05em" }}>{num}</span>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── PROBLEM / SOLUTION ───────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Problem i rozwiązanie</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
              Znasz te problemy?
            </h2>
          </motion.div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32 }} className="md:grid-cols-2 md:gap-12 lg:gap-20">
            {/* Problems */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.red, textTransform: "uppercase", marginBottom: 20 }}>Bez Spendly</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "Chaos faktur — ręczne przepisywanie danych godzinami",
                  "Brak kontroli food cost — dowiadujesz się o problemie za późno",
                  "Ręczne wpisywanie cen — błędy, brak historii, zero analizy",
                  "Brak analizy dostawców — nie wiesz który drożeje i dlaczego",
                ].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <X size={14} style={{ color: C.red, marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Solutions */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4, delay: 0.1 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.accent, textTransform: "uppercase", marginBottom: 20 }}>Z Spendly</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "AI OCR — faktury odczytywane automatycznie w 15 sekund",
                  "Analiza food cost w czasie rzeczywistym z alertami",
                  "Automatyczne raporty — dzienne, miesięczne, per-dostawca",
                  "Alerty cenowe — wiesz zanim podwyżka uderzy w marżę",
                  "Integracja KSeF — faktury pobierane bez żadnego działania",
                ].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <CheckCircle2 size={14} style={{ color: C.accent, marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─────────────────────────────────────────────────────── */}
      <section id="funkcje" style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Funkcje</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
            Wszystko czego potrzebujesz do kontroli kosztów
          </h2>
        </motion.div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <motion.div key={title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp}
              transition={{ duration: 0.4, ease, delay: (i % 3) * 0.07 }}
              style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "24px",
                transition: "border-color 0.2s",
              }}
              whileHover={{ borderColor: C.borderHover }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon size={18} style={{ color: C.accent }} />
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{title}</h3>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── SCREENSHOT / MOCKUP SECTION ──────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Dashboard</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: "0 0 16px" }}>
              Pełna kontrola kosztów w jednym miejscu
            </h2>
            <p style={{ fontSize: 15, color: C.muted, maxWidth: 520, margin: "0 auto" }}>
              Dashboard łączy dane z KSeF, historię cen i alerty w przejrzysty widok — dla każdego dostawcy i produktu.
            </p>
          </motion.div>

          {/* Large dark mockup */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.5 }}
            style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
              overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.5)",
            }}>
            {/* Window chrome */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#F87171", "#FBBF24", "#34D399"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
              </div>
              <div style={{ flex: 1, height: 22, background: "rgba(255,255,255,0.04)", borderRadius: 6, maxWidth: 300, display: "flex", alignItems: "center", padding: "0 10px" }}>
                <span style={{ fontSize: 11, color: C.muted }}>spendly.app/dashboard</span>
              </div>
            </div>
            {/* Dashboard content */}
            <div style={{ padding: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              {[
                { label: "Wydatki łączne", val: "48 230 zł", sub: "+8,2% vs. poprzedni miesiąc", up: true },
                { label: "Food Cost %", val: "28,4%", sub: "cel: < 30%", up: false },
                { label: "Aktywni dostawcy", val: "12", sub: "3 z alertem cenowym", up: true },
                { label: "Faktury w KSeF", val: "106", sub: "wszystkie zaimportowane", up: false },
              ].map(({ label, val, sub, up }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
                  <p style={{ fontSize: 11, color: C.muted, margin: "0 0 6px" }}>{label}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: "0 0 4px" }}>{val}</p>
                  <p style={{ fontSize: 10, color: up ? C.red : C.accent, margin: 0 }}>{sub}</p>
                </div>
              ))}
            </div>
            {/* Price table preview */}
            <div style={{ padding: "0 24px 24px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Ostatnie zmiany cen surowców</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                {[
                  { name: "Łosoś atlantycki (kg)", price: "47,20 zł", pct: "+12,4%", up: true },
                  { name: "Oliwa extra virgin (l)", price: "28,80 zł", pct: "+17,6%", up: true },
                  { name: "Polędwica wołowa (kg)", price: "89,50 zł", pct: "-1,6%", up: false },
                  { name: "Mąka pszenna T550 (kg)", price: "3,20 zł", pct: "+6,7%", up: true },
                ].map((r, i, arr) => (
                  <div key={r.name} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px",
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.up ? C.red : C.accent }} />
                      <span style={{ fontSize: 12, color: C.text }}>{r.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{r.price}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: r.up ? C.redDim : C.accentDim, color: r.up ? C.red : C.accent,
                      }}>{r.pct}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── SEO CONTENT ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48 }}>
          {[
            {
              h2: "System kontroli kosztów dla gastronomii",
              body: "Spendly to dedykowany system do kontroli kosztów restauracji, który automatyzuje analizę faktur i monitorowanie food cost. Dzięki integracji z KSeF i AI OCR, restauratorzy oszczędzają godziny ręcznej pracy i zyskują pełen wgląd w strukturę wydatków — per-dostawca, per-produkt i per-kategoria.",
            },
            {
              h2: "Integracja z KSeF dla restauracji",
              body: "Krajowy System e-Faktur (KSeF) staje się standardem dla polskich firm gastronomicznych. Spendly automatycznie pobiera faktury zakupowe przez API KSeF, eliminując ręczne wprowadzanie danych. Integracja działa dla wszystkich dostawców zarejestrowanych w KSeF i nie wymaga żadnej dodatkowej konfiguracji po stronie dostawcy.",
            },
            {
              h2: "Automatyczna analiza kosztów i food cost",
              body: "Food cost to jeden z kluczowych wskaźników rentowności restauracji. Spendly automatycznie wylicza food cost na podstawie zaimportowanych faktur, śledzi zmiany cen surowców i generuje raporty miesięczne. System wykrywa anomalie cenowe i alarmuje zanim podwyżka składników wpłynie na wynik finansowy lokalu.",
            },
          ].map(({ h2, body }, i) => (
            <motion.div key={h2} variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp}
              transition={{ duration: 0.4, ease, delay: i * 0.07 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>{h2}</h2>
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────────────── */}
      <section id="cennik" style={{ borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>Cennik</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 12 }}>
              Prosta cena. Pełna kontrola kosztów.
            </h2>
            <p style={{ fontSize: 15, color: C.muted, margin: 0 }}>Okres testowy — bezpłatnie dla każdego. Anuluj w dowolnym momencie.</p>
          </motion.div>

          {/* Single Pro card — centered, max-w-md */}
          <div style={{ maxWidth: 420, margin: "0 auto" }}>
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4 }}
              style={{
                background: C.card,
                border: `1px solid rgba(61,220,151,0.25)`,
                borderRadius: 24, padding: "36px 32px",
                display: "flex", flexDirection: "column",
                boxShadow: "0 0 0 1px rgba(61,220,151,0.08), 0 32px 64px rgba(0,0,0,0.4)",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>Spendly Pro</p>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  background: C.accentDim, color: C.accent, padding: "4px 10px", borderRadius: 999,
                }}>Okres testowy</div>
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 52, fontWeight: 800, color: C.accent, letterSpacing: "-0.03em", lineHeight: 1 }}>0</span>
                  <span style={{ fontSize: 16, color: C.muted }}>zł / mies.</span>
                  <span style={{ fontSize: 14, color: C.muted, textDecoration: "line-through", alignSelf: "center", marginLeft: 4, opacity: 0.6 }}>200 zł</span>
                </div>
                <p style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Bezpłatnie w całym okresie testowym — dla każdego.</p>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Integracja z KSeF",
                  "OCR faktur",
                  "Kontrola food cost",
                  "Analiza kosztów restauracji",
                  "Alerty kosztowe",
                  "Dashboard wydatków",
                  "Raporty miesięczne",
                  "Monitoring cen dostawców",
                  "Zbiorcze zarządzanie płatnościami",
                ].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: C.text }}>
                    <Check size={15} style={{ color: C.accent, flexShrink: 0 }} />{f}
                  </li>
                ))}
              </ul>

              <Link href="/sign-up">
                <button style={{
                  width: "100%", padding: "14px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: C.accent, border: "none", color: "#0B0F14", cursor: "pointer",
                  transition: "background 0.15s", marginBottom: 12,
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.accentHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>
                  Rozpocznij za darmo
                </button>
              </Link>
              <p style={{ textAlign: "center", fontSize: 12, color: C.muted, margin: 0 }}>
                Bez umowy. Bez wdrożenia. Bez ukrytych kosztów.
              </p>
            </motion.div>
          </div>

          <motion.p variants={fadeIn} initial="hidden" whileInView="visible" viewport={vp}
            style={{ textAlign: "center", fontSize: 13, color: C.muted, marginTop: 24 }}>
            Potrzebujesz dedykowanej integracji lub wsparcia dla sieci lokali?{" "}
            <a href="mailto:kontakt@spendly.pl" style={{ color: C.accent, textDecoration: "none" }}>Napisz do nas</a>
          </motion.p>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 12 }}>FAQ</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
            Najczęstsze pytania
          </h2>
        </motion.div>
        <motion.div variants={fadeIn} initial="hidden" whileInView="visible" viewport={vp}
          style={{ borderTop: `1px solid ${C.border}` }}>
          {FAQS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
          ))}
        </motion.div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp}
          style={{
            background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)",
            border: `1px solid rgba(61,220,151,0.2)`, borderRadius: 24,
            padding: "60px 40px", textAlign: "center",
          }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 999, marginBottom: 20,
            border: `1px solid ${C.accentDim}`, background: C.accentDim,
            color: C.accent, fontSize: 12, fontWeight: 600,
          }}>
            Okres testowy — bezpłatnie
          </div>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 16 }}>
            Zobacz ile kosztów możesz odzyskać.
          </h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 520, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Spendly pomaga restauracjom kontrolować wydatki, food cost i faktury w jednym miejscu.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/sign-up">
              <button data-testid="btn-cta-final" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer",
                transition: "background 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = C.accentHover)}
                onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>
                Rozpocznij za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/sign-in">
              <button style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 500,
                background: "none", border: `1px solid ${C.border}`,
                color: C.text, cursor: "pointer",
              }}>
                Mam już konto <ChevronRight size={16} />
              </button>
            </Link>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
            {["Bez umowy", "Bez wdrożenia", "Bez ukrytych kosztów"].map(t => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted }}>
                <Check size={12} style={{ color: C.accent }} />{t}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }} className="md:flex-row md:items-center md:justify-between">
          <div>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", color: C.accent }}>
              SPENDLY<span style={{ color: C.text }}>.</span>
            </span>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>— monitoring kosztów dla gastronomii</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {[
              { href: "/sign-in", label: "Logowanie" },
              { href: "/sign-up", label: "Rejestracja" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}>
                <span style={{ fontSize: 13, color: C.muted, cursor: "pointer", textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                  {label}
                </span>
              </Link>
            ))}
            <a href="mailto:kontakt@spendly.pl" style={{ fontSize: 13, color: C.muted, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              Kontakt <ArrowUpRight size={12} />
            </a>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "20px auto 0", paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            &copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa zastrzeżone.
          </span>
        </div>
      </footer>
    </div>
  );
}
