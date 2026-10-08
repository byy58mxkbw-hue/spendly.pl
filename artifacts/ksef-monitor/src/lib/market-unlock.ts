// Odblokowanie pełnej tabeli cen rynkowych (/ceny-rynkowe) po wgraniu faktury XML —
// decyzja usera 2026-10-08: bez faktury strona pokazuje nazwy produktów i kilka
// przykładów, pełne mediany dopiero po wgraniu własnej faktury. To dźwignia UX,
// nie zabezpieczenie (ceny są publiczne w API). Wygoda per przeglądarka → localStorage,
// każdy dostęp w try/catch (tryb prywatny / zablokowane dane strony).

const KEY = "spendly_market_unlocked";
export const MARKET_UNLOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function unlockMarket(now = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    /* ignore — odblokowanie zostanie w stanie strony do przeładowania */
  }
}

export function isMarketUnlocked(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && now - at <= MARKET_UNLOCK_TTL_MS;
  } catch {
    return false;
  }
}
