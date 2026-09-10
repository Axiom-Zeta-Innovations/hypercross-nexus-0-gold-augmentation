# HYPERCROSS COMMERCIAL DEPLOYMENT REPORT

**Date:** 2026-09-01
**Scope:** Convert the existing Hypercross Nexus MVP into a commercial-beta-ready architecture (Railway + PostgreSQL + Stripe + protected backend + Windows desktop client), without rebuilding existing trading/blockchain/nonlinear functionality.

---

## 1. Architecture Before Modification

```
Single Express server (server.ts) + Vite/React frontend + Electron shell
        │
        ├── SQLite (better-sqlite3) — the ONLY persistence layer
        │     users, organizations, sessions, trades, linkedAccounts,
        │     walletVerification, userHoldings, transactions, auditLog
        │
        ├── Two parallel, disconnected auth systems:
        │     1. server.ts /api/auth/signup|signin (SQLite, scrypt hashing)
        │     2. api/auth/signup.ts|signin.ts (Vercel serverless functions,
        │        JSON file at /tmp/hypercross-auth-users.json — ephemeral,
        │        wiped on every container restart, never actually reachable
        │        from the Express server)
        │
        ├── Stripe: checkout/webhook routes already existed, SQLite-backed
        ├── Chainstack: BlockchainService/ChainstackProvider (already hardened
        │     in prior passes — Chainstack-only, no public RPC fallback,
        │     mainnet write interlock, RPC timeout, WSS optional)
        │
        └── No CORS, no Helmet, no rate limiting, no PostgreSQL, no Railway
              config, hardcoded PORT=3000, no graceful shutdown
```

## 2. Architecture After Modification

```
                      INTERNET
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
       Hypercross Web          Hypercross Desktop
              │                        │
              └──────────┬─────────────┘
                    HTTPS / WSS (CORS-restricted, Helmet, rate-limited)
                         ▼
              HYPERCROSS BACKEND (server.ts, unchanged file, extended)
                         │
        ┌────────────────┼─────────────────┬───────────────┐
        ▼                ▼                 ▼               ▼
   PostgreSQL         Stripe          Chainstack      SQLite (legacy/dev)
  (Drizzle ORM,     (webhooks are    (HTTPS RPC +     organizations, wallet
   users, sessions,  authoritative    WSS, resilient   verification, paper
   subscriptions,    for sub state)   reconnect)       trading, portfolio
   entitlements,                                       cache — UNCHANGED
   trade_history,
   audit_log)
```

- **Two auth systems now, by design, not by accident:** the legacy SQLite `/api/auth/signup|signin` (organizations, wallet verification, RBAC — all preserved, untouched) and the new PostgreSQL `/api/auth/v2/register|login|refresh|logout|me` (commercial accounts, sessions with rotating refresh tokens, Stripe subscriptions, entitlements). Both are mounted; the new one is gated behind `DATABASE_URL` being configured. **This is the one deviation from "there should be ONE canonical authentication system"** — see §17 Known Limitations for why, and the recommended cutover path.
- The Vercel `/tmp`-file prototype auth is **removed entirely** (was dead code — never reachable from the actual Express deployment target).

## 3. Files Created

| File | Purpose |
|---|---|
| `database/schema/index.ts` | Drizzle ORM schema: `users`, `sessions`, `subscriptions`, `entitlements`, `linked_accounts`, `strategies`, `trade_history`, `audit_log`, `webhook_events` |
| `database/migrations/0000_stiff_magneto.sql` | Generated SQL migration (initial schema) |
| `database/migrations/0001_wide_medusa.sql` | Generated SQL migration (`webhook_events` idempotency table) |
| `drizzle.config.ts` | Drizzle Kit config (schema path, migrations output, `DATABASE_URL`) |
| `scripts/migrate.ts` | Applies pending migrations via `npm run db:migrate` |
| `server/db/postgres.ts` | Postgres pool + Drizzle client; `isPostgresConfigured()`, `checkPostgresHealth()`, `closePostgresPool()` |
| `server/auth/ProductionAuthService.ts` | Register/login/refresh/revoke logic — bcrypt hashing, JWT access tokens, hashed+rotating refresh tokens |
| `server/auth/productionMiddleware.ts` | `requireProductionAuth`, `requireSubscription()`, `requireEntitlement(feature)` |
| `server/auth/productionAuthRoutes.ts` | `POST /register`, `/login`, `/refresh`, `/logout`, `GET /me` (Zod-validated, rate-limited) |
| `server/config/plans.ts` | Central Research/Trader/Pro → feature mapping; Stripe price id lookup from env |
| `server/entitlements/EntitlementService.ts` | `hasActiveSubscription`, `syncEntitlementsFromSubscription`, `hasEntitlement` |
| `server/billing/billingRoutes.ts` | `create-checkout-session`, `create-portal-session`, `subscription`, `subscription/cancel`, idempotent webhook handler |
| `server/audit/AuditService.ts` | `recordAuditEvent()` — durable audit trail, never crashes the caller |
| `railway.toml` | Railway build/start/healthcheck configuration |
| `docs/DEPLOYMENT.md` | Deployment checklist (§38 of the brief) |
| `docs/SECURITY.md` | Security policy (§39 of the brief) |
| `packages/shared/types.ts` | Shared `User`/`Subscription`/`Entitlement`/`Trade*`/`Portfolio`/`BlockchainStatus`/`ApiError` types |
| `packages/api-client/index.ts` | Typed fetch client (`api.auth.*`, `api.subscription.*`, `api.blockchain.*`, `api.portfolio.*`, `api.trading.*`) with configurable base URL |
| `tests/commercial.test.ts` | Plan config tests, secret-leakage tests, Postgres-gated auth/entitlement tests |
| `HYPERCROSS_COMMERCIAL_DEPLOYMENT_REPORT.md` | This report |

## 4. Files Modified

| File | Change |
|---|---|
| `server.ts` | Added Helmet, CORS (allowlist), request size limit, raw-body exclusion for webhook paths (**fixed a real pre-existing bug** — the global JSON parser would have consumed the Stripe webhook body before the route-level `express.raw()` middleware could see it), `PORT` now reads `process.env.PORT`, `/health`, `/health/live`, `/health/ready` endpoints, mounts `/api/auth/v2/*` and `/api/billing/*` when `DATABASE_URL` is set, graceful `SIGTERM`/`SIGINT` shutdown |
| `server/blockchain/providers/ChainstackProvider.ts` | WSS resiliency: exponential backoff + jitter reconnect, capped retry count, heartbeat/stale-connection detection, named-subscription resubscription after reconnect, clean shutdown |
| `electron/main.mjs` | New `safeStorage`-backed IPC handlers: `secure-store-set/get/delete`, `get-api-base-url` |
| `electron/preload.cjs` | Exposes the new secure-store/API-base-URL methods to the renderer |
| `src/types/electron.d.ts` | Type declarations for the new `window.electron` methods |
| `.env.example` | Full rewrite with `[SERVER ONLY]/[PUBLIC]/[DESKTOP]/[DEVELOPMENT]` labels; added `NODE_ENV`, `PORT`, `LOG_LEVEL`, `VITE_HYPERCROSS_API_URL`, `HYPERCROSS_API_URL`, `HYPERCROSS_PUBLIC_URL`, `ALLOWED_ORIGINS`, `DATABASE_URL`, `PG_POOL_MAX`, `JWT_SECRET`, `ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCH/TRADER/PRO` |
| `package.json` | New deps (`drizzle-orm`, `drizzle-kit`, `pg`, `bcryptjs`, `jsonwebtoken`, `zod`, `cors`, `helmet`, `express-rate-limit`, `stripe`); new scripts (`start`, `build:web`, `build:server`, `build:desktop`, `typecheck`, `db:generate`, `db:migrate`); `electron-builder` Windows/NSIS target config; moved `tsx` to production dependencies (required at runtime by `npm start`) |
| `README.md` | Full rewrite: architecture diagram, local dev, Railway deployment, migrations, Stripe, Chainstack, Windows builds, security summary |

## 5. Files Removed

| File | Reason |
|---|---|
| `api/auth/_store.ts` | Obsolete Vercel-serverless prototype — `/tmp`-file user persistence, never reachable from the actual Express deployment |
| `api/auth/signin.ts` | Same |
| `api/auth/signup.ts` | Same |
| `vercel.json` | Target deployment is Railway, not Vercel; no documented purpose remained |

## 6. Database Schema

See `database/schema/index.ts` / `database/migrations/*.sql` for the authoritative definitions. Summary:

- **users** — `id (uuid pk)`, `email (unique)`, `password_hash`, `display_name`, `status`, `email_verified`, `last_login_at`, `created_at`, `updated_at`
- **sessions** — `id (uuid pk)`, `user_id (fk cascade)`, `refresh_token_hash`, `device_information`, `expires_at`, `revoked_at`, `created_at`
- **subscriptions** — `id`, `user_id (fk)`, `stripe_customer_id`, `stripe_subscription_id (unique)`, `stripe_price_id`, `plan`, `status`, `current_period_start/end`, `cancel_at_period_end`, timestamps
- **entitlements** — `id`, `user_id (fk)`, `feature`, `enabled`, `usage_limit`, unique on `(user_id, feature)`
- **linked_accounts** — `id`, `user_id (fk)`, `provider`, `account_ref` (non-secret), `encrypted_credentials` (placeholder — see §17), `status`
- **strategies** — `id`, `user_id (fk)`, `name`, `config (jsonb)`, `enabled`
- **trade_history** — `id`, `user_id (fk)`, `strategy_id (fk, nullable)`, `symbol`, `side`, `quantity`, `price`, `execution_status`, `exchange`, `client_order_id (unique)`, `exchange_order_id`, `metadata (jsonb)`, timestamps
- **audit_log** — `id`, `user_id (fk, nullable)`, `action`, `metadata (jsonb)`, `request_id`, `created_at`
- **webhook_events** — `id (Stripe event id, pk)`, `type`, `processed_at` — the idempotency ledger for Stripe webhooks

Migrations were **generated** (`npx drizzle-kit generate`) and are real, syntactically valid PostgreSQL DDL — verified by reading the generated SQL — but **not applied against a live database** (none was available in this sandbox).

## 7. API Routes (new, PostgreSQL-backed)

| Route | Method | Notes |
|---|---|---|
| `/api/auth/v2/register` | POST | Zod-validated, rate-limited, bcrypt hash, issues access+refresh tokens |
| `/api/auth/v2/login` | POST | Generic failure message (user-enumeration hardening), rate-limited |
| `/api/auth/v2/refresh` | POST | Rotates refresh token, revokes the old session row |
| `/api/auth/v2/logout` | POST | Revokes the specific session |
| `/api/auth/v2/me` | GET | Requires `Authorization: Bearer <accessToken>` |
| `/api/billing/create-checkout-session` | POST | Auth required; creates/reuses Stripe customer, returns Checkout URL |
| `/api/billing/create-portal-session` | POST | Auth required; returns Billing Portal URL |
| `/api/billing/subscription` | GET | Auth required |
| `/api/billing/subscription/cancel` | POST | Auth required; sets `cancel_at_period_end` |
| `/api/billing/webhook` | POST | Raw body, Stripe signature verified, idempotent via `webhook_events` |
| `/health`, `/health/live` | GET | Process liveness |
| `/health/ready` | GET | Reports Postgres + Chainstack dependency health; fails (503) if Postgres is configured but unreachable |

**Existing routes preserved unchanged:** `/api/auth/signup|signin|logout|me` (SQLite), `/api/checkout/*`, `/api/webhooks/stripe`, `/api/subscription`, `/api/subscription/cancel`, `/api/blockchain/status`, `/api/portfolio/*`, `/api/transfers/*`, `/api/swap/*`, `/api/trading/quote`, `/api/paper/*`, `/api/wallet/*`, `/api/config/features`, `/api/health`, `/api/ready`.

## 8. Authentication Architecture

Two systems, intentionally kept separate rather than risking a breaking rewrite of the deeply-integrated organization/RBAC/wallet-verification system:

1. **Legacy (SQLite, cookie session)** — `server/auth.ts`, unchanged. Powers organizations, RBAC roles, wallet-signature verification, paper trading, portfolio. This is real, working, tested code (`tests/security.test.ts` — 5 tests, all passing) and was **not** touched.
2. **Commercial (PostgreSQL, JWT + rotating refresh token)** — `server/auth/ProductionAuthService.ts`. Bcrypt (work factor 12), 15-minute access tokens, 30-day refresh tokens (SHA-256-hashed at rest, rotated on every refresh, revocable). This is the system Stripe subscriptions/entitlements attach to.

## 9. Stripe Architecture

`server/billing/billingRoutes.ts` using the official `stripe` Node SDK (v22). Checkout Session (subscription mode) → webhook (`checkout.session.completed` retrieves the subscription; `customer.subscription.*` and `invoice.*` keep it in sync) → `applySubscriptionUpdate()` writes to `subscriptions` and calls `syncEntitlementsFromSubscription()`. Idempotency is enforced by inserting the Stripe event id into `webhook_events` (primary key) before processing — a duplicate delivery is acknowledged but not reprocessed. **The browser returning from Stripe checkout never grants entitlement itself** — only the webhook does.

**Bug found and fixed while wiring this up:** the pre-existing `/api/webhooks/stripe` route (and, without this fix, the new `/api/billing/webhook` route) would have received an already-JSON-parsed `req.body` instead of a raw buffer, because the global `express.json()` middleware ran before the route-level `express.raw()` middleware and both matched `content-type: application/json`. Stripe signature verification requires the raw, unparsed body. Fixed by excluding both webhook paths from the global JSON parser (`RAW_BODY_PATHS` set in `server.ts`).

## 10. Entitlement Architecture

`server/config/plans.ts` centralizes the Research/Trader/Pro → feature mapping (Trader ⊇ Research, Pro ⊇ Trader, per the brief). `server/entitlements/EntitlementService.ts` recomputes and persists per-feature `entitlements` rows whenever a subscription changes. `requireEntitlement(feature)` / `requireSubscription()` middleware protect routes server-side — the frontend is never trusted for authorization, only UX.

## 11. Chainstack Architecture

Unchanged core (from prior passes): Chainstack-only enforcement (no public RPC fallback — throws `CHAINSTACK_CONFIGURATION_ERROR`), mainnet write interlock (`ALLOW_MAINNET`), RPC timeout, dual health check (`eth_chainId` + `eth_blockNumber`), sanitized logging.

**New in this pass:** WSS resiliency — exponential backoff with jitter (1s → 30s cap), a 20-attempt ceiling, a 30-second heartbeat ping with 90-second staleness detection that force-closes a dead socket, and a named-subscription registry so reconnection resubscribes existing listeners without creating duplicates. `getWebSocketStatus()` is surfaced via `/api/blockchain/status` as `wssHealthy`/`wssConfigured`. HTTPS remains fully independent of WSS state at all times.

## 12. Desktop Architecture

Electron shell preserved (`electron/main.mjs`, `preload.cjs`, `database.mjs` — all unchanged except the additions below). New: `safeStorage`-backed secure token storage (`secure-store-set/get/delete` IPC handlers) so access/refresh tokens are encrypted at rest using the OS credential store rather than `localStorage` or plaintext JSON. `get-api-base-url` IPC handler resolves `HYPERCROSS_API_URL` for the renderer. **Not done in this pass:** wiring the React frontend's login/API calls to actually use `packages/api-client` + `secureStoreSet/Get` instead of the existing `fetch("/api/auth/signup")` calls — see §17.

## 13. Railway Configuration

`railway.toml`: Nixpacks builder, `npm ci && npm run build`, start command `npm run start`, healthcheck `/health/ready`, restart-on-failure (5 retries). `server.ts` now binds `process.env.PORT` (was hardcoded `3000`), `app.set("trust proxy", 1)` for correct client IPs behind Railway's proxy, and clean `SIGTERM`/`SIGINT` handling that closes the HTTP server, disconnects Chainstack, and closes the Postgres pool before exit.

## 14. Required Environment Variables

See the rewritten `.env.example` (labeled `[SERVER ONLY]/[PUBLIC]/[DESKTOP]/[DEVELOPMENT]`). Full list: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `VITE_HYPERCROSS_API_URL`, `HYPERCROSS_API_URL`, `HYPERCROSS_PUBLIC_URL`, `APP_URL`, `ALLOWED_ORIGINS`, `DATABASE_URL`, `PG_POOL_MAX`, `JWT_SECRET`, `ENCRYPTION_KEY`, `BLOCKCHAIN_PROVIDER`, `CHAINSTACK_NETWORK/RPC_URL/WSS_URL/CHAIN_ID/API_KEY/PROJECT_ID/NODE_ID/PRIVATE_KEY/WALLET_ADDRESS/NATIVE_CURRENCY/RPC_TIMEOUT_MS`, `LIVE_FEED_STRICT`, `APP_DATA_MODE`, `ALLOW_MAINNET`, `ENABLE_SERVER_SIGNER`, `ENABLE_DEBUG_RPC`, `ZEROX_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCH/TRADER/PRO`, `FEATURE_*` (9 flags), `LEGACY_BLOCKCHAIN_PROVIDER`.

## 15. Build Commands

```bash
npm install            # or npm ci in CI/Railway
npm run dev             # local dev server (tsx server.ts)
npm run dev:electron    # local dev server + Electron shell
npm run typecheck       # tsc --noEmit
npm run test            # node:test runner
npm run build           # vite build (web) + typecheck
npm run build:web       # vite build only
npm run build:server    # tsc --noEmit (no separate server bundle step — tsx runs server.ts directly)
npm run build:desktop   # vite build + electron-builder --win
npm run db:generate     # drizzle-kit generate (no DB connection required)
npm run db:migrate      # applies migrations against DATABASE_URL
npm run start           # production server start (tsx server.ts, honors PORT)
```

## 16. Test Results (actual output, this session)

```
$ npm run lint
> tsc --noEmit
(0 errors)

$ npm test
✔ token registry: every configured token address is valid
✔ token registry: at least one token is registered per supported testnet chain
✔ BlockchainProviderFactory: throws CHAINSTACK_CONFIGURATION_ERROR when CHAINSTACK_RPC_URL is missing
✔ BlockchainProviderFactory: never falls back to a public RPC when CHAINSTACK_RPC_URL is absent
﹣ Chainstack integration: eth_chainId and eth_blockNumber succeed (skipped — no CHAINSTACK_RPC_URL)
﹣ Chainstack integration: ERC-20 symbol()/decimals() resolve (skipped — no CHAINSTACK_RPC_URL)
✔ plan config: Trader plan includes everything in Research plus trading/portfolio
✔ plan config: Pro plan includes everything in Trader plus advanced strategies
✔ plan config: 'none' plan grants no features
✔ plan config: Stripe price ids come from environment, not hard-coded
✔ secrets: .env.example contains only placeholders for server-only secrets
✔ secrets: no real Stripe/JWT/Postgres secrets are committed in tracked source
﹣ auth: register + login + refresh + logout round trip (skipped — no DATABASE_URL)
﹣ auth: duplicate registration and wrong password are rejected (skipped — no DATABASE_URL)
﹣ entitlements: user without an active subscription is denied a paid feature (skipped — no DATABASE_URL)
✔ password hashing verifies correctly
✔ session token and cookie helpers are present
✔ role permissions include required access
✔ organization membership is enforced by identity
✔ requireAuth rejects missing session

tests 20, pass 15, fail 0, skipped 5

$ npm run build
✓ vite build succeeded (~24s, chunk-size warnings only, non-blocking)
✓ tsc --noEmit succeeded

$ grep -rlE "STRIPE_SECRET_KEY|JWT_SECRET|ENCRYPTION_KEY|CHAINSTACK_RPC_URL|CHAINSTACK_WSS_URL|DATABASE_URL|STRIPE_WEBHOOK_SECRET" dist/
(no matches — exit code 1, confirmed zero secret leakage into the client bundle)

$ grep -rlE "sk_live_|whsec_[A-Za-z0-9]{10,}|-----BEGIN.*PRIVATE KEY-----" (repo-wide, excluding node_modules)
(no matches outside the test file that defines these patterns as strings)
```

`npx drizzle-kit generate` ran successfully twice (initial schema, then the `webhook_events` addition), confirming the schema is syntactically valid and produces real PostgreSQL DDL.

## 17. Known Limitations

1. **No live Postgres, Stripe, or Chainstack credentials in this sandbox.** All new code is type-checked and unit-tested where possible, but the actual database round trip, Stripe checkout/webhook round trip, and Chainstack RPC/WSS connectivity were never executed against real infrastructure in this session. The 5 skipped tests document exactly which behaviors need live verification.
2. **Two authentication systems coexist** (`/api/auth/signup|signin` SQLite-legacy and `/api/auth/v2/*` Postgres-commercial) rather than one canonical system, because fully migrating the existing organization/RBAC/wallet-verification features (which are deeply integrated with the SQLite `sessions`/`organizationMembers` tables) to Postgres in a single pass was judged too high-risk for "do not remove working functionality." **Recommended next step:** once Postgres is live in a real environment, migrate `organizations`/`organizationMembers`/`walletVerification` to Postgres tables (schemas can extend `database/schema/index.ts`), then point the frontend's `/api/auth/signup|signin` calls at `/api/auth/v2/register|login` and delete the SQLite auth path.
3. **Frontend/desktop not yet wired to the new API client or commercial auth.** `packages/api-client` and `packages/shared/types.ts` exist and type-check, but `src/App.tsx` still calls `fetch("/api/auth/signup")` directly (the legacy path) and does not yet use `secureStoreSet/Get` for token storage. Wiring this up is the natural next PR — it was deferred in favor of getting the backend commercial infrastructure correct and tested first.
4. **`linked_accounts.encrypted_credentials` is a placeholder column**, not yet wired to an actual AES-256-GCM encryption routine. Do not store real customer exchange secrets there until that routine is implemented per `docs/SECURITY.md` §"Customer exchange credential model".
5. **No monorepo restructuring** (`apps/web`, `apps/desktop`, `server/src/index.ts`, npm workspaces) was performed. The brief explicitly permits this ("not a requirement to mechanically move every file... prioritize a clean working architecture over cosmetic restructuring"); given the risk of breaking the existing, working Vite/Electron/Express wiring, this was deferred. `packages/shared` and `packages/api-client` were added as plain TypeScript modules (imported via relative paths), not yet formalized as installable npm workspace packages.
6. **Windows installer was not actually built.** `electron-builder --win` (NSIS) requires a Windows or Wine-capable build agent; this sandbox is Linux-only. The `build` config in `package.json` is real and correct, but `npm run build:desktop` was not executed end-to-end here.
7. **Railway deployment was not performed** — no Railway account/project is connected to this sandbox. `railway.toml` and `docs/DEPLOYMENT.md` are ready to use but unverified against an actual Railway service.
8. **Rate limiting only covers the new `/api/auth/v2/*` routes**, not the legacy `/api/auth/signup|signin`. Recommended follow-up: add `express-rate-limit` to the legacy routes too.
9. **`entitlements.usageLimit`** exists in the schema but no route currently enforces numeric usage limits (e.g., "N trades/month") — only boolean feature gating (`requireEntitlement`) is implemented.
10. **`LOG_LEVEL`** is documented in `.env.example` but no structured logger (pino/winston) was added in this pass — existing `console.log`/`console.error` calls remain. A structured logger with request-id correlation is a reasonable next step.

## 18. Remaining Production Risks

- Rotate any credentials that were ever pasted into a chat/terminal history outside of `.env` during setup — none were found committed in this repository, but this is a standing operational reminder, not something this pass could detect.
- The dual-auth-system state (§17.2) is the biggest architectural risk to track — it must not be allowed to drift further before the Postgres migration of organizations/RBAC is completed.
- `ChainstackProvider`'s WSS reconnect logic accesses `(provider as any).websocket` — this relies on ethers v6's internal Node.js `ws` wrapper shape. If ethers is upgraded, verify this still exposes `.on()`/`.ping()`/`.terminate()` the same way (a compile-time type error would not catch a runtime shape change since it's accessed via `any`).
- No integration test currently exercises the full Stripe webhook signature verification path (only unit-level plan-mapping tests) — recommended: use the Stripe CLI (`stripe trigger checkout.session.completed`) against a running instance with `DATABASE_URL` set, before first production Stripe cutover.

## 19. Manual Setup Required (cannot be automated from this sandbox)

1. Provision a PostgreSQL instance (Railway plugin or external) and set `DATABASE_URL`.
2. Run `npm run db:migrate` against it.
3. Generate and set `JWT_SECRET` and `ENCRYPTION_KEY` (e.g. `openssl rand -hex 32`).
4. Create Stripe products/prices for Research/Trader/Pro; set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`.
5. Register the Stripe webhook endpoint and set `STRIPE_WEBHOOK_SECRET`.
6. Obtain a real Chainstack HTTPS/WSS endpoint; set `CHAINSTACK_RPC_URL`/`CHAINSTACK_WSS_URL`.
7. Set `ALLOWED_ORIGINS` to the real production web domain(s).
8. Connect a Railway project, set all environment variables in its dashboard, deploy.
9. On a Windows machine (or CI with a Windows/Wine agent), run `npm run build:desktop` and verify the generated `Hypercross-Setup-<version>.exe` installs and launches.
10. Perform the full manual verification checklist in `docs/DEPLOYMENT.md` §"Functional verification".

## 20. Exact Next Steps to Deploy

1. `git clone` this repository (private).
2. `cp .env.example .env` and fill in every `[SERVER ONLY]` value for your environment.
3. `npm install`
4. `npm run db:migrate` (after provisioning Postgres)
5. `npm run typecheck && npm test && npm run build`
6. Push to the Railway-connected branch, or `railway up` if using the Railway CLI.
7. Set the Stripe webhook URL to `https://<railway-domain>/api/billing/webhook`.
8. Verify `curl https://<railway-domain>/health/ready` returns `{"ready": true, ...}`.
9. Perform a Stripe test-mode checkout end-to-end and confirm the `subscriptions` row updates.
10. On Windows: `npm run build:desktop`, install the generated `.exe`, log in with a test account, confirm it reaches the deployed backend (`HYPERCROSS_API_URL` pointed at the Railway domain).

---

**Nothing above is disguised as a completed production integration when it was not verified.** Every "REAL" claim in this report is backed by either a passing automated test in this session or a direct code-reading confirmation (e.g., the generated SQL migrations, the secret-scan results). Every item that could not be verified live is listed explicitly in §17–§19.
