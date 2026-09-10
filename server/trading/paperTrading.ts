/**
 * Paper / simulated trading labels.
 *
 * Local ledger fills are never on-chain. Every paper-trading response must
 * carry these labels so clients cannot present a FILLED status as a live fill.
 */

export const PAPER_TRADING_MODE = "PAPER_TRADING" as const;
export const PAPER_TRADING_WARNING =
  "This is simulated trading. No real blockchain execution.";
export const PAPER_TRADE_NOTE = "Paper trading only - not settled on-chain";
export const PAPER_TRADES_EXECUTE_PATH = "/api/paper/trades/execute";

export function paperTradingMeta() {
  return {
    mode: PAPER_TRADING_MODE,
    realExecution: false as const,
    warning: PAPER_TRADING_WARNING,
  };
}

export function paperFilledTradeNote() {
  return {
    note: PAPER_TRADE_NOTE,
  };
}

export function liveExecuteTradeNotImplementedBody() {
  return {
    ok: false as const,
    error: "Trade execution not yet implemented",
    status: "NOT_IMPLEMENTED" as const,
    note: "This live endpoint does not submit or fill trades on-chain. Use paper trading instead.",
    paperTrading: PAPER_TRADES_EXECUTE_PATH,
  };
}

export function kaleidoNotImplementedBody() {
  return {
    ok: false as const,
    error: "Kaleido Hyperledger Fabric is not part of the MVP",
    status: "NOT_IMPLEMENTED" as const,
    note: "This integration has been superseded by Chainstack. Legacy portal UI is gated behind VITE_ENABLE_LEGACY_KALEIDO_PORTAL (default false) and these API routes are not implemented.",
  };
}
