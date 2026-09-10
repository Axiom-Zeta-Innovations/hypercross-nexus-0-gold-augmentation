# Security Architecture

## Trust boundaries

The browser is untrusted. It may select presentation state and request an operation, but it cannot grant a subscription, prove wallet ownership, or confirm a transaction.

- Production identity is backed by PostgreSQL auth and JWT middleware.
- Legacy password recovery now requires a hashed, expiring, one-use token; the direct email-plus-password reset endpoint is disabled.
- Wallet verification uses a signed nonce challenge before wallet-bound operations.
- Stripe webhook signatures, not checkout return URLs, determine production subscription state.
- CORS uses exact configured origins and rejects unknown browser origins.
- Transaction intents are checked against signer, chain, recipient, value, calldata, and receipt.
- Mainnet writes remain explicitly gated by environment policy.

## Nexus and Xero

Nexus can analyze, reject, and propose. It cannot autonomously submit a transaction. Execution intents require explicit user approval, a verified wallet, an authorized entitlement, a valid network policy, and an unexpired intent.

Passwords, reset tokens, JWTs, Stripe secrets, API keys, and cryptocurrency private keys are never returned to clients or stored for blockchain signing. Client-side localStorage and URL parameters are not authorization sources.