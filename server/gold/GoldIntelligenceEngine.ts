export type GoldSignalDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type GoldSignalHorizon = "INTRADAY" | "SWING" | "POSITION";

export interface SignalFactor {
  name: string;
  rawValue: number;
  normalizedValue: number;
  contribution: number;
  dataSource: string;
}

export interface GoldSignal {
  signalId: string;
  asset: "PAXG";
  underlying: "XAU";
  direction: GoldSignalDirection;
  confidence: number;
  horizon: GoldSignalHorizon;
  factors: SignalFactor[];
  generatedAt: number;
  dataQuality: number;
}

export interface GoldMarketState {
  xauUsd: number;
  paxgUsd: number;
  premiumDiscountPct: number;
  btcUsd?: number;
  ethUsd?: number;
  dxy?: number;
  volatility?: number;
  momentum?: number;
  trend?: string;
  liquidity?: number;
  timestamp: number;
  source: string;
  signals: GoldSignal[];
}

export class GoldIntelligenceEngine {
  evaluate(input: Partial<GoldMarketState>): GoldMarketState {
    const xauUsd = Number(input.xauUsd ?? 2300);
    const paxgUsd = Number(input.paxgUsd ?? xauUsd);
    const premiumDiscountPct = xauUsd > 0 ? ((paxgUsd - xauUsd) / xauUsd) * 100 : 0;
    const volatility = Number(input.volatility ?? 10);
    const momentum = Number(input.momentum ?? 0);
    const direction: GoldSignalDirection = momentum > 1 ? "BULLISH" : momentum < -1 ? "BEARISH" : "NEUTRAL";
    const confidence = Math.min(95, Math.max(25, 60 + Math.abs(momentum) * 8 + (Math.abs(premiumDiscountPct) <= 2 ? 8 : 0)));

    const factors: SignalFactor[] = [
      { name: "PAXG vs XAU basis", rawValue: premiumDiscountPct, normalizedValue: Math.max(-1, Math.min(1, premiumDiscountPct / 5)), contribution: premiumDiscountPct > 0 ? 0.5 : -0.2, dataSource: input.source ?? "demo" },
      { name: "Gold momentum", rawValue: momentum, normalizedValue: Math.max(-1, Math.min(1, momentum / 10)), contribution: momentum * 0.6, dataSource: input.source ?? "demo" },
      { name: "Gold volatility", rawValue: volatility, normalizedValue: Math.max(0, Math.min(1, volatility / 25)), contribution: volatility * 0.05, dataSource: input.source ?? "demo" },
    ];

    const signal: GoldSignal = {
      signalId: `gold-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      asset: "PAXG",
      underlying: "XAU",
      direction,
      confidence: Number(confidence.toFixed(1)),
      horizon: "SWING",
      factors,
      generatedAt: Date.now(),
      dataQuality: Math.min(100, Math.max(40, 100 - Math.max(0, volatility * 1.4))),
    };

    return {
      xauUsd,
      paxgUsd,
      premiumDiscountPct,
      btcUsd: input.btcUsd,
      ethUsd: input.ethUsd,
      dxy: input.dxy,
      volatility,
      momentum,
      trend: input.trend ?? (direction === "BULLISH" ? "uptrend" : direction === "BEARISH" ? "downtrend" : "range"),
      liquidity: input.liquidity,
      timestamp: input.timestamp ?? Date.now(),
      source: input.source ?? "demo",
      signals: [signal],
    };
  }
}

export function createGoldMarketState(input: Partial<GoldMarketState>): GoldMarketState {
  return new GoldIntelligenceEngine().evaluate(input);
}
