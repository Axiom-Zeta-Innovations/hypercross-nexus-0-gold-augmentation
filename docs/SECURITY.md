# Hypercross Security Policy

## Secret handling

| Secret | Where it lives | Never |
|---|---|---|
| `CHAINSTACK_RPC_URL` / `CHAINSTACK_WSS_URL` | Server env only | Logged, returned in API responses, bundled in web/desktop, committed to Git |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Server env only | Bundled in web/desktop, logged |
| `DATABASE_URL` | Server env only | Bundled, logged |
| `JWT_SECRET` | Server env only | Bundled, logged, rotated without invalidating existing sessions (rotation forces re-login) |
| `ENCRYPTION_KEY` | Server env only | Committed, reused across environments |
| `CHAINSTACK_PRIVATE_KEY` | Server env, disabled by default | Used unless `ENABLE_SERVER_SIGNER=true` is explicitly set |

`EnvironmentValidator.logStartupInfo()` logs only `configured (<hostname>)` or `not set` for RPC/WSS URLs — never the full URL (which may embed access tokens in the path).

Only variables explicitly prefixed `VITE_` are exposed to the browser build; treat anything with that prefix as public. No server-only secret may ever use that prefix.

## Credential storage (Electron desktop)

Access/refresh tokens are stored via Electron's `safeStorage` API (`electron/main.mjs`: `secure-store-set/get/delete`), which encrypts data using the OS-native credential store (Windows DPAPI, macOS Keychain, libsecret on Linux). Tokens are never written to `localStorage`, plaintext JSON config files, or source files. If `safeStorage.isEncryptionAvailable()` is false, the app refuses to persist the token rather than falling back to plaintext.

## Token lifecycle

- Access tokens: short-lived JWTs (15 minutes), signed with `JWT_SECRET`, never persisted server-side.
- Refresh tokens: long-lived (30 days) random tokens; only their SHA-256 hash is stored in the `sessions` table. A stolen database dump cannot be used to authenticate.
- Refresh tokens rotate on every use (old session row revoked, new one issued) — this limits the blast radius of a leaked refresh token.
- Logout (`POST /api/auth/v2/logout`) revokes the specific session; `revokeAllSessions(userId)` is available for "sign out everywhere".

## Password hashing

`bcryptjs` with a work factor of 12 (`server/auth/ProductionAuthService.ts`). Chosen over native `bcrypt`/`argon2` to avoid native-module build friction across Railway containers, Windows desktop dev machines, and this sandbox — still a deliberately slow, salted, adaptive hash. Never store or log plaintext passwords.

## CORS

`ALLOWED_ORIGINS` is an explicit comma-separated allowlist (`server.ts`). Requests with no `Origin` header (Electron, curl, same-origin) are allowed; browser requests from origins not on the list are rejected. Credentials (cookies) are only sent to allowlisted origins — no `*` wildcard with `credentials: true`.

## Rate limiting

`express-rate-limit` is applied to `/api/auth/v2/register`, `/login`, and `/refresh` (20 requests / 15 minutes / IP). The legacy SQLite-backed `/api/auth/signup`/`/signin` routes do not yet have rate limiting applied — see "Known limitations" in the final report.

## Stripe webhook verification

`stripe.webhooks.constructEvent()` verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` using the raw request body (excluded from the global JSON body parser specifically for this reason — see `RAW_BODY_PATHS` in `server.ts`). Webhook processing is idempotent: every event id is inserted into `webhook_events` (primary key) before processing; a duplicate delivery is acknowledged with `200 { duplicate: true }` and not reprocessed.

## Database access

Production account/platform state uses PostgreSQL via Drizzle ORM with parameterized queries (no raw string interpolation into SQL). Local SQLite remains available for local-only development and legacy organization/wallet-verification features — it is never the production commercial account database.

## Chainstack credential isolation

`CHAINSTACK_RPC_URL`/`CHAINSTACK_WSS_URL` are read only inside `server/blockchain/`. No route echoes them back; `/api/blockchain/status` reports `connected`, `network`, `chainId`, `blockNumber`, `rpcHealthy`, `wssHealthy`, `rpcLatencyMs` — never the endpoint itself. `BlockchainProviderFactory` throws `CHAINSTACK_CONFIGURATION_ERROR` rather than silently falling back to a public RPC when the URL is missing.

## Customer exchange credential model

`linked_accounts.encrypted_credentials` is a placeholder column for any customer-provided exchange API credentials that must be stored server-side; it is NOT yet wired to an encryption routine in this pass. Before storing any real exchange secret there:

1. Use `ENCRYPTION_KEY` with AES-256-GCM (authenticated encryption), a random 96-bit nonce per record, and never a custom/home-grown cipher.
2. Never log the decrypted value.
3. Never return the stored secret through any API response after initial submission (return a masked/redacted reference only).
4. Support revocation (delete the row / rotate `status` to `revoked`).

The preferred architecture per the commercial deployment brief keeps exchange **signing** credentials on the customer's own Windows machine rather than centralizing them server-side; the backend should be limited to market intelligence, nonlinear analysis, and risk recommendations, with the desktop client performing exchange-authenticated calls locally. This pass preserves that option (the `linked_accounts` table can store a non-secret account label/reference only) but does not implement the full local-signing desktop trading client — see the final report's "Known limitations".

## Logging rules

Structured server logs must never include: passwords, JWTs, refresh tokens, Stripe secrets, Chainstack credentials, exchange API secrets, private keys, or full sensitive request payloads. `LOG_LEVEL` controls verbosity.

## Trade auditing

Every entitlement decision, subscription change, login/logout, and (once wired) trade attempt/execution should call `recordAuditEvent()` (`server/audit/AuditService.ts`), which never accepts secrets in its `metadata` field by convention — reviewers should treat any PR that logs a token/secret through this path as a security bug.

## Transaction ownership (IDOR) — production hardening pass

Every `/api/transactions/:id*` route (`GET :id`, `POST :id/submitted`, `POST :id/cancelled`, `GET :id/poll`) resolves the record via `TransactionService.getForUser(id, { id: req.user.id, walletAddress: req.user.walletAddress })` (`server/transactions/TransactionService.ts`). A transaction is only returned if it belongs to the caller by `userId` or verified `walletAddress`; otherwise the route returns `404` (never `200`/`403` with distinguishing detail, to avoid confirming that a given transaction id exists for someone else). See `tests/transaction-idor.test.ts`.

## Submitted transaction hash verification (anti-spoofing)

A client-reported transaction hash is never trusted at face value. `TransactionService.pollReceipt()`:

1. Waits for a receipt via `eth_getTransactionReceipt`. A receipt with `status !== 1` is marked `FAILED`.
2. On a successful receipt, fetches the full transaction body via `eth_getTransactionByHash` (`blockchainService.getTransaction`) and compares it against the **intent snapshot** recorded at prepare-time (`intentTo`, `intentData`, `value`, `chainId`, `walletAddress`) using `verifyTransactionIntent()` (`server/transactions/TransactionIntegrity.ts`).
3. Any mismatch (wrong sender/recipient/amount/calldata/chain, or an unrelated but successful hash) results in `INTEGRITY_FAILED` — the transaction is **never** marked `CONFIRMED`. The mismatch reason is logged server-side (public tx fields only, no secrets).

See `tests/transaction-integrity.test.ts` for the adversarial cases covered (wrong sender, wrong recipient, wrong amount, wrong calldata, wrong chain, unrelated hash, missing transaction).

## Exact financial arithmetic

Native and ERC-20 amount conversions go through `server/blockchain/AmountMath.ts` (`nativeAmountToWei` → `ethers.parseEther`, `tokenAmountToBaseUnits` → `ethers.parseUnits`) and `server/blockchain/TxBuilder.ts#toBaseUnits`. These reject scientific notation, negative values, zero, and sub-unit precision, and never use `Number()`/`Math.round()`/`* 1e18` for authoritative amounts. See `tests/amount-math.test.ts`.

## ERC-20 allowance/approval hardening

`server/swap/AllowanceCheck.ts` compares `allowance >= requiredAmount` (never `allowance > 0`). Approvals default to the exact required amount (`resolveApprovalAmount(required, unlimited=false)`); unlimited approval requires an explicit `unlimited: true` from the caller. The approval `spender` is validated against the `allowanceTarget` returned by the active, trusted 0x quote for that wallet+token — an arbitrary client-supplied spender is rejected (`server/swap/SwapService.ts#prepareApproval`). See `tests/allowance.test.ts`.

