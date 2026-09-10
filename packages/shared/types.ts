/**
 * Shared TypeScript types used across web, desktop, and backend.
 * Import via a relative path, e.g. `import type { User } from "../../packages/shared/types"`.
 *
 * NOTE: this is currently a plain shared module, not yet a published/installable
 * npm workspace package — see docs/DEPLOYMENT.md for the follow-up to formalize
 * it as `@hypercross/shared` once the monorepo restructuring is undertaken.
 */

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  status: "active" | "suspended" | "deleted";
  emailVerified: boolean;
  createdAt: string;
}

export type PlanId = "research" | "trader" | "pro" | "none";

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "inactive";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export type FeatureKey =
  | "research_mode"
  | "live_market_data"
  | "blockchain_analysis"
  | "nonlinear_engine"
  | "automated_trading"
  | "advanced_strategies"
  | "portfolio_analytics"
  | "desktop_access";

export interface Entitlement {
  feature: FeatureKey;
  enabled: boolean;
  limit: number | null;
}

export interface TradeRequest {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType?: "market" | "limit";
  price?: number;
  clientOrderId: string; // required — prevents accidental duplicate orders
}

export interface TradeResult {
  id: string;
  status: "pending" | "filled" | "rejected" | "failed" | "cancelled";
  exchangeOrderId: string | null;
  reason?: string;
}

export interface Portfolio {
  walletAddress: string;
  holdings: Array<{
    tokenSymbol: string;
    tokenAddress?: string;
    balance: string;
    balanceDecimal: number;
    priceUsd: number | null;
    priceAvailable: boolean;
    valueUsd: number | null;
  }>;
  totalValueUSD: number | null;
  updatedAt: string;
}

export interface BlockchainStatus {
  connected: boolean;
  network: string;
  chainId: number | null;
  blockNumber: number | null;
  rpcHealthy: boolean;
  wssHealthy: boolean;
  rpcLatencyMs: number | null;
  testnet: boolean;
  mainnetWritesAllowed: boolean;
}

export interface MarketStatus {
  symbol: string;
  priceUsd: number | null;
  available: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

export type CapabilityStatus =
  | "LIVE"
  | "UNAVAILABLE"
  | "DEGRADED"
  | "COMING_SOON"
  | "DEVELOPMENT_ONLY";

export interface CapabilityRegistry {
  backendApi: CapabilityStatus;
  blockchainRpc: CapabilityStatus;
  wallet: CapabilityStatus;
  chainstackConnectivity: CapabilityStatus;
  digitalAssetIssuance: CapabilityStatus;
  send: CapabilityStatus;
  swap: CapabilityStatus;
  transactions: CapabilityStatus;
  rwaInfrastructure: CapabilityStatus;
  nftMarketplace: CapabilityStatus;
  tokenFundraising: CapabilityStatus;
  tokenLaunchpad: CapabilityStatus;
  derivatives: CapabilityStatus;
  copyTrading: CapabilityStatus;
}
