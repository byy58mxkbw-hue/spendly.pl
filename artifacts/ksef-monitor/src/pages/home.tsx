import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Zap, ArrowRight, Play, Check, ScanLine, BellRing, GitCompare,
  UtensilsCrossed, Sparkles, FileCheck2, RefreshCw, FileText, Plus, Moon, Sun,
  Menu, X,
} from "lucide-react";
import "@/styles/landing.css";

type Theme = "dark" | "light";

function Wordmark({ size }: { size: number }) {
  return (
    <span className="wm" style={{ fontSize: size }}>
      spend<span className="ly">ly</span><span className="dot">.</span>
    </span>
  );
}

const FEATURES = [
  { Icon: ScanLine, h: "OCR faktur w 15 sekund", p: "Wrzuć PDF lub zdjęcie — Spendly rozpozna dostawcę, pozycje i ceny jednostkowe. Bez ręcznego przepisywania." },
  { Icon: BellRing, h: "Alerty cenowe", p: "Ustawiasz próg dla produktu. Gdy dostawca podniesie cenę powyżej progu, dostajesz powiadomienie tego samego dnia." },
  { Icon: GitCompare, h: "Porównanie dostawców", p: "Ten sam produkt u pięciu dostawców w jednej tabeli. Widzisz, gdzie przepłacasz i ile odzyskasz po zmianie." },
  { Icon: UtensilsCrossed, h: "Food cost na żywo", p: "Receptury liczone z aktualnych cen zakupu. Marża dania spada w czasie rzeczywistym, gdy rosną koszty." },
  { Icon: Sparkles, h: "Asystent AI", p: "„Gdzie tracę najwięcej w tym miesiącu?” — pytasz normalnym językiem, dostajesz konkretną odpowiedź i rekomendację." },
  { Icon: FileCheck2, h: "Zgodność z KSeF", p: "Faktury pobierane bezpośrednio z Krajowego Systemu e-Faktur. Zero przeklejania, pełna historia w jednym miejscu." },
];

const STEPS = [
  { n: "1", h: "Połącz konto KSeF", p: "Autoryzujesz Spendly w Krajowym Systemie e-Faktur. Zajmuje minutę, robisz to raz." },
  { n: "2", h: "Faktury spływają automatycznie", p: "Każda nowa faktura kosztowa trafia do Spendly, jest rozpoznawana i przypisywana do kategorii oraz dostawcy." },
  { n: "3", h: "Dostajesz alerty i wglądy", p: "Podwyżki, spadki, przekroczenia progów i rekomendacje — wszystko w pulpicie i na telefonie." },
];

const INVOICES = [
  { t: "FV/2026/07/0184", sub: "Makro Cash & Carry", amt: "4 218,50 zł", tag: false },
  { t: "FV/2026/07/0183", sub: "Bidfood Polska", amt: "2 940,00 zł", tag: true },
  { t: "FV/2026/07/0182", sub: "Selgros", amt: "1 776,20 zł", tag: false },
  { t: "FV/2026/07/0181", sub: "Farma Świeże Zioła", amt: "312,00 zł", tag: false },
];

const STATS = [
  { v: "−18%", l: "Średnia redukcja strat kosztowych" },
  { v: "15 s", l: "rozpoznanie faktury OCR" },
  { v: "6 h", l: "mniej pracy z fakturami / tydzień" },
  { v: "2 140 zł", l: "Średnia oszczędność / miesiąc" },
];

const FAQS = [
  { q: "Czym jest KSeF i czy muszę go mieć?", a: "KSeF to Krajowy System e-Faktur — od 2026 obowiązkowy dla firm w Polsce. Spendly łączy się z nim bezpośrednio, więc faktury spływają automatycznie, bez skanowania i przepisywania." },
  { q: "Jak szybko zobaczę efekty?", a: "Pierwsze alerty cenowe pojawiają się po zaimportowaniu kilku faktur — zwykle w pierwszym tygodniu. Pełny obraz food cost masz po podpięciu receptur." },
  { q: "Czy muszę zmieniać dostawców albo system POS?", a: "Nie. Spendly działa obok Twoich obecnych dostawców i systemów. Podpinasz KSeF i ewentualnie wgrywasz receptury — reszta zostaje bez zmian." },
  { q: "Czy moje dane są bezpieczne?", a: "Dane trzymane są na serwerach w UE, szyfrowane w tranzycie i spoczynku. Dostęp do KSeF autoryzujesz Ty i możesz go cofnąć w każdej chwili." },
  { q: "Co jeśli mam kilka lokali?", a: "Plan Pro obsługuje do 3 lokali, a plan Sieć — dowolną liczbę, z centrami kosztów, rolami i raportami konsolidowanymi dla całej grupy." },
];

export default function Home() {
  const [, navigate] = useLocation();
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const s = localStorage.getItem("spendly_site_theme");
      if (s === "light" || s === "dark") return s;
    } catch { /* ignore */ }
    return "dark";
  });
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<Set<number>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("spendly_site_theme", theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };
  const toggleFaq = (i: number) =>
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  return (
    <div className="spendly-site" data-theme={theme}>
      <div className="aurora"><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>

      {/* NAV */}
      <nav>
        <div className="nav-in glass" style={{ marginTop: scrolled ? 6 : 12 }}>
          <Wordmark size={22} />
          <div className="nav-links">
            <a href="#funkcje">Funkcje</a>
            <a href="#ksef">KSeF</a>
            <a href="#cennik">Cennik</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-right">
            <div className="tgl" title="Zmień motyw" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Moon /> : <Sun />}
            </div>
            <a className="btn btn-ghost nav-desktop" href="/sign-in" onClick={go("/sign-in")}>Zaloguj się</a>
            <a className="btn btn-primary nav-desktop" href="/sign-up" onClick={go("/sign-up")}>Wypróbuj za darmo</a>
            <button
              className="nav-burger"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="nav-mobile glass wrap">
            <a href="#funkcje" onClick={() => setMenuOpen(false)}>Funkcje</a>
            <a href="#ksef" onClick={() => setMenuOpen(false)}>KSeF</a>
            <a href="#cennik" onClick={() => setMenuOpen(false)}>Cennik</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            <div className="nav-mobile-cta">
              <a className="btn btn-ghost" href="/sign-in" onClick={(e) => { setMenuOpen(false); go("/sign-in")(e); }}>Zaloguj się</a>
              <a className="btn btn-primary" href="/sign-up" onClick={(e) => { setMenuOpen(false); go("/sign-up")(e); }}>Wypróbuj za darmo</a>
            </div>
          </div>
        )}
      </nav>

      <main>
      {/* HERO */}
      <header className="hero wrap">
        <div className="eyebrow"><Zap />Zintegrowane z KSeF — gotowe na 2026</div>
        <h1>Kontroluj koszty<br />zanim <span className="g">zjedzą Twoją marżę</span></h1>
        <p className="lead">Spendly pobiera faktury z KSeF, rozpoznaje pozycje i pilnuje cen dostawców. Wiesz o podwyżce w dniu, w którym się pojawia — nie na koniec miesiąca.</p>
        <div className="hero-cta">
          <a className="btn btn-primary btn-lg" href="/sign-up" onClick={go("/sign-up")}>Rozpocznij za darmo <ArrowRight /></a>
          <a className="btn btn-ghost btn-lg" href="#ksef"><Play />Zobacz jak działa</a>
        </div>
        <div className="microcopy">
          <span><Check />14 dni za darmo</span>
          <span><Check />Bez karty</span>
          <span><Check />Konfiguracja w 10 minut</span>
        </div>

        {/* dashboard mock */}
        <div className="mock glass">
          <div className="mock-bar"><i /><i /><i /></div>
          <div className="mock-body">
            <div className="mb-top">
              <Wordmark size={15} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Restauracja Widok · lipiec</span>
            </div>
            <div className="mb-grid">
              <div>
                <div className="mb-kpis">
                  <div className="kpi"><div className="l">Wydatki (30 dni)</div><div className="v">24 512 zł</div><div className="d bad">↑ +12,4%</div></div>
                  <div className="kpi"><div className="l">Food cost</div><div className="v">31,2%</div><div className="d good">↓ −1,8 p.p.</div></div>
                  <div className="kpi"><div className="l">Do przeglądu</div><div className="v">12</div><div className="d" style={{ color: "var(--warn)" }}>faktur</div></div>
                </div>
                <div className="mb-chart">
                  <div className="ct">Wydatki dzienne</div>
                  <svg viewBox="0 0 520 100" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: 96 }}>
                    <defs><linearGradient id="spglg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3DDC97" stopOpacity=".3" /><stop offset="100%" stopColor="#3DDC97" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0,72 C60,66 90,48 140,54 C190,60 210,34 260,32 C310,30 340,50 390,42 C440,34 470,16 520,22 L520,100 L0,100 Z" fill="url(#spglg)" />
                    <path d="M0,72 C60,66 90,48 140,54 C190,60 210,34 260,32 C310,30 340,50 390,42 C440,34 470,16 520,22" fill="none" stroke="#3DDC97" strokeWidth="2.5" />
                  </svg>
                </div>
              </div>
              <div className="mb-side">
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Alerty cenowe</div>
                <div className="alert"><div className="ic" style={{ background: "rgba(255,92,92,.14)" }}>🧈</div><div><div className="n">Masło extra 82%</div><div className="s">Makro</div></div><div className="dd bad">+18,2%</div></div>
                <div className="alert"><div className="ic" style={{ background: "rgba(255,92,92,.14)" }}>🥩</div><div><div className="n">Karkówka</div><div className="s">Bidfood</div></div><div className="dd bad">+9,7%</div></div>
                <div className="alert"><div className="ic" style={{ background: "rgba(61,220,151,.14)" }}>🍅</div><div><div className="n">Pomidory</div><div className="s">Makro</div></div><div className="dd good">−6,3%</div></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* TRUST */}
      <div className="trust wrap">
        <p>Zaufali nam operatorzy gastronomii w całej Polsce</p>
        <div className="trust-row">
          <span className="b">Bistro&nbsp;Foksal</span><span className="b">Grupa&nbsp;Mielżyński</span><span className="b">Hotel&nbsp;Bryza</span><span className="b">Pizzeria&nbsp;Nonna</span><span className="b">Kawa&nbsp;po&nbsp;Turecku</span>
        </div>
      </div>

      {/* FEATURES */}
      <section className="blk wrap" id="funkcje">
        <div className="sec-head">
          <div className="sec-eye">Funkcje</div>
          <h2>Wszystko, czego potrzebujesz, by pilnować kosztu</h2>
          <p>Od automatycznego importu faktur po alerty, które trafiają do Ciebie, zanim podwyżka wejdzie do menu.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map(({ Icon, h, p }) => (
            <div className="feat glass" key={h}>
              <div className="fic"><Icon /></div>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* KSeF / HOW */}
      <section className="blk wrap" id="ksef">
        <div className="ksef">
          <div>
            <div className="sec-eye">Jak to działa</div>
            <h2 style={{ textAlign: "left" }}>Podłącz KSeF raz.<br />Reszta dzieje się sama.</h2>
            <div className="ksef-steps" style={{ marginTop: 30 }}>
              {STEPS.map((s) => (
                <div className="step" key={s.n}>
                  <div className="num">{s.n}</div>
                  <div><h3>{s.h}</h3><p>{s.p}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="ksef-card glass">
            <div className="badge"><RefreshCw />Zsynchronizowano z KSeF · 14:32</div>
            {INVOICES.map((inv) => (
              <div className="inv-row" key={inv.t}>
                <div className="ic"><FileText /></div>
                <div><div className="t">{inv.t}</div><div className="sub">{inv.sub}</div></div>
                {inv.tag && <div className="tag">Nowa</div>}
                <div className="amt">{inv.amt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS BAND */}
      <section className="blk wrap">
        <div className="band glass">
          {STATS.map((s) => (
            <div className="st" key={s.l}><div className="v">{s.v}</div><div className="l">{s.l}</div></div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="blk wrap" id="cennik">
        <div className="sec-head">
          <div className="sec-eye">Cennik</div>
          <h2>Prosty cennik, który się zwraca</h2>
          <p>Bez ukrytych opłat. Anulujesz kiedy chcesz. Każdy plan zaczyna się od 14 dni za darmo.</p>
        </div>
        <div className="price-grid">
          <div className="plan glass">
            <div className="pn">Start</div>
            <div className="pp">0 zł<span>/mies.</span></div>
            <div className="pd">Dla jednego lokalu, który dopiero zaczyna porządkować faktury.</div>
            <ul>
              <li><Check />1 lokal</li>
              <li><Check />Import z KSeF</li>
              <li><Check />OCR do 50 faktur / mies.</li>
              <li><Check />Podstawowe alerty cenowe</li>
            </ul>
            <a className="btn btn-ghost" href="/sign-up" onClick={go("/sign-up")}>Zacznij za darmo</a>
          </div>
          <div className="plan glass hot">
            <div className="pn">Pro</div>
            <div className="pp">199 zł<span>/mies.</span></div>
            <div className="pd">Dla restauracji, które chcą realnie kontrolować food cost.</div>
            <ul>
              <li><Check />Do 3 lokali</li>
              <li><Check />Nielimitowany OCR</li>
              <li><Check />Porównanie dostawców</li>
              <li><Check />Food cost i receptury</li>
              <li><Check />Asystent AI</li>
            </ul>
            <a className="btn btn-primary" href="/sign-up" onClick={go("/sign-up")}>Wybierz Pro</a>
          </div>
          <div className="plan glass">
            <div className="pn">Sieć</div>
            <div className="pp">Wycena<span></span></div>
            <div className="pd">Dla grup gastronomicznych i hoteli z wieloma lokalami.</div>
            <ul>
              <li><Check />Nielimitowane lokale</li>
              <li><Check />Centra kosztów i role</li>
              <li><Check />Raporty konsolidowane</li>
              <li><Check />Dedykowany opiekun</li>
            </ul>
            <a className="btn btn-ghost" href="mailto:kontakt@spendly.pl">Umów rozmowę</a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="blk wrap" id="faq">
        <div className="sec-head">
          <div className="sec-eye">FAQ</div>
          <h2>Najczęstsze pytania</h2>
        </div>
        <div className="faq">
          {FAQS.map((f, i) => (
            <div className={`qa glass${openFaq.has(i) ? " open" : ""}`} key={f.q} onClick={() => toggleFaq(i)}>
              <div className="q">{f.q}<Plus /></div>
              <div className="a">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="blk wrap">
        <div className="cta-final glass">
          <h2>Zacznij kontrolować koszty już dziś</h2>
          <p>14 dni za darmo, bez karty. Podłącz KSeF i zobacz pierwsze oszczędności w tym tygodniu.</p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="/sign-up" onClick={go("/sign-up")}>Rozpocznij za darmo <ArrowRight /></a>
            <a className="btn btn-ghost btn-lg" href="mailto:kontakt@spendly.pl">Umów demo</a>
          </div>
        </div>
      </section>
      </main>

      {/* FOOTER */}
      <footer className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Wordmark size={24} />
            <p>Monitoring cen dostawców i kontrola food cost dla restauracji, hoteli i firm gastronomicznych. Zintegrowane z KSeF.</p>
          </div>
          <div className="foot-col">
            <h3>Produkt</h3>
            <a href="#funkcje">Funkcje</a>
            <a href="#ksef">Integracja KSeF</a>
            <a href="#cennik">Cennik</a>
            <a href="/cennik" onClick={go("/cennik")}>Pełny cennik</a>
          </div>
          <div className="foot-col">
            <h3>Firma</h3>
            <a href="mailto:kontakt@spendly.pl">Kontakt</a>
            <a href="/sign-up" onClick={go("/sign-up")}>Rejestracja</a>
            <a href="/sign-in" onClick={go("/sign-in")}>Logowanie</a>
          </div>
          <div className="foot-col">
            <h3>Zasoby</h3>
            <a href="mailto:kontakt@spendly.pl">Pomoc</a>
            <a href="/polityka-prywatnosci" onClick={go("/polityka-prywatnosci")}>Polityka prywatności</a>
            <a href="/regulamin" onClick={go("/regulamin")}>Regulamin</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 Spendly sp. z o.o. · NIP 5213003700</span>
          <span>Zrobione w Polsce dla polskiej gastronomii</span>
        </div>
      </footer>
    </div>
  );
}
