# Hypercross Live Validation Checklist

Manual, human-executed validation steps against a real testnet (Base Sepolia / Ethereum Sepolia)
and Chainstack endpoint. Each item requires: Prerequisites, Steps, Expected result, Actual result,
PASS/FAIL. Fill in "Actual result" and "PASS/FAIL" when you run these against live infrastructure —
this document ships with the Steps/Expected columns pre-filled and the outcome columns blank,
since no live credentials were available in the environment this pass was prepared in.

## A. Wallet connection

- **Prerequisites**: Testnet wallet (MetaMask/Rainbow) with Base Sepolia configured; app running with `CHAINSTACK_*` env set to a Base Sepolia endpoint.
- **Steps**: Open the app → click "Connect Wallet" → approve in the wallet extension.
- **Expected result**: UI shows the connected address and correct network name.
- **Actual result**: _____
- **PASS/FAIL**: _____

## B. Wallet ownership verification

- **Prerequisites**: Wallet connected (step A).
- **Steps**: Trigger "Verify Wallet" → sign the message prompted by the wallet.
- **Expected result**: `POST /api/wallet/verify` returns `{ ok: true, sessionToken }`; UI shows "Verified".
- **Actual result**: _____
- **PASS/FAIL**: _____

## C. Native testnet transfer

- **Prerequisites**: Verified wallet with testnet ETH.
- **Steps**: Enter a small amount (e.g. 0.0001 ETH) and a valid recipient → submit → sign in wallet.
- **Expected result**: Transaction moves CREATED → AWAITING_SIGNATURE → SUBMITTED → PENDING → CONFIRMED; explorer link resolves to a real, matching transaction.
- **Actual result**: _____
- **PASS/FAIL**: _____

## D. ERC-20 testnet transfer

- **Prerequisites**: Verified wallet holding a registered testnet ERC-20 (e.g. Sepolia USDC).
- **Steps**: Select the token, enter an amount ≤ balance, submit, sign.
- **Expected result**: Same lifecycle as (C); token balance decreases by the exact amount on-chain.
- **Actual result**: _____
- **PASS/FAIL**: _____

## E. ERC-20 approval

- **Prerequisites**: Verified wallet, a swap quote requiring allowance.
- **Steps**: Request a swap quote for a token with `allowanceRequired: true` → approve with default (exact-amount) setting → confirm approval shows Token/Amount/Spender/Network/Approval type before signing.
- **Expected result**: Approval transaction confirms; subsequent allowance check reports `sufficient: true` for the swap's required amount (not just `> 0`).
- **Actual result**: _____
- **PASS/FAIL**: _____

## F. 0x swap

- **Prerequisites**: Approval from (E) confirmed, `ZEROX_API_KEY` configured.
- **Steps**: Execute the swap using the still-valid quote.
- **Expected result**: Swap transaction confirms; buy token balance increases by ~expected amount (within slippage tolerance); intent verification passes (no `INTEGRITY_FAILED`).
- **Actual result**: _____
- **PASS/FAIL**: _____

## G. Transaction receipt confirmation

- **Prerequisites**: Any submitted transaction from C/D/F.
- **Steps**: Poll `GET /api/transactions/:id/poll` until terminal state.
- **Expected result**: State reaches CONFIRMED or FAILED — never stuck indefinitely in PENDING for a mined transaction, never CONFIRMED without a matching on-chain intent.
- **Actual result**: _____
- **PASS/FAIL**: _____

## H. Wrong-chain rejection

- **Prerequisites**: Wallet connected to a different chain than the configured `CHAINSTACK_CHAIN_ID`.
- **Steps**: Attempt a transfer.
- **Expected result**: Prepare call fails or UI blocks with a "Switch Network" action before signing; if a transaction is somehow broadcast on the wrong chain, intent verification marks it `INTEGRITY_FAILED`, never `CONFIRMED`.
- **Actual result**: _____
- **PASS/FAIL**: _____

## I. Insufficient-balance rejection

- **Prerequisites**: Wallet with balance less than the requested transfer amount.
- **Steps**: Attempt a transfer for more than the wallet holds.
- **Expected result**: `INSUFFICIENT_FUNDS`/`INSUFFICIENT_TOKEN_BALANCE` error before any signature request.
- **Actual result**: _____
- **PASS/FAIL**: _____

## J. Wallet signature rejection

- **Prerequisites**: Any prepared transaction.
- **Steps**: Reject the signature request in the wallet.
- **Expected result**: Transaction marked `CANCELLED` (not `FAILED`); UI shows "Transaction canceled", not a generic error.
- **Actual result**: _____
- **PASS/FAIL**: _____

## K. Failed/reverted transaction

- **Prerequisites**: A transaction guaranteed to revert (e.g. transfer amount exceeding a token's transfer restriction, or insufficient gas set deliberately in a test harness).
- **Steps**: Submit and confirm broadcast; wait for receipt.
- **Expected result**: State reaches `FAILED` with `failureReason` set; never `CONFIRMED`.
- **Actual result**: _____
- **PASS/FAIL**: _____

## L. Transaction replacement (speed-up/cancel)

- **Prerequisites**: A pending transaction; use the wallet's "speed up" or "cancel" feature with the same nonce.
- **Steps**: Replace the original transaction, then poll.
- **Expected result**: Original marked `REPLACED` (not left `PENDING` forever); replacement tracked. **Known limitation**: replacement-hash linkage is not yet implemented — see MVP_READINESS_REPORT.md.
- **Actual result**: _____
- **PASS/FAIL**: _____

## M. Chainstack outage

- **Prerequisites**: Ability to temporarily point `CHAINSTACK_RPC_URL` at an unreachable host.
- **Steps**: Attempt a portfolio read and a transfer prepare while unreachable.
- **Expected result**: Reads/writes fail closed with a `CHAINSTACK_UNAVAILABLE` error; no fabricated balances or transactions.
- **Actual result**: _____
- **PASS/FAIL**: _____

## N. WSS disconnect/reconnect

- **Prerequisites**: `CHAINSTACK_WSS_URL` configured.
- **Steps**: Kill the WSS connection (e.g. firewall rule) and observe reconnection.
- **Expected result**: `getWebSocketStatus()` reflects `connected: false` then `true` after reconnect; HTTPS RPC health is unaffected by WSS state.
- **Actual result**: _____
- **PASS/FAIL**: _____

## O. Stripe checkout

- **Prerequisites**: Stripe test-mode keys + price IDs configured.
- **Steps**: `POST /api/billing/create-checkout-session` → complete checkout with Stripe test card `4242 4242 4242 4242`.
- **Expected result**: Redirect to success URL; `customer.subscription.created` webhook fires.
- **Actual result**: _____
- **PASS/FAIL**: _____

## P. Stripe webhook

- **Prerequisites**: Stripe CLI or dashboard webhook pointed at `/api/billing/webhook`.
- **Steps**: Trigger `customer.subscription.updated` via Stripe CLI (`stripe trigger`).
- **Expected result**: Signature verified; `subscriptions` row updates; replayed/duplicate delivery of the same event id is acknowledged without reprocessing.
- **Actual result**: _____
- **PASS/FAIL**: _____

## Q. Subscription entitlement

- **Prerequisites**: Active Trader/Pro subscription for a test account.
- **Steps**: Call a gated route (e.g. `automated_trading`-gated endpoint).
- **Expected result**: Allowed. Downgrading/canceling in Stripe test mode revokes the entitlement on next webhook sync.
- **Actual result**: _____
- **PASS/FAIL**: _____

## R. Canceled subscription

- **Prerequisites**: Subscription canceled (`status: canceled`) via Stripe test mode.
- **Steps**: Call the same gated route.
- **Expected result**: `403`/`402` — access denied; no client-side-only enforcement.
- **Actual result**: _____
- **PASS/FAIL**: _____

## S. Unauthorized transaction access attempt

- **Prerequisites**: Two distinct verified accounts/wallets, A and B.
- **Steps**: As B, call `GET /api/transactions/:id` for a transaction id belonging to A (and the `submitted`/`cancelled`/`poll` variants).
- **Expected result**: `404` for all four routes; B never sees A's transaction data or is able to mutate it. (Automated equivalent: `tests/transaction-idor.test.ts`.)
- **Actual result**: _____
- **PASS/FAIL**: _____
