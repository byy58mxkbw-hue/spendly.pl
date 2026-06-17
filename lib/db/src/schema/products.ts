import { pgTable, serial, text, timestamp, index, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("__legacy__"),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("szt"),
  category: text("category"),
  subcategory: text("subcategory"),
  classificationConfidence: real("classification_confidence"),
  canonicalName: text("canonical_name"),
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("products_user_id_idx").on(t.userId),
  index("products_user_needs_review_idx").on(t.userId, t.needsReview),
  index("products_user_category_idx").on(t.userId, t.category),
  index("products_user_created_at_idx").on(t.userId, t.createdAt),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, userId: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
