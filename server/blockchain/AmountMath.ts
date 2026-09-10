/**
 * AmountMath
 *
 * Exact (non-floating-point) conversions between human-readable asset amounts and
 * on-chain base units. All authoritative financial arithmetic must go through these
 * helpers (or ethers' parseUnits/formatUnits directly) — never Number()/parseFloat()/
 * Math.round()/1e18 style math, which silently loses precision for real amounts.
 */

import { parseEther, parseUnits, formatUnits } from "ethers";
import { InvalidAmountError } from "./errors";

const DECIMAL_STRING_RE = /^-?\d+(\.\d+)?$/;

/** Rejects non-numeric strings, scientific notation, negative values, zero, and NaN/Infinity. */
export function assertPositiveDecimalAmount(amount: string): void {
  if (typeof amount !== "string" || amount.trim() === "") {
    throw new InvalidAmountError("Amount is required.");
  }
  const trimmed = amount.trim();
  if (!DECIMAL_STRING_RE.test(trimmed)) {
    throw new InvalidAmountError(`Amount must be a plain decimal string (no scientific notation). Got: "${amount}".`);
  }
  if (trimmed.startsWith("-")) {
    throw new InvalidAmountError(`Amount must be positive. Got: "${amount}".`);
  }
  if (/^0(\.0+)?$/.test(trimmed)) {
    throw new InvalidAmountError("Amount must be greater than zero.");
  }
}

/** Converts a human-readable ETH/native amount (e.g. "0.000000000000000001") to exact wei. */
export function nativeAmountToWei(amountEth: string): bigint {
  assertPositiveDecimalAmount(amountEth);
  try {
    return parseEther(amountEth.trim());
  } catch (error: any) {
    throw new InvalidAmountError(`Amount "${amountEth}" has too much precision or an invalid format for 18 decimals.`);
  }
}

/** Converts a human-readable ERC-20 amount to exact base units for the token's decimals. */
export function tokenAmountToBaseUnits(amountHuman: string, decimals: number): bigint {
  assertPositiveDecimalAmount(amountHuman);
  try {
    return parseUnits(amountHuman.trim(), decimals);
  } catch (error: any) {
    throw new InvalidAmountError(
      `Amount "${amountHuman}" has more decimal places than this token supports (${decimals}).`
    );
  }
}

/** Formats base units back to a human-readable decimal string for display only (never for storage). */
export function baseUnitsToDisplayString(baseUnits: bigint | string, decimals: number): string {
  return formatUnits(baseUnits, decimals);
}
