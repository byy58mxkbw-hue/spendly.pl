import { pgTable, serial, text, integer, numeric, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Z-user — samo-uczenie się terminów kategorii Z RĘCZNYCH KOREKT KONKRETNEGO usera
// (nie z detekcji AI jak learned_category_terms/learned_brands, które są GLOBALNE).
// Zgłoszone przez usera (2026-09): własna kategoria "DRZEWO" nie łapała nowych partii
// drewna o innym kodzie klasyfikacyjnym niż te, które user już ręcznie poprawił.
//
// Kluczowa różnica względem learned_category_terms (Z10): tam próg zaufania to 2
// NIEZALEŻNE detekcje AI (niepewny sygnał). Tu źródłem jest JAWNA, świadoma decyzja
// usera (PATCH /products/:id/correct-category) — najsilniejszy możliwy sygnał, więc
// ufamy już od PIERWSZEGO wystąpienia (occurrences>=1, patrz MIN_OCCURRENCES_TO_TRUST
// w lib/learned-user-terms.ts).
//
// Skopowane per-user (nie globalnie): ten sam term może znaczyć co innego dla różnych
// userów (jeden ma kategorię "DRZEWO" dla drewna budowlanego, inny mógłby mieć własną
// kategorię gdzie "drewno" znaczy coś innego) — dlatego unique index na (user_id, term),
// nie samym term.
export const learnedUserCategoryTermsTable = pgTable("learned_user_category_terms", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  term: text("term").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  occurrences: integer("occurrences").notNull().default(1),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  conflictCount: integer("conflict_count").notNull().default(0),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("learned_user_category_terms_user_term_idx").on(t.userId, t.term),
]);

export type LearnedUserCategoryTerm = typeof learnedUserCategoryTermsTable.$inferSelect;
