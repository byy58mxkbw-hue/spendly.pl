import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userCategoriesTable = pgTable(
  "user_categories",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    categoryId: text("category_id").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_categories_user_id_category_id_idx").on(t.userId, t.categoryId)],
);

export type UserCategory = typeof userCategoriesTable.$inferSelect;
