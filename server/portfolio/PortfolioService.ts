/**
 * Phase 7: Portfolio Service
 *
 * Comprehensive service for managing user cryptocurrency holdings.
 * Supports:
 * - Native ETH balance fetching
 * - ERC-20 token balance queries via contract interaction
 * - Portfolio aggregation across multiple chains
 * - Balance persistence to database
 * - Multi-chain support (Ethereum, Base, Arbitrum)
 *
 * Key responsibilities:
 * 1. Query blockchain for current balances
 * 2. Decode results using token decimals
 * 3. Persist to database for quick access
 * 4. Aggregate portfolio across chains
 */

import { ethers } from "ethers";
import { blockchainService } from "../blockchain/BlockchainService";
import { getTokenConfig, getTokensByChain, TokenConfig } from "../blockchain/TokenRegistry";
import { ERC20_ABI } from "../blockchain/ERC20_ABI";
import { MarketPriceService } from "../market/MarketPriceService";
import { queries } from "../../src/db";
import crypto from "crypto";

export interface Balance {
  symbol: string;
  address?: string; // Contract address (undefined for native ETH)
  chainId: number;
  balance: string; // Raw balance as string (wei/smallest unit)
  balanceDecimal: number; // Formatted balance (e.g., 1.5 ETH)
  decimals: number;
  fetchedAt: string;
  error?: string;
}

export interface PortfolioEntry {
  walletAddress: string;
  chainId: number;
  tokenSymbol: string;
  tokenAddress?: string;
  balance: string;
  balanceDecimal: number;
  network: string;
  updatedAt: string;
  priceUsd: number | null;
  priceAvailable: boolean;
  valueUsd: number | null;
}

export interface Portfolio {
  walletAddress: string;
  holdings: PortfolioEntry[];
  totalValueUSD: number | null; // null when any priced asset is unavailable
  updatedAt: string;
}

/**
 * Fetch native ETH balance for a wallet
 */
async function fetchNativeBalance(walletAddress: string): Promise<Balance> {
  try {
    const status = await blockchainService.getStatus();
    const networkInfo = blockchainService.getNetworkInfo();

    if (!status.connected || !status.live) {
      throw new Error("Blockchain service not ready");
    }

    const balance = await blockchainService.getBalance(walletAddress);
    const balanceDecimal = parseFloat(ethers.formatEther(balance));

    return {
      symbol: "ETH",
      chainId: status.chainId || 1,
      balance: balance.toString(),
      balanceDecimal,
      decimals: 18,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch native balance: ${error?.message}`);
  }
}

/**
 * Fetch ERC-20 token balance for a wallet
 * @param walletAddress User's wallet address
 * @param token Token configuration (address, decimals, symbol)
 * @returns Balance object with raw and formatted amounts
 */
async function fetchTokenBalance(
  walletAddress: string,
  token: TokenConfig
): Promise<Balance> {
  try {
    const status = await blockchainService.getStatus();

    if (!status.connected || !status.live) {
      throw new Error("Blockchain service not ready");
    }

    // Routed through BlockchainService → ChainstackProvider (never a
    // separate ethers provider instance) so all RPC traffic is Chainstack-only.
    let balance: bigint;
    try {
      balance = await blockchainService.readContract(token.address, ERC20_ABI, "balanceOf", [walletAddress]);
    } catch {
      // Token might not exist at this address or user has zero balance
      balance = BigInt(0);
    }

    const balanceDecimal = parseFloat(
      ethers.formatUnits(balance.toString(), token.decimals)
    );

    return {
      symbol: token.symbol,
      address: token.address,
      chainId: token.chainId,
      balance: balance.toString(),
      balanceDecimal,
      decimals: token.decimals,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch ${token.symbol} balance: ${error?.message}`);
  }
}

/**
 * Fetch all token balances for a wallet on a specific chain
 * @param walletAddress User's wallet address
 * @param chainId EVM chain ID
 * @returns Array of Balance objects (including native ETH)
 */
export async function fetchPortfolioByChain(
  walletAddress: string,
  chainId: number
): Promise<Balance[]> {
  const balances: Balance[] = [];
  const errors: string[] = [];

  try {
    // Fetch native ETH balance if on the configured chain
    const status = await blockchainService.getStatus();
    if (status.chainId === chainId) {
      try {
        const ethBalance = await fetchNativeBalance(walletAddress);
        balances.push(ethBalance);
      } catch (error: any) {
        errors.push(`ETH: ${error?.message}`);
      }
    }

    // Fetch ERC-20 token balances
    const tokens = getTokensByChain(chainId);
    for (const token of Object.values(tokens)) {
      try {
        const balance = await fetchTokenBalance(walletAddress, token);
        balances.push(balance);
      } catch (error: any) {
        errors.push(`${token.symbol}: ${error?.message}`);
      }
    }

    if (errors.length > 0) {
      console.warn(
        `Portfolio fetch errors for ${walletAddress} on chain ${chainId}:`,
        errors
      );
    }

    return balances;
  } catch (error: any) {
    throw new Error(
      `Failed to fetch portfolio for chain ${chainId}: ${error?.message}`
    );
  }
}

/**
 * Persist balance data to database
 * @param walletAddress User's wallet address
 * @param balances Array of Balance objects to persist
 * @param network Network name (e.g., "ethereum-sepolia")
 */
export function persistBalances(
  walletAddress: string,
  balances: Balance[],
  network: string
): void {
  for (const balance of balances) {
    const id = crypto.randomUUID();
    try {
      queries.userHoldings.upsert.run(
        id,
        walletAddress.toLowerCase(),
        balance.chainId,
        balance.address ? balance.address : null, // null for native ETH
        String(balance.symbol),
        balance.balance,
        balance.balanceDecimal,
      );
    } catch (error: any) {
      console.error(
        `Failed to persist ${balance.symbol} balance:`,
        error?.message
      );
      // Try to record the error
      try {
        queries.userHoldings.setError.run(
          error?.message || "Unknown error",
          walletAddress.toLowerCase(),
          balance.chainId,
          balance.symbol
        );
      } catch {
        // Silently fail on error recording
      }
    }
  }
}

/**
 * Retrieve portfolio from database
 * @param walletAddress User's wallet address
 * @returns Portfolio object with all holdings
 */
export function getPortfolioFromDatabase(walletAddress: string): Promise<Portfolio> {
  const holdings = queries.userHoldings.getByWallet.all(
    walletAddress.toLowerCase()
  ) as any[];

  const visible = holdings.filter((h) => !h.error);

  return Promise.all(
    visible.map(async (h) => {
      const tokenConfig = getTokenConfig(h.tokenSymbol, h.chainId);
      const coingeckoId = h.tokenSymbol === "ETH" ? "ethereum" : tokenConfig?.coingeckoId;
      const price = await MarketPriceService.getPriceUsd(coingeckoId);
      const valueUsd = price.available && price.usd !== null ? price.usd * h.balanceDecimal : null;

      const entry: PortfolioEntry = {
        walletAddress: h.walletAddress,
        chainId: h.chainId,
        tokenSymbol: h.tokenSymbol,
        tokenAddress: h.tokenAddress,
        balance: h.balance,
        balanceDecimal: h.balanceDecimal,
        network: tokenConfig?.network || "unknown",
        updatedAt: h.updatedAt,
        priceUsd: price.usd,
        priceAvailable: price.available,
        valueUsd,
      };
      return entry;
    })
  ).then((entries) => {
    const anyUnavailable = entries.some((e) => !e.priceAvailable);
    const totalValueUSD = anyUnavailable
      ? null
      : entries.reduce((sum, e) => sum + (e.valueUsd ?? 0), 0);

    return {
      walletAddress,
      holdings: entries,
      totalValueUSD,
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Refresh portfolio for a wallet on a specific chain
 * Fetches fresh balances from blockchain and persists to database
 * @param walletAddress User's wallet address
 * @param chainId EVM chain ID
 * @param network Network name
 * @returns Updated portfolio data
 */
export async function refreshPortfolio(
  walletAddress: string,
  chainId: number,
  networkId: string
): Promise<Portfolio> {
  try {
    // Fetch fresh balances from blockchain
    const balances = await fetchPortfolioByChain(walletAddress, chainId);

    // Persist to database
    persistBalances(walletAddress, balances, networkId);

    // Return updated portfolio
    return getPortfolioFromDatabase(walletAddress);
  } catch (error: any) {
    console.error(
      `Portfolio refresh failed for ${walletAddress} on chain ${chainId}:`,
      error
    );
    // Return stale data if available
    return getPortfolioFromDatabase(walletAddress);
  }
}

/**
 * Get portfolio with optional refresh
 * @param walletAddress User's wallet address
 * @param chainId Chain ID to refresh (optional)
 * @param forceRefresh Force blockchain query (default: false, use cached data)
 * @returns Portfolio object
 */
export async function getPortfolio(
  walletAddress: string,
  chainId?: number,
  forceRefresh: boolean = false
): Promise<Portfolio> {
  try {
    // Validate address
    ethers.getAddress(walletAddress);
  } catch {
    throw new Error("Invalid wallet address");
  }

  // If force refresh requested and chainId provided, refresh from blockchain
  if (forceRefresh && chainId) {
    const networkInfo = blockchainService.getNetworkInfo();
    const networkId = networkInfo?.networkConfig?.id || "unknown";
    return refreshPortfolio(walletAddress, chainId, networkId);
  }

  // Return cached portfolio from database
  return getPortfolioFromDatabase(walletAddress);
}

/**
 * Get balance for specific token
 * @param walletAddress User's wallet address
 * @param chainId EVM chain ID
 * @param symbol Token symbol (e.g., "USDC")
 * @returns PortfolioEntry or undefined
 */
export async function getTokenBalance(
  walletAddress: string,
  chainId: number,
  symbol: string
): Promise<PortfolioEntry | undefined> {
  const holding = queries.userHoldings.getByWalletAndToken.get(
    walletAddress.toLowerCase(),
    chainId,
    symbol
  ) as any;

  if (!holding || holding.error) {
    return undefined;
  }

  const tokenConfig = getTokenConfig(holding.tokenSymbol, holding.chainId);
  const coingeckoId = holding.tokenSymbol === "ETH" ? "ethereum" : tokenConfig?.coingeckoId;
  const price = await MarketPriceService.getPriceUsd(coingeckoId);

  return {
    walletAddress: holding.walletAddress,
    chainId: holding.chainId,
    tokenSymbol: holding.tokenSymbol,
    tokenAddress: holding.tokenAddress,
    balance: holding.balance,
    balanceDecimal: holding.balanceDecimal,
    network: tokenConfig?.network || "unknown",
    updatedAt: holding.updatedAt,
    priceUsd: price.usd,
    priceAvailable: price.available,
    valueUsd: price.available && price.usd !== null ? price.usd * holding.balanceDecimal : null,
  };
}

/**
 * Clean up old balance data (older than 7 days)
 * Useful as a periodic maintenance task
 */
export function cleanupOldBalances(): number {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = queries.userHoldings.deleteOlderThan.run(sevenDaysAgo) as any;
  return result?.changes || 0;
}

export const PortfolioService = {
  fetchNativeBalance,
  fetchTokenBalance,
  fetchPortfolioByChain,
  persistBalances,
  getPortfolioFromDatabase,
  refreshPortfolio,
  getPortfolio,
  getTokenBalance,
  cleanupOldBalances,
};

export default PortfolioService;
