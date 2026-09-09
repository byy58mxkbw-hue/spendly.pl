import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, learnedUserCategoryTermsTable } from "@workspace/db";
import { matchLearnedUserTerm, recordUserCorrectionTerms } from "./learned-user-terms";

// Z-user — samo-uczenie z ręcznych korekt konkretnego usera (w tym WŁASNYCH kategorii,
// np. "drzewo"). Wymaga bazy: tylko gdy TEST_DATABASE_URL (CI). Wzorzec 1:1 z
// learned-category-terms.test.ts, kluczowa różnica: próg zaufania = 1 (nie 2) i
// izolacja per user_id (ten sam term może być zablokowany dla jednego usera,
// a zaufany dla innego).
const RUN_DB = !!process.env.TEST_DATABASE_URL;

const USER_A = "test_luterm_user_a";
const USER_B = "test_luterm_user_b";
const TERM_A = "zzzsosnowetest9000";
const TERM_B = "zzzfikustest8000";

async function cleanup(): Promise<void> {
  await db.delete(learnedUserCategoryTermsTable).where(
    and(eq(learnedUserCategoryTermsTable.term, TERM_A)),
  );
  await db.delete(learnedUserCategoryTermsTable).where(
    and(eq(learnedUserCategoryTermsTable.term, TERM_B)),
  );
}

describe.skipIf(!RUN_DB)("learned-user-terms (Z-user)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("pierwsza korekta jest OD RAZU zaufana (próg=1, w przeciwieństwie do Z9/Z10)", async () => {
    await recordUserCorrectionTerms(USER_A, `drewno ${TERM_A} x`, "drzewo", null);

    const [row] = await db.select().from(learnedUserCategoryTermsTable)
      .where(and(eq(learnedUserCategoryTermsTable.userId, USER_A), eq(learnedUserCategoryTermsTable.term, TERM_A)));
    expect(row?.occurrences).toBe(1);
    expect(row?.category).toBe("drzewo");

    const match = await matchLearnedUserTerm(USER_A, `drewno ${TERM_A} inny wariant y`);
    expect(match).toEqual({ category: "drzewo", subcategory: null });
  });

  it("term jest izolowany per user — inny user nie widzi cudzej nauki", async () => {
    await recordUserCorrectionTerms(USER_A, `x ${TERM_B} y`, "drzewo", null);
    const matchOther = await matchLearnedUserTerm(USER_B, `x ${TERM_B} y`);
    expect(matchOther).toBeNull();
    const matchOwner = await matchLearnedUserTerm(USER_A, `x ${TERM_B} y`);
    expect(matchOwner).toEqual({ category: "drzewo", subcategory: null });
  });

  it("konflikt (ten sam user, ten sam term, inna kategoria) blokuje trwale", async () => {
    await recordUserCorrectionTerms(USER_A, `x ${TERM_A} y`, "drzewo", null);
    await recordUserCorrectionTerms(USER_A, `x ${TERM_A} y`, "sprzet", null);

    const [row] = await db.select().from(learnedUserCategoryTermsTable)
      .where(and(eq(learnedUserCategoryTermsTable.userId, USER_A), eq(learnedUserCategoryTermsTable.term, TERM_A)));
    expect(row?.blocked).toBe(true);
    expect(row?.category).toBe("drzewo");

    const match = await matchLearnedUserTerm(USER_A, `x ${TERM_A} y`);
    expect(match).toBeNull();
  });

  it("token krótszy niż 4 znaki jest pomijany", async () => {
    await recordUserCorrectionTerms(USER_A, "xyz abc", "drzewo", null);
    const rows = await db.select().from(learnedUserCategoryTermsTable).where(eq(learnedUserCategoryTermsTable.term, "abc"));
    expect(rows.length).toBe(0);
  });

  it('token już pokryty statycznym keywordem (np. "cheddar") jest pomijany', async () => {
    await recordUserCorrectionTerms(USER_A, "x cheddar y", "sery", "cheddar");
    const rows = await db.select().from(learnedUserCategoryTermsTable).where(eq(learnedUserCategoryTermsTable.term, "cheddar"));
    expect(rows.length).toBe(0);
  });
});
