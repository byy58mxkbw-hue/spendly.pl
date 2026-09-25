import type { Logger } from "pino";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db, invoicesTable } from "@workspace/db";
import { parseFA3Xml } from "@workspace/ksef-client";
import { decryptSecret } from "../lib/encryption";

// Jednorazowe/idempotentne odtworzenie invoice_type dla faktur zaimportowanych
// PRZED poprawką w ksef-ingest.ts/routes/ksef.ts — ścieżka auto-sync KSeF
// parsowała RodzajFaktury z XML, ale nigdy nie zapisywała go do invoices.invoice_type
// (real audyt produkcyjny 2026-09-26: WSZYSTKIE 2175 faktur w bazie miały
// invoice_type=NULL, bez wyjątku). To znaczyło, że filtr „IS DISTINCT FROM 'KOR'",
// obecny w dziesiątkach zapytań (ceny, raporty, AI CFO), nigdy faktycznie nie
// wykluczał korekt.
//
// Batch po 200 (dekodowanie+parsowanie XML jest kosztowe) — bezpieczne przy
// każdym boocie, bo WHERE łapie tylko wiersze wciąż z invoice_type IS NULL.
const BATCH_SIZE = 200;

export async function ensureInvoiceTypeBackfill(log: Logger): Promise<void> {
  try {
    let totalUpdated = 0;
    let totalFailed = 0;
    for (;;) {
      const rows = await db
        .select({ id: invoicesTable.id, xmlContent: invoicesTable.xmlContent })
        .from(invoicesTable)
        .where(and(isNull(invoicesTable.invoiceType), isNotNull(invoicesTable.xmlContent)))
        .limit(BATCH_SIZE);
      if (rows.length === 0) break;

      for (const row of rows) {
        try {
          const xml = decryptSecret(row.xmlContent!);
          const parsed = parseFA3Xml(xml);
          if (parsed.header.invoiceType) {
            await db
              .update(invoicesTable)
              .set({ invoiceType: parsed.header.invoiceType })
              .where(eq(invoicesTable.id, row.id));
            totalUpdated++;
          } else {
            // XML nie ma RodzajFaktury (stary/niekompletny format) — nie ma czego
            // odtworzyć. Ustawiamy pusty string zamiast zostawić NULL, żeby WHERE
            // powyżej nie łapał go w kółko przy każdym boocie.
            await db.update(invoicesTable).set({ invoiceType: "" }).where(eq(invoicesTable.id, row.id));
          }
        } catch (err) {
          totalFailed++;
          log.warn({ invoiceId: row.id, err: String(err) }, "invoice-type-backfill: nie udało się odtworzyć dla pojedynczej faktury");
          // Nie blokuj reszty batcha — ale też nie próbuj tej samej faktury w kółko:
          // oznacz jako "nieodtwarzalną" (pusty string), żeby log się nie powtarzał.
          await db.update(invoicesTable).set({ invoiceType: "" }).where(eq(invoicesTable.id, row.id)).catch(() => {});
        }
      }
      if (rows.length < BATCH_SIZE) break;
    }
    if (totalUpdated > 0 || totalFailed > 0) {
      log.info({ totalUpdated, totalFailed }, "invoice-type-backfill: odtworzono invoice_type dla istniejących faktur");
    }
  } catch (err) {
    log.error({ err: String(err) }, "invoice-type-backfill: migracja nieudana");
  }
}

// Diagnostyka: policz ile faktur ma dany typ (do ręcznej weryfikacji po backfillu).
export async function countInvoiceTypes(): Promise<Array<{ invoiceType: string | null; count: number }>> {
  const rows = await db
    .select({ invoiceType: invoicesTable.invoiceType, count: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .groupBy(invoicesTable.invoiceType);
  return rows;
}
