# Threat Model

## Project Overview

Spendly is a public-facing SaaS for restaurants that stores supplier, invoice, product, menu-cost, and KSeF integration data, then exposes analytics and AI-assisted purchasing workflows through a React frontend and an Express API. The production attack surface is the `/api` backend in `artifacts/api-server/src`, backed by PostgreSQL via Drizzle, authenticated by Clerk, and deployed as a public autoscale Replit app.

## Assets

- **User accounts and sessions** — Clerk identities and session tokens gate access to all restaurant data and all state-changing API routes.
- **Restaurant business data** — supplier records, invoices, invoice XML, product catalogs, food-cost dishes, spend history, and price alerts reveal purchasing behavior and sensitive commercial relationships.
- **KSeF credentials** — NIP and encrypted KSeF token allow server-side access to external tax invoice data for a tenant.
- **Third-party service budgets and credentials** — OpenAI usage and KSeF API access can be abused to create billing impact, rate-limit exhaustion, or service disruption.
- **Application secrets** — database connection string, Clerk secret key, and `KSEF_ENCRYPTION_KEY` protect core trust boundaries.

## Trust Boundaries

- **Browser to API** — all frontend input is untrusted; every API route must authenticate and authorize by tenant.
- **API to PostgreSQL** — query filters on `user_id` are the main tenant-isolation control.
- **API to Clerk** — user identity is delegated to Clerk middleware and token/session validation.
- **API to KSeF** — server-side sync fetches invoice metadata and XML using stored tenant credentials.
- **API to OpenAI** — AI CFO, receipt/menu extraction, and product categorization send tenant-derived or tenant-supplied content to a third-party model provider.
- **Single instance vs autoscaled fleet** — production is an autoscale deployment, so in-memory flags and per-process throttles are not globally authoritative.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/*.ts`
- **Auth and tenant scoping:** `artifacts/api-server/src/middlewares/requireUser.ts`
- **Highest-risk areas:** `artifacts/api-server/src/routes/ksef.ts`, `artifacts/api-server/src/routes/ai-cfo.ts`, `artifacts/api-server/src/routes/invoices.ts`, `artifacts/api-server/src/routes/food-cost.ts`, `artifacts/api-server/src/services/insights-generator.ts`, `artifacts/api-server/src/lib/encryption.ts`
- **Public surface:** `/api/healthz` only; current business routes are mounted after `router.use(requireUser)`.
- **Privileged surface:** `artifacts/api-server/src/routes/admin.ts` guarded by `ADMIN_USER_IDS`.
- **Dev-only / usually out of scope:** `artifacts/mockup-sandbox/**`, generated `dist/**` outputs unless verifying compiled behavior.

## Threat Categories

### Spoofing

The API must accept requests only for the authenticated Clerk user and must not trust client-supplied tenant identifiers. Every protected route MUST derive identity from Clerk middleware plus `requireUser`, not from request bodies, query parameters, or frontend-only assumptions.

### Tampering

Invoice imports, KSeF pending-review acceptance, food-cost dish composition, and product/supplier mutations directly affect business records and reporting. The server MUST validate request bodies, bind every write to `req.userId`, and ensure attacker-controlled relationship IDs cannot point at another tenant’s rows.

### Information Disclosure

Invoices, supplier names, food-cost ingredients, KSeF XML, and KSeF tokens are sensitive business data. The application MUST keep KSeF secrets encrypted at rest, scope every read by tenant, avoid leaking raw secrets in logs or responses, and prevent relationship joins from exposing another tenant’s catalog or analytics metadata.

### Denial of Service

The app exposes authenticated endpoints that can trigger expensive database work, OpenAI calls, and multi-request KSeF synchronization. Because production runs on autoscale, the system MUST cap per-request fan-out, enforce quotas or throttles at the resource actually being consumed, and avoid designs where one tenant can amplify shared OpenAI/KSeF cost or cooldown state for other tenants.

### Elevation of Privilege

Tenant isolation is implemented in application code rather than database row-level security. All reads, updates, deletes, and relationship checks MUST enforce `user_id` ownership server-side, especially where numeric IDs are accepted in route params or body mappings, and admin-only behavior MUST remain unreachable to regular authenticated users.
