import { pgTable, serial, text, integer, numeric, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Z10 — samo-uczenie się OGÓLNYCH rzeczowników kategorii z detekcji AI, analogiczne
// do learned_brands (Z9), ale dla tokenów które NIE są marką (np. rzadka nazwa sera
// bez marki, jak "oscypek" zanim trafił do statycznej listy keywordów). Gdy AI pewnie
// zaklasyfikuje produkt do kategorii, a żaden istniejący keyword/brand go nie złapał,
// zapamiętujemy najbardziej znaczący token z nazwy — kolejne produkty z tym samym
// tokenem są łapane bez ponownego pytania AI.
//
// Guard przeciw zaśmiecaniu: term jest ufany dopiero po MIN_OCCURRENCES_TO_TRUST
// (2) NIEZALEŻNYCH detekcjach ZE ZGODNĄ kategorią (jak w learned_brands). Przy
// PIERWSZYM konflikcie (ten sam term, inna kategoria) term jest TRWALE blokowany
// (blocked=true) — nie próbujemy "przegłosowywać" konfliktu, bo to sygnał że słowo
// jest niejednoznaczne (np. "wędzony" pasuje i do ryb, i do mięs, i do serów).
// To jest ŚCIŚLEJSZE niż learned_brands (który przy konflikcie tylko odrzuca update,
// zachowując pierwszą kategorię) — ogólny rzeczownik ma wyższe ryzyko bycia
// współdzielonym między kategoriami niż nazwa marki, więc reagujemy trwałą blokadą.
export const learnedCategoryTermsTable = pgTable("learned_category_terms", {
  id: serial("id").primaryKey(),
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
  uniqueIndex("learned_category_terms_term_idx").on(t.term),
]);

export type LearnedCategoryTerm = typeof learnedCategoryTermsTable.$inferSelect;
