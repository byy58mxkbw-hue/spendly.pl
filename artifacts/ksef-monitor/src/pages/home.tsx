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
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            style={{ overflow: "hidden" }}
          >
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, paddingBottom: 20 }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ScanLine, title: "OCR faktur", desc: "Automatyczne odczytywanie faktur kosztowych — ze zdjęcia lub pliku." },
  { icon: RefreshCw, title: "Integracja KSeF", desc: "Automatyczny import faktur z Krajowego Systemu e-Faktur dla Twojego NIP." },
  { icon: TrendingDown, title: "Food Cost AI", desc: "Monitoruj rentowność produktów, składników i całego menu." },
  { icon: BarChart3, title: "Analiza kosztów", desc: "Wykrywaj wzrosty cen i anomalie zanim uderzą w marżę." },
  { icon: FileBarChart2, title: "Raporty restauracyjne", desc: "Dzienny i miesięczny monitoring kosztów z eksportem CSV." },
  { icon: Bell, title: "Alerty cenowe", desc: "Powiadomienia o niekontrolowanych wydatkach i przekroczeniu progów." },
];

const FAQS = [
  { q: "Czy Spendly integruje się z KSeF?", a: "Tak. Spendly łączy się bezpośrednio z Krajowym Systemem e-Faktur przez API i automatycznie pobiera faktury zakupowe dla Twojego NIP-u. Wystarczy podać NIP i token KSeF — resztą zajmuje się system." },
  { q: "Jak działa OCR faktur?", a: "Spendly wykorzystuje AI do odczytywania faktur ze zdjęć lub plików PDF. System automatycznie rozpoznaje dostawcę, produkty, ceny i daty — bez ręcznego przepisywania danych." },
  { q: "Czy Spendly pomaga kontrolować food cost?", a: "Tak. System monitoruje ceny każdego surowca z faktur, porównuje z poprzednimi miesiącami i wylicza wpływ na food cost. Możesz ustawić progi cenowe dla kluczowych składników i otrzymywać alerty." },
  { q: "Czy system działa dla wielu lokali?", a: "Plan Pro obsługuje nielimitowaną liczbę dostawców. Obsługa wielu lokali z jednego panelu jest dostępna w planie Enterprise — skontaktuj się z nami." },
  { q: "Jak wygląda wdrożenie?", a: "Konfiguracja zajmuje około 2 minut: zakładasz konto, podajesz NIP i token KSeF, a system automatycznie pobiera faktury. Nie musisz instalować żadnego oprogramowania." },
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
                Umów demo
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
                    Umów demo
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
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.4, ease }} style={{ marginBottom: 24 }}>
              <Badge icon={ShieldCheck} label="Zintegrowane z KSeF" />
            </motion.div>

            <motion.h1 variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.45, ease, delay: 0.07 }}
              style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20, color: C.text }}>
              Kontroluj koszty restauracji<br />
              <span style={{ color: C.accent }}>w czasie rzeczywistym</span>
            </motion.h1>

            <motion.p variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.4, ease, delay: 0.14 }}
              style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 480, marginBottom: 36 }}>
              Spendly automatycznie analizuje faktury, kontroluje food cost i integruje się z KSeF, pomagając restauracjom ograniczać straty i zwiększać marżę.
            </motion.p>

            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ duration: 0.4, ease, delay: 0.2 }}
              style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 32 }}>
              <Link href="/sign-up">
                <button data-testid="btn-cta-signup" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.accentHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>
                  Umów demo <ArrowRight size={16} />
                </button>
              </Link>
              <a href="#jak-to-dziala">
                <button data-testid="btn-cta-signin" style={{
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
              {["Bez karty kredytowej", "Konfiguracja w 2 minuty", "Import z KSeF od razu"].map(t => (
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
              Prosty, przejrzysty cennik
            </h2>
            <p style={{ fontSize: 15, color: C.muted, margin: 0 }}>Zacznij za darmo, rozwijaj się kiedy chcesz.</p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, maxWidth: 680, margin: "0 auto" }}>
            {/* Free */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4 }}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "28px", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Free</p>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: C.text }}>0 zł</span>
                <span style={{ fontSize: 13, color: C.muted, marginLeft: 6 }}>/ mies.</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {["Synchronizacja z KSeF", "Do 3 dostawców", "Historia cen — 90 dni", "5 alertów cenowych", "OCR faktur ze zdjęcia"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text }}>
                    <Check size={14} style={{ color: C.accent, flexShrink: 0 }} />{f}
                  </li>
                ))}
                {["Raporty miesięczne", "AI CFO"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, opacity: 0.5 }}>
                    <X size={14} style={{ flexShrink: 0 }} />{f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up">
                <button style={{
                  width: "100%", padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: "none", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                  Zacznij za darmo
                </button>
              </Link>
            </motion.div>

            {/* Pro */}
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4, delay: 0.1 }}
              style={{
                background: C.accent, borderRadius: 20, padding: "28px",
                display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
              }}>
              <div style={{
                position: "absolute", top: 16, right: 16,
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
                background: "rgba(0,0,0,0.15)", color: "#0B0F14", padding: "3px 8px", borderRadius: 999,
              }}>Polecany</div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(11,15,20,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Pro</p>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: "#0B0F14" }}>99 zł</span>
                <span style={{ fontSize: 13, color: "rgba(11,15,20,0.6)", marginLeft: 6 }}>/ mies.</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {["Nieograniczona liczba dostawców", "Nieograniczona historia cen", "Nieograniczone alerty cenowe", "Raporty miesięczne + eksport CSV", "AI CFO — rekomendacje zakupowe", "Wsparcie priorytetowe"].map(f => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#0B0F14" }}>
                    <Check size={14} style={{ flexShrink: 0 }} />{f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up">
                <button style={{
                  width: "100%", padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: "#0B0F14", border: "none", color: C.accent, cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                  Wypróbuj Pro za darmo
                </button>
              </Link>
            </motion.div>
          </div>

          <motion.p variants={fadeIn} initial="hidden" whileInView="visible" viewport={vp}
            style={{ textAlign: "center", fontSize: 13, color: C.muted, marginTop: 24 }}>
            Potrzebujesz wielu lokali lub dedykowanej integracji?{" "}
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
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accent, textTransform: "uppercase", marginBottom: 16 }}>
            Zacznij kontrolować koszty już dziś
          </p>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 16 }}>
            Zobacz gdzie uciekają pieniądze.
          </h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Dołącz do restauratorów, którzy wiedzą za co płacą — i reagują na podwyżki zanim wpłyną na marżę.
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
                Umów demo <ArrowRight size={16} />
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
            {["Darmowy plan na zawsze", "Bez zobowiązań", "Konfiguracja w 2 minuty"].map(t => (
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
