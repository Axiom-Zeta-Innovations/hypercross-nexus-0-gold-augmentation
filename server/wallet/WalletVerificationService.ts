import crypto from "crypto";
import { ethers } from "ethers";
import { queries } from "../../src/db";
import { createSessionToken, getSessionExpiration } from "../auth";
import { blockchainService } from "../blockchain/BlockchainService";

/**
 * Phase 6: Wallet Signature Verification Service
 *
 * This service enables users to prove ownership of a wallet without storing private keys.
 * The verification flow is:
 * 1. Client requests a nonce via POST /api/wallet/nonce?address=0x...
 * 2. Service generates a random nonce (valid for 10 minutes)
 * 3. Client signs the nonce with their wallet (user signs in wallet app)
 * 4. Client sends signature to POST /api/wallet/verify with address, signature, nonce
 * 5. Service verifies signature matches nonce + address
 * 6. Service creates session and returns sessionToken
 * 7. Client uses sessionToken for authenticated requests
 *
 * This proves the client controls the private key without ever exposing the key to the server.
 */

interface NonceRequest {
  address: string;
}

interface VerifyRequest {
  address: string;
  signature: string;
  nonce: string;
}

interface VerifyResponse {
  ok: boolean;
  sessionToken?: string;
  address?: string;
  verifiedAt?: string;
  error?: string;
}

interface WalletInfo {
  address: string;
  verifiedAt: string | null;
  sessionId: string | null;
}

/**
 * Generates a random nonce for wallet signature verification
 */
function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Formats a message for signing (EIP-191)
 * This is the standard message format that wallet apps will sign.
 * Clearly identifies Hypercross Nexus and the chain context to deter phishing/replay across apps or chains.
 */
function formatMessageForSigning(nonce: string, address: string): string {
  const chainId = blockchainService.getNetworkInfo()?.chainId;
  const chainLine = chainId ? `\nChain ID: ${chainId}` : "";
  return `Hypercross Nexus wants you to sign in with your wallet.\n\nAddress: ${address}${chainLine}\nNonce: ${nonce}\n\nThis signature will not trigger a blockchain transaction or cost any gas.`;
}

/**
 * Recovers the signer address from a signature and message
 * Uses ethers.js verifyMessage (EIP-191 standard)
 */
function recoverAddress(message: string, signature: string): string | null {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered;
  } catch (error) {
    return null;
  }
}

/**
 * Creates or gets a nonce for wallet verification
 * Nonce is valid for 10 minutes
 */
export function createNonce(address: string): { nonce: string; expiresAt: string } {
  const normalizedAddress = ethers.getAddress(address);
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  queries.walletVerification.createNonce.run(
    `nonce_${normalizedAddress}_${Date.now()}`,
    normalizedAddress,
    nonce,
    expiresAt.toISOString()
  );

  return {
    nonce,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Retrieves the current nonce for a wallet address
 * Returns null if no valid nonce exists
 */
export function getNonce(address: string): { nonce: string; expiresAt: string } | null {
  try {
    const normalizedAddress = ethers.getAddress(address);
    const record = queries.walletVerification.getNonce.get(normalizedAddress) as any;

    if (!record) {
      return null;
    }

    return {
      nonce: record.nonce,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies a wallet signature against a nonce
 * Returns session token if verification succeeds
 */
export function verifySignature(req: VerifyRequest): VerifyResponse {
  try {
    // Validate inputs
    if (!req.address || !req.signature || !req.nonce) {
      return {
        ok: false,
        error: "Missing required fields: address, signature, nonce",
      };
    }

    // Normalize address
    let normalizedAddress: string;
    try {
      normalizedAddress = ethers.getAddress(req.address);
    } catch {
      return {
        ok: false,
        error: "Invalid Ethereum address",
      };
    }

    // Get the nonce record from database
    const nonceRecord = queries.walletVerification.getNonce.get(normalizedAddress) as any;
    if (!nonceRecord) {
      return {
        ok: false,
        error: "No valid nonce found for this address. Request a nonce first.",
      };
    }

    // Check nonce expiration
    if (new Date(nonceRecord.expiresAt) < new Date()) {
      return {
        ok: false,
        error: "Nonce has expired. Request a new nonce.",
      };
    }

    // Format the message that should have been signed
    const message = formatMessageForSigning(nonceRecord.nonce, normalizedAddress);

    // Recover the signer address from signature
    const recoveredAddress = recoverAddress(message, req.signature);

    if (!recoveredAddress) {
      return {
        ok: false,
        error: "Invalid signature. Could not recover signer address.",
      };
    }

    // Verify the recovered address matches the claimed address
    if (recoveredAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
      return {
        ok: false,
        error: "Signature does not match wallet address",
      };
    }

    // Verification succeeded! Find or create the user record for this wallet,
    // then create a REAL session row so requireAuth() recognizes this token.
    let user = queries.user.getByWallet.get(normalizedAddress) as any;
    if (!user) {
      const userId = crypto.randomUUID();
      queries.user.create.run(userId, null, normalizedAddress, null);
      user = queries.user.getById.get(userId) as any;
    }

    const sessionToken = createSessionToken();
    const sessionExpiration = getSessionExpiration();
    queries.session.create.run(sessionToken, user.id, null, "VIEWER", sessionExpiration.toISOString());

    // Mark nonce as verified (and consumed — see verify query) in the wallet-verification record
    queries.walletVerification.verify.run(
      req.signature,
      sessionToken,
      normalizedAddress,
      nonceRecord.nonce
    );

    return {
      ok: true,
      sessionToken,
      address: normalizedAddress,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("Wallet verification error:", error);
    return {
      ok: false,
      error: error?.message || "Verification failed",
    };
  }
}

/**
 * Retrieves wallet information by address
 * Returns verification status and session association
 */
export function getWalletInfo(address: string): WalletInfo | null {
  try {
    const normalizedAddress = ethers.getAddress(address);
    const record = queries.walletVerification.getByAddress.get(normalizedAddress) as any;

    if (!record) {
      return null;
    }

    return {
      address: normalizedAddress,
      verifiedAt: record.verifiedAt,
      sessionId: record.sessionId,
    };
  } catch {
    return null;
  }
}

/**
 * Cleans up expired nonces from the database
 * Should be called periodically (e.g., daily cron job)
 */
export function cleanupExpiredNonces(): number {
  const result = queries.walletVerification.deleteExpired.run() as any;
  return result?.changes || 0;
}

/**
 * Resolves the wallet session for GET /api/wallet/session — looks up the real
 * `sessions` row (not just the walletVerification bookkeeping row) so the result
 * reflects whether the caller's session token is actually authenticated.
 */
export function getSessionInfo(sessionToken: string): { address: string; userId: string; expiresAt: string } | null {
  const session = queries.session.getById.get(sessionToken) as any;
  if (!session) return null;
  const user = queries.user.getById.get(session.userId) as any;
  if (!user?.walletAddress) return null;
  return {
    address: user.walletAddress,
    userId: user.id,
    expiresAt: session.expiresAt,
  };
}

/**
 * Revokes a wallet session (DELETE /api/wallet/session) — deletes the real
 * session row so the token can never be used again.
 */
export function revokeSession(sessionToken: string): boolean {
  const session = queries.session.getById.get(sessionToken) as any;
  if (!session) return false;
  queries.session.deleteById.run(sessionToken);
  return true;
}

export const WalletVerificationService = {
  createNonce,
  getNonce,
  verifySignature,
  getWalletInfo,
  cleanupExpiredNonces,
  formatMessageForSigning,
  getSessionInfo,
  revokeSession,
};

export default WalletVerificationService;
