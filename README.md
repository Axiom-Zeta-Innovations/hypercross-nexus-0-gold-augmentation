<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Hypercross Nexus

Commercial-beta crypto trading/research platform: React web app, Electron
Windows desktop client, and a protected Express/Node backend with Chainstack
(EVM) connectivity, Stripe subscription billing, and PostgreSQL-backed
accounts/entitlements.

## Architecture

```
                      INTERNET
                          │
              ┌───────────┴────────────┐
              │                        │
              ▼                        ▼
       Hypercross Web          Hypercross Desktop
        (Vite/React)              (Electron)
              │                        │
              └──────────┬─────────────┘
                         │
                   HTTPS / WSS
                         │
                         ▼
              HYPERCROSS BACKEND (server.ts)
                Render deployment
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   PostgreSQL          Stripe         Chainstack
  (accounts, subs,   (billing,      (HTTPS RPC + WSS,
   entitlements,      webhooks)      Base/EVM reads
   audit, trades)                    & wallet-signed
                                      transactions)
```

- **Web** (`src/`, `vite.config.ts`) — existing React/Vite frontend, wagmi/RainbowKit wallet integration, portfolio/send/swap/trading UI.
- **Desktop** (`electron/`) — existing Electron shell, now with OS-backed secure token storage (`safeStorage`) for the commercial auth flow.
- **Backend** (`server.ts`, `server/`) — canonical protected API: Chainstack blockchain access, market data, trading/risk logic, and (new) PostgreSQL-backed auth, Stripe billing, and entitlements.
- **Database** (`database/`) — Drizzle ORM schema + generated SQL migrations for the production PostgreSQL account/platform database. Local SQLite (`src/db/index.ts`) remains for local-only development and legacy organization/wallet features.
- **Shared code** (`packages/shared`, `packages/api-client`) — shared TypeScript types and a typed API client usable by both web and desktop (not yet wired into the existing frontend fetch calls — see "Known limitations" below).

## Local development

**Prerequisites:** Node.js 20+, optionally a local PostgreSQL instance.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Configure Chainstack (required for blockchain features):
   - `BLOCKCHAIN_PROVIDER=chainstack`
   - `CHAINSTACK_NETWORK=base`
   - `CHAINSTACK_RPC_URL=https://<your-chainstack-rpc-endpoint>`
   - `CHAINSTACK_CHAIN_ID=8453`
   - `CHAINSTACK_PRIVATE_KEY=` (leave empty — server-side signing is disabled by default)
4. (Optional, for the commercial auth/billing routes) Configure PostgreSQL and Stripe:
   - `DATABASE_URL=postgres://user:pass@localhost:5432/hypercross`
   - `JWT_SECRET=<generate a long random string>`
   - `STRIPE_SECRET_KEY=`, `STRIPE_WEBHOOK_SECRET=`, `STRIPE_PRICE_RESEARCH/TRADER/PRO=`
   - `APP_BASE_URL=`, `EMAIL_PROVIDER_URL=`, and `EMAIL_PROVIDER_API_KEY=` for production password recovery
   - Apply migrations: `npm run db:migrate`
   - Without `DATABASE_URL` set, the app still runs for local development, but canonical web auth, billing, and intelligence routes are disabled. Legacy SQLite auth remains only for desktop/local compatibility and is not the production identity system.
5. Start the app:
   ```bash
   npm run dev
   ```
6. (Optional) Run the Electron desktop shell against the local dev server:
   ```bash
   npm run dev:electron
   ```

The server exposes `/api/blockchain/status` for the app shell and `/health`, `/health/live`, `/health/ready` for infrastructure monitoring. With `APP_DATA_MODE=live` and `LIVE_FEED_STRICT=true`, blockchain data is never silently replaced with demo data — a disconnected or misconfigured RPC is reported as a degraded/disconnected status instead.

## Capability status

| Capability | Status |
| --- | --- |
| Chainstack reads | Live |
| Native/ERC-20 transfers | Live, wallet-signed |
| 0x swaps | Beta |
| Transaction verification | Live |
| Portfolio | Beta |
| Authentication and Stripe billing | Production beta, Postgres required |
| Nexus deterministic intelligence | Beta, live market provider integration pending |
| Up/Down execution | Planned / Xero |
| Custody and mining | Simulated |

## Production deployment (Render)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full checklist. Summary:

1. Provision PostgreSQL (Render PostgreSQL or external) and set `DATABASE_URL`.
2. Run migrations: `npm run db:migrate` against the production database.
3. Set all required environment variables (see `.env.example`) in the Render service — `JWT_SECRET`, `ENCRYPTION_KEY`, `CHAINSTACK_RPC_URL`, `CHAINSTACK_WSS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `ALLOWED_ORIGINS`, `HYPERCROSS_PUBLIC_URL`.
4. Point the Render service at this repository root (leave **Root Directory** blank). Render builds with `npm ci && npm run build` and starts with `npm start` (see `render.yaml`). The server binds to `0.0.0.0:$PORT` and exposes `/health/ready` as the healthcheck path.
5. Configure a Stripe webhook endpoint pointing at `https://<your-domain>/api/billing/webhook` for: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.

## PostgreSQL migrations

Schema lives in [database/schema/index.ts](database/schema/index.ts); SQL migrations are generated into [database/migrations/](database/migrations/).

```bash
# After editing database/schema/index.ts:
npm run db:generate   # generates a new SQL migration file (no DB connection required)
npm run db:migrate    # applies pending migrations against DATABASE_URL
```

## Stripe

Required environment variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCH`, `STRIPE_PRICE_TRADER`, `STRIPE_PRICE_PRO`. Register the webhook endpoint `POST /api/billing/webhook` in the Stripe dashboard (or via the Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/billing/webhook`). Webhook events are the authoritative source of subscription state and are processed idempotently (see `webhook_events` table).

## Chainstack

Required: `CHAINSTACK_RPC_URL` (HTTPS), optional `CHAINSTACK_WSS_URL` (WSS, used only for future subscription features — HTTPS is always primary). These values are server-only — never logged with credentials, never returned in API responses, never bundled into the web/desktop client. See [docs/SECURITY.md](docs/SECURITY.md).

## Windows builds

```bash
npm run build:desktop
```

Produces `release/Hypercross-Setup-<version>.exe` (electron-builder, NSIS target). The installer bundles only the built frontend (`dist/`) and the Electron shell — no backend secrets, source, or credentials.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the full policy. In short: `CHAINSTACK_RPC_URL`/`CHAINSTACK_WSS_URL`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY` must never be prefixed `VITE_`, never appear in browser or Electron bundles, and never be committed to Git.

