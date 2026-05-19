import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ksefPendingInvoicesTable = pgTable("ksef_pending_invoices", {
  id: serial("id").primaryKey(),
  ksefNumber: text("ksef_number").notNull().unique(),
  sellerNip: text("seller_nip"),
  sellerName: text("seller_name"),
  invoiceNumber: text("invoice_number"),
  invoiceDate: text("invoice_date"),
  totalGross: text("total_gross"),
  rawXml: text("raw_xml").notNull(),
  parsedJson: jsonb("parsed_json").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKsefPendingInvoiceSchema = createInsertSchema(ksefPendingInvoicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKsefPendingInvoice = z.infer<typeof insertKsefPendingInvoiceSchema>;
export type KsefPendingInvoice = typeof ksefPendingInvoicesTable.$inferSelect;
