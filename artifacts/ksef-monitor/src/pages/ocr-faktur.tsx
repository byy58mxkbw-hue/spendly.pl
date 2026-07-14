import { Link } from "wouter";
import { Check, ArrowRight, ScanLine, ChevronRight, Zap, FileText, ShieldCheck } from "lucide-react";
import { useMarketingTheme } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";

export default function OcrFakturPage() {
  const { theme, c, toggle } = useMarketingTheme();

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>
      <MarketingNavBar c={c} theme={theme} onToggle={toggle} />

      <main>
      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 80px" }}>
        <div style={{ maxWidth: 680 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 999, border: `1px solid ${c.accentDim}`, background: c.accentDim, color: c.accentText, fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
            <ScanLine size={12} style={{ color: c.accent }} />
            OCR faktur dla gastronomii
          </div>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20, color: c.text }}>
            Automatyczny odczyt faktur<br />
            <span style={{ color: c.accentText }}>ze zdjęcia lub PDF w 15 sekund</span>
          </h1>
          <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
            Spendly czyta faktury kosztowe bezpośrednio ze zdjęcia zrobionego telefonem lub pliku PDF. Dostawca, produkty, ceny, daty — wszystko trafia do systemu automatycznie, bez ręcznego przepisywania.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/sign-up">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, background: c.accent, color: "#06231a", border: "none", cursor: "pointer" }}>
                Wypróbuj za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/ksef">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer" }}>
                Integracja KSeF
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, background: c.panel }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>Jak działa OCR faktur</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: c.text, margin: 0 }}>
              Od faktury papierowej do danych w systemie
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { num: "01", title: "Zrób zdjęcie lub wgraj PDF", desc: "Wystarczy zdjęcie faktury telefonem lub plik PDF. Spendly akceptuje faktury od dowolnego dostawcy — papierowe, elektroniczne, wydruki." },
              { num: "02", title: "AI rozpoznaje dane automatycznie", desc: "System AI odczytuje: nazwę dostawcy, pozycje produktów, ceny jednostkowe, ilości, stawki VAT i datę faktury. Proces trwa ok. 15 sekund." },
              { num: "03", title: "Dane trafiają do Twojej bazy", desc: "Rozpoznane produkty są dopasowywane do istniejących pozycji lub dodawane jako nowe. Ceny i daty trafiają do historii — gotowe do analizy." },
            ].map(({ num, title, desc }) => (
              <div key={num} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, padding: "28px 24px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.muted, letterSpacing: "0.05em", display: "block", marginBottom: 12 }}>{num}</span>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: c.text, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>Możliwości</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: c.text, margin: 0 }}>
            Co Spendly odczytuje z faktury
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {[
            { icon: FileText, title: "Dane dostawcy", desc: "Nazwa firmy, NIP, adres — system rozpoznaje dostawcę i dopasowuje go do Twojej bazy kontrahentów." },
            { icon: ScanLine, title: "Pozycje i ceny", desc: "Każda linia faktury: nazwa produktu, jednostka miary, ilość, cena netto i brutto, stawka VAT." },
            { icon: Zap, title: "Data i numer faktury", desc: "Data wystawienia i numer faktury — automatycznie przypisywane do historii zakupów." },
            { icon: ShieldCheck, title: "Faktury niestandardowe", desc: "OCR radzi sobie z różnymi formatami faktur — wydruki termiczne, ręcznie wypełnione, skany PDF." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, padding: "24px" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: c.accentDim, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon size={18} style={{ color: c.accent }} />
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 6 }}>{title}</h3>
              <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.6, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEO CONTENT */}
      <section style={{ borderTop: `1px solid ${c.border}`, background: c.panel }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: c.text, marginBottom: 12, lineHeight: 1.35 }}>OCR faktur dla restauracji — dlaczego to ważne?</h2>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.75, margin: 0 }}>Restauracje przetwarzają dziesiątki faktur miesięcznie od różnych dostawców. Ręczne przepisywanie danych jest kosztowne, podatne na błędy i nie zostawia czasu na analizę. OCR (Optical Character Recognition) eliminuje ten problem — fakturę wystarczy sfotografować, a system odczytuje i kategoryzuje wszystkie dane automatycznie.</p>
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: c.text, marginBottom: 12, lineHeight: 1.35 }}>OCR a integracja z KSeF — dwie ścieżki importu</h2>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.75, margin: 0 }}>Spendly obsługuje dwa sposoby pobierania faktur: automatyczny import przez API KSeF (dla dostawców wystawiających e-faktury) oraz OCR (dla faktur papierowych lub spoza KSeF). Oba kanały trafiają do tej samej bazy produktów i generują jednolitą historię cen — niezależnie od źródła faktury.</p>
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: c.text, marginBottom: 12, lineHeight: 1.35 }}>Analiza faktur gastronomicznych — od danych do decyzji</h2>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.75, margin: 0 }}>Sam odczyt faktury to pierwszy krok. Spendly idzie dalej — każda zaimportowana pozycja zasila historię cen, alerty i raporty food cost. Gdy AI wykryje, że cena łososia wzrosła o 15% w stosunku do poprzedniej faktury, system automatycznie generuje alert i aktualizuje wskaźnik food cost dla danego okresu.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>FAQ</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 600, letterSpacing: "-0.025em", color: c.text, margin: 0 }}>OCR faktur — najczęstsze pytania</h2>
        </div>
        <div style={{ borderTop: `1px solid ${c.border}` }}>
          {[
            { q: "Jak działa OCR faktur w Spendly?", a: "OCR odczytuje dane z faktury lub paragonu bezpośrednio ze zdjęcia albo pliku PDF — zwykle w około 15 sekund. Nie musisz nic przepisywać ręcznie: system sam rozpoznaje treść dokumentu." },
            { q: "Jakie dane rozpoznaje OCR z faktury?", a: "Spendly odczytuje dostawcę, poszczególne pozycje (produkty), ceny jednostkowe, ilości, stawki VAT oraz daty. Dane trafiają wprost do bazy kosztów Twojej restauracji." },
            { q: "Czy OCR działa ze zdjęcia zrobionego telefonem?", a: "Tak. Wystarczy zdjęcie faktury lub paragonu z telefonu — system poradzi sobie także ze zdjęciem zrobionym pod kątem czy przy słabszym świetle." },
            { q: "Czy muszę sprawdzać odczytane dane?", a: "Rozpoznane pozycje możesz zweryfikować i poprawić przed zapisaniem. Dzięki temu masz pewność, że koszty i food cost liczą się na poprawnych danych." },
            { q: "Czy OCR obsługuje też paragony, nie tylko faktury?", a: "Tak. OCR działa zarówno dla faktur kosztowych, jak i paragonów — przydatne przy drobnych zakupach, które nie trafiają do KSeF." },
          ].map(({ q, a }) => (
            <div key={q} style={{ borderBottom: `1px solid ${c.border}`, padding: "20px 0" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: c.text, margin: "0 0 8px" }}>{q}</h3>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.7, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.12) 0%, rgba(61,220,151,0.04) 100%)", border: `1px solid ${c.accentDim}`, borderRadius: 24, padding: "60px 40px", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, letterSpacing: "-0.025em", color: c.text, marginBottom: 16 }}>
            Koniec z ręcznym przepisywaniem faktur
          </h2>
          <p style={{ fontSize: 15, color: c.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
            Zacznij importować faktury automatycznie — przez KSeF lub OCR — i zyskaj pełną kontrolę nad kosztami restauracji.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/sign-up">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: c.accent, color: "#06231a", border: "none", cursor: "pointer" }}>
                Wypróbuj za darmo <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/food-cost">
              <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer" }}>
                Kontrola food cost <ChevronRight size={16} />
              </button>
            </Link>
          </div>
        </div>
      </section>

      </main>

      <MarketingFooter c={c} />
    </div>
  );
}
