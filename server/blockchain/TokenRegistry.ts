/**
 * Phase 7: Token Registry
 *
 * Centralized registry of ERC-20 tokens and their metadata.
 * Enables portfolio service to fetch balances and resolve token information.
 *
 * Includes:
 * - Native tokens (ETH)
 * - Popular ERC-20 tokens on Ethereum mainnet and testnets
 * - Test tokens for local development
 *
 * Token metadata: { symbol, name, decimals, contractAddress, chainId, network }
 */

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  coingeckoId?: string; // For price data integration
}

export interface TokenConfig extends TokenMetadata {
  address: string; // Contract address
  chainId: number; // EVM Chain ID
  network: string; // Network name (e.g., "ethereum-sepolia")
}

/**
 * Native ETH token (not an ERC-20, but included for consistency)
 */
export const NATIVE_ETH: TokenMetadata = {
  symbol: "ETH",
  name: "Ethereum",
  decimals: 18,
  logoUrl: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
  coingeckoId: "ethereum",
};

/**
 * Popular ERC-20 tokens on Ethereum Mainnet (chainId: 1)
 */
export const ETHEREUM_MAINNET_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: 1,
    network: "ethereum",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    chainId: 1,
    network: "ethereum",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    coingeckoId: "tether",
  },
  DAI: {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    chainId: 1,
    network: "ethereum",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    coingeckoId: "dai",
  },
  WETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    chainId: 1,
    network: "ethereum",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
};

/**
 * Popular ERC-20 tokens on Ethereum Sepolia Testnet (chainId: 11155111)
 * These are common test tokens used in testnet ecosystems
 */
export const ETHEREUM_SEPOLIA_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    chainId: 11155111,
    network: "ethereum-sepolia",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  DAI: {
    address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
    chainId: 11155111,
    network: "ethereum-sepolia",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    coingeckoId: "dai",
  },
  WETH: {
    address: "0xffF9976782d46cc05630D07aE6142967F7d73AcC",
    chainId: 11155111,
    network: "ethereum-sepolia",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
};

/**
 * Popular ERC-20 tokens on Base Mainnet (chainId: 8453)
 */
export const BASE_MAINNET_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    network: "base",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    chainId: 8453,
    network: "base",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
};

/**
 * Popular ERC-20 tokens on Base Sepolia Testnet (chainId: 84532)
 */
export const BASE_SEPOLIA_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    chainId: 84532,
    network: "base-sepolia",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    chainId: 84532,
    network: "base-sepolia",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
};

/**
 * Popular ERC-20 tokens on Arbitrum One Mainnet (chainId: 42161)
 */
export const ARBITRUM_MAINNET_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    chainId: 42161,
    network: "arbitrum",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  // DAI intentionally omitted: the previously configured address failed EIP-55
  // checksum/length validation (server/blockchain/TokenRegistry.validateTokenRegistry).
  // Re-add only with a verified canonical Arbitrum One DAI contract address.
  WETH: {
    address: "0x82AF49447efb812a79c5005699Fa193953A36b9d",
    chainId: 42161,
    network: "arbitrum",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
};

/**
 * Popular ERC-20 tokens on Arbitrum Sepolia Testnet (chainId: 421614)
 */
export const ARBITRUM_SEPOLIA_TOKENS: Record<string, TokenConfig> = {
  USDC: {
    address: "0x75faF014f0026145105547AC005C1d0afF1060FE",
    chainId: 421614,
    network: "arbitrum-sepolia",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  WETH: {
    address: "0xEd1D1B31e7c1Dc67Ee57d45e3e3bEFf8342D16E7",
    chainId: 421614,
    network: "arbitrum-sepolia",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
};

/**
 * Complete token registry by chain ID
 */
export const TOKEN_REGISTRY: Record<number, Record<string, TokenConfig>> = {
  1: ETHEREUM_MAINNET_TOKENS, // Ethereum Mainnet
  11155111: ETHEREUM_SEPOLIA_TOKENS, // Ethereum Sepolia
  8453: BASE_MAINNET_TOKENS, // Base Mainnet
  84532: BASE_SEPOLIA_TOKENS, // Base Sepolia
  42161: ARBITRUM_MAINNET_TOKENS, // Arbitrum One
  421614: ARBITRUM_SEPOLIA_TOKENS, // Arbitrum Sepolia
};

/**
 * Retrieve token configuration by symbol and chainId
 * @param symbol Token symbol (e.g., "USDC")
 * @param chainId EVM chain ID
 * @returns Token configuration or undefined if not found
 */
export function getTokenConfig(symbol: string, chainId: number): TokenConfig | undefined {
  return TOKEN_REGISTRY[chainId]?.[symbol];
}

/**
 * Get all tokens for a specific chain
 * @param chainId EVM chain ID
 * @returns Record of all tokens on this chain
 */
export function getTokensByChain(chainId: number): Record<string, TokenConfig> {
  return TOKEN_REGISTRY[chainId] || {};
}

/**
 * Get token by contract address (searches all chains)
 * @param address Token contract address
 * @returns Token configuration or undefined
 */
export function getTokenByAddress(address: string): TokenConfig | undefined {
  const normalizedAddress = address.toLowerCase();
  for (const chainTokens of Object.values(TOKEN_REGISTRY)) {
    for (const token of Object.values(chainTokens)) {
      if (token.address.toLowerCase() === normalizedAddress) {
        return token;
      }
    }
  }
  return undefined;
}

/**
 * Get all supported tokens across all chains
 */
export function getAllTokens(): TokenConfig[] {
  const allTokens: TokenConfig[] = [];
  for (const chainTokens of Object.values(TOKEN_REGISTRY)) {
    allTokens.push(...Object.values(chainTokens));
  }
  return allTokens;
}

/**
 * Validates every configured token address at startup (checksum + shape).
 * Throws with a clear list of offending entries so misconfiguration fails fast.
 */
export function validateTokenRegistry(isAddress: (value: string) => boolean): void {
  const problems: string[] = [];
  for (const [chainId, tokens] of Object.entries(TOKEN_REGISTRY)) {
    for (const [symbol, token] of Object.entries(tokens)) {
      if (!isAddress(token.address)) {
        problems.push(`chainId ${chainId} token ${symbol}: invalid address "${token.address}"`);
      }
      if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36) {
        problems.push(`chainId ${chainId} token ${symbol}: invalid decimals "${token.decimals}"`);
      }
      if (Number(chainId) !== token.chainId) {
        problems.push(`chainId ${chainId} token ${symbol}: chainId mismatch (entry says ${token.chainId})`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Token registry validation failed:\n${problems.map((p) => `  • ${p}`).join("\n")}`);
  }
}

export default {
  NATIVE_ETH,
  TOKEN_REGISTRY,
  getTokenConfig,
  getTokensByChain,
  getTokenByAddress,
  getAllTokens,
  validateTokenRegistry,
};
