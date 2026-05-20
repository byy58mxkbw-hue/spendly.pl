import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("__legacy__"),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("szt"),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("products_user_id_idx").on(t.userId)]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, userId: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
