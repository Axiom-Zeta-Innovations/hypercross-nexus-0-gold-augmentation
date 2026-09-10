import axios from 'axios';
import type { AxiosInstance } from 'axios';
import whiteLabelConfig from '../../config/whiteLabelConfig.json';

interface DataSourceConfig {
  type: string;
  baseUrl: string;
  timeout?: number;
}

interface MarketPriceMap {
  [symbol: string]: {
    usd: number;
  };
}

class DataSourceManager {
  private httpClients: Map<string, AxiosInstance> = new Map();
  private config = whiteLabelConfig;
  private liveStrictMode: boolean;

  constructor() {
    this.liveStrictMode = this.envFlagEnabled(process.env.LIVE_FEED_STRICT);
    this.initializeDataSources();
  }

  private envFlagEnabled(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  private getEnv(name: string): string | null {
    const v = process.env[name]?.trim();
    return v ? v : null;
  }

  private async fetchLive(url: string, params?: Record<string, any>): Promise<any> {
    const response = await axios.get(url, { params, timeout: 10000 });
    return response.data;
  }

  private unavailableData(source: string): never {
    throw new Error(`LIVE_DATA_UNAVAILABLE: ${source} is not configured or returned no live data.`);
  }

  private toArrayPayload(data: any): any[] | null {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data)) return data.data;
    return null;
  }

  private initializeDataSources() {
    // Initialize HTTP clients for external APIs
    for (const [name, dsConfig] of Object.entries(this.config.datasources)) {
      if ((dsConfig as any).type === 'rest') {
        const client = axios.create({
          baseURL: (dsConfig as any).baseUrl,
          timeout: (dsConfig as any).timeout || 5000,
        });
        this.httpClients.set(name, client);
      }
    }
  }

  private getDemoAssets(channel: string): any[] {
    if (channel === 'fundraising-channel') {
      return [
        { name: 'HXT Seed Round', symbol: 'HXT', type: 'Campaign', supply: '2000000', channel },
        { name: 'NexusBond Series A', symbol: 'NXB', type: 'Campaign', supply: '5000000', channel },
        { name: 'GreenCredit IDO', symbol: 'GCR', type: 'Campaign', supply: '800000', channel },
      ];
    }

    return [
      { name: 'HyperToken', symbol: 'HXT', supply: '10000000', type: 'Fungible', channel },
      { name: 'NexusBond', symbol: 'NXB', supply: '500000', type: 'Fungible', channel },
      { name: 'AssetShare #001', symbol: 'AS1', supply: '1', type: 'Non-Fungible', channel },
    ];
  }

  private getDemoRWAs(): any[] {
    return [
      { name: '125 Wall St, NYC', type: 'Real Estate', valuation: '4200000', tokens: '4200', yield: '6.8', kyc: true },
      { name: 'Gold Bar Lot #4422', type: 'Commodities', valuation: '980000', tokens: '980', yield: '3.1', kyc: true },
      { name: 'US T-Bill 2025-Q3', type: 'Treasury Bills', valuation: '1000000', tokens: '10000', yield: '5.2', kyc: false },
    ];
  }

  private getDemoNFTs(): any[] {
    return [
      { name: 'Nexus Genesis #001', collection: 'Nexus Genesis', owner: '0x1a2b...3c4d' },
      { name: 'HyperNode Alpha', collection: 'HyperNodes', owner: '0x5e6f...7g8h' },
      { name: 'Chain Chaos #042', collection: 'Chain Chaos', owner: '0x9i0j...1k2l' },
      { name: 'Stability Wave #7', collection: 'Stability Waves', owner: '0x3m4n...5o6p' },
    ];
  }

  private getDemoSportsEvents(): any[] {
    return [
      { home: 'Lakers', away: 'Celtics', sport: 'NBA', homeOdds: 1.85, awayOdds: 1.95, drawOdds: null, status: 'Live', time: 'Q3 08:42' },
      { home: 'Man City', away: 'Arsenal', sport: 'EPL', homeOdds: 1.7, awayOdds: 2.1, drawOdds: 3.5, status: 'Live', time: "67'" },
      { home: 'Djokovic', away: 'Alcaraz', sport: 'Tennis', homeOdds: 1.55, awayOdds: 2.4, drawOdds: null, status: 'Starting', time: 'In 15 min' },
    ];
  }

  private getDemoMiningPools(): any[] {
    return [
      { name: 'Nexus Mining Pool Alpha', algo: 'SHA-256', hashrate: '42.8 PH/s', workers: 184, fee: '1.5%', earnings24h: '0.0042 BTC', status: 'Active' },
      { name: 'HyperCross ETH Pool', algo: 'Ethash', hashrate: '820 GH/s', workers: 67, fee: '1.0%', earnings24h: '0.91 ETH', status: 'Active' },
    ];
  }

  private getDemoMarketPrices(symbols: string[]): MarketPriceMap {
    const defaults: MarketPriceMap = {
      bitcoin: { usd: 67240 },
      ethereum: { usd: 3421.8 },
    };

    return symbols.reduce<MarketPriceMap>((result, symbol) => {
      const key = symbol.toLowerCase();
      result[key] = defaults[key] ?? { usd: 0 };
      return result;
    }, {});
  }

  private isDemoDataAllowed(): boolean {
    const appMode = process.env.APP_DATA_MODE || "live";
    if (appMode === "live") return false;
    const allowDemo = process.env.ALLOW_DEMO_DATA;
    return this.envFlagEnabled(allowDemo);
  }

  // ── DIGITAL ASSETS ──
  async getAssets(channel: string = 'default-channel'): Promise<any[]> {
    try {
      if (this.isDemoDataAllowed()) {
        return this.getDemoAssets(channel);
      }
      // Return real assets from database
      const { queries } = await import('../../src/db/index.js');
      const dbAssets = queries.assets.getByOrg.all('local-desktop-org') || [];
      const filtered = dbAssets.filter((asset: any) => asset.channel === channel);
      if (filtered.length > 0) return filtered;
      return this.unavailableData('asset registry');
    } catch (err) {
      console.error('Failed to fetch assets:', err);
      if (this.isDemoDataAllowed()) return this.getDemoAssets(channel);
      return this.unavailableData('asset registry');
    }
  }

  async getAssetBySymbol(symbol: string, channel: string = 'default-channel'): Promise<any> {
    try {
      if (this.isDemoDataAllowed()) {
        return this.getDemoAssets(channel).find((asset) => asset.symbol === symbol) ?? null;
      }
      const { queries } = await import('../../src/db/index.js');
      const dbAssets = queries.assets.getByOrg.all('local-desktop-org') || [];
      const found = dbAssets.find((asset: any) => asset.symbol === symbol && asset.channel === channel) ?? null;
      if (found) return found;
      return null;
    } catch (err) {
      console.error('Failed to fetch asset:', err);
      if (this.isDemoDataAllowed()) return this.getDemoAssets(channel).find((asset) => asset.symbol === symbol) ?? null;
      return null;
    }
  }

  // ── TRADING DATA ──
  async getMarketPrices(symbols: string[]): Promise<MarketPriceMap> {
    try {
      const coingecko = this.httpClients.get('coingecko');
      if (!coingecko) {
        return this.unavailableData('CoinGecko market data');
      }

      const ids = symbols.map(s => s.toLowerCase()).join(',');
      const res = await coingecko.get('/simple/price', {
        params: {
          ids,
          vs_currencies: 'usd',
          include_market_cap: 'true',
          include_24hr_vol: 'true',
        },
      });

      return res.data;
    } catch (err) {
      console.error('Failed to fetch market prices:', err);
      if (this.isDemoDataAllowed()) return this.getDemoMarketPrices(symbols);
      return this.unavailableData('CoinGecko market data');
    }
  }

  async getLiveOrderBook(instrument: string): Promise<any> {
    return this.unavailableData(`order book for ${instrument}`);
  }

  // ── SPORTS DATA ──
  async getLiveSportsEvents(): Promise<any[]> {
    try {
      return this.unavailableData('sports data provider');
    } catch (err) {
      console.error('Failed to fetch sports events:', err);
      if (this.isDemoDataAllowed()) return this.getDemoSportsEvents();
      return this.unavailableData('sports data provider');
    }
  }

  // ── MINING ──
  async getMiningPoolStats(): Promise<any[]> {
    try {
      return this.unavailableData('mining statistics provider');
    } catch (err) {
      console.error('Failed to fetch mining stats:', err);
      if (this.isDemoDataAllowed()) return this.getDemoMiningPools();
      return this.unavailableData('mining statistics provider');
    }
  }

  // ── RWA ──
  async getRWAssets(channel: string = 'rwa-channel'): Promise<any[]> {
    try {
      return this.unavailableData(`RWA data source for ${channel}`);
    } catch (err) {
      console.error('Failed to fetch RWAs:', err);
      if (this.isDemoDataAllowed()) return this.getDemoRWAs();
      return this.unavailableData(`RWA data source for ${channel}`);
    }
  }

  // ── NFT ──
  async getNFTs(channel: string = 'nft-channel'): Promise<any[]> {
    try {
      return this.unavailableData(`NFT data source for ${channel}`);
    } catch (err) {
      console.error('Failed to fetch NFTs:', err);
      if (this.isDemoDataAllowed()) return this.getDemoNFTs();
      return this.unavailableData(`NFT data source for ${channel}`);
    }
  }
}

export const dataSourceManager = new DataSourceManager();
