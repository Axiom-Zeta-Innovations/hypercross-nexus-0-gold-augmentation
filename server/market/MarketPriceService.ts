/**
 * MarketPriceService
 *
 * Sources USD prices for tokens, completely separate from blockchain state.
 * Architecture: Blockchain -> quantity; MarketPriceService -> price;
 * PortfolioService -> quantity * price.
 *
 * If a price is unavailable, callers must display "Price unavailable" —
 * this service NEVER fabricates a price.
 */

import axios from "axios";

export interface PriceResult {
  coingeckoId: string;
  usd: number | null;
  available: boolean;
  fetchedAt: string;
}

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const CACHE_TTL_MS = 60_000; // 1 minute — avoid hammering the public API

const priceCache = new Map<string, { result: PriceResult; expiresAt: number }>();

/**
 * Fetch USD prices for a set of CoinGecko IDs. Never throws — returns
 * `available: false` entries for anything that could not be priced.
 */
async function getPricesUsd(coingeckoIds: string[]): Promise<Record<string, PriceResult>> {
  const uniqueIds = Array.from(new Set(coingeckoIds.filter(Boolean)));
  const result: Record<string, PriceResult> = {};
  const now = Date.now();

  const idsToFetch: string[] = [];
  for (const id of uniqueIds) {
    const cached = priceCache.get(id);
    if (cached && cached.expiresAt > now) {
      result[id] = cached.result;
    } else {
      idsToFetch.push(id);
    }
  }

  if (idsToFetch.length === 0) {
    return result;
  }

  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/simple/price`, {
      params: { ids: idsToFetch.join(","), vs_currencies: "usd" },
      timeout: 8000,
    });

    for (const id of idsToFetch) {
      const usd = response.data?.[id]?.usd;
      const entry: PriceResult = {
        coingeckoId: id,
        usd: typeof usd === "number" ? usd : null,
        available: typeof usd === "number",
        fetchedAt: new Date().toISOString(),
      };
      result[id] = entry;
      priceCache.set(id, { result: entry, expiresAt: now + CACHE_TTL_MS });
    }
  } catch (error) {
    // Price source unavailable — mark every requested id as unavailable, never fabricate a value.
    for (const id of idsToFetch) {
      const entry: PriceResult = {
        coingeckoId: id,
        usd: null,
        available: false,
        fetchedAt: new Date().toISOString(),
      };
      result[id] = entry;
    }
  }

  return result;
}

async function getPriceUsd(coingeckoId: string | undefined): Promise<PriceResult> {
  if (!coingeckoId) {
    return { coingeckoId: "", usd: null, available: false, fetchedAt: new Date().toISOString() };
  }
  const prices = await getPricesUsd([coingeckoId]);
  return prices[coingeckoId] ?? { coingeckoId, usd: null, available: false, fetchedAt: new Date().toISOString() };
}

export const MarketPriceService = {
  getPriceUsd,
  getPricesUsd,
};

export default MarketPriceService;
