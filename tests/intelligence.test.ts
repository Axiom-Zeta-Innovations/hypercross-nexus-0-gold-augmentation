import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMarket, proposeStrategy, toExecutionIntent } from "../server/intelligence/IntelligenceEngine";

const snapshot = {
  symbol: "BTC",
  timestamp: "2026-09-04T00:00:00.000Z",
  price: 60000,
  change24h: 4,
  liquidity: 100000000,
  volatility24h: 10,
  dataSources: ["test-provider"],
  freshnessMs: 1000,
};

test("Nexus analysis is deterministic and finite", () => {
  const first = analyzeMarket(snapshot);
  const second = analyzeMarket(snapshot);
  assert.deepEqual(first.opportunity, second.opportunity);
  assert.ok(Number.isFinite(first.opportunity.opportunityScore));
  assert.ok(Number.isFinite(first.opportunity.risk.riskScore));
});

test("stale data rejects an opportunity", () => {
  const result = analyzeMarket({ ...snapshot, freshnessMs: 10 * 60 * 1000 });
  assert.equal(result.opportunity.status, "rejected");
  assert.match(result.opportunity.risk.blockers.join(" "), /stale/i);
  assert.equal(proposeStrategy(result.opportunity).action, "HOLD");
});

test("strategy proposals and execution intents require approval", () => {
  const proposal = proposeStrategy(analyzeMarket(snapshot).opportunity);
  const intent = toExecutionIntent(proposal, "ethereum-sepolia");
  assert.equal(proposal.requiresUserApproval, true);
  assert.equal(intent.requiresHumanApproval, true);
  assert.equal(intent.network, "ethereum-sepolia");
});