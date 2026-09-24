import { pgTable, serial, text, timestamp, numeric, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// Zagregowane statystyki rynkowe (mediana + 25/75 percentyl), liczone raz dziennie
// przez market-benchmark-job.ts. ŻADNYCH kolumn userId/supplierId/invoiceId — ta
// tabela z definicji nie może wskazywać na konkretny rekord źródłowy. To jest
// najważniejsza gwarancja anonimowości: wymuszona strukturą tabeli, nie tylko
// logiką zapytania, które ją czyta (patrz routes/benchmarks.ts).
export const marketPriceBenchmarksTable = pgTable("market_price_benchmarks", {
  id: serial("id").primaryKey(),
  marketGroupKey: text("market_group_key").notNull(),
  unit: text("unit").notNull(),
  category: text("category"),
  periodMonth: text("period_month").notNull(), // "YYYY-MM"
  medianPrice: numeric("median_price", { precision: 12, scale: 4 }),
  p25Price: numeric("p25_price", { precision: 12, scale: 4 }),
  p75Price: numeric("p75_price", { precision: 12, scale: 4 }),
  distinctUserCount: integer("distinct_user_count").notNull(),
  distinctSupplierCount: integer("distinct_supplier_count").notNull(), // informacyjnie, patrz brief §2
  sampleRowCount: integer("sample_row_count").notNull(),
  isPublished: boolean("is_published").notNull().default(false), // false = poniżej progu k-anonimowości
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mpb_key_uniq").on(t.marketGroupKey, t.unit, t.periodMonth),
  index("mpb_published_idx").on(t.isPublished, t.category),
]);

export type MarketPriceBenchmark = typeof marketPriceBenchmarksTable.$inferSelect;
