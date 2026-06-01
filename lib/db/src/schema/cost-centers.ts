import { pgTable, serial, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const costCentersTable = pgTable("cost_centers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#14B8A6"),
}, (t) => [index("cost_centers_user_id_idx").on(t.userId)]);

export const insertCostCenterSchema = createInsertSchema(costCentersTable).omit({ id: true, userId: true });
export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;
export type CostCenter = typeof costCentersTable.$inferSelect;
