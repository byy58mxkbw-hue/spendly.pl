# Database Migration Scripts

Utility scripts for managing Spendly database backups and data loading.

## Scripts Overview

| Script | Purpose | Status |
|--------|---------|--------|
| `load-backup-clean.js` | ✅ **RECOMMENDED** - Load backup without conflict checks | Latest, no dependency conflicts |
| `load-backup-opt.js` | Load backup with optimized multi-row INSERT | Good for large datasets |
| `load-backup-fast.js` | Stream-based loading with batching | Experimental |
| `load-backup.js` | Original load script (slow, per-row INSERT) | Legacy |
| `load-backup.mjs` | ESM version of load-backup | Legacy |
| `load-backup.py` | Python implementation | Untested |
| `fix-userid.js` | Update user_id in all tables after user change | Used for Clerk migration |
| `check-data.js` | Verify data loaded in database | Diagnostic |

## Usage

### Load Production Backup

```bash
cd C:\Users\nowys\Downloads

# Option 1: Clean import (recommended)
node C:\Users\nowys\spendly\scripts\migrations\load-backup-clean.js

# Option 2: Optimized for large datasets
node C:\Users\nowys\spendly\scripts\migrations\load-backup-opt.js
```

### Fix User ID (if account changed)

```bash
node C:\Users\nowys\spendly\scripts\migrations\fix-userid.js
```

Prompts for old and new user IDs, then updates all database tables.

### Check Database Content

```bash
node C:\Users\nowys\spendly\scripts\migrations\check-data.js
```

Lists row counts for key tables.

## Requirements

- Node.js 24+
- `.env` file with `DATABASE_URL` set
- CSV backup files in working directory
- `pg` package (installed via pnpm)

## CSV Format Expected

Scripts expect CSV files with headers matching database columns:
- `suppliers.csv`
- `products.csv`
- `invoices.csv`
- `invoice_items.csv`
- `price_alerts.csv`
- `dishes.csv`
- `cost_centers.csv`
- `user_categories.csv`

See `docs/` for sample data structure.

## Troubleshooting

**"duplicate key value" errors**
→ Data already in database. Use `load-backup-clean.js` without conflict checks.

**"column X does not exist"**
→ Database schema changed. Check if CSV columns match current database schema.

**"DATABASE_URL not set"**
→ Ensure `.env` is in root with valid PostgreSQL connection string.

## Notes

- All scripts use `ON CONFLICT (id) DO NOTHING` for safe re-runs
- Batch size: 1000 rows (configurable)
- Connection timeout: 60-120 seconds
- Scripts are transactional - all-or-nothing per batch

---

**Last Used**: June 18, 2026 - Migration to Neon
