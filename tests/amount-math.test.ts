import test from "node:test";
import assert from "node:assert/strict";
import { nativeAmountToWei, tokenAmountToBaseUnits, assertPositiveDecimalAmount } from "../server/blockchain/AmountMath";
import { InvalidAmountError } from "../server/blockchain/errors";

// ── Exact decimal -> base-unit conversion (never Number()/Math.round()/1e18 float math) ──

test("nativeAmountToWei: 1 wei boundary (0.000000000000000001 ETH) converts exactly", () => {
  assert.equal(nativeAmountToWei("0.000000000000000001"), 1n);
});

test("nativeAmountToWei: large balance does not lose precision", () => {
  // 123456789.123456789012345678 ETH would silently lose digits through Number()*1e18.
  const wei = nativeAmountToWei("123456789.123456789012345678");
  assert.equal(wei, 123456789123456789012345678n);
});

test("nativeAmountToWei: rejects scientific notation", () => {
  assert.throws(() => nativeAmountToWei("1e18"), InvalidAmountError);
});

test("nativeAmountToWei: rejects negative amounts", () => {
  assert.throws(() => nativeAmountToWei("-1"), InvalidAmountError);
});

test("nativeAmountToWei: rejects zero", () => {
  assert.throws(() => nativeAmountToWei("0"), InvalidAmountError);
});

test("nativeAmountToWei: rejects sub-wei precision (invalid for 18 decimals)", () => {
  assert.throws(() => nativeAmountToWei("0.0000000000000000001"), InvalidAmountError);
});

test("tokenAmountToBaseUnits: 6-decimal USDC amount converts exactly", () => {
  assert.equal(tokenAmountToBaseUnits("1234.56", 6), 1234560000n);
});

test("tokenAmountToBaseUnits: 8-decimal token amount converts exactly", () => {
  assert.equal(tokenAmountToBaseUnits("0.00000001", 8), 1n);
});

test("tokenAmountToBaseUnits: 18-decimal token amount converts exactly", () => {
  assert.equal(tokenAmountToBaseUnits("1.5", 18), 1500000000000000000n);
});

test("tokenAmountToBaseUnits: rejects amounts with more precision than the token supports", () => {
  assert.throws(() => tokenAmountToBaseUnits("1.1234567", 6), InvalidAmountError);
});

test("assertPositiveDecimalAmount: rejects non-numeric input", () => {
  assert.throws(() => assertPositiveDecimalAmount("abc"), InvalidAmountError);
});

test("assertPositiveDecimalAmount: accepts amounts near typical wallet balances", () => {
  assert.doesNotThrow(() => assertPositiveDecimalAmount("999999.999999999999999999"));
});
