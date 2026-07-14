import { Link } from "wouter";
import { Check, ArrowRight, ChevronRight, Percent, TrendingDown, Bell, Calculator, RefreshCw } from "lucide-react";
import { useMarketingTheme } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";

const FAQ = [
  {
    q: "Czym jest food cost i jak go liczyć?",
    a: "Food cost to udział kosztu surowców w przychodzie ze sprzedaży dania lub całej restauracji. Wzór: food cost % = (koszt składników ÷ cena sprzedaży) × 100%. Przykład: jeśli składniki dania kosztują 12 zł, a sprzedajesz je za 40 zł, food cost wynosi 30%. Spendly liczy to automatycznie na podstawie faktur zakupowych.",
  },
  {
    q: "Ile powinien wynosić food cost w restauracji?",
    a: "W polskiej gastronomii zdrowy food cost to najczęściej 28–35%. Powyżej 35% marża zaczyna topnieć, poniżej 25% zwykle oznacza zawyżone ceny lub oszczędzanie na jakości. Optymalny poziom zależy od formatu lokalu — inny jest dla fine dining, inny dla baru czy pizzerii.",
  },
  {
    q: "Jak Spendly liczy food cost automatycznie?",
    a: "Spendly pobiera faktury zakupowe z KSeF (lub ze zdjęcia/PDF przez OCR), rozpoznaje pozycje i ceny surowców, a następnie zestawia je z Twoimi recepturami. Dzięki temu widzisz realny food cost per danie i per lokal w czasie rzeczywistym — bez ręcznego liczenia w Excelu.",
  },
  {
    q: "Jak obniżyć food cost bez utraty jakości?",
    a: "Kluczem jest analiza kosztowa: monitoruj ceny surowców, porównuj dostawców i reaguj na podwyżki zanim wpłyną na marżę. Spendly wysyła alerty cenowe, pokazuje który dostawca podniósł cenę i o ile, oraz gdzie te same produkty są tańsze — to realne oszczędności w gastronomii.",
  },
  {
    q: "Czy food cost różni się dla każdego dania?",
    a: "Tak. Każde danie ma inną recepturę, więc inny food cost. Spendly pozwala policzyć koszt każdego dania osobno i wskazuje pozycje w menu o najgorszej marży — te, które najbardziej „zjadają” zysk.",
  },
];

export default function FoodCostMarketingPage() {
  const { theme, c: C, toggle } = useMarketingTheme();

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>
      <MarketingNavBar c={C} theme={theme} onToggle={toggle} />

      <main>
        {/* HERO */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 80px" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 20 }}>
              <Percent size={12} style={{ color: C.accent }} />
              Kontrola food cost dla gastronomii
            </div>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20, color: C.text }}>
              Kontrola food cost restauracji<br />
              <span style={{ color: C.accentText }}>w czasie rzeczywistym</span>
            </h1>
            <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
              Spendly automatycznie wylicza food cost na podstawie faktur zakupowych, śledzi ceny surowców i alarmuje zanim koszty uderzą w marżę. Koniec liczenia w Excelu — analiza kosztowa dzieje się sama.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/sign-up">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, background: C.accent, color: "#0B0F14", border: "none", cursor: "pointer" }}>
                  Wypróbuj za darmo <ArrowRight size={16} />
                </button>
              </Link>
              <Link href="/ksef">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${C.border}`, color: C.text, cursor: "pointer" }}>
                  Integracja KSeF
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accentText, textTransform: "uppercase", marginBottom: 12 }}>Jak liczymy food cost</p>
              <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
                Food cost liczony automatycznie z faktur
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
              {[
                { num: "01", title: "Import faktur zakupowych", desc: "Faktury z KSeF lub ze zdjęcia (OCR) trafiają do systemu automatycznie. Spendly rozpoznaje surowce, ilości i ceny — bez ręcznego przepisywania." },
                { num: "02", title: "Zestawienie z recepturami", desc: "System łączy ceny surowców z Twoimi recepturami i wylicza realny koszt każdego dania oraz food cost całej restauracji." },
                { num: "03", title: "Analiza i alerty", desc: "Widzisz food cost w procentach, trendy cen surowców i alerty o podwyżkach — reagujesz zanim koszty uderzą w marżę." },
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
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accentText, textTransform: "uppercase", marginBottom: 12 }}>Oszczędności w gastronomii</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>
              Co zyskujesz na kontroli food cost
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {[
              { icon: Calculator, title: "Food cost bez Excela", desc: "Koniec ręcznego liczenia. Realny food cost per danie i per lokal aktualizuje się sam po każdej fakturze." },
              { icon: TrendingDown, title: "Analiza kosztowa surowców", desc: "Historia cen każdego surowca i porównanie dostawców — wiesz gdzie kupujesz drożej niż trzeba." },
              { icon: Bell, title: "Alerty cenowe", desc: "Powiadomienie, gdy cena kluczowego składnika rośnie — reagujesz zanim podwyżka wejdzie do menu." },
              { icon: RefreshCw, title: "Zawsze aktualne dane", desc: "Faktury z KSeF pobierane automatycznie — food cost liczony na bieżąco, nie raz na kwartał." },
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
                <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Food cost — dlaczego jest kluczowy dla restauracji</h2>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Food cost to jeden z najważniejszych wskaźników rentowności w gastronomii. Pokazuje, jaka część przychodu ze sprzedaży dania wraca do kosztów surowców. Nawet kilkuprocentowy wzrost food cost — np. przez podwyżki cen mięsa, nabiału czy warzyw — potrafi wyzerować zysk lokalu. Dlatego stała kontrola food cost jest podstawą zdrowej marży w restauracji.</p>
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Jak liczyć food cost automatycznie</h2>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Ręczne liczenie food cost w arkuszu jest czasochłonne i szybko się dezaktualizuje. Spendly automatyzuje ten proces: pobiera faktury zakupowe z KSeF, rozpoznaje ceny surowców i zestawia je z recepturami. Wynik to realny, aktualny food cost per danie i per restauracja — bez godzin spędzonych w Excelu i bez błędów przepisywania.</p>
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 12, lineHeight: 1.35 }}>Kontrola kosztów a oszczędności w gastronomii</h2>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75, margin: 0 }}>Analiza kosztowa to nie tylko liczenie — to podejmowanie decyzji. Gdy wiesz, który dostawca podniósł ceny i gdzie te same surowce są tańsze, realnie obniżasz koszty. Spendly łączy monitoring food cost z alertami cenowymi i porównaniem dostawców, dając restauracji konkretne oszczędności bez obniżania jakości.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.accentText, textTransform: "uppercase", marginBottom: 12 }}>FAQ</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, margin: 0 }}>Food cost — najczęstsze pytania</h2>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {FAQ.map(({ q, a }) => (
              <div key={q} style={{ borderBottom: `1px solid ${C.border}`, padding: "20px 0" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: "0 0 8px" }}>{q}</h3>
                <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, margin: 0 }}>{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px", paddingTop: 40 }}>
          <div style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)", border: "1px solid rgba(61,220,151,0.2)", borderRadius: 24, padding: "60px 40px", textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: C.text, marginBottom: 16 }}>
              Zacznij kontrolować food cost już dziś
            </h2>
            <p style={{ fontSize: 15, color: C.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
              Rejestracja zajmuje mniej niż 2 minuty. Podłącz KSeF i zobacz realny food cost swojej restauracji.
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
      </main>

      <MarketingFooter c={C} />
    </div>
  );
}
