/**
 * OnChainTradingService
 *
 * For MVP, "real trading" is implemented as swaps:
 *   BUY ETH using USDC  = swap USDC -> ETH
 *   SELL ETH for USDC   = swap ETH -> USDC
 *
 * This wraps SwapService with trading-style semantics. No leveraged trading,
 * margin, futures, options, or autonomous execution is implemented.
 */

import { getTokenConfig } from "../blockchain/TokenRegistry";
import { blockchainService } from "../blockchain/BlockchainService";
import { SwapService } from "../swap/SwapService";
import { TokenNotRegisteredError } from "../blockchain/errors";

const NATIVE_ETH_PSEUDO_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

async function resolveTokenAddress(symbol: string, chainId: number): Promise<string> {
  if (symbol.toUpperCase() === "ETH") return NATIVE_ETH_PSEUDO_ADDRESS;
  const token = getTokenConfig(symbol.toUpperCase(), chainId);
  if (!token) throw new TokenNotRegisteredError(`Token ${symbol} is not registered on chain ${chainId}.`);
  return token.address;
}

async function quoteTrade(params: {
  side: "BUY" | "SELL";
  base: string; // e.g. "ETH"
  quote: string; // e.g. "USDC"
  amount: string; // amount of the token being sold
  takerAddress: string;
  slippageBps: number;
}) {
  const status = await blockchainService.getStatus();
  const chainId = status.chainId ?? 0;

  // BUY base using quote => sell quote, buy base. SELL base for quote => sell base, buy quote.
  const sellSymbol = params.side === "BUY" ? params.quote : params.base;
  const buySymbol = params.side === "BUY" ? params.base : params.quote;

  const tokenIn = await resolveTokenAddress(sellSymbol, chainId);
  const tokenOut = await resolveTokenAddress(buySymbol, chainId);

  return SwapService.requestQuote({
    tokenIn,
    tokenOut,
    amountIn: params.amount,
    takerAddress: params.takerAddress,
    slippageBps: params.slippageBps,
  });
}

export const OnChainTradingService = {
  quoteTrade,
};

export default OnChainTradingService;
