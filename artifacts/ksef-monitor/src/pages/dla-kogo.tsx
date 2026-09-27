import { Link } from "wouter";
import {
  ArrowRight, ChevronRight, UtensilsCrossed, Pizza, Coffee, PintGlass,
  Zap, Fish, Cow, Hotel, Truck, Users, ShoppingBag, Building2,
} from "@/lib/icons";
import { useMarketingTheme } from "@/lib/marketing-theme";
import { MarketingNavBar, MarketingFooter } from "@/components/marketing-shell";

const INDUSTRIES = [
  { Icon: UtensilsCrossed, h: "Restauracje i bistra", p: "Pilnuj food costu i cen surowców z faktur, zanim podwyżka zje marżę dania." },
  { Icon: Pizza, h: "Pizzerie", p: "Mąka, mozzarella i szynka drożeją w różnym tempie — widzisz, który surowiec podnosi food cost pizzy najszybciej." },
  { Icon: Coffee, h: "Kawiarnie i cukiernie", p: "Kawa, mleko i masło to towary o dużej zmienności cen — food cost wypieków i napojów liczy się sam, bez Excela." },
  { Icon: PintGlass, h: "Bary i puby", p: "Alkohol, piwo i przekąski od różnych dostawców — jedna historia cen zamiast rozrzuconych faktur." },
  { Icon: Zap, h: "Fast food i szybka obsługa", p: "Wysoki wolumen, niska marża na sztuce — nawet drobny wzrost ceny bułki czy oleju widać w food coście od razu." },
  { Icon: Fish, h: "Sushi i restauracje rybne", p: "Ryby i owoce morza mają najbardziej zmienne ceny na rynku — alert ostrzega, zanim dostawca podniesie cenę łososia bez zapowiedzi." },
  { Icon: Cow, h: "Steakhouse i grille", p: "Mięso to zwykle największa pozycja w karcie — food cost dania liczony z aktualnej ceny zakupu, nie z cennika sprzed miesiąca." },
  { Icon: Hotel, h: "Hotele i pensjonaty", p: "Gastronomia hotelowa, bufet i room service — koszty wielu punktów w jednym miejscu." },
  { Icon: Truck, h: "Catering, eventy i food trucki", p: "Zmienne wolumeny zakupów pod imprezy i różne punkty sprzedaży — ceny dostawców pod kontrolą niezależnie od miejsca." },
  { Icon: Users, h: "Stołówki i żywienie zbiorowe", p: "Szkoły, żłobki i zakłady pracy liczą koszt posiłku do grosza — food cost pokazany na osobę, nie tylko na danie." },
  { Icon: ShoppingBag, h: "Ghost kitchens i dostawy online", p: "Zamówienia tylko na wynos i dowóz nie zmieniają matematyki food costu — kontrolujesz marżę tak samo, jak w lokalu ze stolikami." },
  { Icon: Building2, h: "Sieci, franczyzy i grupy", p: "Wiele lokali, centra kosztów i role — raporty konsolidowane i porównanie food costu między lokalami całej grupy." },
];

const DEEP_DIVES = [
  {
    h: "Food cost w restauracji i bistrze",
    p: "W pojedynczej restauracji food cost potrafi się rozjechać już przy kilku podwyżkach cen surowców w miesiącu — mięso, nabiał i warzywa zmieniają cenę u tego samego dostawcy niezależnie od siebie. Spendly liczy koszt każdego dania z aktualnej ceny zakupu z ostatniej faktury, więc marża w karcie menu nie jest liczona na oko ani raz na kwartał.",
  },
  {
    h: "Food cost w hotelu — bufet, bankiety, room service",
    p: "Gastronomia hotelowa ma kilka punktów kosztowych naraz: śniadaniowy bufet, bankiety na zamówienie i room service, każdy z innym zużyciem tych samych surowców. Centra kosztów w Spendly pozwalają rozdzielić wydatki na poszczególne punkty i pilnować food costu osobno dla każdego z nich, zamiast jednej uśrednionej liczby dla całego hotelu.",
  },
  {
    h: "Food cost w cateringu i food truckach",
    p: "Catering i food trucki kupują pod konkretne zamówienia i wydarzenia, więc wolumeny i dostawcy zmieniają się z tygodnia na tydzień. Spendly zbiera faktury od wszystkich dostawców w jedną historię cen, dzięki czemu widać, czy dany dostawca był faktycznie tańszy na danym evencie, czy tylko tak wyglądało w danym momencie.",
  },
  {
    h: "Food cost w sieciach i franczyzach gastronomicznych",
    p: "Przy kilku lub kilkunastu lokalach największym ryzykiem jest to, że każdy lokal negocjuje z dostawcami osobno i nikt nie widzi całości. Spendly konsoliduje faktury ze wszystkich lokali i pokazuje, który punkt płaci więcej za ten sam produkt — to gotowy argument do centralnych negocjacji z dostawcami dla całej sieci.",
  },
  {
    h: "Food cost w barach, pubach i kawiarniach",
    p: "W barach i kawiarniach food cost liczy się nie tylko dla jedzenia, ale i dla napojów — piwa, alkoholu, kawy i mleka, które też mają swoją historię cen u dostawców. Spendly traktuje każdą pozycję z faktury tak samo, więc marża na drinku czy kawie jest liczona równie dokładnie jak marża na daniu z kuchni.",
  },
  {
    h: "Food cost w żywieniu zbiorowym — stołówki, szkoły, zakłady pracy",
    p: "Stołówki i kantyny rozliczają koszt posiłku najczęściej na osobę, w ramach stawki dziennej czy budżetu na ucznia lub pracownika. Spendly pokazuje food cost na porcję z realnych cen zakupu, więc łatwiej upilnować, żeby stawka żywieniowa się spinała nawet przy rosnących cenach surowców.",
  },
];

export default function DlaKogoPage() {
  const { theme, c, toggle } = useMarketingTheme();

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "'Inter Variable', system-ui, sans-serif", minHeight: "100vh", transition: "background 0.3s, color 0.3s" }}>
      <MarketingNavBar c={c} theme={theme} onToggle={toggle} />

      <main>
        {/* HERO */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 64px" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 2, border: `1px solid ${c.accentDim}`, background: c.accentDim, color: c.accentText, fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
              <UtensilsCrossed size={12} style={{ color: c.accent }} />
              Dla każdej branży gastronomicznej
            </div>
            <h1 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(2rem, 5vw, 3.2rem)", fontWeight: 600, letterSpacing: 0, lineHeight: 1.1, marginBottom: 20, color: c.text }}>
              Kontrola food costu<br />
              <span style={{ color: c.accentText }}>dopasowana do Twojej branży</span>
            </h1>
            <p style={{ fontSize: 17, color: c.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 36 }}>
              Od pizzerii przez hotel po sieć restauracji — wszędzie tam, gdzie faktury i ceny surowców decydują o marży, Spendly liczy food cost automatycznie z realnych cen zakupu.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/sign-up">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 3, fontSize: 14, fontWeight: 600, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer" }}>
                  Wypróbuj za darmo <ArrowRight size={16} />
                </button>
              </Link>
              <Link href="/food-cost">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 3, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer" }}>
                  Kontrola food cost
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* SIATKA BRANŻ */}
        <section style={{ borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}`, background: c.panel }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>Dla kogo</p>
              <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, color: c.text, margin: 0 }}>
                12 branż, jeden sposób liczenia food costu
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 1, background: c.border, border: `1px solid ${c.border}` }}>
              {INDUSTRIES.map(({ Icon, h, p }) => (
                <div key={h} style={{ background: c.card, padding: "26px 24px" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 3, background: c.accentDim, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <Icon size={18} style={{ color: c.accent }} />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: c.text, marginBottom: 8 }}>{h}</h3>
                  <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.6, margin: 0 }}>{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* POGŁĘBIONE OPISY — SEO */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: c.accentText, textTransform: "uppercase", marginBottom: 12 }}>Branża po branży</p>
            <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, color: c.text, margin: 0 }}>
              Jak food cost wygląda w praktyce w różnych segmentach
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48 }}>
            {DEEP_DIVES.map(({ h, p }) => (
              <div key={h}>
                <h3 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: 17, fontWeight: 600, color: c.text, marginBottom: 12, lineHeight: 1.35 }}>{h}</h3>
                <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.75, margin: 0 }}>{p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>
          <div style={{ background: c.panel, border: `1px solid ${c.accentDim}`, borderRadius: 4, padding: "60px 40px", textAlign: "center" }}>
            <h2 style={{ fontFamily: "'Baloo 2 Variable', system-ui, sans-serif", fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 600, color: c.text, marginBottom: 16 }}>
              Zobacz food cost swojej branży na realnych danych
            </h2>
            <p style={{ fontSize: 15, color: c.muted, maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.65 }}>
              Podłącz KSeF albo wgraj faktury przez OCR — pierwsze wyliczenia zobaczysz już po kilku zaimportowanych fakturach.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/sign-up">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 3, fontSize: 14, fontWeight: 700, background: c.accent, color: c.onAccent, border: "none", cursor: "pointer" }}>
                  Wypróbuj za darmo <ArrowRight size={16} />
                </button>
              </Link>
              <Link href="/porownanie-cen">
                <button style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 3, fontSize: 14, fontWeight: 500, background: "none", border: `1px solid ${c.border}`, color: c.text, cursor: "pointer" }}>
                  Porównanie cen <ChevronRight size={16} />
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
