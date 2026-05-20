import { pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productGroupsTable = pgTable(
  "product_groups",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("product_groups_user_id_idx").on(t.userId),
    uniqueIndex("product_groups_user_key_uq").on(t.userId, t.normalizedKey),
  ],
);

export const productGroupRejectionsTable = pgTable(
  "product_group_rejections",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_group_rejections_user_key_uq").on(t.userId, t.normalizedKey),
  ],
);

export const insertProductGroupSchema = createInsertSchema(productGroupsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProductGroup = z.infer<typeof insertProductGroupSchema>;
export type ProductGroup = typeof productGroupsTable.$inferSelect;
