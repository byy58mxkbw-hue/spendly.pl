import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Naprawa wsteczna: invoices.total_amount ma być zawsze BRUTTO.
 *
 * Historycznie dwa miejsca zapisywały tam kwotę NETTO:
 *  - import ręczny (suma total_price pozycji, a te są netto),
 *  - usunięcie pozycji z faktury (przeliczenie total_amount z sum netto).
 * Faktury z KSeF miały poprawnie brutto (header.totalGross), więc w bazie
 * siedziały obok siebie dwie konwencje i sumy na Fakturach były zaniżone.
 *
 * Kryterium celowo WĄSKIE — ruszamy tylko wiersze, w których nagłówek jest
 * praktycznie równy sumie NETTO pozycji, a brutto jest istotnie wyższe. Dzięki
 * temu nie nadpisujemy faktur z KSeF, gdzie nagłówek bywa lekko inny od sumy
 * pozycji (rabaty, zaokrąglenia, opakowania zwrotne) — tam źródłem prawdy
 * zostaje nagłówek z KSeF.
 *
 * Idempotentne: po naprawie total_amount = brutto, więc warunek „równy netto"
 * przestaje być spełniony i kolejne uruchomienia dotykają 0 wierszy.
 */

// Wspólny warunek: faktura zapisana jako netto zamiast brutto.
const MISCLASSIFIED = `
  FROM (
    SELECT ii.invoice_id,
           SUM(ii.total_price::numeric) AS net,
           SUM(ii.total_price::numeric * (1 + COALESCE(ii.vat_rate, 0) / 100)) AS gross
    FROM invoice_items ii
    GROUP BY ii.invoice_id
  ) a
  WHERE a.invoice_id = i.id
    AND a.gross > a.net + 0.01
    AND ABS(i.total_amount::numeric - a.net) <= 0.02
    AND ABS(i.total_amount::numeric - a.gross) > 0.01
`;

export async function ensureGrossInvoiceTotals(log: Logger): Promise<void> {
  try {
    const preview = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS ile,
             ROUND(COALESCE(SUM(a.gross - i.total_amount::numeric), 0), 2)::float AS roznica
      FROM invoices i, LATERAL (
        SELECT SUM(ii.total_price::numeric) AS net,
               SUM(ii.total_price::numeric * (1 + COALESCE(ii.vat_rate, 0) / 100)) AS gross
        FROM invoice_items ii WHERE ii.invoice_id = i.id
      ) a
      WHERE a.gross > a.net + 0.01
        AND ABS(i.total_amount::numeric - a.net) <= 0.02
        AND ABS(i.total_amount::numeric - a.gross) > 0.01
    `));
    const { ile, roznica } = (preview.rows[0] ?? { ile: 0, roznica: 0 }) as { ile: number; roznica: number };

    if (!ile) {
      log.info("total_amount brutto: nic do naprawy");
      return;
    }

    await db.execute(sql.raw(`
      UPDATE invoices i
      SET total_amount = ROUND(a.gross, 2)
      ${MISCLASSIFIED}
    `));

    log.info({ faktur: ile, roznicaBrutto: roznica }, "total_amount brutto: naprawiono faktury zapisane jako netto");
  } catch (err) {
    log.error({ err: String(err) }, "Nie udało się naprawić total_amount na brutto");
  }
}
