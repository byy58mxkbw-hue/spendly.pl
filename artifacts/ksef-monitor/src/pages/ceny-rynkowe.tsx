import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Check, Lock, Upload } from "@/lib/icons";
import { useMarketingTheme, type MarketingPalette } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/use-page-meta";
import { apiUrl } from "@/lib/api-base";
import { track } from "@/lib/posthog";
import { formatDate } from "@/lib/format";
import { readInvoiceFile } from "@/lib/ksef-viewer";
import { savePendingInvoice } from "@/lib/pending-invoice";
import { isMarketUnlocked, unlockMarket } from "@/lib/market-unlock";
import { marketKeyOf } from "@/lib/market-match";

/**
 * Ceny rynkowe („wędka” dla gastronomii). Dane: GET /api/public/market-prices — mediana
 * i środkowa połowa cen NETTO z faktur restauracji w Spendly, tylko produkty bazowe ze
 * słownika i tylko grupy powyżej progu anonimowości.
 *
 * Decyzja usera 2026-10-08: bez faktury widać NAZWY produktów i kilka prawdziwych
 * median podpisanych „Przykład”; pełna tabela odblokowuje się po wgraniu własnej
 * faktury (XML, PDF albo zdjęcie; plik zostaje w przeglądarce, patrz lib/market-unlock). Ta sama treść
 * trafia do Google i do ludzi — prerender (scripts/prerender-marketing.mjs) wpisuje
 * w HTML tylko `publicSnapshot()` (bez cen spoza przykładów), więc nie ma cloakingu.
 *
 * Każdy produkt ma też podstronę SEO /ceny-rynkowe/<slug> („ile kosztuje pomidor”),
 * generowaną przy buildzie z tej samej listy.
 */

export type MarketPrice = {
  name: string; unit: string; group: string; median: number | null; p25: number | null; p75: number | null;
  window: "12m" | "month"; fromMonth: string; toMonth: string;
};
/** Odpowiedź API; `updatedAt` = ostatnie przeliczenie median. */
export type MarketPayload = { items: MarketPrice[]; updatedAt: string | null };

/** Produkty, których prawdziwe mediany pokazujemy publicznie jako przykład. */
const EXAMPLE_PREFS = ["Pomidor", "Cytryna", "Filet z kurczaka", "Ogórek", "Marchew", "Jabłko"];
const EXAMPLE_COUNT = 3;

export function exampleNames(items: ReadonlyArray<Pick<MarketPrice, "name">>): Set<string> {
  const present = new Set(items.map((i) => i.name));
  const picked = EXAMPLE_PREFS.filter((n) => present.has(n));
  for (const i of items) if (picked.length < EXAMPLE_COUNT && !picked.includes(i.name)) picked.push(i.name);
  return new Set(picked.slice(0, EXAMPLE_COUNT));
}

/** To, co widać bez faktury: wszystkie nazwy, ceny tylko przykładów. */
export function publicSnapshot(payload: MarketPayload): MarketPayload {
  const ex = exampleNames(payload.items);
  return { updatedAt: payload.updatedAt, items: payload.items.map((i) => (ex.has(i.name) ? i : { ...i, median: null, p25: null, p75: null })) };
}

const PL: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
export function marketSlug(item: Pick<MarketPrice, "name" | "unit">, all: ReadonlyArray<Pick<MarketPrice, "name" | "unit">>): string {
  const base = item.name.toLowerCase().replace(/[ąćęłńóśźż]/g, (ch) => PL[ch] ?? ch).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return all.filter((i) => i.name === item.name).length > 1 ? `${base}-${item.unit}` : base;
}

export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Skąd pochodzą te ceny?",
    a: "Z faktur zakupowych restauracji, które korzystają ze Spendly — głównie pobranych automatycznie z KSeF. Pokazujemy medianę cen netto, czyli wartość środkową: połowa restauracji płaci mniej, połowa więcej.",
  },
  {
    q: "Dlaczego pełne ceny widać dopiero po wgraniu faktury?",
    a: "Bo ceny rynku mają sens dopiero obok Twoich. Wgraj jedną fakturę — XML z KSeF, PDF albo zdjęcie; plik zostaje w Twojej przeglądarce — a odblokujemy ceny wszystkich produktów i zaznaczymy te, które kupujesz.",
  },
  {
    q: "Czy widać ceny konkretnej restauracji albo dostawcy?",
    a: "Nie. Produkt pokazujemy dopiero wtedy, gdy kupuje go kilka różnych restauracji. Nie pokazujemy nazw lokali, dostawców, liczby restauracji ani pojedynczych cen.",
  },
  {
    q: "Co oznacza „środkowa połowa cen”?",
    a: "Zakres, w którym mieści się połowa cen płaconych przez restauracje — od ceny, poniżej której płaci co czwarta, do ceny, powyżej której płaci co czwarta. Jeśli Twoja cena jest wyżej, płacisz więcej niż większość.",
  },
  {
    q: "Dlaczego „Cytryny Argentyna kl. I” i „Cytryna luz” to jedna pozycja?",
    a: "Każdy dostawca nazywa produkty inaczej. Łączymy warianty tego samego produktu bazowego, pomijając pochodzenie, klasę i opakowanie, ale nigdy nie mieszamy cen za kilogram z cenami za sztukę.",
  },
];

/** Od czego zależy cena — tekst per grupa (bez liczb, tylko mechanika rynku). */
const GROUP_NOTES: Record<string, string> = {
  Warzywa:
    "Na cenę warzyw najmocniej działa sezon: w sezonie krajowym kupujesz zwykle taniej niż zimą, gdy towar jedzie z importu albo ze szklarni. Liczą się też klasa, kaliber i opakowanie — skrzynka, worek czy towar na wagę — oraz to, jak często i w jakich ilościach zamawiasz.",
  Owoce:
    "Cytrusy i owoce egzotyczne są niemal w całości importowane, więc ich cena idzie za kursem walut i kosztami transportu. Krajowe owoce tanieją w sezonie i drożeją poza nim. Różnicę robią też klasa i kaliber.",
  Zioła:
    "Świeże zioła kupuje się w małych ilościach, więc cena za kilogram wygląda wysoko. Porównuj ją z ceną za kilogram ze swojej faktury — jeśli dostawca liczy za pęczek albo doniczkę, przelicz ją najpierw na kilogram.",
  "Mięso i ryby":
    "Cena mięsa zależy od elementu i sposobu przygotowania: z kością czy bez, świeże czy mrożone, porcjowane czy w całości. Szeroka środkowa połowa cen zwykle oznacza, że pod jedną nazwą restauracje kupują różne klasy tego samego elementu.",
  Nabiał:
    "Na cenę nabiału wpływają zawartość tłuszczu, wielkość opakowania i marka. Opakowania gastronomiczne są zwykle tańsze w przeliczeniu na kilogram niż detaliczne.",
  Spiżarnia:
    "Produkty suche i przetwory mają stabilniejsze ceny niż świeży towar. Najwięcej zmieniają wielkość opakowania i marka — opakowanie zbiorcze bywa wyraźnie tańsze za kilogram.",
};

const FONT = "'Space Grotesk Variable', system-ui, sans-serif";
const zl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł");
const UNIT_LABEL: Record<string, string> = { kg: "kg", szt: "szt.", l: "l", opak: "opak.", kart: "karton", g: "g" };
const UNIT_WORD: Record<string, string> = { kg: "kilogram", l: "litr", szt: "sztukę" };
const MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const MONTHS_NOM = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m ? `${MONTHS[m - 1]} ${y}` : ym; };
const monthNom = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m ? `${MONTHS_NOM[m - 1]} ${y}` : ym; };
const GROUP_ORDER = ["Warzywa", "Owoce", "Zioła", "Mięso i ryby", "Nabiał", "Spiżarnia"];
const rank = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
const byGroupThenName = (a: MarketPrice, b: MarketPrice) => rank(a.group) - rank(b.group) || a.name.localeCompare(b.name, "pl");

declare global {
  // eslint-disable-next-line no-var
  var __SPENDLY_MARKET_PRICES__: MarketPayload | undefined;
}

function initialData(): MarketPayload | null {
  if (typeof document === "undefined") return globalThis.__SPENDLY_MARKET_PRICES__ ?? null; // prerender
  try {
    const el = document.getElementById("market-prices-data");
    return el?.textContent ? (JSON.parse(el.textContent) as MarketPayload) : null;
  } catch {
    return null;
  }
}

const MAX_SCAN_BYTES = 20 * 1024 * 1024;
const isXmlFile = (f: File) => /\.xml$/i.test(f.name) || /xml/i.test(f.type);
const isScanFile = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name) || f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);

/** Wspólny stan: ceny, odblokowanie i wgrywanie faktury. */
function useMarketData() {
  const [init] = useState(initialData);
  const [prices, setPrices] = useState<MarketPrice[] | null>(init?.items ?? null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(init?.updatedAt ?? null);
  const [failed, setFailed] = useState(false);
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" && isMarketUnlocked());
  // "xml" = faktura czeka na rejestrację i zaznaczamy jej produkty; "scan" = PDF/zdjęcie
  // (bez odczytu — OCR jest tylko na koncie, za limitem AI).
  const [unlockedVia, setUnlockedVia] = useState<"xml" | "scan" | null>(null);
  const [invoiceKeys, setInvoiceKeys] = useState<Set<string> | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/public/market-prices"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MarketPayload) => { setPrices(d.items); setUpdatedAt(d.updatedAt); })
      .catch(() => setFailed(true));
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!isXmlFile(file)) {
      if (!isScanFile(file)) {
        setUploadError("Wgraj fakturę jako plik XML z KSeF, PDF albo zdjęcie (JPG, PNG).");
        track("market_prices_upload_error", { reason: "type" });
        return;
      }
      if (file.size > MAX_SCAN_BYTES) {
        setUploadError("Plik jest za duży — limit to 20 MB.");
        track("market_prices_upload_error", { reason: "too_large" });
        return;
      }
      // PDF/zdjęcia nie czytamy na publicznej stronie (OCR = AI, tylko na koncie) — plik
      // nie opuszcza przeglądarki, a po rejestracji user wgrywa go w Fakturach.
      unlockMarket();
      setUnlocked(true);
      setUnlockedVia("scan");
      track("market_prices_unlocked", { kind: file.type === "application/pdf" ? "pdf" : "image" });
      return;
    }
    const r = await readInvoiceFile(file);
    if (!r.ok) {
      setUploadError(r.message);
      track("market_prices_upload_error", { reason: r.reason });
      return;
    }
    // Ta sama faktura czeka na rejestrację (start-import po założeniu konta).
    savePendingInvoice(r.xml, r.fileName);
    unlockMarket();
    setUnlocked(true);
    setUnlockedVia("xml");
    setInvoiceKeys(new Set(r.invoice.items.map((it) => marketKeyOf(it.name, it.unit))));
    track("market_prices_unlocked", { kind: "xml", items_count: r.invoice.items.length });
  }

  const examples = useMemo(() => exampleNames(prices ?? []), [prices]);
  const showPrice = (p: MarketPrice) => p.median != null && (unlocked || examples.has(p.name));
  const onInvoice = (p: MarketPrice) => invoiceKeys?.has(marketKeyOf(p.name, p.unit)) ?? false;
  return { prices, updatedAt, failed, unlocked, unlockedVia, examples, showPrice, onInvoice, onFile, uploadError };
}

export default function CenyRynkowePage({ slug }: { slug?: string } = {}) {
  const { theme, c, toggle } = useMarketingTheme();
  const data = useMarketData();
  const item = slug && data.prices ? data.prices.find((p) => marketSlug(p, data.prices!) === slug) ?? null : null;

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: FONT, minHeight: "100vh" }}>
      <MarketingNavBar c={c} theme={theme} onToggle={toggle} />
      <main>
        {slug ? <ProductView c={c} slug={slug} item={item} data={data} /> : <IndexView c={c} data={data} />}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 40 }}>
          <div>
            <p style={labelStyle(c)}>FAQ</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 700, margin: 0 }}>Jak liczymy ceny rynkowe</h2>
          </div>
          <div style={{ borderTop: `1px solid ${c.text}` }}>
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0} style={{ borderBottom: `1px solid ${c.border}`, padding: "16px 0" }}>
                <summary style={{ fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{f.q}</summary>
                <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.65, margin: "10px 0 0" }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter c={c} />
    </div>
  );
}

type MarketData = ReturnType<typeof useMarketData>;

// ─── Lista wszystkich produktów ──────────────────────────────────────────────

function IndexView({ c, data }: { c: MarketingPalette; data: MarketData }) {
  usePageMeta({
    title: "Ceny w gastronomii: ile płacą restauracje | Spendly",
    description:
      "Ceny, których dostawca Ci nie pokaże: ile inne restauracje płacą za mięso, warzywa, owoce i zioła. Mediana z prawdziwych faktur — wgraj swoją i porównaj.",
    path: "/ceny-rynkowe",
  });
  useEffect(() => { track("market_prices_view"); }, []);
  const [group, setGroup] = useState<string>("Wszystkie");
  const { prices } = data;
  const groups = useMemo(() => {
    const present = new Set((prices ?? []).map((p) => p.group));
    return ["Wszystkie", ...GROUP_ORDER.filter((g) => present.has(g))];
  }, [prices]);
  const visible = (prices ?? []).filter((p) => group === "Wszystkie" || p.group === group).sort(byGroupThenName);

  return (
    <>
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 28px" }}>
        <p style={{ fontSize: 13, color: c.muted, margin: "0 0 28px" }}>
          <Link href="/kalkulatory"><span style={{ cursor: "pointer" }}>Narzędzia</span></Link> / Ceny rynkowe
        </p>
        <p style={labelStyle(c)}>Ceny produktów dla gastronomii{data.updatedAt ? ` · zaktualizowano ${formatDate(data.updatedAt)}` : ""}</p>
        <h1 style={h1Style}>Ceny, których dostawca Ci nie pokaże</h1>
        <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.65, margin: 0, maxWidth: 680 }}>
          Ile inne restauracje płacą za mięso, warzywa, owoce i zioła. Mediana cen netto z prawdziwych faktur, aktualizowana codziennie. Jeśli płacisz powyżej środkowej połowy cen — przepłacasz.
        </p>
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 24px 56px" }}>
        <UnlockBox c={c} data={data} total={prices?.length ?? 0} />

        <div role="tablist" aria-label="Grupa produktów" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "24px 0 16px" }}>
          {groups.map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g)}
              style={{ padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, borderRadius: 3, border: `1px solid ${group === g ? c.text : c.border}`, background: group === g ? c.text : c.card, color: group === g ? c.bg : c.text }}
            >
              {g}
            </button>
          ))}
        </div>

        {prices == null ? (
          <p style={{ color: c.muted, fontSize: 14, padding: "24px 0" }}>{data.failed ? "Nie udało się wczytać cen. Spróbuj odświeżyć stronę." : "Wczytuję ceny…"}</p>
        ) : (
          <div style={{ border: `1px solid ${c.border}`, background: c.card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted, textAlign: "left" }}>
                  <th style={th(c)}>Produkt</th>
                  <th style={{ ...th(c), textAlign: "right" }}>Mediana</th>
                  <th style={{ ...th(c), textAlign: "right" }}>Środkowa połowa cen</th>
                  <th style={th(c)}>Okres</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <PriceRow key={`${p.name}__${p.unit}`} c={c} p={p} data={data} slug={marketSlug(p, prices)} />
                ))}
              </tbody>
            </table>
            <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: c.muted, margin: 0, padding: "12px 16px", borderTop: `1px solid ${c.border}` }}>
              <Lock size={13} /> Ceny netto. Produkt pokazujemy dopiero, gdy kupuje go kilka restauracji — nikt nie zobaczy cen konkretnego lokalu ani dostawcy.
            </p>
          </div>
        )}
      </section>

      <DarkCta c={c} unlocked={data.unlocked} />
    </>
  );
}

function PriceRow({ c, p, data, slug }: { c: MarketingPalette; p: MarketPrice; data: MarketData; slug: string }) {
  const shown = data.showPrice(p);
  const isExample = shown && !data.unlocked;
  return (
    <tr style={{ borderTop: `1px solid ${c.border}`, background: data.onInvoice(p) ? c.accentDim : undefined }}>
      <td style={td}>
        <Link href={`/ceny-rynkowe/${slug}`} style={{ color: c.text, fontWeight: 700, textDecoration: "none" }}>{p.name}</Link>{" "}
        <span style={{ color: c.muted, fontSize: 13 }}>za {UNIT_LABEL[p.unit] ?? p.unit}</span>
        {isExample && <Tag c={c}>Przykład</Tag>}
        {data.onInvoice(p) && <Tag c={c}>Na Twojej fakturze</Tag>}
        <div style={{ fontSize: 12, color: c.muted }}>{p.group}</div>
      </td>
      {shown ? (
        <>
          <td className="num" style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 16 }}>{zl(p.median)}</td>
          <td className="num" style={{ ...td, textAlign: "right", color: c.muted }}>{p.p25 != null && p.p75 != null ? `${zl(p.p25)} – ${zl(p.p75)}` : "—"}</td>
        </>
      ) : (
        <td colSpan={2} style={{ ...td, textAlign: "right", color: c.muted, fontSize: 13 }}>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Lock size={13} /> po wgraniu faktury</span>
        </td>
      )}
      <td style={{ ...td, fontSize: 13, color: c.muted }}>{p.window === "12m" ? "ostatnie 12 mies." : monthLabel(p.toMonth)}</td>
    </tr>
  );
}

function Tag({ c, children }: { c: MarketingPalette; children: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", marginLeft: 8, background: c.accentDim, color: c.accentText, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** Pole „wgraj fakturę, odblokuj ceny” albo potwierdzenie po odblokowaniu. */
function UnlockBox({ c, data, total, compact = false }: { c: MarketingPalette; data: MarketData; total: number; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (data.unlocked) {
    return (
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", border: `1px solid ${c.border}`, borderTop: `2px solid ${c.text}`, background: c.card }}>
        <p style={{ display: "flex", gap: 10, alignItems: "center", margin: 0, fontSize: 14 }}>
          <Check size={16} style={{ color: c.accent, flexShrink: 0 }} />
          <span>
            <b>Ceny odblokowane.</b>{" "}
            {data.unlockedVia === "scan"
              ? "Chcesz zobaczyć swoje ceny obok mediany, pozycja po pozycji? Załóż darmowe konto i wgraj tę fakturę w zakładce Faktury — odczytamy ją za Ciebie."
              : data.unlockedVia === "xml"
                ? "Chcesz zobaczyć swoje ceny obok mediany, pozycja po pozycji? Załóż darmowe konto — faktura już czeka."
                : "Chcesz zobaczyć swoje ceny obok mediany, pozycja po pozycji? Załóż darmowe konto i podłącz KSeF."}
          </span>
        </p>
        <Link href="/sign-up"><button style={btn(c)}>Porównaj moje ceny <ArrowRight size={16} /></button></Link>
      </div>
    );
  }
  return (
    <div style={{ padding: compact ? "18px 20px" : "22px 24px", border: `1px solid ${c.border}`, borderTop: `2px solid ${c.text}`, background: c.card }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
            {total > 0 ? `Ceny ${total} produktów odblokujesz jedną fakturą` : "Ceny odblokujesz jedną fakturą"}
          </p>
          <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.6, margin: 0 }}>
            Plik XML z KSeF, PDF albo zdjęcie faktury od dostawcy. Plik zostaje w Twojej przeglądarce — nic nie wysyłamy, dopóki nie założysz konta. Z pliku XML od razu zaznaczymy w tabeli produkty, które kupujesz.
          </p>
        </div>
        <button style={btn(c)} onClick={() => inputRef.current?.click()}>
          <Upload size={16} /> Wgraj fakturę
        </button>
        <input id={UPLOAD_INPUT_ID} ref={inputRef} type="file" accept=".xml,text/xml,application/xml,application/pdf,.pdf,image/*" style={{ display: "none" }} onChange={(e) => { void data.onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {data.uploadError && (
        <p role="alert" style={{ display: "flex", gap: 8, fontSize: 13, color: c.accentText, margin: "14px 0 0", lineHeight: 1.5 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {data.uploadError}
        </p>
      )}
      <p style={{ fontSize: 12, color: c.muted, margin: "12px 0 0" }}>
        Wystarczy zdjęcie papierowej faktury telefonem. XML pobierzesz z Aplikacji Podatnika KSeF albo od księgowej. <Link href="/podglad-faktury-ksef" style={{ color: c.text }}>Jak otworzyć fakturę XML</Link>
      </p>
    </div>
  );
}

const UPLOAD_INPUT_ID = "market-upload-input";

function DarkCta({ c, unlocked }: { c: MarketingPalette; unlocked: boolean }) {
  return (
    <section style={{ background: "#211B12", color: "#F0E9DB" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 700, margin: "0 0 8px" }}>Dostawca zna ceny wszystkich swoich klientów. Teraz Ty też.</h2>
          <p style={{ fontSize: 15, color: "#C9BEA9", lineHeight: 1.6, margin: 0 }}>
            Podłącz KSeF na darmowym koncie. Każdą pozycję z faktur porównamy z medianą rynku i pokażemy, ile możesz odzyskać na jednej dostawie.
          </p>
        </div>
        {unlocked ? (
          <Link href="/sign-up">
            <button style={{ ...btn(c), background: "#E06A3C", color: "#17130E" }}>Porównaj swoją fakturę <ArrowRight size={16} /></button>
          </Link>
        ) : (
          // Przed odblokowaniem: wybór pliku na tej stronie (nie konwerter XML→PDF).
          <button
            style={{ ...btn(c), background: "#E06A3C", color: "#17130E" }}
            onClick={() => document.getElementById(UPLOAD_INPUT_ID)?.click()}
          >
            <Upload size={16} /> Wgraj fakturę
          </button>
        )}
      </div>
    </section>
  );
}

// ─── Podstrona produktu (/ceny-rynkowe/<slug>) ──────────────────────────────

function ProductView({ c, slug, item, data }: { c: MarketingPalette; slug: string; item: MarketPrice | null; data: MarketData }) {
  const lc = item?.name.toLowerCase() ?? "";
  const unit = item ? UNIT_LABEL[item.unit] ?? item.unit : "kg";
  usePageMeta(
    item
      ? {
          title: `Ile kosztuje ${lc} dla restauracji? Cena za ${unit} | Spendly`,
          description: `Ile restauracje płacą za ${item.unit === "kg" ? "kilogram" : item.unit === "l" ? "litr" : "jednostkę"} produktu „${item.name}”? Mediana cen netto z prawdziwych faktur zakupowych gastronomii z ostatnich 12 miesięcy. Wgraj fakturę i sprawdź, czy przepłacasz.`,
          path: `/ceny-rynkowe/${slug}`,
        }
      : {
          title: "Ceny produktów w gastronomii | Spendly",
          description: "Ile restauracje płacą za produkty — mediana cen z prawdziwych faktur.",
          path: `/ceny-rynkowe/${slug}`,
        },
  );
  useEffect(() => { if (item) track("market_product_view", { product: item.name }); }, [item?.name]);

  if (!item) {
    return (
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 24px" }}>
        {data.prices == null && !data.failed ? (
          <p style={{ color: c.muted }}>Wczytuję ceny…</p>
        ) : (
          <>
            <h1 style={{ ...h1Style, fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>Nie mamy jeszcze ceny tego produktu</h1>
            <p style={{ color: c.muted, margin: "0 0 20px" }}>Produkt pojawia się, gdy kupuje go kilka restauracji.</p>
            <Link href="/ceny-rynkowe"><button style={btn(c)}>Zobacz wszystkie ceny</button></Link>
          </>
        )}
      </section>
    );
  }

  const all = data.prices ?? [];
  const shown = data.showPrice(item);
  const siblings = all.filter((p) => p.group === item.group && p !== item).sort(byGroupThenName);
  const others = all.filter((p) => p.group !== item.group).sort(byGroupThenName).slice(0, 8);
  const period = item.window === "12m" ? `${monthNom(item.fromMonth)} – ${monthNom(item.toMonth)}` : monthNom(item.toMonth);
  const h2: CSSProperties = { fontSize: "clamp(1.3rem, 2.6vw, 1.7rem)", fontWeight: 700, margin: "0 0 12px" };
  const para: CSSProperties = { fontSize: 15, color: c.muted, lineHeight: 1.7, margin: "0 0 14px", maxWidth: 720 };

  return (
    <>
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 32px" }}>
        <p style={{ fontSize: 13, color: c.muted, margin: "0 0 28px" }}>
          <Link href="/kalkulatory"><span style={{ cursor: "pointer" }}>Narzędzia</span></Link> /{" "}
          <Link href="/ceny-rynkowe"><span style={{ cursor: "pointer" }}>Ceny rynkowe</span></Link> / {item.name}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 40, alignItems: "start" }}>
          <div>
            <p style={labelStyle(c)}>{item.group} · cena hurtowa netto za {unit}</p>
            <h1 style={h1Style}>Ile kosztuje {lc} dla restauracji?</h1>
            <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.65, margin: 0, maxWidth: 560 }}>
              Mediana ceny netto za {UNIT_WORD[item.unit] ?? unit} z faktur zakupowych restauracji w Spendly, okres: {period}. Pod jedną nazwą łączymy warianty od różnych dostawców — pochodzenie, klasę i opakowanie.
            </p>
          </div>
          <div style={{ border: `1px solid ${c.border}`, borderTop: `2px solid ${c.text}`, background: c.card, padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.muted }}>Mediana rynku</span>
              {shown && !data.unlocked && <Tag c={c}>Przykład</Tag>}
            </div>
            {shown ? (
              <>
                <p className="num-lg" style={{ fontSize: 44, margin: "10px 0 4px" }}>{zl(item.median)}<span style={{ fontSize: 16, fontWeight: 500, color: c.muted }}> / {unit}</span></p>
                <p className="num" style={{ fontSize: 14, color: c.muted, margin: 0 }}>
                  Środkowa połowa cen: {item.p25 != null && item.p75 != null ? `${zl(item.p25)} – ${zl(item.p75)}` : "—"}
                </p>
                <p style={{ fontSize: 13, color: c.muted, margin: "14px 0 0", lineHeight: 1.6 }}>
                  Płacisz więcej niż {zl(item.p75)}? To więcej niż trzy czwarte restauracji.
                </p>
              </>
            ) : (
              <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, margin: "14px 0 18px" }}>
                <Lock size={16} /> Cenę zobaczysz po wgraniu jednej faktury — XML, PDF albo zdjęcia.
              </p>
            )}
          </div>
        </div>
      </section>

      {!data.unlocked || !shown ? (
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 40px" }}>
          <UnlockBox c={c} data={data} total={all.length} compact />
        </section>
      ) : null}

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 40 }}>
        <div>
          <h2 style={h2}>Od czego zależy cena: {lc}</h2>
          <p style={para}>{GROUP_NOTES[item.group] ?? GROUP_NOTES.Spiżarnia}</p>
          <h2 style={{ ...h2, marginTop: 28 }}>Jak sprawdzić, czy przepłacasz</h2>
          <p style={para}>
            Weź ostatnią fakturę od dostawcy i znajdź na niej {lc}. Porównuj cenę netto za {UNIT_WORD[item.unit] ?? unit} — bez VAT i w tej samej jednostce. Jeśli Twoja cena jest powyżej środkowej połowy cen, warto zapytać dostawcę o rabat albo porównać ofertę z inną hurtownią.
          </p>
          <p style={para}>
            Spendly robi to automatycznie: pobiera faktury z KSeF, rozpisuje ceny każdego produktu i daje znać, gdy dostawca podniesie cenę.
          </p>
        </div>
        <div>
          {siblings.length > 0 && (
            <>
              <h2 style={h2}>Inne ceny: {item.group.toLowerCase()}</h2>
              <ProductLinks c={c} items={siblings} all={all} />
            </>
          )}
          {others.length > 0 && (
            <>
              <h2 style={{ ...h2, marginTop: 28 }}>Pozostałe produkty</h2>
              <ProductLinks c={c} items={others} all={all} />
            </>
          )}
          <p style={{ margin: "20px 0 0" }}>
            <Link href="/ceny-rynkowe" style={{ color: c.text, fontWeight: 600 }}>Wszystkie ceny rynkowe →</Link>
          </p>
        </div>
      </section>

      <DarkCta c={c} unlocked={data.unlocked} />
    </>
  );
}

function ProductLinks({ c, items, all }: { c: MarketingPalette; items: MarketPrice[]; all: MarketPrice[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, borderTop: `1px solid ${c.border}` }}>
      {items.map((p) => (
        <li key={`${p.name}__${p.unit}`} style={{ borderBottom: `1px solid ${c.border}` }}>
          <Link href={`/ceny-rynkowe/${marketSlug(p, all)}`} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", color: c.text, textDecoration: "none", fontSize: 14 }}>
            <span>Ile kosztuje {p.name.toLowerCase()}</span>
            <span style={{ color: c.muted }}>za {UNIT_LABEL[p.unit] ?? p.unit} →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const h1Style: CSSProperties = { fontSize: "clamp(2rem, 6vw, 3.4rem)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 18px", maxWidth: 820 };
const td: CSSProperties = { padding: "12px 16px", fontSize: 14, verticalAlign: "top" };
function labelStyle(c: MarketingPalette): CSSProperties {
  return { fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.accentText, margin: "0 0 12px" };
}
function th(c: MarketingPalette): CSSProperties {
  return { padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${c.border}` };
}
function btn(c: MarketingPalette): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 3, fontSize: 14, fontWeight: 600, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer", fontFamily: FONT };
}
