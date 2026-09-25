import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Jednorazowe/idempotentne czyszczenie już zaimportowanych pozycji rozliczenia
// zaliczki (np. "Zaliczka 23% VAT" z faktur ROZ — Lasy Państwowe/Nadleśnictwa),
// które przed poprawką w lib/invoice-line-classify.ts trafiały do bazy jako
// osobny "produkt" i zaśmiecały listę produktów, historię cen i raporty
// (realny raport użytkownika 2026-09-26). Odłączamy invoice_items od takich
// produktów (product_id -> NULL, surowa nazwa/kwoty w invoice_items zostają
// bez zmian — faktura i jej suma się nie zmieniają) i usuwamy sam wiersz
// products. Bezpieczne przy każdym boocie — po wyczyszczeniu WHERE nie łapie
// już tych wierszy, więc kolejne uruchomienia są no-op.
//
// Granica słowa po polskim alfabecie (reguła 27 — nigdy surowy LIKE/includes) —
// ten sam wzorzec co w resolveProductFromQuestion (routes/ai-cfo.ts), odporny
// na polskie znaki (w odróżnieniu od `\y`/`\b` natywnego silnika regex Postgresa).
const ADVANCE_LINE_PATTERN = "(^|[^a-ząćęłńóśźż])zaliczk";

export async function ensureNoAdvanceLineProducts(log: Logger): Promise<void> {
  try {
    const affected = await db.execute(sql`
      UPDATE invoice_items SET product_id = NULL
      WHERE product_id IN (SELECT id FROM products WHERE lower(name) ~ ${ADVANCE_LINE_PATTERN})
    `);
    const deleted = await db.execute(sql`
      DELETE FROM products WHERE lower(name) ~ ${ADVANCE_LINE_PATTERN}
    `);
    if ((affected.rowCount ?? 0) > 0 || (deleted.rowCount ?? 0) > 0) {
      log.info(
        { unlinkedItems: affected.rowCount, deletedProducts: deleted.rowCount },
        "wyczyszczono pozycje rozliczenia zaliczki błędnie zaimportowane jako produkty",
      );
    }
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się wyczyścić pozycji rozliczenia zaliczki");
  }
}
