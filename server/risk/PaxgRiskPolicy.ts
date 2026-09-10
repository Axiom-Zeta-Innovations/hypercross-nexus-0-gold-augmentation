export interface PaxgRiskPolicy {
  maxSingleTradeUsd: number;
  maxDailyTradeUsd: number;
  maxPortfolioAllocationPct: number;
  maxSlippageBps: number;
  maximumPremiumToSpotPct: number;
  requireHumanApproval: boolean;
  minLiquidityScore: number;
  minApprovalScore?: number;
}

export const DEFAULT_PAXG_RISK_POLICY: PaxgRiskPolicy = {
  maxSingleTradeUsd: 15000,
  maxDailyTradeUsd: 50000,
  maxPortfolioAllocationPct: 15,
  maxSlippageBps: 100,
  maximumPremiumToSpotPct: 2.5,
  requireHumanApproval: true,
  minLiquidityScore: 55,
  minApprovalScore: 80,
};

export interface PaxgRiskEvaluationInput extends Partial<PaxgRiskPolicy> {
  notionalUsd: number;
  premiumToSpotPct: number;
  portfolioAllocationPct: number;
  slippageBps: number;
  liquidityScore: number;
  approvedBy?: string | null;
}

export function evaluatePaxgRiskPolicy(input: PaxgRiskEvaluationInput): {
  ok: boolean;
  reasons: string[];
  policy: PaxgRiskPolicy;
} {
  const policy: PaxgRiskPolicy = {
    ...DEFAULT_PAXG_RISK_POLICY,
    maxSingleTradeUsd: input.maxSingleTradeUsd ?? DEFAULT_PAXG_RISK_POLICY.maxSingleTradeUsd,
    maxDailyTradeUsd: input.maxDailyTradeUsd ?? DEFAULT_PAXG_RISK_POLICY.maxDailyTradeUsd,
    maxPortfolioAllocationPct: input.maxPortfolioAllocationPct ?? DEFAULT_PAXG_RISK_POLICY.maxPortfolioAllocationPct,
    maxSlippageBps: input.maxSlippageBps ?? DEFAULT_PAXG_RISK_POLICY.maxSlippageBps,
    maximumPremiumToSpotPct: input.maximumPremiumToSpotPct ?? DEFAULT_PAXG_RISK_POLICY.maximumPremiumToSpotPct,
    requireHumanApproval: input.requireHumanApproval ?? DEFAULT_PAXG_RISK_POLICY.requireHumanApproval,
    minLiquidityScore: input.minLiquidityScore ?? DEFAULT_PAXG_RISK_POLICY.minLiquidityScore,
    minApprovalScore: input.minApprovalScore ?? DEFAULT_PAXG_RISK_POLICY.minApprovalScore,
  };

  const reasons: string[] = [];
  const notionalUsd = Number(input.notionalUsd ?? 0);
  const premiumToSpotPct = Number(input.premiumToSpotPct ?? 0);
  const portfolioAllocationPct = Number(input.portfolioAllocationPct ?? 0);
  const slippageBps = Number(input.slippageBps ?? 0);
  const liquidityScore = Number(input.liquidityScore ?? 0);

  if (premiumToSpotPct > policy.maximumPremiumToSpotPct) {
    reasons.push(
      `Premium ${premiumToSpotPct.toFixed(2)}% exceeds the max premium cap of ${policy.maximumPremiumToSpotPct.toFixed(2)}%.`
    );
  }

  if (notionalUsd > policy.maxSingleTradeUsd) {
    reasons.push(
      `Trade notional $${notionalUsd.toLocaleString()} exceeds the max single-trade limit of $${policy.maxSingleTradeUsd.toLocaleString()}.`
    );
  }

  if (notionalUsd > policy.maxDailyTradeUsd) {
    reasons.push(
      `Trade notional $${notionalUsd.toLocaleString()} exceeds the max daily trade limit of $${policy.maxDailyTradeUsd.toLocaleString()}.`
    );
  }

  if (portfolioAllocationPct > policy.maxPortfolioAllocationPct) {
    reasons.push(
      `Portfolio allocation ${portfolioAllocationPct.toFixed(2)}% exceeds the max allocation cap of ${policy.maxPortfolioAllocationPct.toFixed(2)}%.`
    );
  }

  if (slippageBps > policy.maxSlippageBps) {
    reasons.push(
      `Slippage ${slippageBps}bps exceeds the configured max slippage of ${policy.maxSlippageBps}bps.`
    );
  }

  if (liquidityScore < policy.minLiquidityScore) {
    reasons.push(
      `Liquidity score ${liquidityScore} is below the required minimum ${policy.minLiquidityScore}.`
    );
  }

  const approvedBy = String(input.approvedBy ?? "").trim().toUpperCase();
  if (policy.requireHumanApproval && (!approvedBy || !["USER", "APPROVER", "ADMIN", "HUMAN"].includes(approvedBy))) {
    reasons.push("PAXG execution requires explicit human approval before the trade can proceed.");
  }

  return { ok: reasons.length === 0, reasons, policy };
}
