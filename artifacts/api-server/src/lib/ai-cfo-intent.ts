// Routing intencji AI CFO — jedno źródło prawdy słów-kluczy + klasyfikator.
// Czysty moduł (bez DB), żeby dało się go testować headless (scripts/…eval.ts).
//
// UWAGA: klasyfikator zwraca intencję WYŁĄCZNIE po słowach-kluczach. Rzeczywiste
// wstrzyknięcie bloku danych zależy dodatkowo od rozpoznania encji / istnienia danych
// (np. produkt musi się dopasować, dania muszą istnieć) — to gwarantują funkcje fetch*.
// Precedencja klasyfikatora MUSI odpowiadać kolejności ?? w handlerze /ai-cfo/chat.

export type ChatIntent =
  | "cheapest_supplier"
  | "product_price_history"
  | "price_increases"
  | "price_alerts"
  | "dish_margins"
  | "invoice_compare"
  | "general";

export const INTENT_KEYWORDS = {
  cheapest_supplier: [
    "najtaniej", "najtańsz", "gdzie kupić", "gdzie kupię", "u kogo", "gdzie najtaniej",
    "taniej kupić", "oszczęd", "najlepsza cena", "najlepszej cenie", "który dostawca tańsz",
  ],
  product_price_history: [
    "cena", "cenę", "ceny", "cenie", "kosztuje", "kosztował", "podroż", "potani",
    "drożej", "taniej", "historia cen", "historię cen", "trend", "po ile", "ile płac",
  ],
  price_increases: [
    "podrożał", "podrożec", "podwyżk", "drożej", "wzrost cen", "wzrosły ceny",
    "co zdrożało", "zdrożał", "rosną ceny", "największe podwyżki", "co poszło w górę",
  ],
  price_alerts: [
    "alert", "alerty", "alertów", "próg", "progu", "progi", "przekroczył", "przekroczen",
    "monitoruj", "powiadomieni", "co się uruchomiło",
  ],
  dish_margins: [
    "food cost", "foodcost", "food-cost", "marża", "marże", "marży", "marżą", "rentown",
    "opłacaln", "które dania", "najgorsza marża", "najlepsza marża", "koszt dania", "koszt potrawy",
  ],
  invoice_compare: ["porównaj", "porówna", "zestawien", "zestawie", "porównan"],
} as const;

const matches = (q: string, keys: readonly string[]): boolean => {
  const lower = q.toLowerCase();
  return keys.some((k) => lower.includes(k));
};

export const isCheapestSupplierQuery = (q: string): boolean => matches(q, INTENT_KEYWORDS.cheapest_supplier);
export const isProductPriceHistoryQuery = (q: string): boolean => matches(q, INTENT_KEYWORDS.product_price_history);
export const isPriceIncreasesQuery = (q: string): boolean => matches(q, INTENT_KEYWORDS.price_increases);
export const isPriceAlertsQuery = (q: string): boolean => matches(q, INTENT_KEYWORDS.price_alerts);
export const isDishMarginsQuery = (q: string): boolean => matches(q, INTENT_KEYWORDS.dish_margins);
export const isInvoiceCompareQuery = (q: string): boolean => matches(q, INTENT_KEYWORDS.invoice_compare);

// Precedencja == kolejność ?? w handlerze: najtańszy > historia ceny > podwyżki >
// alerty > marże dań > porównanie faktur > (kontekst ogólny).
export function classifyChatIntent(question: string): ChatIntent {
  if (isCheapestSupplierQuery(question)) return "cheapest_supplier";
  if (isProductPriceHistoryQuery(question)) return "product_price_history";
  if (isPriceIncreasesQuery(question)) return "price_increases";
  if (isPriceAlertsQuery(question)) return "price_alerts";
  if (isDishMarginsQuery(question)) return "dish_margins";
  if (isInvoiceCompareQuery(question)) return "invoice_compare";
  return "general";
}
