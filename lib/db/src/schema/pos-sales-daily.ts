import { pgTable, serial, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Sprzedaż z POS per pozycja menu, agregowana DZIENNIE — cache leniwy (patrz
// gopos-daily.ts). GoPOS nie ma wymiaru grupowania po dniu w jednym zapytaniu,
// więc rozbicie dzienne dociągamy osobnym zapytaniem na dzień dopiero gdy user
// faktycznie chce zobaczyć dany miesiąc (modal trendu sprzedaży), nie przy
// każdym syncu — inaczej to 28-31 wywołań GoPOS na miesiąc x usera x sync.
// Miesiące zamknięte (przed bieżącym) są tu trwałe (sprzedaż historyczna się
// nie zmienia); bieżący miesiąc jest dociągany na nowo przy każdym żądaniu.
export const posSalesDailyTable = pgTable("pos_sales_daily", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(), // 'YYYY-MM-DD'
  productName: text("product_name").notNull(),
  posProductId: text("pos_product_id"),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull().default("0"),
  netValue: numeric("net_value", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pos_sales_daily_user_date_product_uniq").on(t.userId, t.date, t.productName),
  index("pos_sales_daily_user_date_idx").on(t.userId, t.date),
]);

export const insertPosSalesDailySchema = createInsertSchema(posSalesDailyTable).omit({ id: true, userId: true, updatedAt: true });
export type PosSaleDaily = typeof posSalesDailyTable.$inferSelect;
export type InsertPosSaleDaily = z.infer<typeof insertPosSalesDailySchema>;

// Znacznik „ten miesiąc jest już w całości dociągnięty z GoPOS dziennie" —
// osobna tabela zamiast liczenia DISTINCT date w pos_sales_daily, bo dni BEZ
// sprzedaży (lokal zamknięty) nie zostawiają tam żadnego wiersza i myliłyby
// cache z niekompletnym.
export const posSalesDailySyncTable = pgTable("pos_sales_daily_sync", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(), // 'YYYY-MM'
  syncedDays: numeric("synced_days", { precision: 4, scale: 0 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pos_sales_daily_sync_user_period_uniq").on(t.userId, t.period),
]);
export type PosSaleDailySync = typeof posSalesDailySyncTable.$inferSelect;
