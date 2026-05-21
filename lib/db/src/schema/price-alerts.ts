import { pgTable, serial, integer, text, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";

export const priceAlertsTable = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("__legacy__"),
  productName: text("product_name").notNull(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  thresholdPercent: numeric("threshold_percent", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("price_alerts_user_id_idx").on(t.userId)]);

export const insertPriceAlertSchema = createInsertSchema(priceAlertsTable).omit({ id: true, userId: true, createdAt: true });
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlertsTable.$inferSelect;

export const alertDismissalsTable = pgTable("alert_dismissals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  alertId: integer("alert_id").references(() => priceAlertsTable.id, { onDelete: "set null" }),
  alertDate: text("alert_date").notNull(),
  productName: text("product_name").notNull(),
  supplierName: text("supplier_name"),
  currentPrice: numeric("current_price", { precision: 10, scale: 4 }).notNull(),
  previousPrice: numeric("previous_price", { precision: 10, scale: 4 }).notNull(),
  changePercent: numeric("change_percent", { precision: 6, scale: 2 }).notNull(),
  thresholdPercent: numeric("threshold_percent", { precision: 5, scale: 2 }).notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("alert_dismissals_user_id_idx").on(t.userId)]);

export type AlertDismissal = typeof alertDismissalsTable.$inferSelect;
