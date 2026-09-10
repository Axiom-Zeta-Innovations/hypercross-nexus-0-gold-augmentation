export type AssetClass =
  | "CRYPTO"
  | "PRECIOUS_METAL"
  | "TOKENIZED_COMMODITY"
  | "STABLECOIN"
  | "RWA";

export type SettlementRail =
  | "BLOCKCHAIN"
  | "BROKER"
  | "CUSTODIAN"
  | "EXCHANGE";

export type AssetUnit =
  | "TOKEN"
  | "TROY_OUNCE"
  | "GRAM"
  | "USD";

export interface AssetDefinition {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  underlying?: string;
  settlementRail: SettlementRail;
  chain?: string;
  contractAddress?: string;
  decimals?: number;
  unit: AssetUnit;
  quoteCurrency?: string;
  metadata?: Record<string, unknown>;
}

export interface TrustedToken {
  symbol: string;
  chainId: number;
  contractAddress: string;
  decimals: number;
  enabled: boolean;
}

export interface AssetProvenance {
  asset: string;
  issuer?: string;
  underlying?: string;
  custodyType?: string;
  settlementRail?: string;
  verificationSources: string[];
  lastVerifiedAt?: number;
}

export const ASSET_REGISTRY = new Map<string, AssetDefinition>();

export function registerAsset(asset: AssetDefinition): AssetDefinition {
  const key = asset.symbol.toUpperCase();
  ASSET_REGISTRY.set(key, asset);
  return asset;
}

export function normalizeAssetDefinition(input: Partial<AssetDefinition> & { symbol?: string }): AssetDefinition | null {
  const symbol = (input.symbol ?? "").toUpperCase();
  if (!symbol) return null;
  const existing = ASSET_REGISTRY.get(symbol);
  if (existing) return existing;

  const fallback: AssetDefinition = {
    id: input.id ?? `asset:${symbol.toLowerCase()}`,
    symbol,
    name: input.name ?? symbol,
    assetClass: input.assetClass ?? "CRYPTO",
    underlying: input.underlying,
    settlementRail: input.settlementRail ?? "BLOCKCHAIN",
    chain: input.chain,
    contractAddress: input.contractAddress,
    decimals: input.decimals ?? 18,
    unit: input.unit ?? "TOKEN",
    quoteCurrency: input.quoteCurrency ?? "USD",
    metadata: input.metadata ?? {},
  };

  ASSET_REGISTRY.set(symbol, fallback);
  return fallback;
}

export const XAU_ASSET: AssetDefinition = registerAsset({
  id: "xau",
  symbol: "XAU",
  name: "Gold Spot (XAU)",
  assetClass: "PRECIOUS_METAL",
  underlying: "XAU",
  settlementRail: "CUSTODIAN",
  unit: "TROY_OUNCE",
  quoteCurrency: "USD",
  metadata: { source: "spot-reference" },
});

export const PAXG_ASSET: AssetDefinition = registerAsset({
  id: "paxg",
  symbol: "PAXG",
  name: "PAX Gold",
  assetClass: "TOKENIZED_COMMODITY",
  underlying: "XAU",
  settlementRail: "BLOCKCHAIN",
  chain: "ethereum",
  contractAddress: "0x45804880de22913dafe09f4980848ece6ecbaf78",
  decimals: 18,
  unit: "TROY_OUNCE",
  quoteCurrency: "USD",
  metadata: {
    issuer: "Paxos",
    custodyType: "allocated-gold",
    tokenized: true,
  },
});

export const BTC_ASSET: AssetDefinition = registerAsset({
  id: "btc",
  symbol: "BTC",
  name: "Bitcoin",
  assetClass: "CRYPTO",
  settlementRail: "BLOCKCHAIN",
  chain: "ethereum",
  decimals: 8,
  unit: "TOKEN",
  quoteCurrency: "USD",
});

export function toTroyOunces(quantity: number, asset: AssetDefinition): number {
  if (!Number.isFinite(quantity)) return 0;
  if (asset.unit === "TROY_OUNCE") return quantity;
  if (asset.unit === "TOKEN") return quantity;
  if (asset.unit === "GRAM") return quantity / 31.1034768;
  if (asset.unit === "USD") return quantity / (asset.metadata?.referencePriceUsd as number || 1);
  return quantity;
}

export function toUsdValue(quantity: number, priceUsd: number, asset: AssetDefinition): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(priceUsd)) return 0;
  const normalizedQuantity = Math.max(0, quantity);
  const normalizedPrice = Math.max(0, priceUsd);
  if (asset.unit === "USD") return normalizedQuantity;
  if (asset.unit === "TROY_OUNCE") return normalizedQuantity * normalizedPrice;
  return normalizedQuantity * normalizedPrice;
}

export function buildAssetProvenance(asset: AssetDefinition): AssetProvenance {
  return {
    asset: asset.symbol,
    issuer: typeof asset.metadata?.issuer === "string" ? asset.metadata.issuer : undefined,
    underlying: asset.underlying,
    custodyType: typeof asset.metadata?.custodyType === "string" ? asset.metadata.custodyType : undefined,
    settlementRail: asset.settlementRail,
    verificationSources: [
      asset.contractAddress ? "contract-address-config" : "reference-price",
      asset.underlying ? "underlying-asset-map" : "market-data",
    ],
    lastVerifiedAt: Date.now(),
  };
}

export const TRUSTED_TOKENS: TrustedToken[] = [
  {
    symbol: "PAXG",
    chainId: 1,
    contractAddress: "0x45804880de22913dafe09f4980848ece6ecbaf78",
    decimals: 18,
    enabled: true,
  },
];
