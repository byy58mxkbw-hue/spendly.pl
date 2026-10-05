import { RefreshCw, Package, Receipt } from "@/lib/icons";

// „Jak to działa” na stronie głównej — telefon z trzema ekranami aplikacji, które
// zmieniają się co 4 s, i trzy kroki obok podświetlane w tym samym rytmie (wzór:
// hero inFaktu). Ekrany: synchronizacja KSeF → Produkty → Faktury (decyzja usera
// 2026-10-05: pokazujemy realne ekrany aplikacji, nie food cost).
// Czysty CSS (landing.css → .hiw-*), zero JS. Przy prefers-reduced-motion telefon
// pokazuje statycznie ekran Produktów, a kroki są widoczne wszystkie naraz.

const STEPS = [
  {
    Icon: RefreshCw,
    h: "Synchronizacja z KSeF",
    p: "Podajesz NIP i token, a Spendly sam pobiera faktury zakupowe od wszystkich dostawców. Bez skanowania i przepisywania.",
  },
  {
    Icon: Package,
    h: "Produkty z aktualnymi cenami",
    p: "Każda pozycja z faktury trafia do listy produktów. Widzisz ostatnią cenę, dostawcę i to, o ile cena zmieniła się od poprzedniej dostawy.",
  },
  {
    Icon: Receipt,
    h: "Wszystkie faktury w jednym miejscu",
    p: "Faktury z KSeF i ze zdjęć są uporządkowane po dniach i dostawcach, z kwotami i terminami płatności.",
  },
];

const PRODUCTS = [
  { n: "Masło extra 82%", s: "Makro · 1 kg", p: "31,80 zł", d: "+18,2%", up: true },
  { n: "Karkówka wieprzowa", s: "Bidfood · 1 kg", p: "21,40 zł", d: "+9,7%", up: true },
  { n: "Pomidory malinowe", s: "Makro · 1 kg", p: "12,90 zł", d: "−6,3%", up: false },
  { n: "Mąka pszenna typ 450", s: "Chefs Culinar · 1 kg", p: "3,10 zł", d: "0,0%", up: null },
];

const INVOICES = [
  { n: "Makro Cash and Carry", s: "FV/10/1482 · dziś", p: "4 812,40 zł" },
  { n: "Bidfood Farutex", s: "FS/2026/8841 · dziś", p: "2 106,15 zł" },
  { n: "Chefs Culinar", s: "302536583 · wczoraj", p: "1 446,78 zł" },
  { n: "Hurtownia Warzyw Jan", s: "12/10/2026 · wczoraj", p: "684,00 zł" },
];

export function HowItWorksPhone() {
  return (
    <div className="hiw">
      <div className="hiw-phone" aria-hidden="true">
        <div className="hiw-notch" />
        <div className="hiw-screen">
          {/* Ekran 1 — synchronizacja z KSeF */}
          <div className="hiw-scr s1">
            <div className="hiw-status"><span>06:00</span><span>KSeF</span></div>
            <div className="hiw-ok spin"><RefreshCw /></div>
            <p className="hiw-t">Synchronizacja z KSeF</p>
            <p className="hiw-s">NIP 526-***-**-95 · pobieranie faktur</p>
            <div className="hiw-bar"><i className="grow" /></div>
            <div className="hiw-card">
              <div className="hiw-row"><span>Nowe faktury</span><b className="num">23</b></div>
              <div className="hiw-row"><span>Dostawcy</span><b className="num">8</b></div>
              <div className="hiw-row"><span>Pozycje</span><b className="num">412</b></div>
              <div className="hiw-row tot ok"><span>Status</span><b>gotowe</b></div>
            </div>
            <p className="hiw-note">Kolejna synchronizacja automatycznie</p>
          </div>

          {/* Ekran 2 — produkty */}
          <div className="hiw-scr s2">
            <div className="hiw-status"><span>06:01</span><span>Produkty</span></div>
            <p className="hiw-h">Produkty</p>
            <div className="hiw-list">
              {PRODUCTS.map((x) => (
                <div className="hiw-li" key={x.n}>
                  <div className="hiw-li-l"><b>{x.n}</b><span>{x.s}</span></div>
                  <div className="hiw-li-r">
                    <b className="num">{x.p}</b>
                    <span className={`num ${x.up === true ? "bad" : x.up === false ? "good" : ""}`}>{x.d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ekran 3 — faktury */}
          <div className="hiw-scr s3">
            <div className="hiw-status"><span>06:01</span><span>Faktury</span></div>
            <p className="hiw-h">Faktury</p>
            <div className="hiw-sum"><span>Październik</span><b className="num">48 216,90 zł</b></div>
            <div className="hiw-list">
              {INVOICES.map((x) => (
                <div className="hiw-li" key={x.s}>
                  <div className="hiw-li-l"><b>{x.n}</b><span>{x.s}</span></div>
                  <div className="hiw-li-r"><b className="num">{x.p}</b><span className="tag">KSeF</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ol className="hiw-steps">
        {STEPS.map(({ Icon, h, p }, i) => (
          <li className={`hiw-step st${i + 1}`} key={h}>
            <span className="hiw-ic"><Icon /></span>
            <div>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
