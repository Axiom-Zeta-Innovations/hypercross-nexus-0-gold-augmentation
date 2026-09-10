import test from "node:test";
import assert from "node:assert/strict";
import { isAllowanceSufficient, resolveApprovalAmount, MAX_UINT256 } from "../server/swap/AllowanceCheck";

test("isAllowanceSufficient: exact match is sufficient", () => {
  assert.equal(isAllowanceSufficient(100n, 100n), true);
});

test("isAllowanceSufficient: allowance one below required is NOT sufficient", () => {
  assert.equal(isAllowanceSufficient(99n, 100n), false);
});

test("isAllowanceSufficient: allowance greater than zero but below required is NOT sufficient (regression: never allowance > 0)", () => {
  assert.equal(isAllowanceSufficient(1n, 1000000000000000000n), false);
});

test("isAllowanceSufficient: zero allowance with zero required is trivially sufficient", () => {
  assert.equal(isAllowanceSufficient(0n, 0n), true);
});

test("isAllowanceSufficient: large allowance covers large requirement", () => {
  assert.equal(isAllowanceSufficient(MAX_UINT256, 1000000000000000000n), true);
});

test("resolveApprovalAmount: defaults to exact required amount", () => {
  assert.equal(resolveApprovalAmount(500n, false), 500n);
});

test("resolveApprovalAmount: unlimited must be explicitly requested", () => {
  assert.equal(resolveApprovalAmount(500n, true), MAX_UINT256);
});
