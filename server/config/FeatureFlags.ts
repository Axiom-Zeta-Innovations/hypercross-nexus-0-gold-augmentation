/**
 * FeatureFlags
 *
 * The MVP concentrates on: Dashboard, Wallet, Portfolio, Send, Swap,
 * Transactions, Networks, Settings. Everything else defaults OFF and is
 * either hidden or shown as "Coming Soon" on the frontend; the corresponding
 * demo-data API routes also refuse to serve data when their flag is off.
 */

function flagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

export function getFeatureFlags(env: NodeJS.ProcessEnv = process.env) {
  return {
    rwa: flagEnabled(env.FEATURE_RWA, true),
    nft: flagEnabled(env.FEATURE_NFT, true),
    launchpad: flagEnabled(env.FEATURE_LAUNCHPAD, true),
    copyTrading: flagEnabled(env.FEATURE_COPY_TRADING, true),
    sports: flagEnabled(env.FEATURE_SPORTS, true),
    derivatives: flagEnabled(env.FEATURE_DERIVATIVES, true),
    mining: flagEnabled(env.FEATURE_MINING, true),
    banking: flagEnabled(env.FEATURE_BANKING, true),
    custody: flagEnabled(env.FEATURE_CUSTODY, true),
  };
}

export type FeatureFlags = ReturnType<typeof getFeatureFlags>;
