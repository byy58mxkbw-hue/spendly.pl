import { pgTable, serial, integer, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { invoicesTable } from "./invoices";

// Dokument WZ (wydanie zewnętrzne) przypięty do faktury: numer i pozycje odczytane OCR
// ze zdjęcia/PDF. Pliku nie przechowujemy — tylko wynik odczytu (reguła 14: jeden dokument
// analizujemy raz). Porównanie z pozycjami faktury liczy routes/invoice-wz.ts na żądanie.
export const invoiceWzDocumentsTable = pgTable("invoice_wz_documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  wzNumber: text("wz_number").notNull(),
  wzDate: text("wz_date"),
  items: jsonb("items").$type<Array<{ productName: string; quantity: number; unit: string }>>().notNull(),
  pageCount: integer("page_count").notNull().default(1),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("iwz_invoice_number_uniq").on(t.invoiceId, t.wzNumber),
  index("iwz_user_idx").on(t.userId),
]);

export type InvoiceWzDocument = typeof invoiceWzDocumentsTable.$inferSelect;
