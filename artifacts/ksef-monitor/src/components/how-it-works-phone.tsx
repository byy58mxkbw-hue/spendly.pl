import { Receipt, TrendingUp, Calculator, Check, BellRing } from "@/lib/icons";

// „Jak to działa” na stronie głównej — telefon z trzema ekranami, które zmieniają
// się co 4 s, i trzy kroki obok podświetlane w tym samym rytmie (wzór: hero inFaktu).
// Czysty CSS (landing.css → .hiw-*), zero JS. Przy prefers-reduced-motion telefon
// pokazuje statycznie ekran alertu, a kroki są widoczne wszystkie naraz.
// Liczby są spójne z makietą dashboardu w hero (Masło extra 82%, Makro, +18,2%).

const STEPS = [
  {
    Icon: Receipt,
    h: "Faktura wpada sama z KSeF",
    p: "Spendly pobiera faktury zakupowe dla Twojego NIP-u. Bez skanowania i przepisywania pozycji.",
  },
  {
    Icon: TrendingUp,
    h: "Wyłapujemy podwyżkę od razu",
    p: "Każda cena jest porównywana z poprzednią dostawą. Gdy surowiec drożeje, dostajesz alert jeszcze tego samego dnia.",
  },
  {
    Icon: Calculator,
    h: "Widzisz, ile tracisz na daniu",
    p: "Food cost dań z tym surowcem przelicza się sam, więc wiesz, którą cenę w karcie poprawić albo z kim negocjować.",
  },
];

export function HowItWorksPhone() {
  return (
    <div className="hiw">
      <div className="hiw-phone" aria-hidden="true">
        <div className="hiw-notch" />
        <div className="hiw-screen">
          {/* Ekran 1 — faktura z KSeF */}
          <div className="hiw-scr s1">
            <div className="hiw-status"><span>06:02</span><span>KSeF</span></div>
            <div className="hiw-ok"><Check /></div>
            <p className="hiw-t">Nowa faktura z KSeF</p>
            <p className="hiw-s">pobrana automatycznie</p>
            <div className="hiw-card">
              <div className="hiw-row"><span>Dostawca</span><b>Makro</b></div>
              <div className="hiw-row"><span>Numer</span><b className="num">FV/10/1482</b></div>
              <div className="hiw-row"><span>Pozycje</span><b className="num">23</b></div>
              <div className="hiw-row tot"><span>Razem brutto</span><b className="num">4 812,40 zł</b></div>
            </div>
          </div>

          {/* Ekran 2 — alert o podwyżce */}
          <div className="hiw-scr s2">
            <div className="hiw-status"><span>06:03</span><span>Alert</span></div>
            <div className="hiw-ok warn"><BellRing /></div>
            <p className="hiw-t">Podwyżka u dostawcy</p>
            <p className="hiw-s">Masło extra 82%, 1 kg · Makro</p>
            <div className="hiw-card">
              <div className="hiw-row"><span>Poprzednio</span><b className="num">26,90 zł</b></div>
              <div className="hiw-row"><span>Teraz</span><b className="num">31,80 zł</b></div>
              <div className="hiw-row tot bad"><span>Zmiana</span><b className="num">+18,2%</b></div>
            </div>
            <p className="hiw-note">Surowiec występuje w 4 daniach</p>
          </div>

          {/* Ekran 3 — food cost dania */}
          <div className="hiw-scr s3">
            <div className="hiw-status"><span>06:03</span><span>Food cost</span></div>
            <p className="hiw-t">Pierogi ruskie na maśle</p>
            <p className="hiw-s">cena w karcie 32 zł</p>
            <div className="hiw-fc">
              <div><span>było</span><b className="num">29,8%</b></div>
              <div className="arrow">→</div>
              <div><span>teraz</span><b className="num bad">32,6%</b></div>
            </div>
            <div className="hiw-bar"><i style={{ width: "54%" }} /></div>
            <div className="hiw-card">
              <div className="hiw-row"><span>Koszt porcji</span><b className="num">+0,83 zł</b></div>
              <div className="hiw-row"><span>Miesięcznie</span><b className="num">≈ −330 zł marży</b></div>
            </div>
            <p className="hiw-note">Sprawdź tańszego dostawcę albo cenę w karcie</p>
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
