import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const productCorrectionsTable = pgTable("product_corrections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  correctedCategory: text("corrected_category").notNull(),
  correctedSubcategory: text("corrected_subcategory"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("product_corrections_user_product_idx").on(t.userId, t.productId),
  index("product_corrections_user_name_idx").on(t.userId, t.normalizedName),
]);

export type ProductCorrection = typeof productCorrectionsTable.$inferSelect;
