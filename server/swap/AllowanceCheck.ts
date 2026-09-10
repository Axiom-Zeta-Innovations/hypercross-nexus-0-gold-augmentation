/**
 * AllowanceCheck
 *
 * Pure helpers for ERC-20 allowance sufficiency and approval-amount resolution.
 * Allowance must always be compared against the amount actually required for the
 * operation (allowance >= required) — never treated as sufficient merely because
 * it is greater than zero.
 */

export const MAX_UINT256 = 2n ** 256n - 1n;

export function isAllowanceSufficient(allowance: bigint, requiredAmount: bigint): boolean {
  return allowance >= requiredAmount;
}

/** Default: approve exactly the required amount. Unlimited must be an explicit opt-in. */
export function resolveApprovalAmount(requiredAmount: bigint, unlimited: boolean): bigint {
  return unlimited ? MAX_UINT256 : requiredAmount;
}
