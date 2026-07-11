import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, learnedBrandsTable } from "@workspace/db";
import { matchLearnedBrand, recordBrandDetection } from "./learned-brands";

// Z9 — samo-uczenie marek z detekcji AI. Wymaga bazy: tylko gdy TEST_DATABASE_URL (CI).
// Lokalnie → pominięte.
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const TEST_BRAND = "testomarka9000";

async function cleanup(): Promise<void> {
  await db.delete(learnedBrandsTable).where(eq(learnedBrandsTable.brand, TEST_BRAND));
}

describe.skipIf(!RUN_DB)("learned-brands (Z9)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("pierwsza detekcja: zapisuje z occurrences=1, ale jeszcze NIE jest ufana (poniżej progu)", async () => {
    await recordBrandDetection(TEST_BRAND, "sery", "ser testowy", 0.8);

    const [row] = await db.select().from(learnedBrandsTable).where(eq(learnedBrandsTable.brand, TEST_BRAND));
    expect(row?.occurrences).toBe(1);
    expect(row?.category).toBe("sery");

    const match = await matchLearnedBrand(`opakowanie produktu ${TEST_BRAND} 200g`);
    expect(match).toBeNull();
  });

  it("druga zgodna detekcja: occurrences=2, marka staje się ufana i matchLearnedBrand ją znajduje", async () => {
    await recordBrandDetection(TEST_BRAND, "sery", "ser testowy", 0.8);
    await recordBrandDetection(TEST_BRAND, "sery", "ser testowy", 0.85);

    const [row] = await db.select().from(learnedBrandsTable).where(eq(learnedBrandsTable.brand, TEST_BRAND));
    expect(row?.occurrences).toBe(2);

    const match = await matchLearnedBrand(`opakowanie produktu ${TEST_BRAND} 200g`);
    expect(match).toEqual({ category: "sery", subcategory: "ser testowy" });
  });

  it("konflikt kategorii: NIE nadpisuje istniejącej klasyfikacji", async () => {
    await recordBrandDetection(TEST_BRAND, "sery", "ser testowy", 0.8);
    await recordBrandDetection(TEST_BRAND, "napoje", "napój testowy", 0.9);

    const [row] = await db.select().from(learnedBrandsTable).where(eq(learnedBrandsTable.brand, TEST_BRAND));
    expect(row?.occurrences).toBe(1);
    expect(row?.category).toBe("sery");
  });

  it("zbyt krótka marka (< 3 znaki) jest pomijana", async () => {
    await recordBrandDetection("ab", "sery", null, 0.9);
    const rows = await db.select().from(learnedBrandsTable).where(eq(learnedBrandsTable.brand, "ab"));
    expect(rows.length).toBe(0);
  });
});
