# Hypercross Deployment Checklist

Use this checklist before promoting a deployment beyond internal testing.

## Provisioning

- [ ] PostgreSQL provisioned (Render PostgreSQL or external managed Postgres)
- [ ] `DATABASE_URL` configured in the Render service environment
- [ ] Migrations applied: `npm run db:migrate` (against the production `DATABASE_URL`)
- [ ] `JWT_SECRET` generated (long random string, e.g. `openssl rand -hex 32`) and set
- [ ] `ENCRYPTION_KEY` generated and set (for any encrypted-at-rest linked-account credentials)
- [ ] `CHAINSTACK_RPC_URL` configured (HTTPS)
- [ ] `CHAINSTACK_WSS_URL` configured (optional, for future subscription features)
- [ ] Stripe products configured (Research / Trader / Pro)
- [ ] Stripe prices configured and copied into `STRIPE_PRICE_RESEARCH` / `STRIPE_PRICE_TRADER` / `STRIPE_PRICE_PRO`
- [ ] Stripe webhook configured, pointing at `https://<domain>/api/billing/webhook`, subscribed to: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- [ ] `STRIPE_WEBHOOK_SECRET` copied from the Stripe webhook endpoint into the environment
- [ ] Production domains configured: `HYPERCROSS_PUBLIC_URL`, `VITE_HYPERCROSS_API_URL`, `HYPERCROSS_API_URL`
- [ ] `ALLOWED_ORIGINS` configured with the exact production web origin(s)

## Build/verify

- [ ] `npm ci` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (Postgres/Chainstack-dependent tests will run automatically once `DATABASE_URL`/`CHAINSTACK_RPC_URL` are set in the test environment)
- [ ] `npm run build` (web build + typecheck) passes
- [ ] `npm run build:server` passes
- [ ] `npm run build:desktop` produces `release/Hypercross-Setup-<version>.exe`
- [ ] Backend health check passes: `curl https://<domain>/health/ready` returns `{"ready": true, ...}`

## Functional verification (manual, requires real credentials)

- [ ] Test customer registration succeeds (`POST /api/auth/v2/register`)
- [ ] Test customer login succeeds (`POST /api/auth/v2/login`)
- [ ] Stripe test-mode payment succeeds (`POST /api/billing/create-checkout-session` → complete checkout with a Stripe test card)
- [ ] Stripe webhook delivers `checkout.session.completed`/`customer.subscription.created` and the `subscriptions` row updates to `active`
- [ ] Subscription entitlement succeeds: `hasEntitlement(userId, "automated_trading")` returns `true` for a Trader/Pro plan
- [ ] Windows installer login succeeds against the deployed backend (`HYPERCROSS_API_URL` pointed at the Render domain)
- [ ] Chainstack backend connection succeeds: `GET /api/blockchain/status` reports `connected: true` with a real `blockNumber`

## Known gaps as of this pass

These items require infrastructure (a live Postgres instance, real Stripe test-mode keys, a real Chainstack endpoint, and a Windows machine/browser) that was **not available in the development sandbox** this repository was prepared in. They are implemented in code and type-checked, but not live-verified:

- Live Postgres connectivity (`checkPostgresHealth`, all Drizzle queries)
- Live Stripe checkout/webhook round trip
- Live Chainstack HTTPS/WSS connectivity
- An actual generated Windows installer (`electron-builder` requires a Windows or Wine-capable build agent; this sandbox is Linux-only)
- Render deployment itself (no Render account/project connected here)

See `REAL_STATUS_REPORT.md` and `HYPERCROSS_COMMERCIAL_DEPLOYMENT_REPORT.md` for full detail on what was verified vs. implemented-but-unverified.
