/**
 * TransactionIntegrity
 *
 * Verifies that a submitted transaction hash actually corresponds to the
 * transaction the server prepared (the "intent") before allowing a transaction
 * to be marked CONFIRMED. A successful receipt alone is NOT sufficient — an
 * attacker could submit any unrelated successful hash. This module compares the
 * on-chain transaction body (from eth_getTransactionByHash) against the
 * server-recorded intent snapshot captured at prepare-time.
 */

export interface TransactionIntent {
  chainId: number;
  fromAddress: string;
  /** Expected `to` address. Null/undefined means "not checked" (should not normally happen). */
  intentTo?: string | null;
  /** Expected calldata. Null/empty means a plain value transfer (native transfer). */
  intentData?: string | null;
  /** Expected value in wei, as a decimal string. */
  intentValue?: string | null;
}

export interface OnChainTransaction {
  chainId?: number | string | bigint | null;
  from?: string | null;
  to?: string | null;
  data?: string | null;
  value?: string | bigint | null;
}

export interface IntegrityCheckResult {
  ok: boolean;
  reason?: string;
}

function normalizeAddress(address: string | null | undefined): string {
  return (address ?? "").toLowerCase();
}

function normalizeData(data: string | null | undefined): string {
  const value = (data ?? "0x").toLowerCase();
  return value === "" ? "0x" : value;
}

function normalizeValue(value: string | bigint | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  return BigInt(value);
}

/**
 * Compares an on-chain transaction (as returned by eth_getTransactionByHash) against
 * the intent snapshot recorded when the server prepared the unsigned transaction.
 * Returns { ok: false, reason } on ANY mismatch — the caller must never mark such a
 * transaction CONFIRMED.
 */
export function verifyTransactionIntent(
  onChain: OnChainTransaction | null | undefined,
  intent: TransactionIntent
): IntegrityCheckResult {
  if (!onChain) {
    return { ok: false, reason: "Transaction not found on-chain (missing transaction)." };
  }

  if (onChain.chainId !== null && onChain.chainId !== undefined) {
    const onChainChainId = Number(onChain.chainId);
    if (Number.isFinite(onChainChainId) && onChainChainId !== intent.chainId) {
      return {
        ok: false,
        reason: `Chain ID mismatch: expected ${intent.chainId}, got ${onChainChainId}.`,
      };
    }
  }

  if (normalizeAddress(onChain.from) !== normalizeAddress(intent.fromAddress)) {
    return {
      ok: false,
      reason: `Sender mismatch: expected ${intent.fromAddress}, got ${onChain.from ?? "unknown"}.`,
    };
  }

  if (intent.intentTo) {
    if (normalizeAddress(onChain.to) !== normalizeAddress(intent.intentTo)) {
      return {
        ok: false,
        reason: `Recipient mismatch: expected ${intent.intentTo}, got ${onChain.to ?? "unknown"}.`,
      };
    }
  }

  if (intent.intentData !== undefined) {
    if (normalizeData(onChain.data) !== normalizeData(intent.intentData)) {
      return { ok: false, reason: "Calldata mismatch: submitted transaction data does not match prepared intent." };
    }
  }

  if (intent.intentValue !== undefined && intent.intentValue !== null) {
    let onChainValue: bigint;
    try {
      onChainValue = normalizeValue(onChain.value);
    } catch {
      return { ok: false, reason: "Unable to parse on-chain transaction value." };
    }
    let expectedValue: bigint;
    try {
      expectedValue = normalizeValue(intent.intentValue);
    } catch {
      return { ok: false, reason: "Unable to parse expected transaction value." };
    }
    if (onChainValue !== expectedValue) {
      return {
        ok: false,
        reason: `Amount mismatch: expected ${expectedValue.toString()} wei, got ${onChainValue.toString()} wei.`,
      };
    }
  }

  return { ok: true };
}
