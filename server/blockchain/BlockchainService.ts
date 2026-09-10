/**
 * BlockchainService
 *
 * High-level service for blockchain operations.
 * Coordinates the BlockchainProvider and adds business logic.
 * Handles wallet validation, transaction tracking, and error handling.
 */

import { BlockchainProviderFactory } from "./BlockchainProviderFactory";
import { EnvironmentValidator } from "./EnvironmentValidator";
import { NetworkRegistry } from "./NetworkRegistry";
import { validateTokenRegistry } from "./TokenRegistry";
import { isAddress } from "ethers";
import {
  BlockchainConfigurationError,
  BlockchainConnectionError,
  MainnetExecutionDisabledError,
} from "./errors";
import type { BlockchainProvider, ProviderConnectionStatus, BlockchainTransactionRequest } from "./types";

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
}

export interface TransactionStatus {
  hash: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  confirmations?: number;
  timestamp: string;
}

export class BlockchainService {
  private provider: BlockchainProvider | null = null;
  private status: ProviderConnectionStatus | null = null;
  private initialized = false;

  /**
   * Initialize the blockchain service
   * Validates environment, creates provider, and performs health checks
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Validate environment
    EnvironmentValidator.throwIfInvalid();
    EnvironmentValidator.logStartupInfo();
    validateTokenRegistry(isAddress);

    // Create provider from environment
    try {
      this.provider = BlockchainProviderFactory.createFromEnvironment();
    } catch (error) {
      throw new BlockchainConfigurationError(
        `Failed to create blockchain provider: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    // Connect and check health
    try {
      this.status = await this.provider.connect();
      console.log(
        `✓ Connected to ${this.status.network} (chain ${this.status.chainId})`
      );
    } catch (error) {
      throw new BlockchainConnectionError(
        `Failed to connect to blockchain RPC: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    this.initialized = true;
  }

    /**
   * Get current provider connection status
   */
  async getStatus(): Promise<ProviderConnectionStatus> {
    if (!this.provider) {
      return {
        provider: "chainstack",
        connected: false,
        network: "unknown",
        rpcHealthy: false,
        live: false,
        error: "Blockchain service not initialized",
      };
    }

    return this.provider.getStatus();
  }

  /**
   * Check RPC health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.provider) return false;
    try {
      return await this.provider.healthCheck();
    } catch {
      return false;
    }
  }

  /** WSS status is tracked separately from HTTPS health — a WSS failure never affects HTTPS. */
  getWebSocketStatus(): { configured: boolean; connected: boolean; error: string | null } {
    if (!this.provider) return { configured: false, connected: false, error: "Not initialized" };
    return this.provider.getWebSocketStatus();
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    return this.provider.getBlockNumber();
  }

  /**
   * Get native token balance for an address
   */
  async getBalance(address: string): Promise<string> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    
    // Validate address format
    if (!address.startsWith("0x") || address.length !== 42) {
      throw new BlockchainConfigurationError(
        `Invalid Ethereum address: "${address}". Must be 42 characters starting with "0x".`
      );
    }

    return this.provider.getBalance(address);
  }

  /**
   * Submit transaction to the blockchain
   */
  async sendTransaction(request: BlockchainTransactionRequest): Promise<any> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    return this.provider.submitTransaction(request);
  }

  /**
   * Get transaction details
   */
  async getTransaction(txHash: string): Promise<any> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    
    if (!txHash.startsWith("0x") || txHash.length !== 66) {
      throw new BlockchainConfigurationError(
        `Invalid transaction hash: "${txHash}". Must be 66 characters starting with "0x".`
      );
    }

    return this.provider.getTransaction(txHash);
  }

  /**
   * Get a transaction receipt (used to determine CONFIRMED/FAILED status).
   * Returns null while still pending.
   */
  async getTransactionReceipt(txHash: string): Promise<any> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    return this.provider.query({ rawRpcMethod: "eth_getTransactionReceipt", rawRpcParams: [txHash] });
  }

  /**
   * Estimates gas for a prepared (unsigned) transaction. Used to show the user
   * an estimated cost before they sign — never used to sign or broadcast.
   */
  async estimateGas(request: { from?: string; to: string; data?: string; value?: string }): Promise<string> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    return this.provider.estimateGas(request);
  }

  async getFeeData() {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    return this.provider.getFeeData();
  }

  /**
   * Read-only contract call routed through the enforced Chainstack provider.
   * The frontend may never supply the ABI/method directly — callers must pass
   * an ABI sourced from the repo's registries (ERC20_ABI, router ABIs, etc.).
   */
  async readContract(contractAddress: string, abi: any[], method: string, args: unknown[] = []): Promise<any> {
    if (!this.provider) throw new BlockchainConnectionError("Blockchain service not initialized");
    return this.provider.query({ contractAddress, abi, method, args });
  }

  /**
   * Whether the currently configured network is a mainnet (per NetworkRegistry).
   */
  isMainnet(): boolean {
    return this.getNetworkInfo()?.testnet === false;
  }

  /**
   * Throws MAINNET_EXECUTION_DISABLED unless ALLOW_MAINNET=true when the active
   * network is mainnet. Reads are never restricted; only state-changing operations
   * (transfers, approvals, swaps, contract writes) should call this guard.
   */
  assertMainnetWritesAllowed(env: NodeJS.ProcessEnv = process.env): void {
    const allowMainnet = ["true", "1"].includes((env.ALLOW_MAINNET || "false").trim().toLowerCase());
    if (this.isMainnet() && !allowMainnet) {
      throw new MainnetExecutionDisabledError();
    }
  }

  /**
   * Get current network information
   */
  getNetworkInfo() {
    if (!this.status) {
      return null;
    }

    const network = NetworkRegistry.getNetworkByChainId(this.status.chainId || 0);
    return {
      chainId: this.status.chainId,
      networkName: this.status.network,
      networkConfig: network,
      testnet: network?.testnet ?? false,
      explorerUrl: network?.explorerUrl ?? null,
    };
  }

  /**
   * Generate explorer URL for a transaction
   */
  getExplorerUrl(txHash: string): string | null {
    const networkInfo = this.getNetworkInfo();
    if (!networkInfo?.networkConfig) return null;
    return NetworkRegistry.getExplorerUrl(networkInfo.networkConfig, txHash);
  }

  /**
   * Disconnect from blockchain
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      await this.provider.disconnect();
      this.provider = null;
      this.status = null;
      this.initialized = false;
    }
  }
}

// Singleton instance
export const blockchainService = new BlockchainService();
