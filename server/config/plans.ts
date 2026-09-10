/**
 * Central subscription plan → feature entitlement mapping.
 * Stripe price IDs come from environment configuration, never hard-coded here.
 */

export type PlanId = "research" | "trader" | "pro" | "none";

export type FeatureKey =
  | "research_mode"
  | "live_market_data"
  | "blockchain_analysis"
  | "nonlinear_engine"
  | "automated_trading"
  | "advanced_strategies"
  | "portfolio_analytics"
  | "desktop_access";

export const PLAN_FEATURES: Record<PlanId, FeatureKey[]> = {
  research: ["research_mode", "blockchain_analysis", "nonlinear_engine", "live_market_data"],
  trader: [
    "research_mode",
    "blockchain_analysis",
    "nonlinear_engine",
    "live_market_data",
    "automated_trading",
    "portfolio_analytics",
    "desktop_access",
  ],
  pro: [
    "research_mode",
    "blockchain_analysis",
    "nonlinear_engine",
    "live_market_data",
    "automated_trading",
    "portfolio_analytics",
    "desktop_access",
    "advanced_strategies",
  ],
  none: [],
};

export function getStripePriceId(plan: Exclude<PlanId, "none">): string | undefined {
  const map: Record<Exclude<PlanId, "none">, string | undefined> = {
    research: process.env.STRIPE_PRICE_RESEARCH,
    trader: process.env.STRIPE_PRICE_TRADER,
    pro: process.env.STRIPE_PRICE_PRO,
  };
  return map[plan];
}

export function planForStripePriceId(priceId: string): PlanId {
  if (priceId === process.env.STRIPE_PRICE_RESEARCH) return "research";
  if (priceId === process.env.STRIPE_PRICE_TRADER) return "trader";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "none";
}

export function featuresForPlan(plan: PlanId): FeatureKey[] {
  return PLAN_FEATURES[plan] ?? [];
}
