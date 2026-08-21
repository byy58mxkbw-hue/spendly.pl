// Strażnik spójności cennika.
//
// Do 2026-08 plany istniały w TRZECH kopiach (home.tsx, cennik.tsx, prerender
// w index.html) i rozjechały się: Pro miał 5 pozycji na landingu i 6 na /cennik,
// „OCR do 50 FAKTUR" vs „OCR PARAGONÓW do 50", a prerender pokazywał cenę 200 zł,
// której nie było nigdzie indziej. Jedynym zabezpieczeniem był komentarz „plany
// spójne z landingiem" — czyli żadne.
//
// Te testy pilnują, żeby nikt (łącznie z nami) nie wpisał ceny obok PLANS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "./pricing";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("cennik — jedno źródło prawdy", () => {
  it("każda cena z PLANS występuje w prerenderze", () => {
    const html = read("index.html");
    for (const plan of PLANS) {
      expect(html, `brak ceny „${plan.price}" (${plan.name}) w index.html`).toContain(plan.price);
    }
  });

  it("prerender nie zawiera martwej ceny 200 zł", () => {
    // Regresja: prerender miał przekreślone „200 zł" jako cenę sprzed promocji,
    // podczas gdy landing i /cennik mówiły 199. Trzecia, nieuzgodniona liczba.
    expect(read("index.html")).not.toContain("200 zł");
  });

  it("nazwy planów w prerenderze zgadzają się z PLANS", () => {
    const html = read("index.html");
    for (const plan of PLANS) {
      expect(html, `brak planu „${plan.name}" w index.html`).toContain(plan.name);
    }
  });

  it("nikt nie wpisał ceny miesięcznej z palca obok PLANS", () => {
    // Łapie wzorce typu „199 zł / mies." wklejone bezpośrednio w JSX.
    const hardcoded = /\d{2,4}\s*zł\s*\/?\s*mies/i;
    for (const file of ["src/pages/home.tsx", "src/pages/cennik.tsx"]) {
      expect(read(file), `${file}: cena wpisana ręcznie zamiast z PLANS`).not.toMatch(hardcoded);
    }
  });

  it("każdy plan ma komplet danych i poprawny tier", () => {
    const tiers = new Set(["free", "pro", "business"]);
    for (const plan of PLANS) {
      expect(plan.name.length, `${plan.id}: pusta nazwa`).toBeGreaterThan(0);
      expect(plan.features.length, `${plan.id}: brak funkcji`).toBeGreaterThan(0);
      expect(plan.cta.length, `${plan.id}: brak CTA`).toBeGreaterThan(0);
      // tier wiąże marketing z uprawnieniami backendu (lib/ai-plan.ts, reguła 24)
      expect(tiers.has(plan.tier), `${plan.id}: nieznany tier „${plan.tier}"`).toBe(true);
    }
    expect(PLANS.filter((p) => p.highlight), "dokładnie jeden plan wyróżniony").toHaveLength(1);
  });
});
