// Food cost i marża dania liczone NETTO do NETTO.
//
// Koszt porcji jest netto (ceny z faktur bez VAT — VAT od zakupów jest odliczany,
// reguła 29), a cena dania w Food Cost to cena z karty, czyli BRUTTO. Dzielenie
// netto przez brutto zaniżało food cost o wartość VAT (audyt 2026-10-01: barszcz
// 48,6% zamiast ~52,5%). Cenę z karty sprowadzamy więc do netto.
//
// Stawka: 8% — VAT na usługi gastronomiczne (jedzenie). Napoje alkoholowe mają 23%,
// ale danie nie ma w bazie własnej stawki; 8% to przybliżenie dla karty jedzenia.
// Ten sam plik ma bliźniaka na froncie: artifacts/ksef-monitor/src/lib/food-cost-math.ts.
export const DISH_VAT_RATE = 0.08;

export function netSellPrice(grossPrice: number): number {
  return grossPrice / (1 + DISH_VAT_RATE);
}

/** Food cost % porcji (netto/netto), zaokrąglony do 0,1. `null` gdy brak danych. */
export function dishFoodCostPct(portionCost: number | null, grossPrice: number): number | null {
  if (portionCost == null || !(grossPrice > 0)) return null;
  return Math.round((portionCost / netSellPrice(grossPrice)) * 1000) / 10;
}

/** Marża % porcji (netto/netto), zaokrąglona do 0,1. `null` gdy brak danych. */
export function dishMarginPct(portionCost: number | null, grossPrice: number): number | null {
  if (portionCost == null || !(grossPrice > 0)) return null;
  const net = netSellPrice(grossPrice);
  return Math.round(((net - portionCost) / net) * 1000) / 10;
}
