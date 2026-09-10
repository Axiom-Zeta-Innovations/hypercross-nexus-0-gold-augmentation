/**
 * ZeroExSwapProvider
 *
 * Real integration with the 0x Swap API (v2, "allowance-holder" quote endpoint),
 * documented at https://0x.org/docs/api. Requires ZEROX_API_KEY to be configured;
 * without it, 0x rejects the request — this provider never fabricates a quote.
 *
 * The `to`/`data`/`value` returned by 0x are relayed directly to the user's wallet
 * for signing; Hypercross never holds funds or signs on the user's behalf.
 */

import axios from "axios";
import { blockchainService } from "../blockchain/BlockchainService";
import { encodeErc20Approve } from "../blockchain/TxBuilder";
import { SwapUnavailableError } from "../blockchain/errors";
import { isAllowanceSufficient, resolveApprovalAmount } from "./AllowanceCheck";
import type {
  SwapProvider,
  SwapQuoteInput,
  SwapQuote,
  AllowanceInput,
  AllowanceResult,
  TransactionRequestOutput,
} from "./SwapProvider";
import { ERC20_ABI } from "../blockchain/ERC20_ABI";

const ZEROEX_BASE_URL = "https://api.0x.org";
const QUOTE_TTL_MS = 30_000; // 0x quotes are valid for a short window; treat as 30s locally

function apiKey(): string | undefined {
  return process.env.ZEROX_API_KEY?.trim() || undefined;
}

async function getQuote(input: SwapQuoteInput): Promise<SwapQuote> {
  const key = apiKey();
  if (!key) {
    throw new SwapUnavailableError(
      "ZEROX_API_KEY is not configured. Real swap quotes require a 0x API key (see .env.example)."
    );
  }

  try {
    const response = await axios.get(`${ZEROEX_BASE_URL}/swap/allowance-holder/quote`, {
      params: {
        chainId: input.chainId,
        sellToken: input.tokenIn,
        buyToken: input.tokenOut,
        sellAmount: input.amountIn,
        taker: input.takerAddress,
        slippageBps: input.slippageBps,
      },
      headers: {
        "0x-api-key": key,
        "0x-version": "v2",
      },
      timeout: 10_000,
    });

    const data = response.data;
    return {
      provider: "0x",
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      estimatedAmountOut: String(data.buyAmount ?? "0"),
      minimumAmountOut: String(data.minBuyAmount ?? data.buyAmount ?? "0"),
      price: String(data.price ?? "0"),
      priceImpactBps: data.estimatedPriceImpact != null ? Math.round(Number(data.estimatedPriceImpact) * 100) : null,
      estimatedGas: String(data.gas ?? data.estimatedGas ?? "0"),
      allowanceTarget: data.allowanceTarget ?? data.issues?.allowance?.spender ?? null,
      allowanceRequired: Boolean(data.issues?.allowance),
      to: data.to,
      data: data.data,
      value: String(data.value ?? "0"),
      quoteExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
      route: "0x-allowance-holder",
    };
  } catch (error: any) {
    const message = error?.response?.data?.reason || error?.message || "Unable to fetch swap quote from 0x.";
    throw new SwapUnavailableError(message);
  }
}

async function getAllowance(input: AllowanceInput): Promise<AllowanceResult> {
  const allowance: bigint = await blockchainService.readContract(
    input.tokenAddress,
    ERC20_ABI,
    "allowance",
    [input.owner, input.spender]
  );
  const required = BigInt(input.requiredAmount);
  return {
    allowance: allowance.toString(),
    requiredAmount: required.toString(),
    // Never treat allowance > 0 as sufficient — must cover the actual amount required.
    sufficient: isAllowanceSufficient(allowance, required),
  };
}

async function buildApprovalTransaction(input: AllowanceInput): Promise<TransactionRequestOutput> {
  // Default: approve exactly the required amount. Unlimited approval requires the
  // caller to have explicitly opted in (never the silent default).
  const amount = resolveApprovalAmount(BigInt(input.requiredAmount), input.unlimited === true);
  const data = encodeErc20Approve(input.spender, amount);
  const gasEstimate = await blockchainService.estimateGas({ to: input.tokenAddress, data, from: input.owner });
  return { to: input.tokenAddress, data, value: "0", gasEstimate };
}

export const ZeroExSwapProvider: SwapProvider = {
  name: "0x",
  getQuote,
  getAllowance,
  buildApprovalTransaction,
};

export default ZeroExSwapProvider;
