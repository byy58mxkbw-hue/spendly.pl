import { pgTable, serial, integer, text, numeric, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";
import { costCentersTable } from "./cost-centers";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("__legacy__"),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: text("invoice_date").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  xmlContent: text("xml_content"),
  ksefNumber: text("ksef_number"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  excluded: boolean("excluded").notNull().default(false),
  paymentMethod: text("payment_method"),
  paymentDueDate: text("payment_due_date"),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  costCenterId: integer("cost_center_id").references(() => costCentersTable.id, { onDelete: "set null" }),
}, (t) => [
  index("invoices_user_id_idx").on(t.userId),
  uniqueIndex("invoices_user_ksef_number_uniq").on(t.userId, t.ksefNumber),
]);

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, userId: true, importedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
