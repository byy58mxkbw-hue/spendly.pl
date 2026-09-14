import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock klienta OpenAI (wzorzec mockowania modułu jak @clerk/express w innych testach) —
// categorize-ai.ts importuje `openai` z tego pakietu jako binding ewaluowany raz przy
// imporcie, więc trzeba zamockować CAŁY moduł przed importem categorize-ai.ts.
const createMock = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: (...args: unknown[]) => createMock(...args) } } },
  aiObservabilityEnabled: false,
}));

// recordBrandDetection/recordCategoryTermDetection dotykają bazy (fire-and-forget) —
// w tym pliku testujemy tylko SAM pipeline decyzyjny (który krok wygrywa, co zwraca),
// nie efekty uboczne zapisu do learned_brands/learned_category_terms (te mają własne
// DB-gated testy: learned-brands.test.ts, learned-category-terms.test.ts).
vi.mock("./learned-brands.js", () => ({
  matchLearnedBrand: vi.fn().mockResolvedValue(null),
  recordBrandDetection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./learned-category-terms.js", () => ({
  matchLearnedCategoryTerm: vi.fn().mockResolvedValue(null),
  recordCategoryTermDetection: vi.fn().mockResolvedValue(undefined),
}));
const matchLearnedUserTermMock = vi.fn().mockResolvedValue(null);
vi.mock("./learned-user-terms.js", () => ({
  matchLearnedUserTerm: (...args: unknown[]) => matchLearnedUserTermMock(...args),
  recordUserCorrectionTerms: vi.fn().mockResolvedValue(undefined),
}));
// getUserCategories/getLatestCorrection uderzają w DB — nie potrzebne dla testów
// czystego pipeline'u (brak korekty, lista kategorii nieużywana gdy AI nie jest wołane;
// gdy AI JEST wołane, przekazujemy userCategories jawnie w argumencie, więc DB i tak
// nie jest odpytywane w tych testach).
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
  },
  userCategoriesTable: {},
  productCorrectionsTable: {},
}));

import { categorizeProductWithAI } from "./categorize-ai";
import { recordBrandDetection } from "./learned-brands.js";
import { recordCategoryTermDetection } from "./learned-category-terms.js";

const USER = "test_categorize_ai_user";
const CATS = [
  { id: "sery", label: "Sery" },
  { id: "napoje", label: "Napoje" },
  { id: "inne", label: "Inne" },
];

function mockAiResponse(payload: Record<string, unknown>): void {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(payload) } }] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("categorizeProductWithAI: keyword/brand wygrywa bez wołania AI", () => {
  it('dopasowanie keywordu bez marki ("twaróg wiejski") zwraca wynik bez wywołania OpenAI', async () => {
    const result = await categorizeProductWithAI("Twarog Wiejski 500g", USER, undefined, undefined, CATS);
    expect(result.category).toBe("sery");
    expect(result.confidence).toBe(0.9);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('dopasowanie marki (brand-map, "coca-cola") zwraca wynik bez wywołania OpenAI', async () => {
    const result = await categorizeProductWithAI("Coca-Cola 1L", USER, undefined, undefined, CATS);
    expect(result.category).toBe("napoje");
    expect(result.confidence).toBe(0.92);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("Z-user (term nauczony z ręcznej korekty TEGO usera) łapie nieznany produkt, gdy keyword/brand milczą", async () => {
    // Symuluje: user wcześniej poprawił "drewno sosnowe ..." na własną kategorię
    // "drzewo" — kolejna partia z innym kodem, bez żadnego dopasowania keywordu/marki,
    // trafia tam automatycznie zamiast do "inne" lub AI.
    matchLearnedUserTermMock.mockResolvedValueOnce({ category: "drzewo", subcategory: null });
    const result = await categorizeProductWithAI("Zzz Nieznany Towar Bez Marki", USER, undefined, undefined, CATS);
    expect(result.category).toBe("drzewo");
    expect(result.confidence).toBe(0.95);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("Z-user NIE przebija już pewnego dopasowania keywordu (regresja: wkręt do drewna)", async () => {
    // Regresja znaleziona na produkcji 2026-09: user nauczył term "drewno" (z korekty
    // drewna budowlanego), co przebijało poprawne "techniczne" dla wkrętów do drewna.
    // Celowo NIE ustawiamy tu mockResolvedValueOnce — jeśli kod błędnie sięgnie po
    // Z-user, dostanie domyślne `null` (patrz deklaracja matchLearnedUserTermMock),
    // co i tak zepsułoby wynik (spadłby do "inne"/AI) i ujawniło regresję.
    const result = await categorizeProductWithAI("Wkręt podkładka ocynk 4.2x19 drewno", USER, undefined, undefined, CATS);
    expect(result.category).toBe("techniczne");
    expect(matchLearnedUserTermMock).not.toHaveBeenCalled();
  });
});

describe("categorizeProductWithAI: fallback do AI gdy keyword/brand nie trafiają", () => {
  it("brak keywordu → woła AI i zwraca zwalidowany wynik", async () => {
    mockAiResponse({ category: "sery", subcategory: "oscypek wędzony", detectedBrand: null, confidence: 0.9 });
    const result = await categorizeProductWithAI("Zzz Nieznany Produkt Xyz", USER, undefined, undefined, CATS);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      category: "sery",
      subcategory: "oscypek wędzony",
      confidence: 0.9,
      canonicalName: "zzz nieznany produkt xyz",
    });
  });

  it("AI zwraca nieznane ID kategorii → wymuszone 'inne'", async () => {
    mockAiResponse({ category: "kategoria_ktora_nie_istnieje", subcategory: null, detectedBrand: null, confidence: 0.8 });
    const result = await categorizeProductWithAI("Zzz Inny Produkt Abc", USER, undefined, undefined, CATS);
    expect(result.category).toBe("inne");
  });

  it("JSON niemożliwy do sparsowania → confidence 0.4, category inne", async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "nie jestem jsonem" } }] });
    const result = await categorizeProductWithAI("Zzz Trzeci Produkt Def", USER, undefined, undefined, CATS);
    expect(result.category).toBe("inne");
    expect(result.confidence).toBe(0.4);
  });

  it("wyjątek/timeout wywołania AI → confidence 0.3, category inne (nie wywala się)", async () => {
    createMock.mockRejectedValueOnce(new Error("network down"));
    const result = await categorizeProductWithAI("Zzz Czwarty Produkt Ghi", USER, undefined, undefined, CATS);
    expect(result.category).toBe("inne");
    expect(result.confidence).toBe(0.3);
  });

  it("detectedBrand + confidence≥0.7 → recordBrandDetection wywołane (Z9)", async () => {
    mockAiResponse({ category: "sery", subcategory: "ser regionalny", detectedBrand: "MarkaTestowaXyz", confidence: 0.85 });
    await categorizeProductWithAI("Zzz Piaty Produkt Jkl", USER, undefined, undefined, CATS);
    expect(recordBrandDetection).toHaveBeenCalledWith("MarkaTestowaXyz", "sery", "ser regionalny", 0.85, undefined);
  });

  it("detectedBrand ale confidence<0.7 → recordBrandDetection NIE wywołane", async () => {
    mockAiResponse({ category: "sery", subcategory: null, detectedBrand: "MarkaNiepewna", confidence: 0.5 });
    await categorizeProductWithAI("Zzz Szosty Produkt Mno", USER, undefined, undefined, CATS);
    expect(recordBrandDetection).not.toHaveBeenCalled();
  });

  it("category≠inne i confidence≥0.75 → recordCategoryTermDetection wywołane (Z10)", async () => {
    mockAiResponse({ category: "sery", subcategory: "ser regionalny", detectedBrand: null, confidence: 0.9 });
    await categorizeProductWithAI("Zzz Siodmy Produkt Pqr", USER, undefined, undefined, CATS);
    expect(recordCategoryTermDetection).toHaveBeenCalledWith("zzz siodmy produkt pqr", "sery", "ser regionalny", 0.9, undefined);
  });
});
