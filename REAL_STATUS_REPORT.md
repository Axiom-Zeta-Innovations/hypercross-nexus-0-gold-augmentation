# REAL_STATUS_REPORT.md

**Date:** 2026-09-01
**Scope:** Real-Status Implementation Pass — converting partially-implemented MVP areas into genuinely operational, wallet-signed, Chainstack-native components.

---

## Executive Summary

This pass implemented the real backend and frontend plumbing for wallet-signed
transfers, ERC-20 balance reads, USD pricing, a real DEX (0x) swap flow, a
transaction lifecycle manager, mainnet write interlocks, and complete removal
of the remaining active Kaleido/Fabric footprint. All code paths were built to
route through the enforced Chainstack provider (no public-RPC fallback), and
`npm run lint`, `npm test`, and `npm run build` all pass.

**What could NOT be verified in this environment:** this sandbox has no
configured `CHAINSTACK_RPC_URL`, no `ZEROX_API_KEY`, no funded testnet wallet,
and no browser with a real wallet extension. Every "REAL" rating below means
*the implementation genuinely reaches the real external system when given
real credentials* — it does **not** mean the execution was observed end-to-end
in this session. Where live execution could not be observed, this is stated
explicitly rather than invented.

---

## Wallet Integration

**Status: REAL (implementation) / UNVERIFIED (live browser + wallet extension)**

Evidence:
- `POST /api/wallet/nonce`, `POST /api/wallet/verify`, `GET /api/wallet/session`,
  `DELETE /api/wallet/session` all implemented in
  [server/wallet/WalletVerificationService.ts](server/wallet/WalletVerificationService.ts)
  and wired in [server.ts](server.ts).
- **Fixed a real bug**: wallet verification previously issued a session cookie
  that `requireAuth` could never recognize (no matching `sessions` row was
  created). Verification now finds-or-creates a `users` row by wallet address
  and inserts a real `sessions` row, so the wallet-verified session actually
  authenticates subsequent requests.
- **Fixed nonce replay**: the nonce is now consumed (expired) on successful
  verification, so a captured `(nonce, signature)` pair cannot be replayed.
- Signed message now identifies "Hypercross Nexus" by name and includes the
  configured chain ID, and gas cost is explicitly stated as zero.
- Frontend [`WalletStatusPanel`](src/components/WalletStatusPanel.tsx) uses
  real wagmi hooks (`useAccount`, `useChainId`, `useBalance`, `useSwitchChain`)
  — it does **not** claim CONNECTED unless the wallet's chain ID matches the
  Chainstack-configured chain ID, and implements `DISCONNECTED / CONNECTING /
  CONNECTED / WRONG_NETWORK / RPC_UNAVAILABLE` states with a working "Switch
  Network" button.
- Private keys never enter the backend for normal operations. Server-side
  signing (`ChainstackProvider.wallet`) is now gated behind
  `ENABLE_SERVER_SIGNER=false` (default) in addition to requiring
  `CHAINSTACK_PRIVATE_KEY`.

Not verified: actually connecting a browser wallet (MetaMask/RainbowKit modal),
signing a real nonce, and completing the round trip. This requires a browser
environment this sandbox does not have.

---

## Portfolio

**Status: REAL (implementation) / UNVERIFIED (live RPC)**

Evidence:
- **Fixed a Chainstack-only violation**: `PortfolioService.fetchTokenBalance`
  previously created its own `ethers.JsonRpcProvider(process.env.CHAINSTACK_RPC_URL)`,
  bypassing `BlockchainService`/`ChainstackProvider` entirely. It now calls
  `blockchainService.readContract(...)`, so all ERC-20 reads are routed through
  the single enforced Chainstack provider.
- New [`MarketPriceService`](server/market/MarketPriceService.ts) is fully
  separate from blockchain state, sources real USD prices from CoinGecko, and
  returns `{ available: false, usd: null }` on failure — it never fabricates a
  price. `PortfolioEntry.valueUsd` is `null` whenever the price is unavailable,
  and `Portfolio.totalValueUSD` is `null` if any holding's price is unavailable
  (never silently computed as if the missing price were zero).
- **Fixed a real data bug**: `validateTokenRegistry()` (new) caught 6 token
  addresses in `TokenRegistry.ts` that failed EIP-55 checksum/length
  validation (Arbitrum USDC/DAI/WETH, Arbitrum Sepolia USDC/WETH, Ethereum
  Sepolia WETH). Five were fixable by recomputing the checksum; the Arbitrum
  One DAI entry was a malformed address (41 hex characters, not 40) and was
  removed rather than guessed, since fabricating a plausible-looking contract
  address for a token registry is exactly the kind of "fake" this pass exists
  to eliminate. `validateTokenRegistry` now runs at `BlockchainService.initialize()`
  and fails startup if any address is invalid.

Not verified: an actual balance read against a live Chainstack RPC endpoint
(no `CHAINSTACK_RPC_URL` configured in this sandbox).

---

## Real Asset Transfers

**Status: REAL (implementation) / UNVERIFIED (no funded testnet wallet)**

Evidence:
- New [`TransferService`](server/transactions/TransferService.ts) validates
  recipient (`isAddress`, non-zero), validates amount, checks the sender's
  real balance via `blockchainService.getBalance`/`readContract`, estimates
  gas via a real `eth_estimateGas` call, and enforces the mainnet write
  interlock — all before any transaction is created.
- New [`TransactionService`](server/transactions/TransactionService.ts)
  persists `CREATED → SUBMITTED → PENDING → CONFIRMED/FAILED` records in a new
  `transactions` table (with `UNIQUE(transactionHash, chainId)`). A record can
  only become `CONFIRMED` after `pollReceipt()` observes a real
  `eth_getTransactionReceipt` result with `status === "0x1"`; a reverted
  receipt is recorded as `FAILED`, never `CONFIRMED`. A background poller runs
  every 15s against all `SUBMITTED`/`PENDING` records.
- Frontend [`SendPage`](src/pages/SendPage.tsx) calls the prepare endpoint,
  then uses wagmi's real `useSendTransaction`/`useWaitForTransactionReceipt` —
  the wallet signs and broadcasts, never the backend. It only reports
  "Transaction submitted" then "Transaction confirmed"/"failed" after the
  receipt resolves; it never says "Transfer successful" prematurely. Wallet
  rejection calls `/api/transactions/:id/cancelled` (not treated as a backend
  failure).

Not verified: an actual signed transfer on Base Sepolia (or any testnet) —
this requires a funded test wallet and a real browser/wallet session, neither
of which exist in this sandbox.

---

## DEX (Swap)

**Status: REAL (implementation) / UNVERIFIED (no ZEROX_API_KEY, no live network)**

Evidence:
- One real DEX integration: [`ZeroExSwapProvider`](server/swap/ZeroExSwapProvider.ts)
  calls the documented 0x Swap API v2 `allowance-holder/quote` endpoint. It
  throws `SWAP_UNAVAILABLE` if `ZEROX_API_KEY` is not configured — it never
  fabricates a quote, price, or gas estimate.
- [`SwapService`](server/swap/SwapService.ts) enforces slippage bounds
  (0.01%–20%, warns ≥3%), tracks quote expiration (30s) and rejects execution
  of an expired quote with `QUOTE_EXPIRED`, and requires a separate explicit
  `/api/swap/execute/prepare` call after approval — it never auto-executes a
  swap once an approval succeeds.
- Allowance is read via a real `allowance(owner, spender)` contract call;
  approval builds a real `approve(spender, amount)` calldata via
  `TxBuilder.encodeErc20Approve` and is signed by the user's wallet.
- New [`OnChainTradingService`](server/trading/OnChainTradingService.ts)
  implements BUY/SELL as swaps (`BUY ETH using USDC` = swap USDC→ETH), per
  spec — no leveraged/margin/futures/options logic was added.
- Frontend [`SwapPage`](src/pages/SwapPage.tsx) fetches a real quote, shows
  allowance/approval when required, and requires an explicit "Confirm Swap"
  click before building/signing the swap transaction.

Not verified: an actual 0x quote or swap execution (no API key configured in
this sandbox) or a live testnet swap.

---

## Chainstack

**Status: REAL, IMPROVED / UNVERIFIED (no RPC endpoint configured in this sandbox)**

Evidence — three real bugs fixed in this pass:
1. **Public RPC fallback removed.** `BlockchainProviderFactory` previously
   fell back to `rpc.ankr.com`, `mainnet.base.org`, `bsc-dataseed.bnbchain.org`,
   etc. when `CHAINSTACK_RPC_URL` was unset. It now throws
   `BlockchainConfigurationError` (`code: CHAINSTACK_CONFIGURATION_ERROR`)
   unconditionally when the URL is missing — verified by a new test
   (`tests/blockchain.test.ts`) that asserts the error message never contains
   `mainnet.base.org|ankr|infura|alchemy`.
2. **Health check now requires both `eth_chainId` and `eth_blockNumber`.**
   `ChainstackProvider.healthCheck()` previously only called
   `getBlockNumber()`; it now calls `Promise.all([getNetwork(), getBlockNumber()])`
   and only reports healthy if both succeed.
3. **RPC timeout enforced** (from the prior pass, retained): every RPC call is
   raced against `CHAINSTACK_RPC_TIMEOUT_MS` and fails with `Chainstack RPC
   timed out` rather than hanging or silently succeeding.
4. **Credential-safe logging** (from the prior pass, retained):
   `EnvironmentValidator.logStartupInfo()` never logs the RPC/WSS URL — only
   `configured (<hostname>)` or `not set`.
5. **WSS isolated from HTTPS.** An optional `WebSocketProvider` is only
   instantiated when `CHAINSTACK_WSS_URL` is set, wrapped in try/catch, and
   its failure cannot affect HTTPS operations. Exposed via
   `getWebSocketStatus()` and surfaced in `/api/blockchain/status` as
   `wssHealthy`/`wssConfigured`.
6. `/api/blockchain/status` now also returns `rpcLatencyMs` and
   `mainnetWritesAllowed`, matching the requested shape.

Not verified: an actual connection to a real Chainstack Base Mainnet or
Sepolia endpoint — no RPC URL/API key was available in this sandbox.

---

## Kaleido / Fabric

**Status: REMOVED (active web MVP runtime) / legacy Electron schema untouched**

- The only remaining active runtime reference (`/api/kaleido` fallback fetch
  in `src/App.tsx`) and the entire "Kaleido Hyperledger Fabric Connection
  Portal" component (which called nonexistent `/api/fabric-connect`,
  `/api/fabric-query`, `/api/fabric-invoke` endpoints) were removed and
  replaced with a read-only `ChainstackConnectPage` in a prior pass — this
  pass additionally removed the dead `fabricStrictMode` state/effect (which
  polled a nonexistent `/api/live/connection-status` endpoint).
- `config/whiteLabelConfig.json`: removed the `fabricConnect` module and the
  `fabric` (`legacy-fabric`) datasource entirely; `copyTrading`/`custody`
  module `dataSource` changed from `"fabric-chaincode"` to `"demo"`.
- Rewrote all "Kaleido Fabric"/"Hyperledger Fabric"/"chaincode" marketing copy
  across `RWAPage`, `NFTMarketplacePage`, `CustodyPage`, `DerivativesPage`,
  `CopyTradingPage`, `MiningPoolsPage`, `SportsTradingPage`,
  `TokenFundraisingPage`, `TokenLaunchpadPage`, and `App.tsx` landing copy to
  describe these as simulated demo modules (they are also feature-flagged off
  by default — see Feature Flags below).
- Created [`legacy/fabric/README.md`](legacy/fabric/README.md) documenting
  that no separable Fabric business-logic module exists to archive — the
  remaining footprint was dead routes (already deleted in an earlier pass) and
  UI copy (rewritten in place).
- **Not touched (documented, out of scope):** `electron/database.mjs` and the
  `channel`/`chaincode` columns on the unused `assets` table in
  `src/db/index.ts`. These belong to the Electron desktop build's own local
  schema, a separate distribution channel from the web MVP server; no active
  web MVP route reads or writes that table (confirmed via `grep`).

Confirmed via repository-wide search: no remaining `Kaleido`, `KALEIDO_`, or
`/api/kaleido` references outside documentation/audit files and the two
Electron/legacy items noted above.

---

## Additional Hardening Implemented This Pass

- **Mainnet execution interlock**: `ALLOW_MAINNET=false` by default.
  `BlockchainService.assertMainnetWritesAllowed()` throws
  `MainnetExecutionDisabledError` (`MAINNET_EXECUTION_DISABLED`) for any write
  operation (transfer, approval, swap) when the active network is mainnet and
  `ALLOW_MAINNET` is not `true`. Reads are never restricted.
- **Typed error model**: `server/blockchain/errors.ts` now defines a
  `HypercrossError` base class with a stable `.code` (`CHAINSTACK_UNAVAILABLE`,
  `CHAIN_MISMATCH`, `WALLET_NOT_CONNECTED`, `WALLET_NOT_VERIFIED`,
  `MAINNET_EXECUTION_DISABLED`, `INSUFFICIENT_FUNDS`,
  `INSUFFICIENT_TOKEN_BALANCE`, `ALLOWANCE_REQUIRED`, `QUOTE_EXPIRED`,
  `SWAP_UNAVAILABLE`, `TRANSACTION_REVERTED`, `INVALID_ADDRESS`,
  `INVALID_AMOUNT`, `TOKEN_NOT_REGISTERED`) and a `toErrorPayload()` helper
  used by every new route so error responses are safe and consistent.
- **Feature flags**: `FEATURE_RWA/NFT/LAUNCHPAD/COPY_TRADING/SPORTS/
  DERIVATIVES/MINING/BANKING/CUSTODY` all default to `false`. `GET
  /api/config/features` exposes resolved flags; disabled modules render
  "Coming Soon" in the frontend (nav items show a "Soon" badge) and their
  demo-data routes (`/api/live/rwa`, `/api/live/nft`, `/api/live/sports-events`,
  `/api/live/mining-stats`) return `404 FEATURE_DISABLED` while off.
- **Paper trading clearly labeled**: `/api/live/execute-trade` and
  `/api/live/linked-accounts`/`/api/live/trades` were renamed to
  `/api/paper/trades/execute`, `/api/paper/accounts`, `/api/paper/trades`.
  Every response now includes `{ mode: "paper", realExecution: false }`, and
  the frontend success message is prefixed `[PAPER TRADING — NO REAL ASSETS]`.
  Real on-chain trading is available separately via `POST /api/trading/quote`
  (`OnChainTradingService`), which returns `{ mode: "onchain", realExecution: true }`.
- **No debug/arbitrary contract execution surface**: confirmed via `grep` that
  no route accepts `contractAddress`/`abi`/`method`/`args` directly from the
  client — all contract calls use ABIs from the repo (`ERC20_ABI`) with
  addresses from the repo's `TokenRegistry` or the 0x quote response.
  `ENABLE_DEBUG_RPC=false` reserved in `.env.example` for any future debug
  tooling.

---

## Test Results (actual output)

```
$ npm run lint
> tsc --noEmit
(no output — 0 errors)

$ npm test
> tsx --test
✔ token registry: every configured token address is valid
✔ token registry: at least one token is registered per supported testnet chain
✔ BlockchainProviderFactory: throws CHAINSTACK_CONFIGURATION_ERROR when CHAINSTACK_RPC_URL is missing
✔ BlockchainProviderFactory: never falls back to a public RPC when CHAINSTACK_RPC_URL is absent
﹣ Chainstack integration: eth_chainId and eth_blockNumber succeed against the configured RPC (skipped — no credentials)
﹣ Chainstack integration: ERC-20 symbol()/decimals() resolve for a registered token (skipped — no credentials)
✔ password hashing verifies correctly
✔ session token and cookie helpers are present
✔ role permissions include required access
✔ organization membership is enforced by identity
✔ requireAuth rejects missing session
ℹ tests 11, pass 9, fail 0, skipped 2

$ npm run build
✓ built in ~26s (chunk-size warnings only, non-blocking)
```

`npm ci` was not run (dependencies were already installed via `npm install` in
a prior pass); `npm run lint`/`test`/`build` above were run against the final
state of this pass.

---

## Testnet Transactions

**None.** No `CHAINSTACK_RPC_URL`, `ZEROX_API_KEY`, or funded testnet private
key/wallet was available in this sandbox. No transaction hash, block number,
or receipt is reported here because none was produced — inventing one would
violate the explicit instruction not to fabricate evidence.

---

## Remaining Blockers (before real testnet/mainnet execution can be claimed)

1. **No live Chainstack credentials exercised.** All RPC-dependent code
   (`ChainstackProvider`, `PortfolioService`, `TransferService`, `SwapService`)
   is implemented and type-checked but has never executed against a real
   endpoint in this environment. Acceptance tests 47–54 (real integration
   tests, testnet write tests, mainnet read test) must be run by whoever has
   real credentials.
2. **No `ZEROX_API_KEY` configured** — swap quotes cannot be fetched until one
   is provided.
3. **No browser/wallet extension in this sandbox** — the entire wallet
   connect → sign → broadcast flow (RainbowKit modal, MetaMask popup, wagmi
   `sendTransaction`) has not been exercised end-to-end by a human or
   automated browser test.
4. **`electron/database.mjs`** retains the legacy Fabric-era schema
   (`channel`, `chaincode` columns) — out of scope for this web-MVP-focused
   pass; the desktop build was not touched.
5. **Frontend Send/Swap pages are minimal** — functional but not
   feature-complete UI (no gas-in-fiat estimate, no token picker dropdown
   backed by `TokenRegistry`, no live balance display sourced from
   `PortfolioService` inline). Sufficient to exercise the real transaction
   flow, not a finished product UI.
6. **Bundle size warning** on `npm run build` (chunks >500kB) — pre-existing,
   not addressed in this pass (unrelated to correctness).

---

## Feature Verification Matrix

| Feature | Status | Evidence |
|---|---|---|
| Wallet integration | REAL (unverified live) | Real session linkage fixed; wagmi wrong-network detection; no browser available to observe a live connect/sign |
| Portfolio | REAL (unverified live) | Routed through BlockchainService; real/absent USD pricing; token registry validated & fixed |
| Native/ERC-20 transfers | REAL (unverified live) | Real validation, gas estimate, wallet-signed broadcast, receipt-gated CONFIRMED status |
| DEX swap | REAL (unverified live) | Real 0x v2 integration; requires ZEROX_API_KEY not present here |
| Chainstack execution | REAL, improved (unverified live) | Public-RPC fallback removed (real bug fixed); dual health check; timeout; WSS isolation |
| Kaleido/Fabric | REMOVED (web MVP) | No active routes/UI remain; Electron legacy schema explicitly out of scope |

---

## FINAL VERDICT

```
MVP READY FOR TESTNET BETA
```

**Why not "MVP READY FOR CONTROLLED MAINNET BETA":** per the instructions,
mainnet beta requires *verified* wallet signing, transfers, DEX execution,
receipt handling, mainnet safeguards, authorization, secret handling, and
live-mode integrity — not merely working reads or correctly-written code. None
of the write paths (transfer, approval, swap) were exercised against a real
network in this session, because no RPC credentials, API keys, or funded
wallet were available. The mainnet interlock (`ALLOW_MAINNET=false`) is in
place and enforced server-side precisely so that mainnet writes remain
disabled until that verification happens.

**Why not "NOT MVP READY":** the architecture is now genuinely correct end to
end (frontend wallet signs → wagmi broadcasts → Chainstack → EVM → real
receipt → persistent status → UI), several real pre-existing bugs were found
and fixed (session linkage, nonce replay, RPC fallback, malformed token
addresses), Kaleido/Fabric is fully removed from the active runtime, and
`lint`/`test`/`build` all pass. What remains is *operational verification*
with real credentials — not further implementation work.

**Required before promoting beyond testnet beta:** configure
`CHAINSTACK_RPC_URL` (testnet), run the new integration tests
(`tests/blockchain.test.ts`), perform a real Send on Base Sepolia, configure
`ZEROX_API_KEY` and perform a real quote→approve→swap on a 0x-supported
testnet, then repeat all of the above against mainnet read-only before ever
setting `ALLOW_MAINNET=true`.
