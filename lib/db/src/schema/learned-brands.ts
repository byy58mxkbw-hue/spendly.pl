import { pgTable, serial, text, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Z9 — marki wykryte przez AI (categorize-ai.ts, pole detectedBrand), zapamiętane
// globalnie (marka to fakt o produkcie, nie preferencja usera — jak statyczny
// brand-map.ts). Gdy ta sama marka pojawi się ponownie z wystarczającą liczbą
// potwierdzeń, kolejne produkty tej marki są klasyfikowane bez wywołania AI.
export const learnedBrandsTable = pgTable("learned_brands", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  occurrences: integer("occurrences").notNull().default(1),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("learned_brands_brand_idx").on(t.brand),
]);

export type LearnedBrand = typeof learnedBrandsTable.$inferSelect;
