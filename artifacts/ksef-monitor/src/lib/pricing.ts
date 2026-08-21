// JEDNO ŹRÓDŁO PRAWDY dla planów cenowych.
//
// Do 2026-08 cennik istniał w TRZECH kopiach — home.tsx (JSX), cennik.tsx (lokalna
// tablica) i prerender w index.html — i wszystkie się rozjechały: „OCR do 50 FAKTUR"
// vs „OCR PARAGONÓW do 50" (inne znaczenie), Pro miał 5 pozycji na landingu i 6 na
// /cennik, a prerender pokazywał cenę 200 zł, której nie było nigdzie indziej.
// Komentarz „plany spójne z landingiem" niczego nie wymuszał.
//
// Stylowanie NIE jest tu ujednolicone i nie musi być: landing renderuje to klasami
// CSS, /cennik stylami inline. Wspólne są DANE — one się rozjeżdżały, nie wygląd.
//
// `tier` wiąże marketing z uprawnieniami z backendu (`lib/ai-plan.ts`, reguła 24).

export type PlanTier = "free" | "pro" | "business";

export type Plan = {
  id: "start" | "pro" | "siec";
  tier: PlanTier;
  name: string;
  price: string;
  /** Jednostka po cenie. `null` = plan bez ceny („Wycena”) — zastępuje warunek
   *  `price !== "Wycena"`, który był wcześniej zaszyty w JSX obu stron. */
  unit: string | null;
  highlight: boolean;
  desc: string;
  features: string[];
  cta: string;
  href: string;
};

export const PLANS: readonly Plan[] = [
  {
    id: "start",
    tier: "free",
    name: "Start",
    price: "0",
    unit: "zł/mies.",
    highlight: false,
    desc: "Dla jednego lokalu, który dopiero zaczyna porządkować faktury.",
    features: [
      "1 lokal",
      "Faktury z KSeF bez limitu",
      "OCR paragonów do 50 / mies.",
      "Podstawowe alerty cenowe",
    ],
    cta: "Zacznij za darmo",
    href: "/sign-up",
  },
  {
    id: "pro",
    tier: "pro",
    name: "Pro",
    price: "199",
    unit: "zł/mies.",
    highlight: true,
    desc: "Dla restauracji, które chcą realnie kontrolować food cost.",
    features: [
      "Do 3 lokali",
      "Faktury z KSeF bez limitu",
      "Nielimitowany OCR paragonów",
      "Porównanie dostawców",
      "Food cost i receptury",
      "Asystent AI",
    ],
    cta: "Wybierz Pro",
    href: "/sign-up",
  },
  {
    id: "siec",
    tier: "business",
    name: "Sieć",
    price: "Wycena",
    unit: null,
    highlight: false,
    desc: "Dla grup gastronomicznych i hoteli z wieloma lokalami.",
    features: [
      "Nielimitowane lokale",
      "Centra kosztów i role",
      "Raporty konsolidowane",
      "Dedykowany opiekun",
    ],
    cta: "Umów rozmowę",
    href: "mailto:kontakt@spendly.pl",
  },
] as const;

/** Zdanie pod nagłówkiem cennika — wspólne dla obu stron. */
export const PRICING_NOTE =
  "Obecnie pełny dostęp bezpłatnie w okresie testowym — ceny poniżej wejdą po jego zakończeniu. Bez ukrytych opłat, anulujesz kiedy chcesz.";
