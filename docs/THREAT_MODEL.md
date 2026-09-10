# Hypercross Threat Model

Scope: the production MVP financial paths — account/auth, wallet verification, portfolio,
native/ERC-20 transfers, 0x swaps, Chainstack access, transaction lifecycle, billing/entitlements.

For each threat: **Vector → Mitigation (implemented) → Residual risk**.

## 1. IDOR — reading/mutating another user's transaction

- **Vector**: Authenticated user A guesses/enumerates user B's transaction UUID and calls
  `GET /api/transactions/:id`, `POST /:id/submitted`, `POST /:id/cancelled`, `GET /:id/poll`.
- **Mitigation**: `TransactionService.getForUser(id, user)` requires the record's `userId` or
  `walletAddress` to match the caller; otherwise `404`. Applied to all four routes in `server.ts`.
- **Tests**: `tests/transaction-idor.test.ts`.
- **Residual risk**: Ownership is currently `userId` (legacy SQLite) OR `walletAddress` match. If
  two different accounts ever share a wallet address record (should be prevented by the `UNIQUE`
  constraint on `users.walletAddress`), review before relaxing that constraint.

## 2. Submitted-hash spoofing (claiming an unrelated successful transaction)

- **Vector**: Client calls `POST /api/transactions/:id/submitted` with a transaction hash that
  succeeded on-chain but has nothing to do with the prepared transfer/swap (wrong recipient/amount/
  contract), attempting to have it marked `CONFIRMED`.
- **Mitigation**: `verifyTransactionIntent()` compares the on-chain tx (`eth_getTransactionByHash`)
  against the server-recorded intent snapshot (`intentTo`, `intentData`, `value`, `chainId`, `from`)
  before allowing `CONFIRMED`. Mismatches → `INTEGRITY_FAILED`, never `CONFIRMED`.
- **Tests**: `tests/transaction-integrity.test.ts`.
- **Residual risk**: Intent snapshot does not yet cover swap intermediate routing hops beyond the
  top-level `to`/`data`/`value` from the 0x quote; a byte-for-byte calldata match is required, so
  any 0x route change requires a fresh quote (already enforced via quote TTL).

## 3. Wallet impersonation (claiming an address you don't control)

- **Vector**: Client claims wallet ownership by simply connecting a wallet extension/address,
  without proving control of the private key.
- **Mitigation**: `WalletVerificationService` requires an EIP-191 signature over a server-issued,
  time-boxed (10 min), single-use nonce (`server/wallet/WalletVerificationService.ts`). Only a
  verified wallet address is trusted for financial operations (`req.user.walletAddress`).
- **Residual risk**: Nonce/session store is SQLite-backed (single instance); a horizontally-scaled
  deployment needs a shared session/nonce store (documented, not yet implemented).

## 4. Malicious/spoofed token (fake USDC contract)

- **Vector**: Client requests a transfer/swap using a token symbol/address that isn't the real
  canonical token, hoping the server trusts client-supplied metadata.
- **Mitigation**: `TokenRegistry` is a server-side, hardcoded allowlist keyed by `(symbol, chainId)`;
  transfers resolve the contract address from the registry, never from client input directly.
- **Residual risk**: Swap `tokenIn`/`tokenOut` addresses passed to 0x are not yet cross-checked
  against `TokenRegistry` — see MVP_READINESS_REPORT.md "Known limitations" (token safety is PARTIAL).

## 5. Malicious DEX response (untrusted 0x quote fields)

- **Vector**: A compromised/misbehaving 0x response returns a spender or `to` address that isn't
  the genuine allowance-holder/router contract.
- **Mitigation**: Approval `spender` must equal the `allowanceTarget` from the same wallet's active
  0x quote (`SwapService.prepareApproval`); an arbitrary client-supplied spender is rejected.
- **Residual risk**: We trust the 0x API response's `to`/`data`/`allowanceTarget` fields themselves;
  there is no independent on-chain allowlist of known 0x router/allowance-holder addresses per chain.

## 6. Wrong-chain execution

- **Vector**: Wallet is connected to a different chain than the one the server prepared for.
- **Mitigation**: `assertMainnetWritesAllowed()` + intent verification's `chainId` check reject a
  transaction submitted on the wrong chain (`INTEGRITY_FAILED`). Prepare-time chain is taken from
  `blockchainService.getStatus().chainId` (the Chainstack-configured chain), not client input.
- **Residual risk**: Frontend-side "wallet chain === app chain" pre-check before opening the wallet
  signature dialog is a UX improvement, not a security boundary — the backend check is authoritative.

## 7. Replay attacks (signature/nonce reuse)

- **Vector**: A captured wallet-verification signature/nonce replayed later, or against a different
  session/domain.
- **Mitigation**: Nonces are single-use (deleted/marked verified on success) and expire after 10
  minutes; the signed message embeds the chain ID and app name to scope it to Hypercross.
- **Residual risk**: No explicit `domain`/`origin` binding beyond the message text (not full SIWE
  EIP-4361 with `domain`/`uri`/`version` fields) — recommended follow-up.

## 8. Stripe webhook spoofing

- **Vector**: Attacker POSTs a fabricated event to `/api/billing/webhook` claiming an active
  subscription.
- **Mitigation**: `stripe.webhooks.constructEvent()` verifies the `Stripe-Signature` HMAC against
  `STRIPE_WEBHOOK_SECRET` using the raw body; unverifiable requests are rejected with 400.
  Idempotent processing via `webhookEvents` primary-key insert.
- **Residual risk**: None known for this flow specifically; general webhook secret rotation
  procedure should be documented operationally.

## 9. XSS / CSRF / session theft

- **Vector**: Stored/reflected XSS exfiltrating session cookies or JWTs; CSRF against
  state-changing routes; cookie theft via insecure transport.
- **Mitigation**: `helmet` security headers, `httpOnly`/`sameSite` cookies, `secure` in production,
  React's default JSX escaping.
- **Residual risk**: **PARTIAL** — CSP is currently disabled (`contentSecurityPolicy: false`) for
  Vite asset compatibility; no explicit CSRF token middleware is present for state-changing
  cookie-authenticated routes (JWT-bearer routes are not CSRF-exposed the same way, but the legacy
  cookie-session routes are). Tracked in MVP_READINESS_REPORT.md.

## 10. Database compromise

- **Vector**: Attacker gains read access to Postgres/SQLite.
- **Mitigation**: Passwords are bcrypt-hashed (cost 12); refresh tokens are stored as SHA-256
  hashes, not plaintext; no private keys are ever stored (non-custodial architecture).
- **Residual risk**: `linked_accounts.encrypted_credentials` is a placeholder column not yet wired
  to AES-256-GCM (documented in `docs/SECURITY.md`); do not store real exchange secrets there yet.

## 11. RPC/Chainstack compromise or failure

- **Vector**: Chainstack endpoint returns malformed/malicious data, or is unavailable.
- **Mitigation**: No public-RPC fallback (`EnvironmentValidator`/`BlockchainProviderFactory` fail
  closed); mainnet writes require `ALLOW_MAINNET=true`; reads/writes fail with typed errors rather
  than fabricating data.
- **Residual risk**: Provider health states (HEALTHY/DEGRADED/UNAVAILABLE) are exposed via
  `/api/blockchain/status` but not yet used to automatically block financial *reads* from serving
  stale/partial portfolio data with a clear "stale" indicator in all cases — reviewed, PARTIAL.

## 12. Privilege escalation / trusting client-supplied role or subscription state

- **Vector**: Client sends `{"role": "OWNER"}` or `{"subscriptionActive": true}` in a request body.
- **Mitigation**: Role comes from the server-side session row (`requireAuth`); subscription/
  entitlement state comes from `EntitlementService`/`subscriptions` table, populated only from
  Stripe API responses (webhook-driven), never from client-supplied fields.
- **Residual risk**: None identified in the audited routes.

## 13. Dependency compromise

- **Vector**: A malicious/compromised npm dependency (e.g. `ethers`, `stripe`, `axios`) exfiltrates
  secrets or tampers with transaction data.
- **Mitigation**: `npm audit` should be run in CI (see MVP_READINESS_REPORT.md — CI workflow status).
- **Residual risk**: **NOT YET AUTOMATED** — no CI pipeline exists in this pass; run `npm audit`
  manually before each release until CI is added.

## 14. Logging leakage

- **Vector**: Secrets/PII end up in application logs (RPC URLs with embedded keys, JWTs, Stripe
  keys, private keys).
- **Mitigation**: `EnvironmentValidator.logStartupInfo()` redacts RPC/WSS URLs to
  `configured (<hostname>)`; `toErrorPayload()` returns only `{code, message}` to clients (no stack
  traces); `AuditService` metadata convention forbids secrets.
- **Residual risk**: No automated log-scrubbing test asserts this holds for *every* log call site;
  rely on code review discipline.
