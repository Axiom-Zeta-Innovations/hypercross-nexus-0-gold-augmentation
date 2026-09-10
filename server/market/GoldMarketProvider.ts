import { calculateGoldBasis, normalizeMarketSnapshot, type GoldBasisState, type MarketDataProvider, type MarketSnapshot } from "./PaxgMarketAdapter";

export type GoldMarketExecutionState = "DEMO" | "LIVE" | "UNAVAILABLE";

export interface GoldMarketProviderConfig {
  marketProvider?: string;
  apiUrl?: string;
  apiKey?: string;
  strictMode?: boolean;
}

const DEFAULT_XAU_USD = 2345;
const DEFAULT_PAXG_USD = 2368.5;

export class GoldMarketProvider implements MarketDataProvider {
  readonly executionState: GoldMarketExecutionState;

  constructor(executionState: GoldMarketExecutionState = "DEMO", protected readonly sourceLabel = "demo") {
    this.executionState = executionState;
  }

  getSnapshot(symbol: string): MarketSnapshot | null {
    return normalizeMarketSnapshot({
      symbol,
      priceUsd: symbol.toUpperCase() === "XAU" ? DEFAULT_XAU_USD : DEFAULT_PAXG_USD,
      change24h: 0,
      timestamp: Date.now(),
      source: this.sourceLabel,
    });
  }

  getGoldBasis(symbol: string): GoldBasisState {
    const snapshot = this.getSnapshot(symbol) ?? normalizeMarketSnapshot({
      symbol,
      priceUsd: DEFAULT_PAXG_USD,
      change24h: 0,
      timestamp: Date.now(),
      source: this.sourceLabel,
    });

    const xauUsd = symbol.toUpperCase() === "XAU" ? snapshot.priceUsd : DEFAULT_XAU_USD;
    const paxgUsd = symbol.toUpperCase() === "PAXG" ? snapshot.priceUsd : DEFAULT_PAXG_USD;
    return calculateGoldBasis({ xauUsd, paxgUsd, timestamp: snapshot.timestamp });
  }

  async fetchSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    return this.getSnapshot(symbol);
  }
}

export class DemoGoldMarketProvider extends GoldMarketProvider {
  constructor() {
    super("DEMO", "demo-provider");
  }

  override getSnapshot(symbol: string): MarketSnapshot | null {
    const normalizedSymbol = (symbol || "PAXG").toUpperCase();
    const priceUsd = normalizedSymbol === "XAU" ? DEFAULT_XAU_USD : DEFAULT_PAXG_USD;
    return normalizeMarketSnapshot({
      symbol: normalizedSymbol,
      priceUsd,
      change24h: 0.4,
      volume24h: normalizedSymbol === "PAXG" ? 4_200_000 : 16_000_000,
      high24h: priceUsd * 1.02,
      low24h: priceUsd * 0.98,
      volatility: 0.7,
      timestamp: Date.now(),
      source: this.sourceLabel,
    });
  }
}

export class LiveGoldMarketProvider extends GoldMarketProvider {
  constructor(private readonly apiUrl?: string, private readonly apiKey?: string) {
    super("LIVE", "live-provider");
  }

  override getSnapshot(symbol: string): MarketSnapshot | null {
    return null;
  }

  override async fetchSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    if (!this.apiUrl) return null;

    try {
      const response = await fetch(`${this.apiUrl.replace(/\/$/, "")}/quotes/${encodeURIComponent(symbol.toUpperCase())}`, {
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const payload = await response.json() as Record<string, unknown>;
      const quote = (payload.quote ?? payload.data ?? payload) as Record<string, unknown>;
      const snapshot = normalizeMarketSnapshot({
        symbol: String(quote.symbol ?? symbol),
        priceUsd: Number(quote.priceUsd ?? quote.price ?? quote.usd),
        change24h: Number(quote.change24h ?? quote.change ?? 0),
        volume24h: quote.volume24h === undefined ? undefined : Number(quote.volume24h),
        high24h: quote.high24h === undefined ? undefined : Number(quote.high24h),
        low24h: quote.low24h === undefined ? undefined : Number(quote.low24h),
        volatility: quote.volatility === undefined ? undefined : Number(quote.volatility),
        timestamp: Number(quote.timestamp ?? Date.now()),
        source: this.apiUrl,
      });
      return snapshot.priceUsd > 0 ? snapshot : null;
    } catch {
      return null;
    }
  }
}

export function resolveGoldMarketProvider(env: Record<string, string | undefined> = process.env): GoldMarketProvider {
  const configured = (env.PAXG_MARKET_PROVIDER ?? env.APP_DATA_MODE ?? "demo").trim().toLowerCase();

  if (configured === "live" || configured === "production" || configured === "chainstack") {
    return new LiveGoldMarketProvider(env.PAXG_MARKET_API_URL, env.PAXG_MARKET_API_KEY);
  }

  if (configured === "demo" || configured === "test") {
    return new DemoGoldMarketProvider();
  }

  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return new LiveGoldMarketProvider(configured, env.PAXG_MARKET_API_KEY);
  }

  return new DemoGoldMarketProvider();
}

export const defaultGoldMarketProvider = resolveGoldMarketProvider();
