import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Bell, RefreshCw,
  FileBarChart2, Sparkles, CheckCircle2, Check, X,
  ArrowRight, ShieldCheck, ChevronRight, Camera,
} from "lucide-react";

const ease = [0.4, 0, 0.2, 1] as const;
const vp = { once: true, amount: 0.12 } as const;
const fadeUp = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0 } };

const TEAL = "#14B8A6";

function MiniDashboard() {
  const rows = [
    { name: "Łosoś atlantycki", change: "+12,4%", up: true },
    { name: "Polędwica wołowa", change: "-1,6%", up: false },
    { name: "Oliwa extra virgin", change: "+17,6%", up: true },
    { name: "Mąka pszenna T550", change: "+6,7%", up: true },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.3 }}
      className="w-full max-w-[400px] bg-white/10 border border-white/20 rounded-2xl overflow-hidden backdrop-blur-sm">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs font-black tracking-tighter text-white">SPENDLY.</span>
        <span className="text-[10px] text-white/50 font-medium">maj 2026</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Zmiany cen — ten miesiąc</p>
        {rows.map((r, i) => (
          <motion.div key={r.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08, duration: 0.3 }}
            className="flex items-center justify-between">
            <span className="text-xs text-white/70 truncate">{r.name}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.up ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
              {r.change}
            </span>
          </motion.div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2">
        <Bell className="w-3 h-3 text-amber-400" />
        <span className="text-[10px] text-amber-300">2 alerty cenowe — sprawdź teraz</span>
      </div>
    </motion.div>
  );
}

const STEPS = [
  { num: "01", icon: RefreshCw, title: "Synchronizuj z KSeF", desc: "Podajesz NIP i token KSeF. SPENDLY automatycznie pobiera faktury zakupowe od wszystkich twoich dostawców." },
  { num: "02", icon: TrendingUp, title: "Śledź zmiany cen", desc: "Każda pozycja z faktury trafia do bazy. Widzisz historię ceny każdego surowca i wykres trendu." },
  { num: "03", icon: Bell, title: "Reaguj na podwyżki", desc: "Ustawiasz progi cenowe dla kluczowych składników. SPENDLY alarmuje cię zanim podwyżka wpłynie na marżę." },
];

const COMPARISON_LEFT = [
  "Dowiadujesz się o podwyżce na koniec miesiąca",
  "Godziny ręcznego przepisywania faktur do Excela",
  "Nie wiesz który dostawca drożeje i dlaczego",
  "Reagujesz po fakcie — marża już ucierpiała",
];
const COMPARISON_RIGHT = [
  "Alert natychmiast po dostawie — czas zareagować",
  "Automatyczny import z KSeF — zero przepisywania",
  "Raporty per-dostawca i per-produkt z wykresem trendu",
  "Działasz z wyprzedzeniem — marża pod kontrolą",
];

const FEATURES = [
  { icon: RefreshCw, title: "Synchronizacja KSeF", desc: "Automatyczne pobieranie faktur zakupowych z Krajowego Systemu e-Faktur." },
  { icon: TrendingDown, title: "Historia cen", desc: "Wykres trendu każdego surowca z zaznaczonymi datami wszystkich zmian ceny." },
  { icon: Bell, title: "Alerty cenowe", desc: "Progi procentowe lub kwotowe. Alert trafia zanim przyjdzie kolejna dostawa." },
  { icon: FileBarChart2, title: "Raporty miesięczne", desc: "Zestawienie per-dostawca i per-kategoria z eksportem CSV do Excela." },
  { icon: Camera, title: "Skanowanie faktur", desc: "Zrób zdjęcie telefonem — AI odczyta pozycje i ceny. Działa bez KSeF." },
  { icon: Sparkles, title: "AI CFO", desc: "Sztuczna inteligencja analizuje zakupy i rekomenduje co renegocjować." },
];

const FREE_F = ["Synchronizacja z KSeF","Do 3 dostawców","Historia cen — 90 dni","5 alertów cenowych","Skanowanie faktur ze zdjęcia"];
const FREE_NO = ["Raporty miesięczne","AI CFO"];
const PRO_F = ["Nieograniczona liczba dostawców","Nieograniczona historia cen","Nieograniczone alerty cenowe","Raporty miesięczne + eksport CSV","AI CFO — rekomendacje zakupowe","Wsparcie priorytetowe"];

export function Editorial() {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="font-black text-xl tracking-tighter" style={{ color: TEAL }}>SPENDLY<span className="text-gray-900">.</span></span>
          <nav className="hidden md:flex items-center gap-7 text-sm text-gray-400 font-medium">
            {["Jak to działa","Funkcje","Cennik"].map(l => <a key={l} href="#" className="hover:text-gray-900 transition-colors">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-500">Zaloguj</Button>
            <Button size="sm" className="text-white" style={{ background: TEAL }}>Zacznij za darmo</Button>
          </div>
        </div>
      </header>

      {/* HERO — dark */}
      <section style={{ background: "#1a1f2e" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/8 text-xs font-medium text-white/60 mb-8">
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: TEAL }} />
                Zintegrowane z KSeF
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.07 }}
                className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.06] mb-6">
                Kontrola food cost<br />zaczyna się od<br /><span style={{ color: TEAL }}>faktury</span>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay: 0.14 }}
                className="text-base sm:text-lg text-white/55 leading-relaxed mb-10 max-w-md">
                SPENDLY automatycznie pobiera faktury od dostawców z KSeF, śledzi ceny każdego surowca i alarmuje zanim podwyżka uderzy w twój wynik.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay: 0.2 }}
                className="flex flex-col sm:flex-row gap-3 mb-8">
                <Button size="lg" className="gap-2 text-white w-full sm:w-auto px-8" style={{ background: TEAL }}>
                  Zacznij bezpłatnie <ArrowRight className="w-4 h-4" />
                </Button>
                <Button size="lg" variant="outline" className="border-white/20 text-white/80 hover:bg-white/10 hover:text-white w-full sm:w-auto"
                  style={{ background: "transparent" }}>
                  Zaloguj się
                </Button>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.3 }}
                className="flex flex-wrap gap-5 text-sm text-white/40">
                {["Bez karty kredytowej","Konfiguracja w 5 minut","Faktury z KSeF od razu"].map(t => (
                  <div key={t} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0" style={{ color: TEAL }} />{t}
                  </div>
                ))}
              </motion.div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <MiniDashboard />
            </div>
          </div>
        </div>
      </section>

      {/* STATS ROW */}
      <motion.section variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.5, ease }}
        className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
            {[
              { val: "8%", label: "średnia oszczędność food cost" },
              { val: "2 min", label: "konfiguracja od zera" },
              { val: "100%", label: "automatyzacja faktur KSeF" },
              { val: "bezpłatny", label: "start bez karty kredytowej" },
            ].map(({ val, label }) => (
              <div key={label} className="py-7 px-6 text-center">
                <p className="text-2xl sm:text-3xl font-black text-gray-900">{val}</p>
                <p className="text-xs text-gray-400 mt-1.5 leading-snug">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45 }} className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: TEAL }}>Jak to działa</p>
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">Od faktury do alertu<br className="hidden md:block" /> w trzech krokach</h2>
        </motion.div>
        <div className="space-y-0">
          {STEPS.map(({ num, icon: Icon, title, desc }, i) => (
            <motion.div key={num} variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45, ease, delay: i * 0.08 }}
              className="relative flex items-start gap-8 py-8 border-b border-gray-100 last:border-0">
              <div className="hidden sm:block absolute left-0 top-1/2 -translate-y-1/2 text-[96px] font-black text-gray-50 select-none leading-none" style={{ zIndex: 0 }}>
                {num}
              </div>
              <div className="relative z-10 w-12 h-12 shrink-0 rounded-xl flex items-center justify-center border" style={{ background: "rgba(20,184,166,0.07)", borderColor: "rgba(20,184,166,0.2)" }}>
                <Icon className="w-5 h-5" style={{ color: TEAL }} />
              </div>
              <div className="relative z-10 pt-1 sm:pl-16">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold text-gray-300 sm:hidden">{num}</span>
                  <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed max-w-xl">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* COMPARISON */}
      <section className="bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45 }} className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: TEAL }}>Dla kogo</p>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">Widzisz różnicę?</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45 }}
              className="bg-white border border-gray-200 rounded-2xl p-7">
              <div className="flex items-center gap-2 mb-5">
                <X className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-gray-900">Bez SPENDLY</h3>
              </div>
              <ul className="space-y-3.5">
                {COMPARISON_LEFT.map(t => (
                  <li key={t} className="flex items-start gap-3 text-sm text-gray-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-300 shrink-0 mt-1.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45, delay: 0.1 }}
              className="bg-white border rounded-2xl p-7" style={{ borderColor: "rgba(20,184,166,0.3)" }}>
              <div className="flex items-center gap-2 mb-5">
                <CheckCircle2 className="w-4 h-4" style={{ color: TEAL }} />
                <h3 className="font-bold text-gray-900">Z SPENDLY</h3>
              </div>
              <ul className="space-y-3.5">
                {COMPARISON_RIGHT.map(t => (
                  <li key={t} className="flex items-start gap-3 text-sm text-gray-700">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: TEAL }} />
                    {t}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45 }} className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: TEAL }}>Funkcje</p>
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight">Wszystko czego potrzebujesz<br className="hidden md:block" /> do kontroli kosztów</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-8 max-w-4xl mx-auto">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <motion.div key={title} variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4, ease, delay: (i % 2) * 0.06 }}
              className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                style={{ background: "rgba(20,184,166,0.07)", borderColor: "rgba(20,184,166,0.15)" }}>
                <Icon className="w-5 h-5" style={{ color: TEAL }} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="bg-gray-50/70 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.45 }} className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: TEAL }}>Cennik</p>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight mb-2">Prosty, przejrzysty cennik</h2>
            <p className="text-gray-400">Zacznij za darmo, rozwijaj się kiedy chcesz.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4 }}
              className="bg-white border border-gray-200 rounded-2xl p-7 flex flex-col">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Free</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-gray-900">0 zł</span>
                <span className="text-gray-400 text-sm">/ mies.</span>
              </div>
              <p className="text-sm text-gray-400 mb-6">Idealne na start — bez karty kredytowej.</p>
              <ul className="space-y-2.5 flex-1 mb-7">
                {FREE_F.map(f => <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700"><Check className="w-4 h-4 shrink-0" style={{ color: TEAL }} />{f}</li>)}
                {FREE_NO.map(f => <li key={f} className="flex items-center gap-2.5 text-sm text-gray-300"><X className="w-4 h-4 shrink-0" />{f}</li>)}
              </ul>
              <Button variant="outline" size="lg" className="w-full">Zacznij za darmo</Button>
            </motion.div>
            <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.4, delay: 0.1 }}
              className="rounded-2xl p-7 flex flex-col relative overflow-hidden text-white" style={{ background: TEAL }}>
              <div className="absolute top-5 right-5 text-[10px] font-bold bg-white px-2.5 py-1 rounded-full uppercase tracking-wide" style={{ color: TEAL }}>Polecany</div>
              <p className="text-xs font-bold text-white/70 uppercase tracking-wide mb-2">Pro</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-white">99 zł</span>
                <span className="text-white/70 text-sm">/ mies.</span>
              </div>
              <p className="text-sm text-white/70 mb-6">Pełna kontrola kosztów bez ograniczeń.</p>
              <ul className="space-y-2.5 flex-1 mb-7">
                {PRO_F.map(f => <li key={f} className="flex items-center gap-2.5 text-sm text-white"><Check className="w-4 h-4 shrink-0 text-white/80" />{f}</li>)}
              </ul>
              <Button size="lg" className="w-full bg-white font-semibold hover:bg-white/90" style={{ color: TEAL }}>Wypróbuj Pro za darmo</Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FINAL CTA — dark */}
      <section style={{ background: "#1a1f2e" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24 text-center">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={vp} transition={{ duration: 0.5 }}>
            <p className="text-white/40 text-sm font-semibold uppercase tracking-widest mb-4">Zacznij kontrolować koszty już dziś</p>
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-5">
              Twój food cost pod kontrolą.<br className="hidden md:block" /> Rejestracja zajmuje 2 minuty.
            </h2>
            <p className="text-white/50 text-base mb-10 max-w-lg mx-auto">Dołącz do restauratorów, którzy wiedzą za co płacą i reagują na podwyżki zanim wpłyną na marżę.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="gap-2 text-white font-semibold px-8 w-full sm:w-auto" style={{ background: TEAL }}>
                Zarejestruj się za darmo <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 w-full sm:w-auto">
                Mam już konto <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-6 mt-8">
              {["Darmowy plan na zawsze","Bez zobowiązań","Konfiguracja w 5 minut"].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-sm text-white/35">
                  <Check className="w-3.5 h-3.5" style={{ color: TEAL }} />{t}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10" style={{ background: "#141821" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <span className="font-black text-lg tracking-tighter" style={{ color: TEAL }}>SPENDLY<span className="text-white/80">.</span></span>
            <div className="flex flex-wrap gap-5 text-sm text-white/30">
              {["Logowanie","Rejestracja","Kontakt"].map(l => <a key={l} href="#" className="hover:text-white/60 transition-colors">{l}</a>)}
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-white/10 text-center text-xs text-white/20">
            &copy; {new Date().getFullYear()} SPENDLY. Wszelkie prawa zastrzeżone.
          </div>
        </div>
      </footer>
    </div>
  );
}
