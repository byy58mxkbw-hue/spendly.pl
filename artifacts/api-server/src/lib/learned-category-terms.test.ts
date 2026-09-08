import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq, or } from "drizzle-orm";
import { db, learnedCategoryTermsTable } from "@workspace/db";
import { matchLearnedCategoryTerm, recordCategoryTermDetection } from "./learned-category-terms";

// Z10 — samo-uczenie ogólnych terminów kategorii z detekcji AI. Wymaga bazy: tylko
// gdy TEST_DATABASE_URL (CI). Lokalnie → pominięte. Wzorzec 1:1 z learned-brands.test.ts.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

// Tokeny testowe dłuższe niż MIN_TERM_LENGTH, nigdy nie pokryte statycznie. Otoczone
// w nazwach produktów WYŁĄCZNIE jednoliterowymi wypełniaczami ("x"/"y"), żeby
// significantTokens() nie wyłuskał żadnego DODATKOWEGO kandydata poza testowanym
// termem — inaczej sąsiedni prawdziwy wyraz (np. "wędzony") sam zostałby zapisany
// jako osobny term i zafałszował asercje o izolowanym termie testowym.
const TERM_A = "zzztestwaru9000";
const TERM_B = "zzztestfiku8000";

async function cleanup(): Promise<void> {
  await db.delete(learnedCategoryTermsTable).where(or(
    eq(learnedCategoryTermsTable.term, TERM_A),
    eq(learnedCategoryTermsTable.term, TERM_B),
  ));
}

describe.skipIf(!RUN_DB)("learned-category-terms (Z10)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("pierwsza detekcja: zapisuje z occurrences=1, ale jeszcze NIE jest ufana (poniżej progu)", async () => {
    await recordCategoryTermDetection(`x ${TERM_A} y`, "sery", "ser testowy", 0.8);

    const [row] = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, TERM_A));
    expect(row?.occurrences).toBe(1);
    expect(row?.category).toBe("sery");

    const match = await matchLearnedCategoryTerm(`opakowanie produktu ${TERM_A} 200g`);
    expect(match).toBeNull();
  });

  it("druga zgodna detekcja: occurrences=2, term staje się ufany i matchLearnedCategoryTerm go znajduje", async () => {
    await recordCategoryTermDetection(`x ${TERM_A} y`, "sery", "ser testowy", 0.8);
    await recordCategoryTermDetection(`x ${TERM_A} y`, "sery", "ser testowy", 0.85);

    const [row] = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, TERM_A));
    expect(row?.occurrences).toBe(2);

    const match = await matchLearnedCategoryTerm(`opakowanie produktu ${TERM_A} 200g`);
    expect(match).toEqual({ category: "sery", subcategory: "ser testowy" });
  });

  it("konflikt kategorii: term zostaje TRWALE zablokowany (surowsze niż learned-brands)", async () => {
    await recordCategoryTermDetection(`x ${TERM_B} y`, "sery", "ser testowy", 0.8);
    await recordCategoryTermDetection(`x ${TERM_B} y`, "napoje", "napój testowy", 0.9);

    const [row] = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, TERM_B));
    expect(row?.blocked).toBe(true);
    expect(row?.category).toBe("sery"); // pierwsza kategoria zachowana

    // Nawet kolejne ZGODNE z pierwotną kategorią detekcje nie odblokowują term —
    // blokada jest trwała, nie licznikiem do zresetowania.
    await recordCategoryTermDetection(`x ${TERM_B} y`, "sery", "ser testowy", 0.9);
    await recordCategoryTermDetection(`x ${TERM_B} y`, "sery", "ser testowy", 0.9);
    const match = await matchLearnedCategoryTerm(`x ${TERM_B} y 200g`);
    expect(match).toBeNull();
  });

  it("token krótszy niż MIN_TERM_LENGTH (4) jest pomijany", async () => {
    await recordCategoryTermDetection("xyz abc", "sery", null, 0.9);
    const rows = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, "abc"));
    expect(rows.length).toBe(0);
  });

  it('token już pokryty statycznym keywordem (np. "cheddar") jest pomijany — nie dubluje brand-map/keywordów', async () => {
    await recordCategoryTermDetection("x cheddar y", "sery", "cheddar", 0.9);
    const rows = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, "cheddar"));
    expect(rows.length).toBe(0);
  });

  it("confidence poniżej progu (0.75) nie jest zapisywana", async () => {
    await recordCategoryTermDetection(`x ${TERM_A} y`, "sery", null, 0.7);
    const rows = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, TERM_A));
    expect(rows.length).toBe(0);
  });

  it('kategoria "inne" nigdy nie jest zapisywana', async () => {
    await recordCategoryTermDetection(`x ${TERM_A} y`, "inne", null, 0.95);
    const rows = await db.select().from(learnedCategoryTermsTable).where(eq(learnedCategoryTermsTable.term, TERM_A));
    expect(rows.length).toBe(0);
  });
});
