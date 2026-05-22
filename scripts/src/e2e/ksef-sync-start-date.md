# KSeF sync start date — change log & cleanup record

## Code change

**File:** `artifacts/api-server/src/routes/ksef.ts`

**Before:**
```ts
const overallFrom = cfg.lastSyncedAt
  ? cfg.lastSyncedAt
  : new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
```

**After:**
```ts
const KSEF_MANDATORY_START = new Date("2026-02-01T00:00:00.000Z");
const overallFrom = cfg.lastSyncedAt
  ? cfg.lastSyncedAt
  : KSEF_MANDATORY_START;
```

**Why:** The 2-year lookback caused ~25 API windows. KSeF rate-limited at window ~20
(reaching ~January 2026), so the sync never reached February–May 2026 where all
mandatory-KSeF invoices actually are. The new constant (Feb 1, 2026 = KSeF mandatory
start in Poland) reduces windows to 4–5, completing in seconds without hitting the limit.

## UI text changes

**File:** `artifacts/ksef-monitor/src/pages/settings-ksef.tsx`

- Button description: `"ostatnich 365 dni"` → `"od 1 lutego 2026 (start obowiązkowego KSeF)"`
- AlertDialog body: `"ostatnich 2 lat / 25 zapytań"` → `"od 1 lutego 2026 / 4–5 zapytań"`

## Production DB cleanup — AGATA SPÓŁKA AKCYJNA

**Problem:** 4 pending invoices from AGATA SPÓŁKA AKCYJNA (seller_nip=6340197476) were
created by the partial sync (sync reached 2024 data from this early KSeF adopter before
the rate limit). These invoices are from before the mandatory KSeF period and can be
removed from `ksef_pending_invoices` for the affected user.

**SQL to run against production DB:**

```sql
DELETE FROM ksef_pending_invoices
WHERE seller_nip = '6340197476'
  AND user_id = 'user_3DzRzmuDxrOL23jmsxF7j7M8SSA';
```

**Result in dev DB:** DELETE 0 (records did not exist in dev — they were only in production).
The production cleanup should be run manually via the admin panel or a one-time migration
after the new sync start date is deployed.
