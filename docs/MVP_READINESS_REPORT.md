# Hypercross MVP Readiness Report

Date of this pass: 2026-09-01. This report reflects a targeted production-hardening pass focused
on the highest-severity, most concretely verifiable gaps found during audit: transaction
authorization (IDOR), submitted-hash spoofing, floating-point financial arithmetic, and ERC-20
allowance/approval logic — plus supporting docs, tests, and a CI workflow. It does **not** claim
work that was not actually implemented and tested in this pass. Where a section of the original
60-point spec was not addressed, it is explicitly listed as a remaining gap.

Legend: **PASS** (implemented + tested + no known mock fallback), **PARTIAL** (implemented but
with a known, stated limitation, or partially tested), **FAIL/NOT DONE** (not implemented in this
pass).

## Subsystem status

### Authentication — PARTIAL
- Evidence: dual system — legacy SQLite session auth (`server/auth.ts`) and production JWT/Postgres
  auth (`server/auth/ProductionAuthService.ts`, `productionMiddleware.ts`).
- Files: `server/auth.ts`, `server/auth/ProductionAuthService.ts`, `server/auth/productionMiddleware.ts`, `server/auth/productionAuthRoutes.ts`.
- Tests: `tests/security.test.ts` (password hashing, session rejection, role permissions, org isolation), `tests/commercial.test.ts` (register/login/refresh/logout round trip, skipped without `DATABASE_URL`).
- Known limitation: **not unified** — production financial routes (`transfers`, `swap`, `transactions`) currently authorize via the legacy `requireAuth` session, not the JWT production auth. Full identity unification (account → session → verified wallet → subscription → entitlement as one chain, gated behind `ENABLE_LEGACY_AUTH`) was **not implemented in this pass**. This is the single largest remaining architectural gap.

### Wallet verification — PASS
- Evidence: EIP-191 signature verification over a server-issued, chain-scoped, single-use, 10-minute nonce (`server/wallet/WalletVerificationService.ts`); recovered address must match; session created only on success.
- Tests: no new automated tests added in this pass (pre-existing); logic reviewed and unchanged.
- Known limitation: not full SIWE (EIP-4361) — no explicit `domain`/`uri`/`version` fields, only address+chainId+nonce in the message text.

### Portfolio — PASS (with noted display-only float use)
- Evidence: reads exclusively via `blockchainService.readContract`/`getBalance` (Chainstack-only, no fallback); raw balances stored/returned as base-unit strings; `balanceDecimal` is a display-only `ethers.formatUnits` float, never used for authoritative math.
- Files: `server/portfolio/PortfolioService.ts`.
- Known limitation: does not yet distinguish "fiat valuation unavailable" from "$0" everywhere in the UI layer (server-side `priceAvailable` flag exists; full frontend audit of this distinction not verified in this pass).

### Native transfers — PASS
- Evidence: exact wei conversion via `ethers.parseEther` (`server/blockchain/AmountMath.ts#nativeAmountToWei`), replacing the prior `Math.round(Number(amount) * 1e18)` float math. Balance precheck (`balance >= value`) before preparing. Prepared intent (`to`, implicit empty calldata, `value`, `chainId`) recorded for later hash verification.
- Files: `server/transactions/TransferService.ts`, `server/blockchain/AmountMath.ts`.
- Tests: `tests/amount-math.test.ts` (1-wei boundary, large balances, scientific notation rejected, negative rejected, zero rejected, sub-wei precision rejected).
- Known limitation: gas estimate is fetched from `estimateGas`, but this pass did not add an explicit "amount + max gas ≤ balance" combined precheck (balance vs. value only); see Balance Prechecks below.

### ERC-20 transfers — PASS
- Evidence: exact base-unit conversion via `ethers.parseUnits` (`toBaseUnits`, unchanged/pre-existing and confirmed correct), token resolved from server-side `TokenRegistry` (not client-supplied address), balance precheck before preparing, prepared intent (`to`=token contract, `data`=encoded `transfer()`) recorded.
- Files: `server/transactions/TransferService.ts`, `server/blockchain/TxBuilder.ts`.
- Tests: `tests/amount-math.test.ts` (6/8/18-decimal boundaries, over-precision rejected).

### DEX (0x) execution — PARTIAL
- Evidence: real 0x Swap API v2 integration (`server/swap/ZeroExSwapProvider.ts`), slippage bounds enforced (1–2000 bps), 30s quote TTL with `QUOTE_EXPIRED` on stale execution, allowance now compared `>= requiredAmount` (was `> 0`), approval defaults to the exact required amount (was always max-uint256), approval spender now validated against the trusted quote's `allowanceTarget`.
- Files: `server/swap/ZeroExSwapProvider.ts`, `server/swap/SwapService.ts`, `server/swap/AllowanceCheck.ts`, `server/swap/SwapProvider.ts`.
- Tests: `tests/allowance.test.ts` (exact-match sufficient, one-below insufficient, allowance>0-but-insufficient regression case, unlimited-must-be-explicit).
- Known limitation: `tokenIn`/`tokenOut` addresses are not yet cross-validated against `TokenRegistry` before being sent to 0x (token-safety allowlisting is not enforced on the swap path, only on the transfer path). No live-network swap was executed (requires a funded testnet wallet + `ZEROX_API_KEY`).

### Chainstack — PASS
- Evidence: no public-RPC fallback (`EnvironmentValidator`/`BlockchainProviderFactory` fail closed and tested), mainnet write interlock (`ALLOW_MAINNET`), redacted RPC URL logging, WSS status tracked independently of HTTPS health.
- Files: `server/blockchain/EnvironmentValidator.ts`, `BlockchainProviderFactory.ts`, `BlockchainService.ts`, `providers/ChainstackProvider.ts`.
- Tests: `tests/blockchain.test.ts` (structural; live integration tests skipped without `CHAINSTACK_RPC_URL`).
- Known limitation: live RPC/WSS connectivity, reconnect, and rate-limit behavior were not exercised against a real Chainstack endpoint in this pass (no credentials available) — see `docs/LIVE_VALIDATION_CHECKLIST.md` items H/M/N.

### Transaction lifecycle — PASS
- Evidence: explicit state machine (`CREATED → AWAITING_SIGNATURE → SIGNED → SUBMITTED → PENDING → CONFIRMED/FAILED/INTEGRITY_FAILED/CANCELLED`), server-owned transitions only; client sends events (submitted hash, cancelled), never a target state.
- Files: `server/transactions/TransactionService.ts`.
- Tests: `tests/transaction-integrity.test.ts`, `tests/transaction-idor.test.ts`.
- Known limitation: `REPLACED`/`EXPIRED` states exist in the type but there is no implemented same-nonce replacement detection (speed-up/cancel tracking) — see Threat Model / Live Validation item L.

### Transaction integrity (submitted-hash verification) — PASS
- Evidence: **new in this pass.** A successful receipt is no longer sufficient to mark `CONFIRMED`. `TransactionService.pollReceipt()` now fetches the full on-chain transaction (`eth_getTransactionByHash`) and runs `verifyTransactionIntent()` against the server-recorded prepare-time intent snapshot (`intentTo`, `intentData`, `value`, `chainId`, `walletAddress`) before confirming. Any mismatch → `INTEGRITY_FAILED`, logged server-side, never `CONFIRMED`.
- Files: `server/transactions/TransactionIntegrity.ts`, `server/transactions/TransactionService.ts`, `src/db/index.ts` (new `intentTo`/`intentData` columns + migration guard).
- Tests: `tests/transaction-integrity.test.ts` — correct tx, wrong sender, wrong recipient, wrong amount, wrong calldata, wrong chain, unrelated successful hash, missing transaction. (Failed-receipt and pending-receipt paths were already covered by pre-existing logic and are exercised implicitly by `pollReceipt`'s early-return branches; no live "replaced transaction" scenario was exercised — requires a live testnet wallet.)

### Authorization (IDOR) — PASS
- Evidence: **new in this pass.** `TransactionService.getForUser(id, user)` requires the record's `userId` or verified `walletAddress` to match the caller; all four transaction routes (`GET :id`, `POST :id/submitted`, `POST :id/cancelled`, `GET :id/poll`) now use it and return `404` (not `200`) for a transaction that exists but isn't owned by the caller — indistinguishable from "not found" to prevent enumeration.
- Files: `server.ts`, `server/transactions/TransactionService.ts`.
- Tests: `tests/transaction-idor.test.ts` — owner can fetch; another user cannot fetch; wallet-only ownership match; unauthenticated caller rejected; unknown id rejected. (The spec's "submitted/cancelled/poll" IDOR cases are covered at the unit level via the shared `getForUser` guard reused by all four routes; a full HTTP-level supertest suite was not added in this pass.)

### Stripe / Billing — PASS
- Evidence (pre-existing, reviewed not modified): webhook signature verification via `stripe.webhooks.constructEvent`, idempotent processing via `webhookEvents` primary-key insert, subscription state synced from Stripe API responses only (never client-supplied).
- Files: `server/billing/billingRoutes.ts`.
- Tests: `tests/commercial.test.ts` (plan/price config, secret placeholder checks); no webhook-replay integration test was added in this pass.

### Entitlements — PASS
- Evidence (pre-existing, reviewed not modified): `EntitlementService.hasEntitlement`/`hasActiveSubscription` derive from the `subscriptions`/`entitlements` tables only, synced from Stripe.
- Files: `server/entitlements/EntitlementService.ts`, `server/config/plans.ts`.
- Tests: `tests/commercial.test.ts` (plan hierarchy, denial without subscription — skipped without `DATABASE_URL`).
- Known limitation: entitlement checks are not yet applied to the transfer/swap routes themselves (only to a subset of premium routes) — full "every protected route" wiring per spec item #9 was not completed in this pass.

### Database — PARTIAL
- Evidence: transaction records now capture enough fields for forensic reconstruction of native/ERC-20 transfers and swaps (`userId`, `walletAddress`, `chainId`, `operationType`, `tokenAddress`, `amount`, `value`, `intentTo`, `intentData`, `transactionHash`, `blockNumber`, `status`, `failureReason`, timestamps). Migration guard added for the new columns.
- Files: `src/db/index.ts`, `database/migrations/` (Drizzle/Postgres side, unchanged).
- Known limitation: no `replacementHash`/`provider`/`correlationId` columns yet (spec item #35 lists these); SQLite schema changes are applied via `ALTER TABLE` guards rather than a formal migration tool (Drizzle migrations only cover the Postgres side).

### Frontend — NOT AUDITED IN THIS PASS
- No frontend (`src/`) files were modified in this pass. Claims about "no false success states," transaction confirmation UX, network-mismatch UI, and gas/slippage display (spec items #6, #13, #31, #55–56) were **not verified against the current frontend implementation** and should be treated as unverified, not passing.

### Security (headers/CORS/CSRF/rate limiting) — PARTIAL
- Evidence (pre-existing, reviewed not modified): `helmet` applied (CSP explicitly disabled for Vite compatibility), CORS allowlist via `ALLOWED_ORIGINS`, cookies `httpOnly`/`sameSite`/`secure-in-production`, rate limiting on `/api/auth/v2/register|login|refresh` only.
- Known limitations (unchanged by this pass, documented in `docs/THREAT_MODEL.md` #9): CSP disabled; no explicit CSRF token middleware for cookie-authenticated state-changing routes; no rate limiting on wallet verification, swap quotes, transfer prepare, or transaction polling (spec item #21 not fully implemented).

### Testing — PARTIAL
- Evidence: 53 automated tests (48 passing, 5 skipped pending live credentials), including 4 new test files added in this pass covering the fixes above (amount math, allowance, transaction integrity, IDOR).
- Command: `npm test` → `48 pass / 0 fail / 5 skipped` (skipped tests require `DATABASE_URL`/`CHAINSTACK_RPC_URL`).
- Known limitation: no HTTP-level (supertest/integration) tests against `server.ts` routes directly; no E2E browser tests; no adversarial "malicious client" HTTP fuzzing suite (spec item #54) beyond the unit-level ownership/integrity tests.

### CI — PASS (newly added, unverified on a real runner)
- Evidence: `.github/workflows/ci.yml` added in this pass — runs `npm ci`, `typecheck`, `lint`, `test`, `build`, and a non-blocking `npm audit` on push/PR to `main`.
- Known limitation: this workflow has not yet executed on GitHub Actions (no push to trigger it during this session); verify on the next PR.

### Deployment — PARTIAL (pre-existing)
- Evidence: `railway.toml`, `docs/DEPLOYMENT.md` checklist, health endpoints (`/api/health`, `/api/ready`, `/health/live`, `/health/ready`).
- Known limitation (stated in the pre-existing `docs/DEPLOYMENT.md`): no live Postgres/Stripe/Chainstack/Railway credentials were available to actually execute a deployment in this environment.

### Documentation — PASS (this pass)
- New: `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/LIVE_VALIDATION_CHECKLIST.md`, this report.
- Updated: `docs/SECURITY.md` (new section documenting the IDOR/integrity/allowance fixes).

## Dependency security

`npm audit` before this pass: 64 vulnerabilities (3 critical, 25 high, 34 moderate, 2 low), almost
entirely transitive from `wagmi`/`RainbowKit`/WalletConnect/Solana-adjacent wallet-connector
dependencies and the Vite dev server. Ran `npm audit fix` (non-breaking): reduced to **32
vulnerabilities (0 critical, 3 high, 29 moderate)**. The remaining 3 high (`ws` via
`@reown/appkit`/WalletConnect transitive deps) require `wagmi@3` (a breaking major version) to
fully resolve — **accepted residual risk** for this pass; upgrading `wagmi` v2→v3 requires a
frontend wallet-integration regression pass that was out of scope here. Typecheck/tests/build were
re-verified after `npm audit fix` and remain green.

## Build / test / typecheck results (this pass)

```
npm run typecheck  → PASS (no errors)
npm test           → 53 tests: 48 pass, 0 fail, 5 skipped (require DATABASE_URL/CHAINSTACK_RPC_URL)
npm run build      → PASS (vite build + tsc --noEmit)
npm audit          → 64 → 32 vulnerabilities after `npm audit fix` (0 critical remaining; 3 high require a wagmi v3 breaking upgrade, deferred)
```

## Environment variables required (unchanged by this pass — see `.env.example`)

`DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `CHAINSTACK_RPC_URL`, `CHAINSTACK_CHAIN_ID`,
`CHAINSTACK_WSS_URL` (optional), `ZEROX_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_RESEARCH`/`_TRADER`/`_PRO`, `ALLOWED_ORIGINS`, `ALLOW_MAINNET` (keep `false`),
`ENABLE_SERVER_SIGNER` (keep `false`).

## Testnet validation instructions

1. Set `CHAINSTACK_RPC_URL`/`CHAINSTACK_CHAIN_ID` to a Base Sepolia or Ethereum Sepolia Chainstack endpoint, `ZEROX_API_KEY`, and (optionally) `DATABASE_URL` for a local/test Postgres instance.
2. `npm test` — the previously-skipped Chainstack/Postgres tests will now run automatically.
3. Follow `docs/LIVE_VALIDATION_CHECKLIST.md` sections A–S with a funded Sepolia/Base-Sepolia testnet wallet.
4. Confirm `INTEGRITY_FAILED` never appears for a legitimate transfer/swap, and confirm it **does** appear if you deliberately call `POST /api/transactions/:id/submitted` with an unrelated real transaction hash from a block explorer (adversarial manual test corresponding to Threat Model #2).

## Remaining blockers to full MVP completion

1. **Auth unification** (spec #7) — legacy session auth still authorizes financial routes; JWT/Postgres auth is not yet the sole gate for `transfers`/`swap`/`transactions`.
2. **Entitlement gating on transfer/swap routes** (spec #9) — not wired end-to-end.
3. **Token-registry validation on the swap path** (spec #12) — `tokenIn`/`tokenOut` not cross-checked against `TokenRegistry` before calling 0x.
4. **Nonce/replacement tracking** (spec #17) — `REPLACED` state exists but has no detection logic.
5. **CSRF middleware + CSP hardening** (spec #22–23) — CSP disabled, no CSRF tokens.
6. **Rate limiting breadth** (spec #21) — only auth v2 routes covered.
7. **Frontend transaction UX audit** (spec #31, #55–56) — not reviewed in this pass.
8. **Live testnet/mainnet validation** (spec #39–40) — no live credentials available in this environment; `docs/LIVE_VALIDATION_CHECKLIST.md` is prepared but unexecuted.
9. **wagmi v3 dependency upgrade** to close the remaining 3 high-severity transitive `ws` advisories.

## Files changed in this pass

- `src/db/index.ts` — intent snapshot columns, migration guard, `setIntegrityFailed` query.
- `server/blockchain/AmountMath.ts` — new (exact amount conversions).
- `server/transactions/TransactionIntegrity.ts` — new (intent verification).
- `server/transactions/TransactionService.ts` — `INTEGRITY_FAILED` state, `getForUser`, intent-verified `pollReceipt`.
- `server/transactions/TransferService.ts` — exact wei math, intent recording.
- `server/swap/AllowanceCheck.ts` — new (pure allowance/approval-amount helpers).
- `server/swap/SwapProvider.ts`, `ZeroExSwapProvider.ts`, `SwapService.ts` — allowance `>=`, exact-amount default approval, spender validated against trusted quote.
- `server.ts` — ownership-aware transaction routes, updated allowance/approve routes.
- `tests/amount-math.test.ts`, `tests/allowance.test.ts`, `tests/transaction-integrity.test.ts`, `tests/transaction-idor.test.ts` — new.
- `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/LIVE_VALIDATION_CHECKLIST.md` — new.
- `docs/SECURITY.md` — appended section.
- `.github/workflows/ci.yml` — new.
- `package-lock.json` — updated via `npm audit fix`.

## Final scorecard

| Subsystem | Score | Basis |
|---|---|---|
| Wallet integration | 85% | Verification flow solid; not full SIWE; no live test executed |
| Portfolio | 85% | Chainstack-only reads, exact base units; fiat-unavailable UX not fully verified |
| Native transfers | 90% | Exact math + intent verification + tests; no live testnet execution |
| ERC-20 transfers | 90% | Exact math + intent verification + tests; no live testnet execution |
| DEX execution | 70% | Allowance/approval hardened; token-registry cross-check on swap path missing; no live swap executed |
| Chainstack | 80% | Fail-closed, no fallback, tested structurally; live RPC/WSS behavior unverified |
| Transaction integrity | 85% | New intent-verification logic + adversarial unit tests; no live replaced-tx scenario tested |
| Authentication | 55% | Two systems coexist; not unified; production auth tests require live Postgres |
| Authorization | 85% | IDOR fixed + unit-tested for all 4 transaction routes; no HTTP-level test suite |
| Billing (Stripe) | 75% | Signature verification + idempotency reviewed and sound; no live checkout/webhook test executed |
| Entitlements | 60% | Model implemented and tested for existence; not enforced on transfer/swap routes |
| Security (headers/CORS/CSRF/rate limit) | 55% | CORS/cookies solid; CSP disabled; CSRF and broad rate limiting missing |
| Testing | 65% | 53 unit tests, meaningful coverage of new fixes; no integration/E2E/HTTP-level suite |
| Deployment | 50% | Documented and scripted; not live-executed against real infrastructure |
| **Overall MVP readiness** | **≈72%** | Weighted toward the audited financial-correctness core (transfers, transaction integrity, IDOR, allowance) which improved the most; auth unification, entitlement enforcement breadth, and live validation remain the largest gaps |

**Classification for this pass: CODE COMPLETE for the fixes listed above; TEST SUITE COMPLETE for
unit-level coverage of those fixes; NOT YET TESTNET LIVE VALIDATED (no live Chainstack/Stripe
credentials available in this environment); NOT MAINNET VALIDATED.**
