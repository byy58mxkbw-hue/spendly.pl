import { pgTable, serial, text, timestamp, numeric, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// WEWNĘTRZNA tabela benchmarku (spec benchmark v2, etap 1): jedna cena na restaurację per
// (grupa rynkowa, jednostka porównania, przedział opakowania, miesiąc | 'R12' = ostatnie
// 12 mies.). Średnia ważona ilością, przeliczona na kg/l/szt. Przeliczana od zera przez
// market-benchmark-job.ts. NIGDY nie zwracana wprost przez API — routes/benchmarks.ts liczy
// z niej medianę NA ŻĄDANIE z warunkiem user_id <> oglądający (leave-one-out), więc nikt
// nie widzi mediany zawierającej własną cenę i nie może odjąć jej od wyniku.
export const marketUserPricesTable = pgTable("market_user_prices", {
  id: serial("id").primaryKey(),
  marketGroupKey: text("market_group_key").notNull(),
  compareUnit: text("compare_unit").notNull(),
  packTier: text("pack_tier").notNull(),
  periodMonth: text("period_month").notNull(), // "YYYY-MM" albo "R12"
  userId: text("user_id").notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 14, scale: 4 }).notNull(),
  quantity: numeric("quantity", { precision: 16, scale: 4 }).notNull(),
  hasKsef: boolean("has_ksef").notNull(),
  category: text("category"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mup_key_uniq").on(t.marketGroupKey, t.compareUnit, t.packTier, t.periodMonth, t.userId),
  index("mup_group_idx").on(t.marketGroupKey, t.compareUnit, t.packTier, t.periodMonth),
]);

// Zgłoszenia „To nie ten produkt” (etap 4). Jeden wpis na (lokal, wariant nazwy).
export const marketMatchFeedbackTable = pgTable("market_match_feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  canonicalName: text("canonical_name").notNull(),
  unit: text("unit").notNull(),
  marketGroupKey: text("market_group_key"),
  reason: text("reason").notNull(), // other_product | wrong_pack | different_quality
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mmf_user_variant_uniq").on(t.userId, t.canonicalName, t.unit),
  index("mmf_variant_idx").on(t.canonicalName, t.unit),
]);

// Decyzja admina o wariancie zgłoszonym przez kilka restauracji: excluded = poza grupą,
// restored = zostaje w grupie mimo zgłoszeń.
export const marketMatchReviewTable = pgTable("market_match_review", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  unit: text("unit").notNull(),
  decision: text("decision").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("mmr_variant_uniq").on(t.canonicalName, t.unit)]);
