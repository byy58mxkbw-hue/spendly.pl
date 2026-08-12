// Zestaw regresyjny routingu intencji AI CFO. Uruchom: pnpm --filter @workspace/scripts run eval:ai-intent
// Testuje CZYSTĄ logikę słów-kluczy (bez DB/LLM). Chroni przed przypadkowym zepsuciem
// wykrywania intencji przy edycji list słów-kluczy.
import {
  classifyChatIntent,
  isCheapestSupplierQuery,
  isSupplierPriceChangesQuery,
  isProductPriceHistoryQuery,
  isPriceIncreasesQuery,
  isPriceAlertsQuery,
  isDishMarginsQuery,
  isInvoiceCompareQuery,
  type ChatIntent,
} from "../../artifacts/api-server/src/lib/ai-cfo-intent.ts";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (ok) { passed++; } else { failed++; console.error(`  ✗ ${name}: oczekiwano ${JSON.stringify(expected)}, jest ${JSON.stringify(actual)}`); }
}

// ── Predykaty: pokrycie słów-kluczy (odmiana PL, frazy) ──
check("cheapest: najtaniej", isCheapestSupplierQuery("gdzie kupię cytrynę najtaniej"), true);
check("cheapest: u kogo taniej", isCheapestSupplierQuery("u kogo taniej masło"), true);
check("cheapest: oszczędzę", isCheapestSupplierQuery("ile oszczędzę na oleju"), true);
check("history: cena", isProductPriceHistoryQuery("jaka jest cena cytryny"), true);
check("history: trend/ceny", isProductPriceHistoryQuery("pokaż trend ceny pomidora"), true);
check("increases: co podrożało", isPriceIncreasesQuery("co podrożało w tym miesiącu"), true);
check("increases: drożeją (l.mn.)", isPriceIncreasesQuery("które produkty drożeją"), true);
check("increases: podwyżki", isPriceIncreasesQuery("największe podwyżki cen"), true);
check("alerts: alerty", isPriceAlertsQuery("jakie mam alerty cenowe"), true);
check("alerts: próg", isPriceAlertsQuery("co przekroczyło próg"), true);
check("dish: marża", isDishMarginsQuery("które dania mają najgorszą marżę"), true);
check("dish: food cost", isDishMarginsQuery("jaki jest food cost dań"), true);
check("invoice: porównaj faktury", isInvoiceCompareQuery("porównaj fakturę FV/1 z FV/2"), true);

// ── Negatywy: nie łap tam, gdzie nie trzeba ──
check("neg: wydatki na mięso ≠ cheapest", isCheapestSupplierQuery("ile wydałem na mięso"), false);
check("neg: wydatki na mięso ≠ dish", isDishMarginsQuery("ile wydałem na mięso"), false);
check("neg: alerty ≠ cheapest", isCheapestSupplierQuery("jakie mam alerty"), false);

// ── Zmiany cen wg dostawcy: wymaga OBU sygnałów (dostawca + ruch ceny) ──
check("supplier-chg: dostawca podrożał", isSupplierPriceChangesQuery("który dostawca podrożał najbardziej"), true);
check("supplier-chg: ceny w górę u dostawcy", isSupplierPriceChangesQuery("u którego dostawcy ceny poszły w górę"), true);
check("supplier-chg: sam dostawca to za mało", isSupplierPriceChangesQuery("ile wydałem u tego dostawcy"), false);
check("supplier-chg: sam ruch ceny to za mało", isSupplierPriceChangesQuery("co podrożało"), false);

// ── classifyChatIntent: jednoznaczne przypadki + KLUCZOWA regresja ──
const cls: Array<[string, ChatIntent]> = [
  // Regresja z produkcji: „porównaj cenę cytryny" MUSI iść w historię ceny, NIE w porównanie faktur.
  ["porównaj cenę cytryny z ostatnich 5 faktur", "product_price_history"],
  ["gdzie kupię cytrynę najtaniej", "cheapest_supplier"],
  ["jakie mam alerty cenowe", "price_alerts"],
  ["które dania mają najgorszą marżę", "dish_margins"],
  // Porównanie faktur działa, gdy brak słowa o cenie produktu:
  ["porównaj fakturę FV/123 z FV/124", "invoice_compare"],
  ["ile wydałem u dostawcy w tym miesiącu", "general"],
  // Regresja z produkcji 2026-08-12: pytanie o DOSTAWCĘ łapała historia ceny,
  // nie znajdowała produktu i użytkownik dostawał „brak danych" mimo pełnej bazy.
  ["Który dostawca podrożał najbardziej w tym miesiącu?", "supplier_price_changes"],
  ["u którego dostawcy ceny poszły w górę", "supplier_price_changes"],
  ["czy któryś dostawca staniał", "supplier_price_changes"],
  ["jakie podwyżki dał mi ten dostawca", "supplier_price_changes"],
  // …ale bez słowa o dostawcy NIE idzie w intencję dostawcy. Trafia w
  // product_price_history, bo „podroż" jest też na jej liście i stoi wyżej —
  // to stan zastany, nie regresja. Nie boli, bo fetchProductPriceHistory nie
  // rozpozna produktu, zwróci null i łańcuch ?? spadnie na fetchPriceIncreases.
  ["co podrożało w tym miesiącu", "product_price_history"],
  // …a „gdzie najtaniej" ma pierwszeństwo (to pytanie o zakup, nie o dynamikę):
  ["u kogo taniej masło", "cheapest_supplier"],
];
for (const [q, intent] of cls) check(`classify: "${q}"`, classifyChatIntent(q), intent);

console.log(`\nAI CFO intent eval: ${passed} OK, ${failed} FAIL`);
if (failed > 0) process.exit(1);
