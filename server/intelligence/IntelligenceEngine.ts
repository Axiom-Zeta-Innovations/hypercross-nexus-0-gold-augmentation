import crypto from "node:crypto";

export interface MarketSnapshot {
  symbol: string;
  timestamp: string;
  price: number;
  change24h: number;
  volume24h?: number;
  liquidity?: number;
  volatility24h?: number;
  dataSources: string[];
  freshnessMs: number;
}

export interface Signal {
  id: string;
  symbol: string;
  type: "momentum" | "trend" | "volatility" | "liquidity";
  direction: "bullish" | "bearish" | "neutral";
  score: number;
  confidence: number;
  evidence: string[];
  createdAt: string;
}

export interface RiskAssessment {
  riskScore: number;
  volatilityRisk: number;
  liquidityRisk: number;
  concentrationRisk: number;
  executionRisk: number;
  reasons: string[];
  blockers: string[];
}

export interface Opportunity {
  id: string;
  asset: string;
  category: "spot";
  direction: "long" | "short" | "neutral";
  opportunityScore: number;
  confidence: number;
  expectedRisk: number;
  signals: Signal[];
  risk: RiskAssessment;
  thesis: string[];
  invalidationConditions: string[];
  status: "candidate" | "approved" | "rejected";
}

export interface StrategyProposal {
  id: string;
  source: "hypercross-nexus";
  opportunityId: string;
  action: "BUY" | "SELL" | "HOLD";
  assetIn?: string;
  amount?: string;
  confidence: number;
  riskScore: number;
  rationale: string[];
  warnings: string[];
  executionConstraints: { maxPositionPercent: number; expiresAt: string };
  requiresUserApproval: true;
}

export interface NexusExecutionIntent {
  version: "1.0";
  intentId: string;
  createdAt: string;
  expiresAt: string;
  strategyProposalId: string;
  tradeClass: "DEFI";
  network: string;
  action: Record<string, unknown>;
  risk: { score: number };
  confidence: number;
  policyRequirements: string[];
  requiresHumanApproval: true;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const idFor = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);

export function analyzeMarket(snapshot: MarketSnapshot): { signals: Signal[]; opportunity: Opportunity } {
  const now = snapshot.timestamp;
  const stale = snapshot.freshnessMs > 5 * 60 * 1000;
  const momentumDirection = snapshot.change24h > 1 ? "bullish" : snapshot.change24h < -1 ? "bearish" : "neutral";
  const momentumScore = clamp(Math.abs(snapshot.change24h) * 10);
  const signals: Signal[] = [{
    id: idFor(`${snapshot.symbol}:momentum:${snapshot.timestamp}`),
    symbol: snapshot.symbol,
    type: "momentum",
    direction: momentumDirection,
    score: momentumScore,
    confidence: stale ? 0 : clamp(50 + momentumScore / 2),
    evidence: [`24h change is ${snapshot.change24h}%`, `sources: ${snapshot.dataSources.join(", ") || "none"}`],
    createdAt: now,
  }];

  const volatilityRisk = clamp((snapshot.volatility24h ?? 50) * 1.5);
  const liquidityRisk = snapshot.liquidity === undefined ? 80 : clamp(100 - Math.min(snapshot.liquidity / 1000000, 100));
  const executionRisk = stale || snapshot.dataSources.length === 0 ? 100 : 20;
  const blockers = [
    ...(stale ? ["Market data is stale."] : []),
    ...(snapshot.dataSources.length === 0 ? ["No data provenance is available."] : []),
    ...(snapshot.price <= 0 ? ["Price must be greater than zero."] : []),
  ];
  const risk: RiskAssessment = {
    riskScore: clamp((volatilityRisk + liquidityRisk + executionRisk) / 3),
    volatilityRisk,
    liquidityRisk,
    concentrationRisk: 0,
    executionRisk,
    reasons: ["Risk is derived from volatility, liquidity, freshness, and provenance."],
    blockers,
  };
  const opportunityScore = clamp(momentumScore * 0.7 + (100 - risk.riskScore) * 0.3);
  const status = blockers.length > 0 || risk.riskScore >= 70 || momentumDirection === "neutral" ? "rejected" : "candidate";
  const opportunity: Opportunity = {
    id: idFor(`${snapshot.symbol}:${snapshot.timestamp}`),
    asset: snapshot.symbol,
    category: "spot",
    direction: momentumDirection === "bullish" ? "long" : momentumDirection === "bearish" ? "short" : "neutral",
    opportunityScore,
    confidence: signals[0].confidence,
    expectedRisk: risk.riskScore,
    signals,
    risk,
    thesis: [`Momentum is ${momentumDirection}.`, `Opportunity score is ${opportunityScore.toFixed(1)}/100.`],
    invalidationConditions: ["Freshness threshold exceeded.", "Risk score reaches 70/100."],
    status,
  };
  return { signals, opportunity };
}

export function proposeStrategy(opportunity: Opportunity): StrategyProposal {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const rejected = opportunity.status === "rejected";
  return {
    id: idFor(`proposal:${opportunity.id}`),
    source: "hypercross-nexus",
    opportunityId: opportunity.id,
    action: rejected ? "HOLD" : opportunity.direction === "long" ? "BUY" : "SELL",
    assetIn: opportunity.asset,
    confidence: opportunity.confidence,
    riskScore: opportunity.expectedRisk,
    rationale: opportunity.thesis,
    warnings: [...opportunity.risk.blockers, ...(rejected ? ["Nexus rejected this opportunity; no execution is permitted."] : [])],
    executionConstraints: { maxPositionPercent: 5, expiresAt },
    requiresUserApproval: true,
  };
}

export function toExecutionIntent(proposal: StrategyProposal, network: string): NexusExecutionIntent {
  return {
    version: "1.0",
    intentId: idFor(`intent:${proposal.id}`),
    createdAt: new Date().toISOString(),
    expiresAt: proposal.executionConstraints.expiresAt,
    strategyProposalId: proposal.id,
    tradeClass: "DEFI",
    network,
    action: { action: proposal.action, asset: proposal.assetIn },
    risk: { score: proposal.riskScore },
    confidence: proposal.confidence,
    policyRequirements: ["verified-wallet", "server-entitlement", "explicit-user-approval", "mainnet-policy-check"],
    requiresHumanApproval: true,
  };
}