import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { TransactionService } from "../server/transactions/TransactionService";

// ── IDOR / ownership tests ───────────────────────────────────────────────────
// A transaction must only be resolvable by the user who owns it (by userId or by
// verified wallet address) — never merely because the caller is authenticated.

function makeOwner() {
  return { id: crypto.randomUUID(), walletAddress: `0x${crypto.randomBytes(20).toString("hex")}` };
}

test("owner can fetch their own transaction", () => {
  const owner = makeOwner();
  const id = TransactionService.createTransaction({
    userId: owner.id,
    walletAddress: owner.walletAddress,
    chainId: 84532,
    network: "base-sepolia",
    operationType: "native_transfer",
  });

  const record = TransactionService.getForUser(id, owner);
  assert.ok(record, "owner should be able to fetch their own transaction");
  assert.equal(record.id, id);
});

test("another authenticated user cannot fetch someone else's transaction", () => {
  const owner = makeOwner();
  const attacker = makeOwner();
  const id = TransactionService.createTransaction({
    userId: owner.id,
    walletAddress: owner.walletAddress,
    chainId: 84532,
    network: "base-sepolia",
    operationType: "native_transfer",
  });

  const record = TransactionService.getForUser(id, attacker);
  assert.equal(record, null, "attacker must not be able to read another user's transaction");
});

test("wallet-only ownership match works when userId is absent (wallet-verification-only sessions)", () => {
  const owner = { id: null, walletAddress: `0x${crypto.randomBytes(20).toString("hex")}` };
  const id = TransactionService.createTransaction({
    userId: null,
    walletAddress: owner.walletAddress,
    chainId: 84532,
    network: "base-sepolia",
    operationType: "native_transfer",
  });

  const record = TransactionService.getForUser(id, owner);
  assert.ok(record);

  const attacker = { id: null, walletAddress: `0x${crypto.randomBytes(20).toString("hex")}` };
  assert.equal(TransactionService.getForUser(id, attacker), null);
});

test("unauthenticated caller (no id/wallet) cannot resolve any transaction", () => {
  const owner = makeOwner();
  const id = TransactionService.createTransaction({
    userId: owner.id,
    walletAddress: owner.walletAddress,
    chainId: 84532,
    network: "base-sepolia",
    operationType: "native_transfer",
  });

  const record = TransactionService.getForUser(id, { id: null, walletAddress: null });
  assert.equal(record, null);
});

test("unknown transaction id resolves to null for any caller (indistinguishable from unauthorized)", () => {
  const owner = makeOwner();
  const record = TransactionService.getForUser(crypto.randomUUID(), owner);
  assert.equal(record, null);
});
