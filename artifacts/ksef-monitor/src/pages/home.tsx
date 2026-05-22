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
  BarChart2,
  FileText,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Check,
  X,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

// ─── Animation helpers ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const ease = [0.4, 0, 0.2, 1] as const;
const viewportOpts = { once: true, amount: 0.15 } as const;

// ─── App UI Mockup ────────────────────────────────────────────────────────────

function AppMockup() {
  const items = [
    { name: "Łosoś atlantycki (kg)", price: "47,20 zł", prev: "42,00 zł", pct: "+12,4%", up: true },
    { name: "Polędwica wołowa (kg)", price: "89,50 zł", prev: "91,00 zł", pct: "-1,6%", up: false },
    { name: "Oliwa extra virgin (l)", price: "28,80 zł", prev: "24,50 zł", pct: "+17,6%", up: true },
    { name: "Mąka pszenna T550 (kg)", price: "3,20 zł", prev: "3,00 zł", pct: "+6,7%", up: true },
    { name: "Masło extra 82% (kg)", price: "32,40 zł", prev: "32,40 zł", pct: "0,0%", up: false },
  ];

  return (
    <div className="relative w-full max-w-[520px] mx-auto lg:mx-0">
      {/* Glow effect */}
      <div className="absolute -inset-4 bg-primary/5 rounded-3xl blur-2xl" />

      {/* Main card */}
      <div className="relative bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="CheckIT" className="w-6 h-6 rounded-md" />
            <span className="text-sm font-semibold text-foreground">CheckIT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            { label: "Dostawcy", value: "12" },
            { label: "Produkty", value: "184" },
            { label: "Faktury", value: "106" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card px-4 py-3 text-center">
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Price table */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ostatnie zmiany cen</p>
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.up ? "bg-red-400" : item.pct === "0,0%" ? "bg-muted-foreground" : "bg-emerald-500"}`} />
                  <span className="text-xs text-foreground truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-xs text-muted-foreground line-through">{item.prev}</span>
                  <span className="text-xs font-semibold text-foreground">{item.price}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    item.up
                      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      : item.pct === "0,0%"
                        ? "bg-secondary text-muted-foreground"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  }`}>
                    {item.up ? <span className="flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5 inline" /> {item.pct}</span> : item.pct}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alert badge */}
        <div className="mx-4 mb-4 mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Alert: Łosoś przekroczył próg +10% — sprawdź dostawców</span>
        </div>
      </div>

      {/* Floating invoice card */}
      <div className="absolute -bottom-4 -right-6 bg-card border border-border rounded-xl shadow-lg px-4 py-3 min-w-[160px] hidden sm:block">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Nowa faktura</span>
        </div>
        <p className="text-xs text-muted-foreground">PPHU Rybex Sp. z o.o.</p>
        <p className="text-sm font-bold text-foreground mt-0.5">4 820,00 zł</p>
        <div className="flex items-center gap-1 mt-1">
          <CheckCircle2 className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-primary font-medium">Zaimportowano z KSeF</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="min-h-screen bg-background">

      {/* ─── Nav ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="CheckIT" className="w-8 h-8 rounded-lg" />
            <span className="font-extrabold text-foreground text-lg tracking-tight">CheckIT</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#jak-to-dziala" className="hover:text-foreground transition-colors">Jak to działa</a>
            <a href="#funkcje" className="hover:text-foreground transition-colors">Funkcje</a>
            <a href="#cennik" className="hover:text-foreground transition-colors">Cennik</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm" data-testid="btn-signin">Zaloguj</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="gap-1.5" data-testid="btn-signup">
                Zacznij za darmo
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-10 md:pt-20 md:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left */}
          <div>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.4, ease, delay: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-7"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Zintegrowane z KSeF
            </motion.div>
            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.4, ease, delay: 0.07 }}
              className="text-4xl md:text-5xl font-extrabold text-foreground tracking-tight leading-[1.08] mb-5"
            >
              Przestań tracić<br />
              na <span className="text-primary">food cost.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.4, ease, delay: 0.14 }}
              className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg"
            >
              CheckIT automatycznie pobiera faktury od dostawców z KSeF, śledzi zmiany cen każdego surowca i alarmuje zanim podwyżka uderzy w twój wynik.
            </motion.p>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.4, ease, delay: 0.21 }}
              className="flex flex-col sm:flex-row gap-3 mb-8"
            >
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button size="lg" className="gap-2 w-full sm:w-auto" data-testid="btn-cta-signup">
                  Zacznij bezpłatnie <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/sign-in" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="btn-cta-signin">
                  Zaloguj się
                </Button>
              </Link>
            </motion.div>
            <motion.div
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.35, ease, delay: 0.32 }}
              className="flex flex-wrap gap-4 text-sm text-muted-foreground"
            >
              {["Bez karty kredytowej", "Konfiguracja w 5 minut", "Faktury z KSeF od razu"].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  {t}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — app mockup */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.4, ease, delay: 0.15 }}
            className="flex justify-center lg:justify-end pt-2 pb-2 lg:pt-0 lg:pb-0"
          >
            <AppMockup />
          </motion.div>
        </div>
      </section>

      {/* ─── Trust bar ───────────────────────────────────────────────────── */}
      <motion.section
        variants={fadeIn}
        initial="hidden"
        whileInView="visible"
        viewport={viewportOpts}
        className="border-y border-border bg-secondary/40"
      >
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-8 sm:gap-y-3">
            {[
              { icon: RefreshCw, text: "Automatyczna integracja z KSeF" },
              { icon: TrendingDown, text: "Historia cen każdego surowca" },
              { icon: Bell, text: "Alerty o podwyżkach w czasie rzeczywistym" },
              { icon: BarChart2, text: "Raporty food cost" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="w-4 h-4 text-primary shrink-0" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ─── How it works ────────────────────────────────────────────────── */}
      <section id="jak-to-dziala" className="max-w-6xl mx-auto px-6 py-12 md:py-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOpts}
          className="text-center mb-8 md:mb-14"
        >
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Jak to działa</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
            Od faktury do alertu<br className="hidden md:block" /> w trzech krokach
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-[calc(33%+2rem)] right-[calc(33%+2rem)] h-px bg-border" />

          {[
            {
              num: "1",
              icon: RefreshCw,
              title: "Synchronizuj z KSeF",
              desc: "Podajesz NIP i token KSeF. CheckIT automatycznie pobiera faktury zakupowe od wszystkich twoich dostawców — bez ręcznego wgrywania plików.",
              delay: 0,
            },
            {
              num: "2",
              icon: TrendingUp,
              title: "Śledź zmiany cen",
              desc: "Każda pozycja z faktury trafia do bazy. Widzisz historię ceny każdego surowca i wykres trendu — kto podniósł i o ile.",
              delay: 0.1,
            },
            {
              num: "3",
              icon: Bell,
              title: "Reaguj na podwyżki",
              desc: "Ustawiasz progi cenowe dla kluczowych składników. CheckIT alarmuje cię zanim podwyżka wpłynie na marżę i food cost.",
              delay: 0.2,
            },
          ].map(({ num, icon: Icon, title, desc, delay }) => (
            <motion.div
              key={num}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              transition={{ duration: 0.4, ease, delay }}
              className="relative flex items-start gap-4 md:flex-col md:items-center md:text-center md:gap-0 md:px-4"
            >
              <div className="relative w-12 h-12 shrink-0 md:w-20 md:h-20 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center md:mb-5 z-10">
                <Icon className="w-5 h-5 md:w-8 md:h-8 text-primary" />
                <span className="absolute -top-2 -right-2 w-5 h-5 md:-top-2.5 md:-right-2.5 md:w-6 md:h-6 rounded-full bg-primary text-primary-foreground text-[10px] md:text-xs font-bold flex items-center justify-center">
                  {num}
                </span>
              </div>
              <div className="pt-0.5">
                <h3 className="text-base font-semibold text-foreground mb-1.5 md:mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Problem / Solution ──────────────────────────────────────────── */}
      <section className="bg-secondary/30 border-y border-border">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOpts}
            className="text-center mb-8 md:mb-14"
          >
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Dla kogo</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
              Znasz te problemy?
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                problem: "Dowiadujesz się o podwyżce dopiero gdy liczy się food cost na koniec miesiąca.",
                solution: "CheckIT monitoruje ceny na bieżąco i alarmuje tuż po dostawie — masz czas zareagować.",
                delay: 0,
              },
              {
                problem: "Ręcznie wpisujesz ceny z faktur do arkusza. Zajmuje godziny, błędy się zdarzają.",
                solution: "Automatyczny import z KSeF. Ceny są w systemie zanim zdążysz otworzyć Excela.",
                delay: 0.1,
              },
              {
                problem: "Nie wiesz który dostawca ciągnie food cost w górę i o ile.",
                solution: "Raporty per-dostawca i per-produkt pokazują dokładnie kto i kiedy zmienił cenę.",
                delay: 0.2,
              },
            ].map(({ problem, solution, delay }) => (
              <motion.div
                key={problem}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={viewportOpts}
                transition={{ duration: 0.4, ease, delay }}
                className="bg-card rounded-2xl border border-border overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-border bg-red-50/50 dark:bg-red-900/10">
                  <div className="flex items-start gap-2.5">
                    <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground/80 leading-relaxed">{problem}</p>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground leading-relaxed font-medium">{solution}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────────── */}
      <section id="funkcje" className="max-w-6xl mx-auto px-6 py-12 md:py-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOpts}
          className="text-center mb-8 md:mb-14"
        >
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Funkcje</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
            Wszystko czego potrzebujesz<br className="hidden md:block" /> do kontroli kosztów
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: RefreshCw,
              title: "Synchronizacja KSeF",
              desc: "Automatyczne pobieranie faktur zakupowych z Krajowego Systemu e-Faktur dla twojego NIP-u.",
              delay: 0,
            },
            {
              icon: TrendingDown,
              title: "Historia cen",
              desc: "Wykres trendu każdego surowca z zaznaczonymi datami zmian. Jedno spojrzenie — cały kontekst.",
              delay: 0.07,
            },
            {
              icon: Bell,
              title: "Alerty cenowe",
              desc: "Ustawiasz próg procentowy lub kwotowy. Alert trafia do ciebie zanim przyjdzie kolejna dostawa.",
              delay: 0.14,
            },
            {
              icon: FileBarChart2,
              title: "Raporty miesięczne",
              desc: "Zestawienie zakupów per-dostawca i per-kategoria. Wiesz gdzie idzie budżet zakupowy.",
              delay: 0.0,
            },
            {
              icon: FileText,
              title: "Faktury do przeglądu",
              desc: "Faktury bez automatycznego dopasowania trafiają do kolejki. Przypisujesz dostawcę jednym kliknięciem.",
              delay: 0.07,
            },
            {
              icon: Sparkles,
              title: "AI CFO",
              desc: "Sztuczna inteligencja analizuje twoje zakupy i daje konkretne rekomendacje co renegocjować.",
              delay: 0.14,
            },
          ].map(({ icon: Icon, title, desc, delay }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              transition={{ duration: 0.4, ease, delay }}
              className="group border border-border rounded-xl p-5 bg-card hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/8 text-primary flex items-center justify-center mb-4 group-hover:bg-primary/12 transition-colors">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Pricing ─────────────────────────────────────────────────────── */}
      <section id="cennik" className="bg-secondary/30 border-y border-border">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOpts}
            className="text-center mb-8 md:mb-14"
          >
            <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Cennik</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight mb-3">
              Prosty, przejrzysty cennik
            </h2>
            <p className="text-muted-foreground text-base">Zacznij za darmo, rozwijaj się kiedy chcesz.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              transition={{ duration: 0.4, ease, delay: 0 }}
              className="bg-card border border-border rounded-2xl p-7 flex flex-col"
            >
              <div className="mb-6">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Starter</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-foreground">0 zł</span>
                  <span className="text-muted-foreground text-sm">/ mies.</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Idealne na start — bez karty kredytowej.</p>
              </div>
              <ul className="space-y-2.5 flex-1 mb-7">
                {[
                  "Synchronizacja z KSeF",
                  "Do 3 dostawców",
                  "Historia cen — 90 dni",
                  "5 alertów cenowych",
                  "Import ręczny faktur XML",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
                {["Raporty miesięczne", "AI CFO"].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground/60">
                    <X className="w-4 h-4 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up" className="w-full">
                <Button variant="outline" className="w-full" size="lg">
                  Zacznij za darmo
                </Button>
              </Link>
            </motion.div>

            {/* Pro */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              transition={{ duration: 0.4, ease, delay: 0.1 }}
              className="bg-primary rounded-2xl p-7 flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-5 right-5 text-[10px] font-bold text-primary bg-primary-foreground px-2.5 py-1 rounded-full uppercase tracking-wide">
                Polecany
              </div>
              <div className="mb-6">
                <p className="text-sm font-semibold text-primary-foreground/70 uppercase tracking-wide mb-1">Pro</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-primary-foreground">99 zł</span>
                  <span className="text-primary-foreground/70 text-sm">/ mies.</span>
                </div>
                <p className="text-sm text-primary-foreground/70 mt-2">Pełna kontrola kosztów bez ograniczeń.</p>
              </div>
              <ul className="space-y-2.5 flex-1 mb-7">
                {[
                  "Nieograniczona liczba dostawców",
                  "Nieograniczona historia cen",
                  "Nieograniczone alerty cenowe",
                  "Raporty miesięczne",
                  "AI CFO — rekomendacje zakupowe",
                  "Eksport danych (CSV)",
                  "Wsparcie priorytetowe",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-primary-foreground">
                    <Check className="w-4 h-4 text-primary-foreground/80 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up" className="w-full">
                <Button
                  variant="secondary"
                  className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold"
                  size="lg"
                >
                  Wypróbuj Pro za darmo
                </Button>
              </Link>
            </motion.div>
          </div>

          <motion.p
            variants={fadeIn}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOpts}
            transition={{ duration: 0.35, ease, delay: 0.15 }}
            className="text-center text-sm text-muted-foreground mt-6"
          >
            Potrzebujesz więcej lokali lub niestandardowej integracji?{" "}
            <a href="mailto:kontakt@checkit.pl" className="text-primary hover:underline font-medium">
              Napisz do nas
            </a>
          </motion.p>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-12 md:py-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOpts}
          className="relative bg-primary rounded-3xl overflow-hidden px-6 py-10 md:px-16 md:py-20 text-center"
        >
          {/* Decorative circles */}
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/5 rounded-full" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-white/5 rounded-full" />

          <div className="relative">
            <p className="text-primary-foreground/70 text-sm font-semibold uppercase tracking-widest mb-4">
              Zacznij kontrolować koszty już dziś
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-primary-foreground tracking-tight mb-5">
              Twój food cost pod kontrolą.<br className="hidden md:block" /> Rejestracja zajmuje 2 minuty.
            </h2>
            <p className="text-primary-foreground/75 text-base mb-8 max-w-xl mx-auto leading-relaxed">
              Dołącz do restauratorów, którzy wiedzą za co płacą — i reagują na podwyżki zanim wpłyną na marżę.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="gap-2 bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold px-8 w-full sm:w-auto"
                  data-testid="btn-cta-final"
                >
                  Zarejestruj się za darmo <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/sign-in" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 w-full sm:w-auto"
                >
                  Mam już konto <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-5 mt-7">
              {["Darmowy plan na zawsze", "Bez zobowiązań", "Konfiguracja w 5 minut"].map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-sm text-primary-foreground/70">
                  <Check className="w-3.5 h-3.5 text-primary-foreground/60" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-secondary/20">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="CheckIT" className="w-7 h-7 rounded-lg" />
              <span className="font-extrabold text-foreground tracking-tight">CheckIT</span>
              <span className="text-muted-foreground text-xs hidden md:inline">— monitoring cen surowców dla restauracji</span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <Link href="/sign-in" className="hover:text-foreground transition-colors">
                Logowanie
              </Link>
              <Link href="/sign-up" className="hover:text-foreground transition-colors">
                Rejestracja
              </Link>
              <a href="mailto:kontakt@checkit.pl" className="hover:text-foreground transition-colors flex items-center gap-1">
                Kontakt <ArrowUpRight className="w-3 h-3" />
              </a>
              <span className="text-border">|</span>
              <span className="text-muted-foreground/60 text-xs">Polityka prywatności</span>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-border text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} CheckIT. Wszelkie prawa zastrzeżone.
          </div>
        </div>
      </footer>
    </div>
  );
}
