export type HypercrossErrorCode =
  | "CHAINSTACK_CONFIGURATION_ERROR"
  | "CHAINSTACK_UNAVAILABLE"
  | "CHAIN_MISMATCH"
  | "WALLET_NOT_CONNECTED"
  | "WALLET_NOT_VERIFIED"
  | "WALLET_REJECTED"
  | "MAINNET_EXECUTION_DISABLED"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_TOKEN_BALANCE"
  | "ALLOWANCE_REQUIRED"
  | "QUOTE_EXPIRED"
  | "SWAP_UNAVAILABLE"
  | "TRANSACTION_REVERTED"
  | "INVALID_ADDRESS"
  | "INVALID_AMOUNT"
  | "TOKEN_NOT_REGISTERED";

/** Base class for all typed Hypercross errors; `code` is stable and safe to send to the frontend. */
export class HypercrossError extends Error {
  readonly code: HypercrossErrorCode;
  constructor(code: HypercrossErrorCode, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export class BlockchainConnectionError extends HypercrossError {
  constructor(message: string) {
    super("CHAINSTACK_UNAVAILABLE", message);
  }
}

export class BlockchainConfigurationError extends HypercrossError {
  constructor(message: string) {
    super("CHAINSTACK_CONFIGURATION_ERROR", message);
  }
}

export class BlockchainRpcError extends HypercrossError {
  constructor(message: string) {
    super("CHAINSTACK_UNAVAILABLE", message);
  }
}

export class BlockchainSigningError extends HypercrossError {
  constructor(message: string) {
    super("WALLET_NOT_CONNECTED", message);
  }
}

export class BlockchainTransactionError extends HypercrossError {
  constructor(message: string) {
    super("TRANSACTION_REVERTED", message);
  }
}

export class ChainMismatchError extends HypercrossError {
  constructor(message: string) {
    super("CHAIN_MISMATCH", message);
  }
}

export class MainnetExecutionDisabledError extends HypercrossError {
  constructor(message = "Mainnet transaction execution is disabled.") {
    super("MAINNET_EXECUTION_DISABLED", message);
  }
}

export class InsufficientFundsError extends HypercrossError {
  constructor(message: string) {
    super("INSUFFICIENT_FUNDS", message);
  }
}

export class InsufficientTokenBalanceError extends HypercrossError {
  constructor(message: string) {
    super("INSUFFICIENT_TOKEN_BALANCE", message);
  }
}

export class AllowanceRequiredError extends HypercrossError {
  constructor(message: string) {
    super("ALLOWANCE_REQUIRED", message);
  }
}

export class QuoteExpiredError extends HypercrossError {
  constructor(message = "Swap quote has expired. Request a new quote.") {
    super("QUOTE_EXPIRED", message);
  }
}

export class SwapUnavailableError extends HypercrossError {
  constructor(message: string) {
    super("SWAP_UNAVAILABLE", message);
  }
}

export class InvalidAddressError extends HypercrossError {
  constructor(message: string) {
    super("INVALID_ADDRESS", message);
  }
}

export class InvalidAmountError extends HypercrossError {
  constructor(message: string) {
    super("INVALID_AMOUNT", message);
  }
}

export class TokenNotRegisteredError extends HypercrossError {
  constructor(message: string) {
    super("TOKEN_NOT_REGISTERED", message);
  }
}

/** Maps any error to a safe { code, message } payload for API responses. Never leaks internals. */
export function toErrorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof HypercrossError) {
    return { code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return { code: "UNKNOWN_ERROR", message };
}

