import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Link } from "wouter";
import { Upload, Lock, Check, AlertTriangle, ArrowRight, FileText } from "@/lib/icons";
import { useMarketingTheme, type MarketingPalette } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/use-page-meta";
import { readInvoiceFile, type ViewerResult } from "@/lib/ksef-viewer";
import { savePendingInvoice, readPendingInvoice } from "@/lib/pending-invoice";
import { track } from "@/lib/posthog";
import { fetchMarketKeys, countComparable } from "@/lib/market-match";

/**
 * Publiczne narzędzie SEO: podgląd faktury KSeF z pliku XML (spec „Podgląd faktury
 * KSeF → rejestracja → porównanie cen”, ekrany 01 i 02). Plik jest czytany w
 * przeglądarce i do rejestracji nie opuszcza jej. Wynik (pełna tabela, PDF, porównanie
 * cen) widać po założeniu darmowego konta — faktura czeka w localStorage
 * (lib/pending-invoice.ts) i importuje się sama po pierwszym logowaniu (/start).
 *
 * Statyczny HTML (H1, kroki, FAQ + JSON-LD FAQPage) robi scripts/prerender-marketing.mjs
 * — eksport FAQ niżej jest przez niego czytany.
 */

export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Jak otworzyć plik XML z KSeF?",
    a: "Przeciągnij go w pole na górze strony. Od razu zobaczysz, czy plik jest poprawny, kto wystawił fakturę i ile ma pozycji. Pełny podgląd, PDF i porównanie cen pokażemy po założeniu darmowego konta. Nie potrzebujesz żadnego programu.",
  },
  {
    q: "Czy PDF zrobiony z XML jest ważną fakturą?",
    a: "Fakturą jest plik XML zapisany w KSeF. PDF to jego wizualizacja, wygodna do druku i archiwum.",
  },
  {
    q: "Czy moje dane są bezpieczne?",
    a: "Do chwili rejestracji plik jest tylko w Twojej przeglądarce. Po założeniu konta zapisujemy go na Twoim koncie. Twoich cen i dostawców nie zobaczy żadna inna restauracja.",
  },
  {
    q: "Dlaczego trzeba założyć konto?",
    a: "Konto jest darmowe i bez karty. Dzięki niemu faktura od razu się zapisuje, a Ty widzisz, jak Twoje ceny wypadają na tle innych restauracji.",
  },
  {
    q: "Jakie wersje faktur obsługujecie?",
    a: "Faktury ustrukturyzowane FA(2) i FA(3) z KSeF, w tym korekty i faktury zaliczkowe.",
  },
  {
    q: "Czy mogę zamienić PDF na XML do KSeF?",
    a: "Pracujemy nad tym. Zamiana faktury PDF na plik FA(3) do wysłania w KSeF pojawi się na darmowym koncie.",
  },
];

const FONT = "'Space Grotesk Variable', system-ui, sans-serif";
const zl = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);

type Loaded = Extract<ViewerResult, { ok: true }>;

export default function PodgladFakturyKsefPage() {
  usePageMeta({
    title: "Podgląd faktury KSeF — zamień XML na PDF | Spendly",
    description:
      "Jak otworzyć fakturę XML z KSeF? Wczytaj plik, zobacz sprzedawcę i pozycje, pobierz PDF i sprawdź, czy nie przepłacasz za produkty. Darmowe konto, bez karty.",
    path: "/podglad-faktury-ksef",
  });
  const { theme, c, toggle } = useMarketingTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("ksef_viewer_view");
    readPendingInvoice(); // usuwa przeterminowany wpis z poprzedniej wizyty
  }, []);

  async function handleFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setError(null);
    const r = await readInvoiceFile(list[0]!);
    if (!r.ok) {
      setError(r.message);
      track("ksef_viewer_file_error", { reason: r.reason });
      return;
    }
    savePendingInvoice(r.xml, r.fileName);
    track("ksef_viewer_file_loaded", { schema: r.schema, items_count: r.invoice.items.length });
    setLoaded(r);
    if (list.length > 1) setError("Na razie wczytujemy jeden plik naraz. Pokazujemy pierwszy z wybranych.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: FONT, minHeight: "100vh" }}>
      <MarketingNavBar c={c} theme={theme} onToggle={toggle} />
      <main>
        {loaded ? (
          <GatedResult c={c} loaded={loaded} notice={error} onReset={() => { setLoaded(null); setError(null); }} />
        ) : (
          <ToolLanding c={c} error={error} onFiles={handleFiles} />
        )}
      </main>
      <MarketingFooter c={c} />
    </div>
  );
}

// ─── Ekran 01 ────────────────────────────────────────────────────────────────

function ToolLanding({ c, error, onFiles }: { c: MarketingPalette; error: string | null; onFiles: (f: FileList | File[] | null) => void }) {
  const label: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.accentText, margin: "0 0 12px" };
  const h2: CSSProperties = { fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.15, margin: "0 0 16px", color: c.text };
  return (
    <>
      {/* HERO + pole pliku */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 64px" }}>
        <p style={{ fontSize: 13, color: c.muted, margin: "0 0 28px" }}>
          <Link href="/kalkulatory"><span style={{ cursor: "pointer" }}>Narzędzia</span></Link> / Podgląd faktury KSeF
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 48, alignItems: "start" }}>
          <div>
            <p style={label}>Darmowe narzędzie · konto bez karty</p>
            <h1 style={{ fontSize: "clamp(2rem, 6vw, 3.4rem)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 20px", color: c.text }}>
              Otwórz fakturę KSeF z&nbsp;pliku XML
            </h1>
            <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.65, margin: "0 0 24px", maxWidth: 560 }}>
              Zamień XML z Krajowego Systemu e-Faktur na czytelny PDF i od razu sprawdź, czy za produkty z faktury nie płacisz więcej niż inne restauracje.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {["Faktury FA(2) i FA(3), także korekty i zaliczki", "Czytelny PDF do druku i archiwum", "Darmowe konto, bez karty i bez limitu plików"].map((t) => (
                <li key={t} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: c.text }}>
                  <Check size={15} style={{ color: c.accent, flexShrink: 0 }} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <DropBox c={c} error={error} onFiles={onFiles} />
        </div>
      </section>

      {/* JAK TO DZIAŁA */}
      <section style={{ background: c.card, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
          <p style={label}>Jak to działa</p>
          <h2 style={h2}>Trzy kroki, zero instalacji</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 1, background: c.border, border: `1px solid ${c.border}`, marginTop: 28 }}>
            {[
              ["01", "Pobierz XML z KSeF", "Z Aplikacji Podatnika, od księgowej albo z programu do faktur. To plik z końcówką .xml."],
              ["02", "Przeciągnij go tutaj", "Od razu widzisz, czy plik jest poprawny: numer, sprzedawca, nabywca i liczba pozycji."],
              ["03", "Załóż konto i pobierz PDF", "Darmowe konto, bez karty. Faktura zapisze się sama, a Ty dostajesz PDF i porównanie cen z rynkiem."],
            ].map(([n, h, p]) => (
              <div key={n} style={{ background: c.bg, padding: "28px 24px" }}>
                <div className="num" style={{ fontSize: 34, fontWeight: 700, color: c.accentText, marginBottom: 14 }}>{n}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: c.text }}>{h}</h3>
                <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.6, margin: 0 }}>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DLA RESTAURACJI — porównanie cen (przykład, mediany ukryte) */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 48, alignItems: "center" }}>
          <div>
            <p style={label}>Dla restauracji</p>
            <h2 style={h2}>A co, jeśli za cytryny płacisz więcej niż lokal obok?</h2>
            <p style={{ fontSize: 16, color: c.muted, lineHeight: 1.65, margin: "0 0 24px" }}>
              Spendly porównuje ceny z Twoich faktur z anonimową medianą innych restauracji. Widzisz, gdzie przepłacasz i ile możesz odzyskać co miesiąc.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link href="/sign-up">
                <button style={btnPrimary(c)}>Sprawdź swoje ceny za darmo</button>
              </Link>
              <Link href="/ceny-rynkowe">
                <span style={{ fontSize: 14, fontWeight: 600, color: c.text, cursor: "pointer" }}>Zobacz prawdziwe ceny rynkowe →</span>
              </Link>
            </div>
            <p style={{ fontSize: 12, color: c.muted, margin: "16px 0 0", lineHeight: 1.6 }}>
              Medianę pokazujemy dopiero, gdy ceny podało co najmniej kilka restauracji. Nikt nie zobaczy Twoich cen ani dostawców.
            </p>
          </div>
          <ExampleMarketTable c={c} />
        </div>
      </section>

      {/* W DRUGĄ STRONĘ — uczciwie: funkcja w przygotowaniu */}
      <section style={{ background: c.card, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 40 }}>
          <div>
            <p style={label}>W drugą stronę · w przygotowaniu</p>
            <h2 style={{ ...h2, margin: 0 }}>PDF na XML dla KSeF</h2>
          </div>
          <div>
            <p style={{ fontSize: 16, color: c.muted, lineHeight: 1.65, margin: "0 0 16px" }}>
              Pracujemy nad zamianą faktury PDF na plik w schemacie FA(3), gotowy do wysłania w KSeF. Pojawi się na darmowym koncie.
            </p>
            <div style={{ display: "flex", gap: 10, padding: "14px 16px", border: `1px solid ${c.border}`, background: c.bg, fontSize: 13, color: c.muted, lineHeight: 1.55 }}>
              <AlertTriangle size={16} style={{ color: c.accentText, flexShrink: 0, marginTop: 1 }} />
              <span>Taki plik będzie szkicem do wystawienia, nie fakturą. Fakturą staje się dopiero dokument przyjęty w KSeF i oznaczony numerem KSeF.</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 40 }}>
        <div>
          <p style={label}>FAQ</p>
          <h2 style={h2}>Najczęstsze pytania</h2>
        </div>
        <div style={{ borderTop: `1px solid ${c.text}` }}>
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0} style={{ borderBottom: `1px solid ${c.border}`, padding: "16px 0" }}>
              <summary style={{ fontSize: 15, fontWeight: 600, cursor: "pointer", color: c.text }}>{f.q}</summary>
              <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.65, margin: "10px 0 0" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "#211B12", color: "#F0E9DB" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 24px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ maxWidth: 620 }}>
            <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 700, margin: "0 0 10px", color: "#F0E9DB" }}>Faktury z KSeF mogą spływać same.</h2>
            <p style={{ fontSize: 15, color: "#C9BEA9", lineHeight: 1.6, margin: 0 }}>
              Podłącz KSeF i włącz automatyczną synchronizację, a Spendly sam pobierze nowe faktury, rozpisze ceny produktów i powie, gdy dostawca podniesie cenę.
            </p>
          </div>
          <Link href="/sign-up">
            <button style={{ ...btnPrimary(c), background: "#E06A3C", color: "#17130E" }}>Załóż darmowe konto</button>
          </Link>
        </div>
      </section>
    </>
  );
}

function btnPrimary(c: MarketingPalette): CSSProperties {
  return { padding: "12px 22px", borderRadius: 3, fontSize: 14, fontWeight: 600, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer", fontFamily: FONT };
}

function DropBox({ c, error, onFiles }: { c: MarketingPalette; error: string | null; onFiles: (f: FileList | File[] | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState<"xml" | "pdf">("xml");
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles(e.dataTransfer.files);
  };
  const tabStyle = (on: boolean): CSSProperties => ({
    flex: 1, padding: "14px 12px", fontSize: 13, fontWeight: 600, background: on ? c.card : c.bg, color: on ? c.text : c.muted,
    border: "none", borderBottom: `2px solid ${on ? c.accent : c.border}`, cursor: "pointer", fontFamily: FONT,
  });
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderTop: `2px solid ${c.text}` }}>
      <div role="tablist" style={{ display: "flex" }}>
        <button role="tab" aria-selected={tab === "xml"} style={tabStyle(tab === "xml")} onClick={() => setTab("xml")}>XML → PDF</button>
        <button role="tab" aria-selected={tab === "pdf"} style={tabStyle(tab === "pdf")} onClick={() => setTab("pdf")}>
          PDF → XML <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", marginLeft: 6, background: c.accentDim, color: c.accentText }}>wkrótce</span>
        </button>
      </div>
      <div style={{ padding: 20 }}>
        {tab === "xml" ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Wybierz albo przeciągnij plik XML faktury z KSeF"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            style={{ border: `1.5px dashed ${over ? c.accent : c.border}`, background: over ? c.accentDim : c.bg, padding: "44px 20px", textAlign: "center", cursor: "pointer" }}
          >
            <Upload size={30} style={{ color: c.accent }} />
            <p style={{ fontSize: 17, fontWeight: 700, margin: "14px 0 6px", color: c.text }}>Przeciągnij plik XML z KSeF</p>
            <p style={{ fontSize: 13, color: c.muted, margin: "0 0 18px" }}>lub kliknij, żeby wybrać z dysku.</p>
            <span style={{ ...btnPrimary(c), display: "inline-block" }}>Wybierz plik</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              style={{ display: "none" }}
              onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
        ) : (
          <div style={{ border: `1.5px dashed ${c.border}`, background: c.bg, padding: "36px 20px", textAlign: "center" }}>
            <FileText size={28} style={{ color: c.muted }} />
            <p style={{ fontSize: 15, fontWeight: 700, margin: "12px 0 6px", color: c.text }}>Zamiana PDF na XML jest w przygotowaniu</p>
            <p style={{ fontSize: 13, color: c.muted, margin: "0 0 16px", lineHeight: 1.6 }}>Pojawi się na darmowym koncie Spendly. Załóż konto, a dowiesz się pierwszy.</p>
            <Link href="/sign-up"><button style={btnPrimary(c)}>Załóż darmowe konto</button></Link>
          </div>
        )}
        {error && (
          <p role="alert" style={{ display: "flex", gap: 8, fontSize: 13, color: c.accentText, margin: "14px 0 0", lineHeight: 1.5 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </p>
        )}
        <p style={{ display: "flex", gap: 8, fontSize: 12, color: c.muted, margin: "16px 0 0", lineHeight: 1.55 }}>
          <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><b style={{ color: c.text }}>Do rejestracji plik zostaje w Twojej przeglądarce.</b> Na Twoje konto trafia dopiero, gdy je założysz — żeby pokazać PDF i porównanie cen.</span>
        </p>
      </div>
    </div>
  );
}

function ExampleMarketTable({ c }: { c: MarketingPalette }) {
  const rows: Array<[string, string, string]> = [["Cytryna", "kg", "9,40 zł"], ["Cukier biały", "kg", "3,89 zł"], ["Masło 82%", "kg", "38,90 zł"], ["Filet z kurczaka", "kg", "24,90 zł"]];
  const cell: CSSProperties = { padding: "11px 14px", fontSize: 13, borderBottom: `1px solid ${c.border}` };
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}` }} aria-label="Przykład porównania cen">
      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px", borderBottom: `1px solid ${c.border}`, fontSize: 13, fontWeight: 600 }}>
        <span>Twoje ceny na tle rynku</span>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Przykład</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: c.muted }}>
            <th style={{ ...cell, textAlign: "left", fontWeight: 600 }}>Produkt</th>
            <th style={{ ...cell, textAlign: "right", fontWeight: 600 }}>Twoja cena</th>
            <th style={{ ...cell, textAlign: "right", fontWeight: 600 }}>Mediana</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([n, u, p]) => (
            <tr key={n}>
              <td style={cell}>{n} <span style={{ color: c.muted, fontSize: 12 }}>{u}</span></td>
              <td className="num" style={{ ...cell, textAlign: "right" }}>{p}</td>
              <td className="num" aria-hidden style={{ ...cell, textAlign: "right", filter: "blur(5px)", color: c.muted, userSelect: "none" }}>00,00 zł</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: c.muted, margin: 0, padding: "12px 14px" }}>
        <Lock size={13} /> Mediana rynku jest widoczna po założeniu konta
      </p>
    </div>
  );
}

// ─── Ekran 02 — wynik zablokowany do rejestracji ─────────────────────────────

function GatedResult({ c, loaded, notice, onReset }: { c: MarketingPalette; loaded: Loaded; notice: string | null; onReset: () => void }) {
  const h = loaded.invoice.header;
  const items = loaded.invoice.items;
  const paper = "#FFFFFF";
  const ink = "#211B12";
  const step = (state: "done" | "active" | "todo", text: string) => (
    <div style={{ flex: 1, minWidth: 0, borderTop: `2px solid ${state === "done" ? "#5C6B2F" : state === "active" ? c.accent : c.border}`, paddingTop: 10, fontSize: 13, fontWeight: state === "todo" ? 500 : 600, color: state === "done" ? "#5C6B2F" : state === "active" ? c.text : c.muted, display: "flex", gap: 6, alignItems: "center" }}>
      {state === "done" && <Check size={14} />}{text}
    </div>
  );
  const track_cta = () => track("ksef_viewer_gate_cta", { method: "email" });
  // Ile pozycji ma medianę rynku (publiczna lista bez cen; nic z faktury nie wychodzi).
  const [comparable, setComparable] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMarketKeys()
      .then((keys) => { if (alive) setComparable(countComparable(items, keys)); })
      .catch(() => { /* brak licznika — zostaje kwota brutto */ });
    return () => { alive = false; };
  }, [items]);

  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 64px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {step("done", "Plik wczytany")}
        {step("active", "2 · Darmowe konto")}
        {step("todo", "3 · PDF i porównanie cen")}
      </div>
      {notice && <p role="status" style={{ fontSize: 13, color: c.muted, margin: "0 0 16px" }}>{notice}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 24, alignItems: "start" }}>
        {/* Lewa: prawdziwy nagłówek, reszta rozmyta */}
        <div style={{ background: c.panel === "#FFFFFF" ? "#EAE1D0" : c.card, border: `1px solid ${c.border}`, padding: "24px 24px 20px" }}>
          <div style={{ background: paper, color: ink, padding: "28px 28px 0", fontFamily: "Arial, Helvetica, sans-serif", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 11 }}>
              <div>
                <div style={{ fontSize: 9, color: "#666" }}>Krajowy System e-Faktur</div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 6px" }}>Faktura {h.invoiceType && h.invoiceType !== "VAT" ? h.invoiceType : "VAT"}</div>
                <div>Nr <b>{h.invoiceNumber ?? "—"}</b></div>
              </div>
              <div style={{ textAlign: "right", lineHeight: 1.7 }}>
                <div>Data wystawienia: <b>{h.invoiceDate ?? "—"}</b></div>
                {h.paymentDueDate && <div>Termin płatności: <b>{h.paymentDueDate}</b></div>}
              </div>
            </div>
            <div style={{ borderTop: `2px solid ${ink}`, margin: "18px 0 14px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 11 }}>
              <div><div style={{ fontSize: 8, letterSpacing: "0.1em", color: "#666", marginBottom: 4 }}>SPRZEDAWCA</div><b>{h.sellerName ?? "—"}</b>{h.sellerNip && <div style={{ color: "#555" }}>NIP {h.sellerNip}</div>}</div>
              <div><div style={{ fontSize: 8, letterSpacing: "0.1em", color: "#666", marginBottom: 4 }}>NABYWCA</div><b>{h.buyerName ?? "—"}</b>{h.buyerNip && <div style={{ color: "#555" }}>NIP {h.buyerNip}</div>}</div>
            </div>
            <div aria-hidden style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none", marginTop: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <tbody>
                  {items.slice(0, 8).map((it, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "7px 4px" }}>{i + 1}</td>
                      <td style={{ padding: "7px 4px" }}>{it.name}</td>
                      <td style={{ padding: "7px 4px", textAlign: "right" }}>{it.quantity}</td>
                      <td style={{ padding: "7px 4px", textAlign: "right" }}>{it.unitPrice.toFixed(2)}</td>
                      <td style={{ padding: "7px 4px", textAlign: "right" }}>{it.net.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, padding: "14px 4px 24px" }}>Do zapłaty: {zl(h.totalGross)}</div>
            </div>
          </div>
          <p style={{ display: "flex", gap: 12, alignItems: "flex-start", background: c.card, border: `1px solid ${c.border}`, padding: "16px 18px", margin: "16px 0 0", fontSize: 14, lineHeight: 1.55, color: c.text }}>
            <Lock size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            Plik jest poprawny i gotowy. Pełny podgląd, PDF i porównanie cen zobaczysz po założeniu darmowego konta.
          </p>
        </div>

        {/* Prawa: CTA */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderTop: `3px solid ${c.accent}`, padding: "26px 26px 24px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.accentText, margin: "0 0 10px" }}>Twój wynik jest gotowy</p>
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 700, lineHeight: 1.15, margin: "0 0 20px", color: c.text }}>
            Załóż darmowe konto, żeby zobaczyć fakturę i porównanie cen
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: c.border, border: `1px solid ${c.border}`, marginBottom: 18 }}>
            {[["Rozpoznane pozycje", String(items.length)], comparable != null && comparable > 0 ? ["Z medianą rynku", String(comparable)] : ["Kwota brutto", zl(h.totalGross)]].map(([k, v]) => (
              <div key={k} style={{ background: c.bg, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>{k}</div>
                <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: c.text }}>{v}</div>
              </div>
            ))}
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px" }}>
            {["PDF faktury do pobrania i wydruku", "Twoje ceny na tle mediany innych restauracji", "Faktura od razu zapisana na Twoim koncie"].map((t) => (
              <li key={t} style={{ display: "flex", gap: 10, padding: "11px 0", borderTop: `1px solid ${c.border}`, fontSize: 14, color: c.text }}>
                <Check size={15} style={{ color: "#5C6B2F", flexShrink: 0, marginTop: 2 }} /> {t}
              </li>
            ))}
          </ul>
          <Link href="/sign-up">
            <button onClick={track_cta} style={{ ...btnPrimary(c), width: "100%", padding: "14px 18px", fontSize: 15, display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
              Załóż konto i zobacz wynik <ArrowRight size={16} />
            </button>
          </Link>
          <Link href="/sign-in">
            <button style={{ width: "100%", marginTop: 10, padding: "12px 18px", fontSize: 14, fontWeight: 600, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer", fontFamily: FONT }}>
              Mam już konto — zaloguj się
            </button>
          </Link>
          <p style={{ fontSize: 12, color: c.muted, lineHeight: 1.6, margin: "14px 0 0" }}>
            Darmowe konto, bez karty i bez zobowiązań. Plik do chwili rejestracji zostaje w Twojej przeglądarce.
          </p>
          <button onClick={onReset} style={{ background: "none", border: "none", padding: 0, marginTop: 12, fontSize: 13, color: c.accentText, cursor: "pointer", textDecoration: "underline", fontFamily: FONT }}>
            Wczytaj inny plik
          </button>
        </div>
      </div>
    </section>
  );
}
