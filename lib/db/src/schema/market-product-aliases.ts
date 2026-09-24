import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Grupowanie nazw produktów odpornych na literówki/liczbę mnogą/błędy OCR (pg_trgm,
// liczone w market-product-matcher.ts), TYLKO dla joba benchmarku — nie ruszamy
// istniejącej normalizeProductName() używanej w kategoryzacji/alertach/dopasowaniu.
// (canonicalName, unit) -> marketGroupKey (wariant nazwy używany przez najwięcej userów
// w grupie, deterministyczny). Osobna, inspekcjonowalna tabela: grupowanie widoczne
// i debugowalne, nie ukryte w jednym wielkim zapytaniu.
export const marketProductAliasesTable = pgTable("market_product_aliases", {
  id: serial("id").primaryKey(),
  canonicalName: text("canonical_name").notNull(),
  unit: text("unit").notNull(),
  category: text("category"),
  marketGroupKey: text("market_group_key").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("mpa_canonical_unit_uniq").on(t.canonicalName, t.unit),
]);

export type MarketProductAlias = typeof marketProductAliasesTable.$inferSelect;
