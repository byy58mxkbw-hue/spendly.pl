import { pgTable, serial, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Sprzedaż z POS per pozycja menu, agregowana miesięcznie — UNIWERSALNY format
// (źródło = GoPOS, ale może być inny POS lub import). Zasila stronę „Sprzedaż"
// (ile sztuk czego w miesiącu + porównanie do poprzedniego) oraz food cost ważony
// i wariancję zużycia (sprzedaż × receptura vs zakupy z KSeF).
export const posSalesTable = pgTable("pos_sales", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(), // 'YYYY-MM'
  productName: text("product_name").notNull(),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull().default("0"),
  netValue: numeric("net_value", { precision: 12, scale: 2 }).notNull().default("0"),
  source: text("source").notNull().default("gopos"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pos_sales_user_period_product_uniq").on(t.userId, t.period, t.productName),
  index("pos_sales_user_period_idx").on(t.userId, t.period),
]);

export const insertPosSalesSchema = createInsertSchema(posSalesTable).omit({ id: true, userId: true, updatedAt: true });
export type PosSale = typeof posSalesTable.$inferSelect;
export type InsertPosSale = z.infer<typeof insertPosSalesSchema>;
