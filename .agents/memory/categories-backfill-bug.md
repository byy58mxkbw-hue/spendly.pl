---
name: Categories backfill bug — cleanupHallucinatedUserCategories
description: Why the cleanup function that deleted user categories was removed and how the backfill now works
---

## The bug
`cleanupHallucinatedUserCategories()` in `backfill-categories.ts` ran on every API server restart and deleted ALL entries from `user_categories` whose `category_id` was not in `BUILTIN_CATEGORY_DEFS`. This nuked every user-created category on restart.

## The fix
Removed the function entirely. The current code never auto-creates `user_categories` (only explicit POST /categories does), so there is nothing to clean up.

**Why:** The original guard was against an older AI bug that invented category names. That bug is long fixed.

## cleanupInvalidCategories fix
`cleanupInvalidCategories()` was also updated to query `user_categories` from DB and include those IDs in the whitelist before resetting products with unknown categories. Otherwise it would also reset products using user-defined categories.

**How to apply:** If `cleanupHallucinatedUserCategories` is ever re-introduced (e.g. to handle a new hallucination bug), it MUST be scoped to only delete categories that are provably AI-generated — not all non-builtin categories. A safe pattern would be to add a `is_ai_generated` flag to `user_categories` and only delete those rows.
