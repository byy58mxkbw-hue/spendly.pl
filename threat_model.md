# Threat Model

## Project Overview

CheckIT is a public-facing SaaS for restaurants that stores supplier, invoice, product, and KSeF integration data, then exposes analytics and AI-generated purchasing insights through a React frontend and an Express API. The production attack surface is the `/api` backend in `artifacts/api-server/src`, backed by PostgreSQL via Drizzle, authenticated by Clerk, and deployed as a public autoscale Replit app.

## Assets

- **User accounts and sessions** — Clerk identities and session tokens gate access to all restaurant data and all state-changing API routes.
- **Restaurant business data** — supplier records, invoices, invoice XML, product catalogs, spend history, and price alerts reveal purchasing behavior and sensitive commercial relationships.
- **KSeF credentials** — NIP and encrypted KSeF token allow server-side access to external tax invoice data for a tenant.
- **Third-party service budgets and credentials** — OpenAI usage and KSeF API access can be abused to create billing impact, rate-limit exhaustion, or service disruption.
- **Application secrets** — database connection string, Clerk secret key, and `KSEF_ENCRYPTION_KEY` protect core trust boundaries.

## Trust Boundaries

- **Browser to API** — all frontend input is untrusted; every API route must authenticate and authorize by tenant.
- **API to PostgreSQL** — query filters on `user_id` are the main tenant-isolation control.
- **API to Clerk** — user identity is delegated to Clerk middleware and token/session validation.
- **API to KSeF** — server-side sync fetches invoice metadata and XML using stored tenant credentials.
- **API to OpenAI** — AI insight generation sends derived restaurant purchasing data to a third-party model provider.
- **Single instance vs autoscaled fleet** — production is an autoscale deployment, so in-memory locks, caches, and “currently running” flags are not globally authoritative.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`
- **Auth and tenant scoping:** `artifacts/api-server/src/middlewares/requireUser.ts`
- **Highest-risk areas:** `artifacts/api-server/src/routes/ksef.ts`, `artifacts/api-server/src/routes/insights.ts`, `artifacts/api-server/src/services/insights-generator.ts`, `artifacts/api-server/src/lib/encryption.ts`
- **Public surface:** `/api/healthz` only; all other current routes are authenticated after `router.use(requireUser)`.
- **Dev-only / usually out of scope:** `artifacts/mockup-sandbox/**`, generated `dist/**` outputs unless verifying compiled behavior.

## Threat Categories

### Spoofing

The API must accept requests only for the authenticated Clerk user and must not trust client-supplied tenant identifiers. Every protected route MUST derive identity from Clerk middleware plus `requireUser`, not from request bodies or query parameters.

### Tampering

Invoice imports, KSeF pending-review acceptance, and product/supplier mutations directly affect business records and reporting. The server MUST validate request bodies, bind every write to `req.userId`, and ensure attacker-controlled input cannot alter another tenant’s records or inject unintended SQL.

### Information Disclosure

Invoices, supplier names, KSeF XML, and KSeF tokens are sensitive business data. The application MUST keep KSeF secrets encrypted at rest, scope every read by tenant, avoid leaking raw secrets in logs or responses, and treat third-party AI/export integrations as data egress boundaries that require deliberate control.

### Denial of Service

The app exposes authenticated endpoints that can trigger expensive database work, OpenAI calls, and multi-request KSeF synchronization. Because production runs on autoscale, the system MUST not rely on per-process memory flags as the only guard against repeated or concurrent expensive jobs; abuse by one tenant must not be able to multiply work across instances or exhaust shared quotas.

### Elevation of Privilege

Tenant isolation is implemented in application code rather than database row-level security. All reads, updates, deletes, and relationship checks MUST enforce `user_id` ownership server-side, especially where numeric IDs are accepted in route params or body mappings.
