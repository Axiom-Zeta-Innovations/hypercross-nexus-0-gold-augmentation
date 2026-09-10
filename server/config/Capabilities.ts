import { getFeatureFlags } from "./FeatureFlags";
import { blockchainService } from "../blockchain/BlockchainService";
import type { CapabilityRegistry, CapabilityStatus } from "../../packages/shared/types";

export async function getCapabilities(env: NodeJS.ProcessEnv = process.env): Promise<CapabilityRegistry> {
  const isProd = env.NODE_ENV === "production";
  const appMode = env.APP_DATA_MODE || "live";
  const isDemo = appMode === "demo";
  const allowDemo = env.ALLOW_DEMO_DATA === "true";

  // Check blockchain connectivity
  let rpcHealthy = false;
  try {
    rpcHealthy = await blockchainService.healthCheck();
  } catch (err) {
    rpcHealthy = false;
  }

  const blockchainStatus: CapabilityStatus = rpcHealthy 
    ? "LIVE" 
    : (isDemo && allowDemo ? "DEVELOPMENT_ONLY" : "UNAVAILABLE");

  const backendStatus: CapabilityStatus = "LIVE";

  // Swap becomes truly live only when the RPC is healthy and the 0x key is configured.
  // In local development, a missing key should remain a non-fatal development-only signal
  // rather than the hard "unavailable" state shown to users in a dev environment.
  const hasZeroExKey = !!env.ZEROX_API_KEY?.trim();
  const isLocalDev = env.NODE_ENV !== "production";
  const swapStatus: CapabilityStatus = (rpcHealthy && hasZeroExKey)
    ? "LIVE"
    : (isLocalDev ? "DEVELOPMENT_ONLY" : (isDemo && allowDemo ? "DEVELOPMENT_ONLY" : "UNAVAILABLE"));

  // Digitial Asset Issuance using web client or desktop connection
  const assetIssuanceStatus: CapabilityStatus = rpcHealthy
    ? "LIVE"
    : (isDemo && allowDemo ? "DEVELOPMENT_ONLY" : "UNAVAILABLE");

  // Send & Transactions are live if blockchain RPC is healthy
  const sendStatus: CapabilityStatus = rpcHealthy
    ? "LIVE"
    : (isDemo && allowDemo ? "DEVELOPMENT_ONLY" : "UNAVAILABLE");

  const transactionsStatus: CapabilityStatus = rpcHealthy
    ? "LIVE"
    : "DEGRADED"; // degraded history available in DB

  const liveStatus: CapabilityStatus = rpcHealthy
    ? "LIVE"
    : (isDemo && allowDemo ? "DEVELOPMENT_ONLY" : "UNAVAILABLE");

  return {
    backendApi: backendStatus,
    blockchainRpc: blockchainStatus,
    wallet: "LIVE", // default as it is driven by client check but we want to allow live path
    chainstackConnectivity: blockchainStatus,
    digitalAssetIssuance: assetIssuanceStatus,
    send: sendStatus,
    swap: swapStatus,
    transactions: transactionsStatus,
    // Non-MVP features are "COMING_SOON" but if enabled and in demo mode with ALLOW_DEMO_DATA, they are "DEVELOPMENT_ONLY"
    rwaInfrastructure: getFeatureFlags(env).rwa ? liveStatus : "COMING_SOON",
    nftMarketplace: getFeatureFlags(env).nft ? liveStatus : "COMING_SOON",
    tokenFundraising: getFeatureFlags(env).launchpad ? liveStatus : "COMING_SOON",
    tokenLaunchpad: getFeatureFlags(env).launchpad ? liveStatus : "COMING_SOON",
    derivatives: getFeatureFlags(env).derivatives ? liveStatus : "COMING_SOON",
    copyTrading: getFeatureFlags(env).copyTrading ? liveStatus : "COMING_SOON",
  };
}
