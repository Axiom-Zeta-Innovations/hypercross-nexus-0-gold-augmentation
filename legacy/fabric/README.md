# Legacy Fabric Archive

This directory is a placeholder for historical Hyperledger Fabric / Kaleido code.

**This code belongs to the previous Hyperledger Fabric/Kaleido implementation.
It is not imported or used by the active Hypercross Chainstack MVP.**

## Status

As of the Chainstack-native MVP migration:

- All active Fabric/Kaleido API routes (`/api/kaleido`, `/api/fabric-connect`,
  `/api/fabric-query`, `/api/fabric-invoke`) were removed from `server.ts` in an
  earlier migration pass — none remain reachable.
- The frontend "Kaleido Hyperledger Fabric Connection Portal" component was
  replaced with a read-only `ChainstackConnectPage` that only displays real
  `/api/blockchain/status` data.
- `config/whiteLabelConfig.json` no longer declares a `fabric` datasource or
  `fabricConnect` module.
- Marketing copy referencing "Kaleido Fabric" across feature pages (RWA, NFT,
  Custody, Derivatives, Copy Trading, Mining, Sports, Fundraising, Launchpad)
  has been rewritten to describe those pages as simulated demo modules
  (they are also feature-flagged off by default — see `FEATURE_*` in
  `.env.example`).

## What was NOT migrated here

No separable "Fabric business logic" module exists to move into this folder —
by the time of this pass, the remaining Fabric/Kaleido footprint was limited to:

1. Dead/unreachable route handlers (already deleted, not archived).
2. UI copy and demo data labels (rewritten in place, not archived).
3. Legacy SQLite schema columns (`channel`, `chaincode`) on the unused `assets`
   table in `src/db/index.ts` — kept only for backward compatibility with the
   desktop Electron build (`electron/database.mjs`), which retains its own
   local database schema and is a separate distribution channel from the web
   MVP server. No active web MVP route reads or writes this table.

If genuine legacy Fabric integration code is found elsewhere in the future,
move it here alongside this README rather than deleting it outright.
