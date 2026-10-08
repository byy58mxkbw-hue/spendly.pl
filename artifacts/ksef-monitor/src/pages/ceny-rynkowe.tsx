import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { ArrowRight, Lock, Upload } from "@/lib/icons";
import { useMarketingTheme, type MarketingPalette } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/use-page-meta";
import { apiUrl } from "@/lib/api-base";
import { track } from "@/lib/posthog";

/**
 * Publiczne ceny rynkowe („wędka” dla gastronomii, decyzja usera 2026-10-08: dokładna
 * mediana i widełki). Dane: GET /api/public/market-prices — mediana i środkowa połowa cen
 * NETTO z faktur restauracji w Spendly, tylko produkty bazowe ze słownika i tylko grupy
 * powyżej progu anonimowości. Prerender (scripts/prerender-marketing.mjs) wpisuje ceny
 * w statyczny HTML i w <script type="application/json" id="market-prices-data">, żeby
 * Google je widział, a przeglądarka nie migała pustą tabelą przed odświeżeniem.
 */

export type MarketPrice = {
  name: string; unit: string; group: string; median: number; p25: number | null; p75: number | null;
  window: "12m" | "month"; fromMonth: string; toMonth: string;
};

export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Skąd pochodzą te ceny?",
    a: "Z faktur zakupowych restauracji, które korzystają ze Spendly — głównie pobranych automatycznie z KSeF. Pokazujemy medianę cen netto, czyli wartość środkową: połowa restauracji płaci mniej, połowa więcej.",
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
  {
    q: "Jak sprawdzić, czy ja płacę więcej?",
    a: "Wgraj fakturę XML z KSeF w podglądzie faktury albo podłącz KSeF na darmowym koncie. Spendly porówna każdą pozycję z medianą rynku i pokaże, ile możesz odzyskać.",
  },
];

const FONT = "'Space Grotesk Variable', system-ui, sans-serif";
const zl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł");
const UNIT_LABEL: Record<string, string> = { kg: "kg", szt: "szt.", l: "l", opak: "opak.", kart: "karton", g: "g" };
const MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m ? `${MONTHS[m - 1]} ${y}` : ym; };
const GROUP_ORDER = ["Warzywa", "Owoce", "Zioła", "Mięso i ryby", "Nabiał", "Spiżarnia"];

declare global {
  // eslint-disable-next-line no-var
  var __SPENDLY_MARKET_PRICES__: MarketPrice[] | undefined;
}

function initialPrices(): MarketPrice[] | null {
  if (typeof document === "undefined") return globalThis.__SPENDLY_MARKET_PRICES__ ?? null; // prerender
  try {
    const el = document.getElementById("market-prices-data");
    return el?.textContent ? (JSON.parse(el.textContent) as MarketPrice[]) : null;
  } catch {
    return null;
  }
}

export default function CenyRynkowePage() {
  usePageMeta({
    title: "Ceny produktów w gastronomii — ile płacą restauracje | Spendly",
    description:
      "Ceny, których dostawca Ci nie pokaże: ile inne restauracje płacą za mięso, warzywa, nabiał i resztę zakupów. Mediana z prawdziwych faktur, codziennie.",
    path: "/ceny-rynkowe",
  });
  const { theme, c, toggle } = useMarketingTheme();
  const [prices, setPrices] = useState<MarketPrice[] | null>(initialPrices);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState<string>("Wszystkie");

  useEffect(() => {
    track("market_prices_view");
    fetch(apiUrl("/api/public/market-prices"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: MarketPrice[] }) => setPrices(d.items))
      .catch(() => setFailed(true));
  }, []);

  const groups = useMemo(() => {
    const present = new Set((prices ?? []).map((p) => p.group));
    return ["Wszystkie", ...GROUP_ORDER.filter((g) => present.has(g))];
  }, [prices]);
  // Kolejność grup jak w haśle strony: najpierw warzywa, owoce i zioła.
  const rank = (g: string) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
  const visible = (prices ?? [])
    .filter((p) => group === "Wszystkie" || p.group === group)
    .sort((a, b) => rank(a.group) - rank(b.group) || a.name.localeCompare(b.name, "pl"));
  const latest = (prices ?? []).reduce<string | null>((m, p) => (m == null || p.toMonth > m ? p.toMonth : m), null);

  const label: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: c.accentText, margin: "0 0 12px" };

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: FONT, minHeight: "100vh" }}>
      <MarketingNavBar c={c} theme={theme} onToggle={toggle} />
      <main>
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 28px" }}>
          <p style={{ fontSize: 13, color: c.muted, margin: "0 0 28px" }}>
            <Link href="/kalkulatory"><span style={{ cursor: "pointer" }}>Narzędzia</span></Link> / Ceny rynkowe
          </p>
          <p style={label}>Ceny rynkowe{latest ? ` · dane do ${monthLabel(latest)}` : ""}</p>
          <h1 style={{ fontSize: "clamp(2rem, 6vw, 3.4rem)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 18px", maxWidth: 820 }}>
            Ceny, których dostawca Ci nie pokaże
          </h1>
          <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.65, margin: "0 0 24px", maxWidth: 680 }}>
            Ile inne restauracje płacą za mięso, warzywa, nabiał i resztę zakupów. Mediana cen netto z prawdziwych faktur, aktualizowana codziennie. Jeśli płacisz powyżej środkowej połowy cen — przepłacasz.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/podglad-faktury-ksef">
              <button style={btn(c)}><Upload size={16} /> Sprawdź, czy przepłacasz — wgraj fakturę</button>
            </Link>
            <Link href="/sign-up">
              <button style={{ ...btn(c), background: "none", color: c.text, border: `1px solid ${c.border}` }}>Załóż darmowe konto</button>
            </Link>
          </div>
        </section>

        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 24px 56px" }}>
          <div role="tablist" aria-label="Grupa produktów" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
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
            <p style={{ color: c.muted, fontSize: 14, padding: "24px 0" }}>{failed ? "Nie udało się wczytać cen. Spróbuj odświeżyć stronę." : "Wczytuję ceny…"}</p>
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
                    <tr key={`${p.name}__${p.unit}`} style={{ borderTop: `1px solid ${c.border}` }}>
                      <td style={td}>
                        <b>{p.name}</b> <span style={{ color: c.muted, fontSize: 13 }}>za {UNIT_LABEL[p.unit] ?? p.unit}</span>
                        <div style={{ fontSize: 12, color: c.muted }}>{p.group}</div>
                      </td>
                      <td className="num" style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 16 }}>{zl(p.median)}</td>
                      <td className="num" style={{ ...td, textAlign: "right", color: c.muted }}>
                        {p.p25 != null && p.p75 != null ? `${zl(p.p25)} – ${zl(p.p75)}` : "—"}
                      </td>
                      <td style={{ ...td, fontSize: 13, color: c.muted }}>{p.window === "12m" ? "ostatnie 12 mies." : monthLabel(p.toMonth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: c.muted, margin: 0, padding: "12px 16px", borderTop: `1px solid ${c.border}` }}>
                <Lock size={13} /> Ceny netto. Produkt pokazujemy dopiero, gdy kupuje go kilka restauracji — nikt nie zobaczy cen konkretnego lokalu ani dostawcy.
              </p>
            </div>
          )}
        </section>

        <section style={{ background: "#211B12", color: "#F0E9DB" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ maxWidth: 640 }}>
              <h2 style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 700, margin: "0 0 8px" }}>Dostawca zna ceny wszystkich swoich klientów. Teraz Ty też.</h2>
              <p style={{ fontSize: 15, color: "#C9BEA9", lineHeight: 1.6, margin: 0 }}>
                Wgraj plik XML z KSeF. Każdą pozycję porównamy z medianą rynku i pokażemy, ile możesz odzyskać na jednej dostawie.
              </p>
            </div>
            <Link href="/podglad-faktury-ksef">
              <button style={{ ...btn(c), background: "#E06A3C", color: "#17130E" }}>Porównaj swoją fakturę <ArrowRight size={16} /></button>
            </Link>
          </div>
        </section>

        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 40 }}>
          <div>
            <p style={label}>FAQ</p>
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

const td: CSSProperties = { padding: "12px 16px", fontSize: 14, verticalAlign: "top" };
function th(c: MarketingPalette): CSSProperties {
  return { padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${c.border}` };
}
function btn(c: MarketingPalette): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 3, fontSize: 14, fontWeight: 600, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer", fontFamily: FONT };
}
