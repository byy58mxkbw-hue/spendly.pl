import { pgTable, serial, text, timestamp, numeric, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";

// Mediana rynku z OKNA kroczącego (np. 12 mies.), nie z jednego miesiąca. Miesięczna
// mediana (market_price_benchmarks) rzadko przekracza próg przy małej liczbie kont —
// produkt kupiony przez 2 lokale we wrześniu i 2 inne w sierpniu nie miał jej w żadnym.
// Tu liczymy jedną cenę na (user, dostawca) z całego okna. Te same progi k-anonimowości.
// Jak market_price_benchmarks: ŻADNYCH kolumn userId/supplierId/invoiceId.
export const marketPriceRangesTable = pgTable("market_price_ranges", {
  id: serial("id").primaryKey(),
  marketGroupKey: text("market_group_key").notNull(),
  unit: text("unit").notNull(),
  category: text("category"),
  windowMonths: integer("window_months").notNull(),
  fromMonth: text("from_month").notNull(), // "YYYY-MM" — najstarszy miesiąc z danymi w oknie
  toMonth: text("to_month").notNull(), // "YYYY-MM" — najnowszy
  medianPrice: numeric("median_price", { precision: 12, scale: 4 }),
  p25Price: numeric("p25_price", { precision: 12, scale: 4 }),
  p75Price: numeric("p75_price", { precision: 12, scale: 4 }),
  distinctUserCount: integer("distinct_user_count").notNull(),
  verifiedUserCount: integer("verified_user_count").notNull(), // konta z fakturą ksef_sync — liczą się do progu
  sampleRowCount: integer("sample_row_count").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mpr_key_uniq").on(t.marketGroupKey, t.unit, t.windowMonths),
]);

export type MarketPriceRange = typeof marketPriceRangesTable.$inferSelect;
