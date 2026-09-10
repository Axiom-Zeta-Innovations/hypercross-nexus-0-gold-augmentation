import test from "node:test";
import assert from "node:assert/strict";
import { verifyTransactionIntent } from "../server/transactions/TransactionIntegrity";

const baseIntent = {
  chainId: 84532,
  fromAddress: "0xAbC1230000000000000000000000000000dEaD",
  intentTo: "0x1111111111111111111111111111111111111111",
  intentData: "0xa9059cbb00000000000000000000000000000000000000000000000000000000000001",
  intentValue: "0",
};

const validOnChainTx = {
  chainId: 84532,
  from: "0xabc1230000000000000000000000000000dead",
  to: "0x1111111111111111111111111111111111111111",
  data: "0xa9059cbb00000000000000000000000000000000000000000000000000000000000001",
  value: "0",
};

test("verifyTransactionIntent: matching transaction passes", () => {
  const result = verifyTransactionIntent(validOnChainTx, baseIntent);
  assert.equal(result.ok, true);
});

test("verifyTransactionIntent: missing transaction fails (never confirm on absence)", () => {
  const result = verifyTransactionIntent(null, baseIntent);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /not found/i);
});

test("verifyTransactionIntent: wrong sender fails", () => {
  const result = verifyTransactionIntent({ ...validOnChainTx, from: "0x0000000000000000000000000000000000dead" }, baseIntent);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /sender/i);
});

test("verifyTransactionIntent: wrong recipient fails", () => {
  const result = verifyTransactionIntent({ ...validOnChainTx, to: "0x2222222222222222222222222222222222222222" }, baseIntent);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /recipient/i);
});

test("verifyTransactionIntent: wrong amount fails", () => {
  const result = verifyTransactionIntent({ ...validOnChainTx, value: "1000000000000000000" }, baseIntent);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /amount/i);
});

test("verifyTransactionIntent: wrong calldata fails", () => {
  const result = verifyTransactionIntent({ ...validOnChainTx, data: "0xdeadbeef" }, baseIntent);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /calldata/i);
});

test("verifyTransactionIntent: wrong chain fails", () => {
  const result = verifyTransactionIntent({ ...validOnChainTx, chainId: 1 }, baseIntent);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /chain/i);
});

test("verifyTransactionIntent: unrelated but successful hash (all fields wrong) fails", () => {
  const unrelated = {
    chainId: 1,
    from: "0x9999999999999999999999999999999999999999".slice(0, 42),
    to: "0x8888888888888888888888888888888888888888".slice(0, 42),
    data: "0x",
    value: "5000000000000000000",
  };
  const result = verifyTransactionIntent(unrelated, baseIntent);
  assert.equal(result.ok, false);
});

test("verifyTransactionIntent: native transfer with no calldata matches when intentData is empty", () => {
  const nativeIntent = { ...baseIntent, intentData: null, intentValue: "1000000000000000000" };
  const nativeTx = { ...validOnChainTx, data: "0x", value: "1000000000000000000" };
  const result = verifyTransactionIntent(nativeTx, nativeIntent);
  assert.equal(result.ok, true);
});
