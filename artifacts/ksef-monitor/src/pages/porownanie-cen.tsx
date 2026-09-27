import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronRight, Scales, Lock, Users, ShieldCheck } from "@/lib/icons";
import { useMarketingTheme } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";

// Przykładowe dane poglądowe do interaktywnego widgetu — NIE realne ceny
// użytkowników. Wersja z realnymi, zanonimizowanymi danymi (k-anonimowość jak
// w /benchmark) to świadomie odłożona decyzja (2026-09-27) — wymagałaby
// osobnego publicznego endpointu API bez auth, co jest większym zadaniem.
const CATEGORIES = [
  { id: "wszystkie", label: "Wszystkie" },
  { id: "warzywa", label: "Warzywa i owoce" },
  { id: "mieso", label: "Mięso i ryby" },
  { id: "nabial", label: "Nabiał" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const PRODUCTS: { name: string; unit: string; category: CategoryId; your: number; median: number }[] = [
  { name: "Pomidor malinowy", unit: "kg", category: "warzywa", your: 8.9, median: 7.2 },
  { name: "Cebula żółta", unit: "kg", category: "warzywa", your: 2.1, median: 2.3 },
  { name: "Filet z kurczaka", unit: "kg", category: "mieso", your: 24.9, median: 21.4 },
  { name: "Łosoś norweski", unit: "kg", category: "mieso", your: 68.0, median: 71.5 },
  { name: "Masło 82%", unit: "kg", category: "nabial", your: 32.1, median: 32.8 },
  { name: "Ser żółty gouda", unit: "kg", category: "nabial", your: 28.5, median: 26.9 },
];

const fmtZl = (n: number) => `${n.toFixed(2).replace(".", ",")} zł`;

export default function PorownanieCenPage() {
  const { theme, c, toggle } = useMarketingTheme();
  const [category, setCategory] = useState<CategoryId>("wszystkie");

  const positive = theme === "light" ? "#5C6B2F" : "#B9CC7A";
  const positiveDim = theme === "light" ? "rgba(92,107,47,0.12)" : "rgba(185,204,122,0.16)";

  const rows = (category === "wszystkie" ? PRODUCTS : PRODUCTS.filter((p) => p.category === category)).map((p) => {
    const barMax = Math.max(p.your, p.median);
    const yourPct = Math.round((p.your / barMax) * 100);
    const medianPct = Math.round((p.median / barMax) * 100);
    const delta = Math.round(((p.your - p.median) / p.median) * 1000) / 10;
    const isOver = p.your > p.median;
    return { ...p, yourPct, medianPct, delta, isOver };
  });

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "'Inter Variable', system-ui, sans-serif", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>
      <MarketingNavBar c={c} theme={theme} onToggle={toggle} />

      <main>
        {/* HERO */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 80px" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 2, border: `1px solid ${c.accentDim}`, background: c.accentDim, color: c.accentText, fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
              <Scales size={12} style={{ color: c.accent }} />
              Nowość — Porównanie cen
            </div>
            <h1 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: 0, lineHeight: 1.1, marginBottom: 20, color: c.text }}>
              Czy Twój dostawca<br />
              <span style={{ color: c.accentText }}>sprzedaje uczciwie?</span>
            </h1>
            <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
              Spendly anonimowo porównuje ceny z Twoich faktur do mediany cen, jakie za te same produkty płacą inne restauracje. Widzisz od razu, gdzie płacisz więcej niż rynek — i masz argument do negocjacji.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/sign-up">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 3, fontSize: 14, fontWeight: 600, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer" }}>
                  Wypróbuj za darmo <ArrowRight size={16} />
                </button>
              </Link>
              <Link href="/blog/benchmark-cen-w-gastronomii">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 3, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer" }}>
                  Jak liczymy porównanie
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* INTERAKTYWNY WIDGET */}
        <section style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, background: c.panel }}>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 24px" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 600, color: c.text, margin: "0 0 8px" }}>
                Wypróbuj — Twoje ceny vs rynek
              </h2>
              <p style={{ fontSize: 14, color: c.muted, margin: 0 }}>Kliknij kategorię, żeby zobaczyć przykładowe porównanie.</p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 24 }}>
              {CATEGORIES.map((cat) => {
                const active = cat.id === category;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    style={{ padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? c.accent : c.border}`, background: active ? c.accent : c.card, color: active ? c.onAccent : c.text }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ padding: "14px 24px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", fontSize: 12, color: c.muted }}>
                <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Produkty ({rows.length})</span>
                <span>Dane poglądowe · min. 5 restauracji w próbie</span>
              </div>
              {rows.map((row) => (
                <div key={row.name} style={{ padding: "18px 24px", borderBottom: `1px solid ${c.border}`, display: "grid", gridTemplateColumns: "1.2fr 2fr 0.8fr", gap: 16, alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: c.muted, width: 54, flexShrink: 0 }}>Twoja</span>
                      <div style={{ flex: 1, height: 7, background: c.border, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 999, background: c.accent, width: `${row.yourPct}%` }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, width: 70, textAlign: "right", flexShrink: 0 }}>{fmtZl(row.your)}/{row.unit}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: c.muted, width: 54, flexShrink: 0 }}>Mediana</span>
                      <div style={{ flex: 1, height: 7, background: c.border, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 999, background: c.muted, width: `${row.medianPct}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: c.muted, width: 70, textAlign: "right", flexShrink: 0 }}>{fmtZl(row.median)}/{row.unit}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, background: row.isOver ? c.accentDim : positiveDim, color: row.isOver ? c.accentText : positive }}>
                      {row.isOver ? "+" : ""}{String(row.delta).replace(".", ",")}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: 13, color: c.muted, marginTop: 14 }}>Przykładowe dane poglądowe — Twoje realne porównanie wygląda inaczej.</p>
          </div>
        </section>

        {/* JAK TO DZIAŁA */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>Jak to działa</p>
            <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, color: c.text, margin: 0 }}>
              Trzy kroki do porównania cen
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { num: "01", title: "Importujesz faktury jak zwykle", desc: "Przez KSeF albo OCR — nic dodatkowego nie musisz robić. Ceny z faktur już zasilają Twoją historię cen." },
              { num: "02", title: "System liczy medianę anonimowo", desc: "Gdy co najmniej 5 restauracji kupuje ten sam produkt, Spendly liczy medianę cen — bez pokazywania, kto i ile płaci." },
              { num: "03", title: "Widzisz swoją cenę na tle rynku", desc: "Przy każdym produkcie widać, czy płacisz więcej, mniej, czy tyle samo co inne restauracje — gotowy argument do rozmowy z dostawcą." },
            ].map(({ num, title, desc }) => (
              <div key={num} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 4, padding: "28px 24px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.muted, letterSpacing: "0.05em", display: "block", marginBottom: 12 }}>{num}</span>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: c.text, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ANONIMOWOŚĆ */}
        <section style={{ borderTop: `1px solid ${c.border}`, background: c.panel }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 48, alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>Anonimowość</p>
              <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 600, color: c.text, marginBottom: 16 }}>
                Nikt nie widzi, ile płaci Twój konkurent
              </h2>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.75, marginBottom: 0 }}>
                Porównanie liczy się dopiero, gdy dany produkt kupuje co najmniej 5 różnych restauracji (k-anonimowość) — dzięki temu żadna pojedyncza cena nie jest identyfikowalna. Twoje realne ceny nigdy nie są udostępniane innym użytkownikom — widzisz i pokazujesz innym tylko medianę, nigdy pojedyncze faktury.
              </p>
            </div>
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 4, padding: "32px" }}>
              {[
                { icon: Users, text: "Min. 5 restauracji w próbie, żeby produkt trafił do porównania" },
                { icon: Lock, text: "Widoczna jest tylko mediana — nigdy pojedyncza cena innej restauracji" },
                { icon: ShieldCheck, text: "Udział jest opcjonalny — możesz wyłączyć go w każdej chwili" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderBottom: `1px solid ${c.border}` }}>
                  <Icon size={18} style={{ color: c.accent, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 14, color: c.text, lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>FAQ</p>
            <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 600, color: c.text, margin: 0 }}>Porównanie cen — najczęstsze pytania</h2>
          </div>
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            {[
              { q: "Skąd Spendly bierze ceny do porównania?", a: "Z faktur użytkowników Spendly, którzy zgodzili się na udział w anonimowym porównaniu. Nie potrzeba żadnej sieci partnerskiej dostawców — liczą się tylko faktury, które i tak już importujesz." },
              { q: "Czy inni widzą moje ceny?", a: "Nie. Widoczna jest wyłącznie zagregowana mediana, nigdy pojedyncza cena konkretnej restauracji — a dodatkowo produkt pojawia się w porównaniu tylko wtedy, gdy kupuje go min. 5 restauracji." },
              { q: "Co jeśli mój produkt nie ma jeszcze porównania?", a: "Oznacza to, że za mało restauracji w bazie kupuje akurat ten produkt. Baza rośnie z każdym nowym użytkownikiem, więc porównań z czasem przybywa." },
              { q: "Czy mogę wyłączyć udział w porównaniu?", a: "Tak, w każdej chwili — udział jest opcjonalny (opt-out) i nie wpływa na żadną inną funkcję Spendly." },
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
          <div style={{ background: c.panel, border: `1px solid ${c.accentDim}`, borderRadius: 4, padding: "60px 40px", textAlign: "center" }}>
            <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, color: c.text, marginBottom: 16 }}>
              Sprawdź, czy płacisz uczciwą cenę
            </h2>
            <p style={{ fontSize: 15, color: c.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
              Zaimportuj faktury przez KSeF lub OCR i zobacz swoje porównanie cen na tle innych restauracji.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/sign-up">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 3, fontSize: 14, fontWeight: 700, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer" }}>
                  Wypróbuj za darmo <ArrowRight size={16} />
                </button>
              </Link>
              <Link href="/food-cost">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 3, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer" }}>
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
