# SPENDLY

Aplikacja SaaS dla restauracji do monitorowania cen surowców z faktur KSeF. Właściciel restauracji importuje faktury od swoich dostawców, śledzi zmiany cen składników i reaguje na podwyżki zanim uderzą w food cost.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ksef-monitor run dev` — run the frontend (port 22900)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `KSEF_ENCRYPTION_KEY` — 32+ char secret used to AES-256-GCM encrypt the KSeF token at rest

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 at `/api` path
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (via `@clerk/express` on server, `@clerk/react` on client)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + shadcn/ui + Tailwind, recharts, wouter routing

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas (from codegen)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks
- `lib/db/src/schema/` — Drizzle ORM schemas (suppliers, products, invoices, invoice-items, price-alerts)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/ksef-monitor/src/pages/` — React frontend pages
- `artifacts/ksef-monitor/src/components/layout.tsx` — sidebar + layout shell

## Architecture decisions

- `invoice_date` stored as TEXT (YYYY-MM-DD) in PostgreSQL — use substring/string ops for grouping, not date_trunc directly with Drizzle column refs
- `db.execute(sql\`...\`)` returns `{ rows: [...] }` not an array — always access `.rows` property
- When using raw SQL GROUP BY with Drizzle, use positional GROUP BY (e.g., `GROUP BY 1, 2, 3`) and `sql.raw()` for LIMIT to avoid parameter binding issues
- Clerk auth uses `publishableKeyFromHost` to support both dev and prod domains; proxy via `/clerk` path
- All prices formatted with Polish locale (`pl-PL`, `PLN` currency)

## Product

- **Dashboard** — summary stats, monthly food cost bar chart, recent purchases with price change indicators, top price changes
- **Dostawcy** — list of suppliers as cards, add/delete, click-through to supplier detail with invoice history
- **Produkty** — searchable table of all tracked products with latest/previous price and % change, click for price history chart
- **Faktury** — list of imported invoices, import new invoice with optional KSeF XML content
- **Alerty cenowe** — configure price change thresholds per product/supplier, view triggered alerts
- **KSeF sync** — manual "Synchronizuj z KSeF" button on Faktury pulls buyer invoices via prod API v2; auto-imports when supplier (by NIP) and all products (by name) match, else queues into **Do przeglądu** for manual supplier/product mapping
- **Ustawienia KSeF** — store NIP + token (token encrypted at rest with `KSEF_ENCRYPTION_KEY`, masked to last 4 chars on read)

## User preferences

- Polish UI language throughout
- Prices formatted: `new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price)`
- Dates formatted: `new Date(date).toLocaleDateString('pl-PL')`
- Design style: clean, minimal, lots of whitespace — inspired by cheff.it
- Primary accent color: teal `hsl(173, 80%, 40%)` = `#14B8A6`
- No emojis in UI

## Gotchas

- **Always restart api-server after changing route files** — it runs a pre-built dist bundle
- `lib/api-zod/src/index.ts` must only export `export * from "./generated/api"` — orval overwrites it
- `invoice_date` column is type TEXT not DATE — use string functions for date operations in raw SQL
- `db.execute()` returns `QueryResult` not `Row[]` — use `.rows` to get the array
- Price/quantity columns are `numeric` type — pass numeric values not text strings when inserting

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
