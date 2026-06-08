import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { costCentersTable } from "./cost-centers";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("__legacy__"),
  name: text("name").notNull(),
  taxId: text("tax_id").notNull(),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  defaultCostCenterId: integer("default_cost_center_id").references(() => costCentersTable.id, { onDelete: "set null" }),
  defaultCategory: text("default_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("suppliers_user_id_idx").on(t.userId)]);

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;
