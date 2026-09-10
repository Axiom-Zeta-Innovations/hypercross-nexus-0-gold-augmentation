# Real Execution Validation Report

This report outlines the "No Demo Path" hardening milestone for the **Hyper-Cross Nexus** application. It provides authoritative documentation of the core architecture, security interlocks, state models, transaction lifecycles, and verification procedures implemented to support live-only operations without fallback simulations.

---

## 1. Architecture Summary
Hyper-Cross Nexus is designed around a zero-trust model where all on-chain actions must propagate through real blockchain connections. No simulated/mock data is fabricated under live operations. 

- **Frontend Shell**: Built with React and configured to consume only client-derived reachability signals.
- **Backend Service Layer**: Serves as an unsigned intent-builder and persistent database indexing layer.
- **Security Signer Boundary**: The server does not store or process user private keys (unless running localized backend automation under testnets); normal EVM transactions are pushed directly to the user’s connected Web3 Wallet (via `wagmi`/`RainbowKit`) for client-side signing and broadcast.

---

## 2. Chainstack Configuration
Chainstack serves as the sole authoritative EVM gateway.
- Primary transactions (read/reads and writes) are routed via Chainstack RPC node.
- Real-time event indexing relies on the Chainstack WebSocket (WSS) link, maintained independently of HTTPS process states.
- The RPC and WSS configurations are validated on server startup using the `EnvironmentValidator`. Only hosts/domains are printed during initialization to prevent credential and access-token leakage.

---

## 3. Supported Chain IDs
Hyper-Cross Nexus supports any EVM network defined via Chainstack. Typical targets include:
- `8453`: Base (Mainnet)
- `84532`: Base Sepolia (Testnet)
- `11155111`: Ethereum Sepolia (Testnet)

---

## 4. Mainnet Safety Policy
To prevent unintended Mainnet funds usage, a strict write-interlock is active:
- **Default Action**: Mainnet reads are permitted. Direct mainnet writes (transfers, approvals, swaps, and token deployments) are disabled.
- **Configuration Activation**: Direct mainnet writes require setting `ALLOW_MAINNET_WRITES=true` in the environment. Without it, user write actions on mainnet chain IDs are automatically aborted and show a clear warning.

---

## 5. Wallet Execution Model
We distinguish between wallet integration capability and active session connection:
- **Capability registry**: Represents whether modern Web3 wallet integration functionality is active (`LIVE` or `UNAVAILABLE`).
- **Active wallet state**: Exposes five distinct runtime states based on user connectivity:
  1. `DISCONNECTED`: No wallet is connected.
  2. `CONNECTING`: Attempting connection pairing.
  3. `CONNECTED`: Connected and on the correct chain.
  4. `WRONG_CHAIN`: Connected to a chain mismatching the backend Chainstack ID.
  5. `ERROR`: Chainstack provider is unreachable.

---

## 6. Asset Issuance Lifecycle
Issuance transitions through eight distinct states to guarantee on-chain consistency even if backend indexing fails:
1. `VALIDATING`: Client asserts name/symbol/supply sanity.
2. `AWAITING_SIGNATURE`: Prompt sent to client's wallet for contract deployment signature.
3. `SUBMITTED`: Deployment transaction signed and broadcast; transaction hash acquired.
4. `PENDING`: Waiting for the transaction to compile on-chain into a block.
5. `CONFIRMED_ONCHAIN`: Deployed transaction marked successful in on-chain receipt.
6. `INDEXING`: Client posts contract parameters and hash to database indexing layer.
7. `INDEXED`: Success record written to SQLite database, asset loaded locally.
8. `INDEXING_FAILED`: Occurs if on-chain transaction succeeded but backend write was aborted or offline. Displays copyable transaction hash and contract address to avoid duplicate deployment.

---

## 7. ERC-20 Artifact Verification
Token issuance deploys a fully verifiable, standardized implementation. 
- **Decimals**: Consistent 18 decimals.
- **Supply**: Total supply matches initial issuance requested, allocated entirely to the deploying owner.
- **Readback Checks**: Built-in verification testing validates deployed bytecode against the contract ABI, querying `name()`, `symbol()`, `decimals()`, and `totalSupply()` post-deployment.

---

## 8. Send Lifecycle
The send flow enforces robust verification:
- `VALIDATE` $\rightarrow$ `AWAITING_SIGNATURE` $\rightarrow$ `SUBMITTED` $\rightarrow$ `PENDING` $\rightarrow$ `CONFIRMED` / `FAILED` / `REJECTED`.
- Handles wallet rejection, zero/negative inputs, decimal precision errors, insufficient gas fees, network mismatches, and on-chain receipt reverting without falling back to demo records.

---

## 9. Swap Lifecycle (0x Integration)
Direct, real-market trading routes through the 0x Swap portal:
1. Fetch live pricing and quote from 0x.
2. Display quote details, buy/sell values, slippage limits, and allowance parameters.
3. If token allowance is insufficient, request approval and await block receipt.
4. Build transaction using quote payload, verify expiry, and request wallet signature.
5. Broadcast transaction, poll hash until finalized.
6. Handle quote expiry, key absence, and slip tolerance failures safely.

---

## 10. 0x Configuration
- Driven by `ZEROX_API_KEY` in environment.
- In the absence of an API key, Swap is marked `UNAVAILABLE` inside the capabilities registry rather than fabricating placeholder records.

---

## 11. Persistence Mechanism
All transactions and deployed assets are indexed and written to localized database storage:
- Core operations (`ASSET_ISSUANCE`, `SEND`, `TOKEN_APPROVAL`, `SWAP`) are recorded with unique hashes, ownership mappings, and block timestamps.
- Records survive server process restarts, ensuring consistent historical state upon reinitialization.

---

## 12. Health Semantics
Under live operations, health indicators are clearly defined:
- `/health/live`: Proves the server process is alive.
- `/health/ready`: Asserts that server and critical dependencies (database) are operational.
- `/api/blockchain/status`: Returns granular, Chainstack-derived RPC health, latency, block number, and network connectivity.

---

## 13. Transaction Status Model
Status mapping enforces strict blockchain finality:
- `CREATED`: Local intent constructed.
- `AWAITING_SIGNATURE`: User prompted to authorize.
- `SUBMITTED`: Real broadcast hash generated.
- `PENDING`: Block inclusion in progress.
- `CONFIRMED`: Transacted successfully (verified via cryptographic log and receipt check).
- `FAILED`: On-chain execution reverted.
- `CANCELLED`: User aborted transaction in wallet.

---

## 14. Test Coverage
Comprehensive tests are integrated into the automated node test suite, asserting:
- Safe default live execution.
- Strict double-flag requirement for demo activation (`APP_DATA_MODE=demo` and `ALLOW_DEMO_DATA=true`).
- Production mode interlock preventing demo fallbacks.
- Expiration limits on swap executions.
- Unreachable/malformed order-book handling.
- Survivability of database records across restarts.

---

## 15. Real Execution Test Instructions
To execute real integration checks on a supported testnet (e.g., Base Sepolia):
1. Configure `.env` with a real Chainstack node endpoint:
   ```bash
   CHAINSTACK_RPC_URL="https://your-base-sepolia-endpoint"
   CHAINSTACK_CHAIN_ID="8452"
   CHAINSTACK_PRIVATE_KEY="your-testnet-private-key"
   ENABLE_SERVER_SIGNER="true"
   RUN_REAL_EXECUTION_TESTS="true"
   ```
2. Execute the verification script:
   ```bash
   npm run test:harness
   ```
3. Review logs for RPC connectivity, token deployment, contract reads, and database write checks.

---

## 16. Features Still Unavailable
Features currently under active milestone roadmap and designated `COMING_SOON` or `UNAVAILABLE` in the UI:
- On-chain Transfer / Burn / Sync (UI controls are visual-only, clearly labelled "Coming Soon", and block network calls).
- RWA Infrastructure.
- NFT Marketplace.
- Token Fundraising & Launchpad.
- Copy Trading (explicitly labelled as simulation, no real transactions).
- Derivatives & Margin options.

---

## 17. Known Risks
- **RPC Outage**: Outages in the Chainstack node degrade Web3 reading capabilities. 
- **Gas Spikes**: Spikes in transaction price can result in silent transaction replacement if not correctly priced by the connected wallet.

---

## 18. Production Blockers
- **ZeroEx API validation**: Before mainnet production release, a verified `ZEROX_API_KEY` must be acquired and set in the environment.
- **Postgres Deployment**: A high-availability Pg cluster must match the `DATABASE_URL` parameter to support scale.
