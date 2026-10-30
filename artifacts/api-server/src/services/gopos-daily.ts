import type { Logger } from "pino";
import { db, goposConfigTable, posSalesDailyTable, posSalesDailySyncTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret } from "../lib/encryption";
import { getGoposToken, fetchDailySales } from "./gopos-client";
import { mergeSalesByName } from "./gopos-sync";

// Rozbicie dzienne sprzedaży — leniwy cache per (user, miesiąc), dociągany
// dopiero gdy user kliknie w dany miesiąc w modalu trendu sprzedaży (nigdy
// przy zwykłym syncu). JEDNO zapytanie do GoPOS na cały miesiąc — `groups`
// wspiera CLOSED_AT_DATE (patrz gopos-client.ts), więc nie trzeba odpytywać
// dzień po dniu. Miesiące w PRZESZŁOŚCI są trwałe
// (sprzedaż historyczna się nie zmienia) i dociągane raz; bieżący miesiąc
// odświeżamy przy każdym wejściu, bo dzisiejsza sprzedaż jeszcze rośnie.
function monthBounds(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01T00:00:00`, to: `${period}-${String(lastDay).padStart(2, "0")}T23:59:59` };
}

export async function ensureDailySalesForMonth(userId: string, period: string, log: Logger): Promise<void> {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) throw new Error(`Nieprawidłowy okres: ${period}`);

  const now = new Date();
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;

  if (!isCurrentMonth) {
    const [sync] = await db
      .select()
      .from(posSalesDailySyncTable)
      .where(and(eq(posSalesDailySyncTable.userId, userId), eq(posSalesDailySyncTable.period, period)))
      .limit(1);
    if (sync) return; // miesiąc zamknięty — już dociągnięty, sprzedaż historyczna się nie zmienia
  }

  const [cfg] = await db.select().from(goposConfigTable).where(eq(goposConfigTable.userId, userId)).limit(1);
  if (!cfg) throw new Error("Brak konfiguracji GoPOS.");
  if (!cfg.locationId) throw new Error("Brak organization_id (pole locationId) w konfiguracji GoPOS.");

  const secret = decryptSecret(cfg.encryptedClientSecret);
  const token = await getGoposToken(cfg.clientId, secret, cfg.locationId);

  const { from, to } = monthBounds(period);
  const { days, diagnostic } = await fetchDailySales(token, cfg.locationId, from, to);
  // Diagnostyka pierwszych wywołań na żywo (2026-10-30) — do usunięcia, gdy
  // potwierdzimy że `extractDayDate` rozpoznaje realny kształt GoPOS.
  if (days.length === 0 && diagnostic.dayNodeCount > 0) {
    log.warn({ userId, period, diagnostic }, "GoPOS: dni z odpowiedzi nie rozpoznane przez extractDayDate");
  }

  // Nadpisujemy cały miesiąc za jednym zamachem (prościej niż diff dzień po
  // dniu) — bieżący miesiąc i tak odświeżamy za każdym razem.
  await db
    .delete(posSalesDailyTable)
    .where(and(eq(posSalesDailyTable.userId, userId), sql`${posSalesDailyTable.date} LIKE ${period + "-%"}`));

  const rows: Array<{ userId: string; date: string; productName: string; posProductId: string | null; qty: string; netValue: string }> = [];
  for (const { date, items } of days) {
    const byName = mergeSalesByName(items);
    for (const [productName, v] of byName) {
      rows.push({ userId, date, productName, posProductId: v.productId, qty: v.qty.toString(), netValue: v.net.toFixed(2) });
    }
  }
  if (rows.length > 0) {
    await db.insert(posSalesDailyTable).values(rows);
  }

  await db
    .insert(posSalesDailySyncTable)
    .values({ userId, period, syncedDays: String(days.length) })
    .onConflictDoUpdate({
      target: [posSalesDailySyncTable.userId, posSalesDailySyncTable.period],
      set: { syncedDays: String(days.length), updatedAt: new Date() },
    });

  log.info({ userId, period, days: days.length, items: rows.length }, "GoPOS: zsynchronizowano rozbicie dzienne miesiąca");
}
