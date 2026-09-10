/**
 * SwapProvider
 *
 * Interface for real DEX/router/aggregator integrations. Only ONE provider is
 * implemented for this MVP pass (see ZeroExSwapProvider) — per spec, we do not
 * integrate five providers.
 */

export interface SwapQuoteInput {
  chainId: number;
  tokenIn: string; // contract address, or "ETH" for native
  tokenOut: string;
  amountIn: string; // human-readable amount (e.g. "1.25")
  takerAddress: string;
  slippageBps: number; // e.g. 50 = 0.5%
}

export interface SwapQuote {
  provider: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;
  price: string;
  priceImpactBps: number | null;
  estimatedGas: string;
  allowanceTarget: string | null;
  allowanceRequired: boolean;
  to: string;
  data: string;
  value: string;
  quoteExpiresAt: string;
  route: string;
}

export interface AllowanceInput {
  chainId: number;
  tokenAddress: string;
  owner: string;
  spender: string;
  /** Required amount in base units, as a decimal string. Allowance must be >= this, never just > 0. */
  requiredAmount: string;
  /** Default false: approve exactly `requiredAmount`. Only true when the user explicitly opts in. */
  unlimited?: boolean;
}

export interface AllowanceResult {
  allowance: string;
  requiredAmount: string;
  sufficient: boolean;
}

export interface TransactionRequestOutput {
  to: string;
  data: string;
  value: string;
  gasEstimate: string;
}

export interface SwapProvider {
  readonly name: string;
  getQuote(input: SwapQuoteInput): Promise<SwapQuote>;
  getAllowance(input: AllowanceInput): Promise<AllowanceResult>;
  buildApprovalTransaction(input: AllowanceInput): Promise<TransactionRequestOutput>;
}
