import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Bell,
  RefreshCw,
  BarChart2,
  FileBarChart2,
  FileText,
  Sparkles,
  CheckCircle2,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Menu,
  Camera,
} from "lucide-react";

const ease = [0.4, 0, 0.2, 1] as const;
const vp = { once: true, amount: 0.15 } as const;

function CountUp({
  to,
  suffix = "",
  duration = 1.8,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, duration]);
  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  );
}

function AppMockup() {
  const items = [
    {
      name: "Łosoś atlantycki",
      price: "47,20 zł",
      prev: "42,00 zł",
      pct: "+12,4%",
      up: true,
    },
    {
      name: "Polędwica wołowa",
      price: "89,50 zł",
      prev: "91,00 zł",
      pct: "-1,6%",
      up: false,
    },
    {
      name: "Oliwa extra virgin",
      price: "28,80 zł",
      prev: "24,50 zł",
      pct: "+17,6%",
      up: true,
    },
    {
      name: "Mąka pszenna T550",
      price: "3,20 zł",
      prev: "3,00 zł",
      pct: "+6,7%",
      up: true,
    },
    {
      name: "Masło extra 82%",
      price: "32,40 zł",
      prev: "32,40 zł",
      pct: "0%",
      up: false,
    },
  ];
  return (
    <div className="relative w-full max-w-[480px] mx-auto">
      <div
        className="absolute -inset-6 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, rgba(20,184,166,0.15) 0%, transparent 70%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease, delay: 0.2 }}
        className="relative bg-white border border-gray-100 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <span
            className="text-xs font-black tracking-tighter"
            style={{ color: "#14B8A6" }}
          >
            SPENDLY<span className="text-gray-800">.</span>
          </span>
          <div className="flex gap-1">
            {["bg-red-400", "bg-yellow-400", "bg-green-400"].map((c) => (
              <div key={c} className={`w-2.5 h-2.5 rounded-full ${c}`} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            ["12", "Dostawcy"],
            ["184", "Produkty"],
            ["106", "Faktury"],
          ].map(([v, l]) => (
            <div key={l} className="py-2.5 text-center">
              <p className="text-lg font-black text-gray-900">{v}</p>
              <p className="text-[10px] text-gray-400">{l}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pt-3 pb-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Ostatnie zmiany cen
          </p>
          <div className="space-y-1">
            {items.map((item, i) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08, duration: 0.35, ease }}
                className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.up ? "bg-red-400" : item.pct === "0%" ? "bg-gray-300" : "bg-emerald-500"}`}
                  />
                  <span className="text-[11px] text-gray-700 truncate">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] text-gray-400 line-through">
                    {item.prev}
                  </span>
                  <span className="text-[11px] font-bold text-gray-800">
                    {item.price}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.up ? "bg-red-100 text-red-600" : item.pct === "0%" ? "bg-gray-100 text-gray-400" : "bg-emerald-100 text-emerald-700"}`}
                  >
                    {item.pct}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="mx-4 mb-3 mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <Bell className="w-3 h-3 text-amber-500 shrink-0" />
          <span className="text-[10px] text-amber-700 font-medium">
            Alert: Łosoś +12,4% — przekroczył próg
          </span>
        </motion.div>
      </motion.div>

      {/* Floating badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, x: 20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 1.0, duration: 0.4, ease }}
        className="absolute -bottom-3 -right-4 bg-white border border-gray-100 rounded-xl shadow-lg px-3.5 py-2.5 hidden sm:block"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#14B8A6" }} />
          <span className="text-[11px] font-semibold text-gray-800">
            Nowa faktura
          </span>
        </div>
        <p className="text-[10px] text-gray-400">PPHU Rybex Sp. z o.o.</p>
        <p className="text-sm font-black text-gray-900">4 820,00 zł</p>
        <p
          className="text-[9px] font-medium mt-0.5"
          style={{ color: "#14B8A6" }}
        >
          Zaimportowano z KSeF
        </p>
      </motion.div>
    </div>
  );
}

const STEPS = [
  {
    num: "1",
    icon: RefreshCw,
    title: "Synchronizuj z KSeF",
    desc: "Podajesz NIP i token KSeF. SPENDLY automatycznie pobiera faktury zakupowe od wszystkich twoich dostawców — bez ręcznego wgrywania plików.",
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
    desc: "Ustawiasz progi cenowe dla kluczowych składników. SPENDLY alarmuje cię zanim podwyżka wpłynie na marżę i food cost.",
    delay: 0.2,
  },
];

const PROBLEMS = [
  {
    problem:
      "Dowiadujesz się o podwyżce dopiero gdy liczysz food cost na koniec miesiąca.",
    solution:
      "SPENDLY monitoruje ceny na bieżąco i alarmuje tuż po dostawie — masz czas zareagować.",
  },
  {
    problem:
      "Ręcznie wpisujesz ceny z faktur do arkusza. Zajmuje godziny, błędy się zdarzają.",
    solution:
      "Automatyczny import z KSeF. Ceny są w systemie zanim zdążysz otworzyć Excela.",
  },
  {
    problem: "Nie wiesz który dostawca ciągnie food cost w górę i o ile.",
    solution:
      "Raporty per-dostawca i per-produkt pokazują dokładnie kto i kiedy zmienił cenę.",
  },
];

const FEATURES = [
  {
    icon: RefreshCw,
    title: "Synchronizacja KSeF",
    desc: "Automatyczne pobieranie faktur zakupowych z Krajowego Systemu e-Faktur dla twojego NIP-u.",
  },
  {
    icon: TrendingDown,
    title: "Historia cen",
    desc: "Wykres trendu każdego surowca z zaznaczonymi datami zmian. Jedno spojrzenie — cały kontekst.",
  },
  {
    icon: Bell,
    title: "Alerty cenowe",
    desc: "Ustawiasz próg procentowy lub kwotowy. Alert trafia do ciebie zanim przyjdzie kolejna dostawa.",
  },
  {
    icon: FileBarChart2,
    title: "Raporty miesięczne",
    desc: "Zestawienie zakupów per-dostawca i per-kategoria z eksportem CSV. Wiesz gdzie idzie budżet.",
  },
  {
    icon: Camera,
    title: "Skanowanie faktur",
    desc: "Zrób zdjęcie telefonem — AI odczyta pozycje i ceny. Działa nawet bez KSeF.",
  },
  {
    icon: Sparkles,
    title: "AI CFO",
    desc: "Sztuczna inteligencja analizuje twoje zakupy i daje konkretne rekomendacje co renegocjować.",
  },
];

const FREE_FEATURES = [
  "Synchronizacja z KSeF",
  "Do 3 dostawców",
  "Historia cen — 90 dni",
  "5 alertów cenowych",
  "Skanowanie faktur ze zdjęcia",
];
const FREE_MISSING = ["Raporty miesięczne", "AI CFO"];
const PRO_FEATURES = [
  "Nieograniczona liczba dostawców",
  "Nieograniczona historia cen",
  "Nieograniczone alerty cenowe",
  "Raporty miesięczne + eksport CSV",
  "AI CFO — rekomendacje zakupowe",
  "Wsparcie priorytetowe",
];

export function Dynamic() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span
            className="font-black text-xl tracking-tighter"
            style={{ color: "#14B8A6" }}
          >
            SPENDLY<span className="text-gray-900">.</span>
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-500">
            {["Jak to działa", "Funkcje", "Cennik"].map((l) => (
              <a
                key={l}
                href="#"
                className="hover:text-gray-900 transition-colors"
              >
                {l}
              </a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm">
              Zaloguj
            </Button>
            <Button
              size="sm"
              style={{ background: "#14B8A6" }}
              className="text-white hover:opacity-90 gap-1.5"
            >
              Zacznij za darmo
            </Button>
          </div>
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3"
          >
            {["Jak to działa", "Funkcje", "Cennik"].map((l) => (
              <a
                key={l}
                href="#"
                className="block text-sm text-gray-600 hover:text-gray-900 py-1"
              >
                {l}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" size="sm" className="w-full">
                Zaloguj
              </Button>
              <Button
                size="sm"
                className="w-full text-white"
                style={{ background: "#14B8A6" }}
              >
                Zacznij za darmo
              </Button>
            </div>
          </motion.div>
        )}
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10 md:pt-20 md:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 text-xs font-semibold"
              style={{
                borderColor: "rgba(20,184,166,0.3)",
                background: "rgba(20,184,166,0.06)",
                color: "#14B8A6",
              }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Zintegrowane z KSeF
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.07 }}
              className="text-4xl sm:text-5xl md:text-6xl font-black text-gray-900 tracking-tight leading-[1.08] mb-5"
            >
              Wiedz o podwyżce
              <br />
              zanim przyjdzie
              <br className="sm:hidden" />{" "}
              <span style={{ color: "#14B8A6" }}>dostawa</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.13 }}
              className="text-base sm:text-lg text-gray-500 leading-relaxed mb-8 max-w-lg"
            >
              SPENDLY automatycznie pobiera faktury od dostawców z KSeF, śledzi
              ceny każdego surowca i alarmuje zanim podwyżka uderzy w twój
              wynik.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.18 }}
              className="flex flex-col sm:flex-row gap-3 mb-7"
            >
              <Button
                size="lg"
                className="gap-2 text-white w-full sm:w-auto"
                style={{ background: "#14B8A6" }}
              >
                Zacznij bezpłatnie <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Zaloguj się
              </Button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.28 }}
              className="flex flex-wrap gap-4 text-sm text-gray-500"
            >
              {[
                "Bez karty kredytowej",
                "Konfiguracja w 5 minut",
                "Faktury z KSeF od razu",
              ].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <Check
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "#14B8A6" }}
                  />
                  {t}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Desktop: app mockup | Mobile: stat pills */}
          <div className="hidden lg:flex justify-end">
            <AppMockup />
          </div>
          <div className="lg:hidden grid grid-cols-3 gap-3 mt-2">
            {[
              { val: "8%", label: "oszczędności food cost" },
              { val: "2 min", label: "konfiguracja od zera" },
              { val: "100%", label: "faktur z KSeF auto" },
            ].map(({ val, label }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.2 }}
                className="rounded-2xl p-4 text-center border border-gray-100"
                style={{ background: "rgba(20,184,166,0.04)" }}
              >
                <p className="text-2xl font-black" style={{ color: "#14B8A6" }}>
                  {val}
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-tight">
                  {label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* STAT STRIP */}
      <motion.section
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
        initial="hidden"
        whileInView="visible"
        viewport={vp}
        className="border-y border-gray-100"
        style={{ background: "rgba(20,184,166,0.03)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { to: 8, suffix: "%", label: "średnia oszczędność\nfood cost" },
              { to: 2, suffix: " min", label: "konfiguracja\nod zera" },
              { to: 100, suffix: "%", label: "faktur z KSeF\nautomatycznie" },
              { to: 0, suffix: " zł", label: "żeby\nzacząć" },
            ].map(({ to, suffix, label }) => (
              <div key={label}>
                <p
                  className="text-4xl sm:text-5xl font-black"
                  style={{ color: "#14B8A6" }}
                >
                  <CountUp to={to} suffix={suffix} />
                </p>
                <p className="text-sm text-gray-500 mt-1 whitespace-pre-line leading-snug">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          viewport={vp}
          className="text-center mb-10 md:mb-14"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "#14B8A6" }}
          >
            Jak to działa
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">
            Od faktury do alertu
            <br className="hidden md:block" /> w trzech krokach
          </h2>
        </motion.div>
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="hidden md:block absolute top-10 left-[calc(33%+1.5rem)] right-[calc(33%+1.5rem)] h-px bg-gray-200" />
          {STEPS.map(({ num, icon: Icon, title, desc, delay }) => (
            <motion.div
              key={num}
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              viewport={vp}
              transition={{ duration: 0.45, ease, delay }}
              className="flex items-start gap-4 md:flex-col md:items-center md:text-center md:gap-0"
            >
              <div
                className="relative w-14 h-14 shrink-0 md:w-20 md:h-20 rounded-2xl flex items-center justify-center md:mb-5 z-10 border"
                style={{
                  background: "rgba(20,184,166,0.07)",
                  borderColor: "rgba(20,184,166,0.2)",
                }}
              >
                <Icon
                  className="w-6 h-6 md:w-8 md:h-8"
                  style={{ color: "#14B8A6" }}
                />
                <span
                  className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center"
                  style={{ background: "#14B8A6" }}
                >
                  {num}
                </span>
              </div>
              <div className="pt-1">
                <h3 className="text-base font-bold text-gray-900 mb-1.5">
                  {title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PROBLEM / SOLUTION */}
      <section className="border-y border-gray-100 bg-gray-50/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            initial="hidden"
            whileInView="visible"
            viewport={vp}
            className="text-center mb-10"
          >
            <p
              className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: "#14B8A6" }}
            >
              Dla kogo
            </p>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">
              Znasz te problemy?
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PROBLEMS.map(({ problem, solution }, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                initial="hidden"
                whileInView="visible"
                viewport={vp}
                transition={{ duration: 0.4, ease, delay: i * 0.08 }}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
              >
                <div className="px-5 py-4 border-b border-gray-100 bg-red-50/50">
                  <div className="flex items-start gap-2.5">
                    <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {problem}
                    </p>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: "#14B8A6" }}
                    />
                    <p className="text-sm text-gray-900 font-medium leading-relaxed">
                      {solution}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          viewport={vp}
          className="text-center mb-10"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "#14B8A6" }}
          >
            Funkcje
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">
            Wszystko czego potrzebujesz
            <br className="hidden md:block" /> do kontroli kosztów
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              viewport={vp}
              transition={{ duration: 0.4, ease, delay: (i % 3) * 0.07 }}
              className="group border border-gray-100 rounded-xl p-5 bg-white hover:border-teal-200 hover:shadow-md transition-all duration-200 cursor-default"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors"
                style={{ background: "rgba(20,184,166,0.08)" }}
              >
                <Icon className="w-5 h-5" style={{ color: "#14B8A6" }} />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="border-y border-gray-100 bg-gray-50/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            initial="hidden"
            whileInView="visible"
            viewport={vp}
            className="text-center mb-10"
          >
            <p
              className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: "#14B8A6" }}
            >
              Cennik
            </p>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight mb-2">
              Prosty, przejrzysty cennik
            </h2>
            <p className="text-gray-500">
              Zacznij za darmo, rozwijaj się kiedy chcesz.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              viewport={vp}
              transition={{ duration: 0.4, ease }}
              className="bg-white border border-gray-200 rounded-2xl p-7 flex flex-col"
            >
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                Free
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-gray-900">0 zł</span>
                <span className="text-gray-400 text-sm">/ mies.</span>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Idealne na start — bez karty kredytowej.
              </p>
              <ul className="space-y-2.5 flex-1 mb-6">
                {FREE_FEATURES.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm text-gray-700"
                  >
                    <Check
                      className="w-4 h-4 shrink-0"
                      style={{ color: "#14B8A6" }}
                    />
                    {f}
                  </li>
                ))}
                {FREE_MISSING.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm text-gray-300"
                  >
                    <X className="w-4 h-4 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="lg" className="w-full">
                Zacznij za darmo
              </Button>
            </motion.div>
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              initial="hidden"
              whileInView="visible"
              viewport={vp}
              transition={{ duration: 0.4, ease, delay: 0.1 }}
              className="rounded-2xl p-7 flex flex-col relative overflow-hidden text-white"
              style={{ background: "#14B8A6" }}
            >
              <div
                className="absolute top-5 right-5 text-[10px] font-bold bg-white px-2.5 py-1 rounded-full uppercase tracking-wide"
                style={{ color: "#14B8A6" }}
              >
                Polecany
              </div>
              <p className="text-xs font-bold text-white/70 uppercase tracking-wide mb-1">
                Pro
              </p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-white">99 zł</span>
                <span className="text-white/70 text-sm">/ mies.</span>
              </div>
              <p className="text-sm text-white/70 mb-6">
                Pełna kontrola kosztów bez ograniczeń.
              </p>
              <ul className="space-y-2.5 flex-1 mb-6">
                {PRO_FEATURES.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-sm text-white"
                  >
                    <Check className="w-4 h-4 shrink-0 text-white/80" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="w-full bg-white font-semibold hover:bg-white/90"
                style={{ color: "#14B8A6" }}
              >
                Wypróbuj Pro za darmo
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-20">
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 24 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          viewport={vp}
          className="relative rounded-3xl overflow-hidden px-6 py-10 md:px-16 md:py-20 text-center text-white"
          style={{
            background: "linear-gradient(135deg, #14B8A6 0%, #0d9488 100%)",
          }}
        >
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/5 rounded-full" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-white/5 rounded-full" />
          <div className="relative">
            <p className="text-white/70 text-sm font-semibold uppercase tracking-widest mb-4">
              Zacznij kontrolować koszty już dziś
            </p>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-5">
              Twój food cost pod kontrolą.
              <br className="hidden md:block" /> Rejestracja zajmuje 2 minuty.
            </h2>
            <p className="text-white/75 text-base mb-8 max-w-xl mx-auto">
              Dołącz do restauratorów, którzy wiedzą za co płacą — i reagują na
              podwyżki zanim wpłyną na marżę.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="gap-2 bg-white font-semibold hover:bg-white/90 w-full sm:w-auto px-8"
                style={{ color: "#14B8A6" }}
              >
                Zarejestruj się za darmo <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white/80 hover:text-white hover:bg-white/10 w-full sm:w-auto"
              >
                Mam już konto <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-5 mt-7">
              {[
                "Darmowy plan na zawsze",
                "Bez zobowiązań",
                "Konfiguracja w 5 minut",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-1.5 text-sm text-white/70"
                >
                  <Check className="w-3.5 h-3.5 text-white/60" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gray-100 bg-gray-50/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <span
              className="font-black text-lg tracking-tighter"
              style={{ color: "#14B8A6" }}
            >
              SPENDLY<span className="text-gray-900">.</span>
            </span>
            <div className="flex flex-wrap gap-5 text-sm text-gray-400">
              {["Logowanie", "Rejestracja", "Kontakt"].map((l) => (
                <a
                  key={l}
                  href="#"
                  className="hover:text-gray-700 transition-colors"
                >
                  {l}
                </a>
              ))}
              <span className="text-gray-200">|</span>
              <span className="text-gray-300 text-xs">
                Polityka prywatności
              </span>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa
            zastrzeżone.
          </div>
        </div>
      </footer>
    </div>
  );
}
