export interface MarketSnapshot {
  symbol: string;
  price?: number;
  priceUsd: number;
  change24h: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  volatility?: number;
  timestamp: number;
  source: string;
}

export interface GoldBasisState {
  xauUsd: number;
  paxgUsd: number;
  premiumDiscountPct: number;
  timestamp: number;
}

export interface MarketDataProvider {
  getSnapshot(symbol: string): MarketSnapshot | null;
}

export interface CryptoProvider extends MarketDataProvider {}
export interface GoldSpotProvider extends MarketDataProvider {}
export interface TokenizedGoldProvider extends MarketDataProvider {}

export function normalizeMarketSnapshot(input: Partial<MarketSnapshot> & { symbol?: string; price?: number }): MarketSnapshot {
  const symbol = String(input.symbol ?? "UNKNOWN").toUpperCase();
  const priceUsd = Number(input.priceUsd ?? input.price ?? 0);
  const timestamp = Number(input.timestamp ?? Date.now());
  return {
    symbol,
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
    change24h: Number(input.change24h ?? 0),
    volume24h: input.volume24h ?? undefined,
    high24h: input.high24h ?? undefined,
    low24h: input.low24h ?? undefined,
    volatility: input.volatility ?? undefined,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    source: String(input.source ?? "unknown"),
  };
}

export function calculateGoldBasis(input: { xauUsd: number; paxgUsd: number; timestamp?: number }): GoldBasisState {
  const xauUsd = Number(input.xauUsd ?? 0);
  const paxgUsd = Number(input.paxgUsd ?? 0);
  const premiumDiscountPct = xauUsd > 0 ? Number((((paxgUsd - xauUsd) / xauUsd) * 100).toFixed(2)) : 0;
  return {
    xauUsd,
    paxgUsd,
    premiumDiscountPct,
    timestamp: Number(input.timestamp ?? Date.now()),
  };
}

export class MockMarketProvider implements MarketDataProvider {
  constructor(private readonly snapshot: MarketSnapshot) {}

  getSnapshot(symbol: string): MarketSnapshot | null {
    if (symbol.toUpperCase() !== this.snapshot.symbol.toUpperCase()) return null;
    return { ...this.snapshot, timestamp: this.snapshot.timestamp || Date.now() };
  }
}

export function mockGoldProvider(initial: {
  xauUsd: number;
  paxgUsd: number;
  volume24h?: number;
  change24h?: number;
  timestamp?: number;
}): MarketDataProvider {
  const snapshot: MarketSnapshot = {
    symbol: "PAXG",
    priceUsd: Number(initial.paxgUsd),
    change24h: Number(initial.change24h ?? 0),
    volume24h: initial.volume24h,
    high24h: Number(initial.paxgUsd) * 1.02,
    low24h: Number(initial.paxgUsd) * 0.98,
    volatility: 0.7,
    timestamp: Number(initial.timestamp ?? Date.now()),
    source: "demo-provider",
  };
  return new MockMarketProvider(snapshot);
}

export class PaxgMarketAdapter {
  constructor(private readonly provider: MarketDataProvider) {}

  getSnapshot(symbol: string): MarketSnapshot {
    const snapshot = this.provider.getSnapshot(symbol) ?? normalizeMarketSnapshot({
      symbol,
      priceUsd: 0,
      change24h: 0,
      timestamp: Date.now(),
      source: "mock-unavailable",
    });

    if (!snapshot.symbol) {
      snapshot.symbol = symbol.toUpperCase();
    }
    return normalizeMarketSnapshot(snapshot);
  }

  getGoldBasis(symbol: string): GoldBasisState {
    const snapshot = this.getSnapshot(symbol);
    const xauUsd = Number(snapshot.priceUsd > 0 && symbol.toUpperCase() === "XAU" ? snapshot.priceUsd : 2345);
    const paxgUsd = snapshot.priceUsd || xauUsd;
    return calculateGoldBasis({ xauUsd, paxgUsd, timestamp: snapshot.timestamp });
  }
}
