import { pgTable, serial, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Przychód (sprzedaż netto) restauracji per miesiąc — potrzebny do policzenia
// REALNEGO food cost % = koszt składników (z faktur) / przychód. MVP: jedna kwota
// na użytkownika na miesiąc (bez podziału na centra kosztów — to ew. rozwój).
export const restaurantRevenueTable = pgTable("restaurant_revenue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  period: text("period").notNull(), // 'YYYY-MM'
  amountNet: numeric("amount_net", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("restaurant_revenue_user_period_uniq").on(t.userId, t.period)]);

export const insertRestaurantRevenueSchema = createInsertSchema(restaurantRevenueTable).omit({
  id: true, userId: true, createdAt: true, updatedAt: true,
});
export type InsertRestaurantRevenue = z.infer<typeof insertRestaurantRevenueSchema>;
export type RestaurantRevenue = typeof restaurantRevenueTable.$inferSelect;
