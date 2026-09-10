/**
 * NetworkRegistry
 *
 * Centralized configuration for EVM-compatible networks supported by the MVP.
 * Provides normalized network info for UI display and blockchain operations.
 */

export interface NetworkConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  websocketUrl?: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  testnet: boolean;
}

export class NetworkRegistry {
  private static readonly NETWORKS: Record<string, NetworkConfig> = {
    "ethereum-sepolia": {
      id: "ethereum-sepolia",
      name: "Ethereum Sepolia",
      chainId: 11155111,
      rpcUrl: "https://rpc.sepolia.org",
      explorerUrl: "https://sepolia.etherscan.io",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: true,
    },
    "base-sepolia": {
      id: "base-sepolia",
      name: "Base Sepolia",
      chainId: 84532,
      rpcUrl: "https://sepolia.base.org",
      explorerUrl: "https://sepolia.basescan.org",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: true,
    },
    "arbitrum-sepolia": {
      id: "arbitrum-sepolia",
      name: "Arbitrum Sepolia",
      chainId: 421614,
      rpcUrl: "https://sepolia-rollup.arbitrum.io:443/rpc",
      explorerUrl: "https://sepolia.arbiscan.io",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: true,
    },
    "ethereum": {
      id: "ethereum",
      name: "Ethereum",
      chainId: 1,
      rpcUrl: "https://rpc.ankr.com/eth",
      explorerUrl: "https://etherscan.io",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: false,
    },
    "base": {
      id: "base",
      name: "Base",
      chainId: 8453,
      rpcUrl: "https://mainnet.base.org",
      explorerUrl: "https://basescan.org",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: false,
    },
    "arbitrum": {
      id: "arbitrum",
      name: "Arbitrum One",
      chainId: 42161,
      rpcUrl: "https://rpc.arb1.arbitrum.io/rpc",
      explorerUrl: "https://arbiscan.io",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      testnet: false,
    },
  };

  /**
   * Get all registered networks
   */
  static getAllNetworks(): NetworkConfig[] {
    return Object.values(this.NETWORKS);
  }

  /**
   * Get all testnet networks
   */
  static getTestnets(): NetworkConfig[] {
    return Object.values(this.NETWORKS).filter((n) => n.testnet);
  }

  /**
   * Get all mainnet networks
   */
  static getMainnets(): NetworkConfig[] {
    return Object.values(this.NETWORKS).filter((n) => !n.testnet);
  }

  /**
   * Find network by ID
   */
  static getNetworkById(id: string): NetworkConfig | null {
    return this.NETWORKS[id] || null;
  }

  /**
   * Find network by chain ID
   */
  static getNetworkByChainId(chainId: number): NetworkConfig | null {
    return (
      Object.values(this.NETWORKS).find((n) => n.chainId === chainId) || null
    );
  }

  /**
   * Resolve network from environment configuration
   * Prefers explicit network ID, falls back to chain ID matching
   */
  static resolveNetwork(
    networkName?: string,
    chainId?: number
  ): NetworkConfig | null {
    // Try explicit network name first
    if (networkName) {
      const normalized = networkName.toLowerCase().replace(/[_\s]+/g, "-");
      const network = this.NETWORKS[normalized];
      if (network) return network;
    }

    // Fall back to chain ID matching
    if (chainId) {
      return this.getNetworkByChainId(chainId);
    }

    // Default to Ethereum Sepolia for testnet MVP
    return this.NETWORKS["ethereum-sepolia"];
  }

  /**
   * Get explorer URL for a transaction hash
   */
  static getExplorerUrl(
    network: NetworkConfig | null,
    txHash: string
  ): string | null {
    if (!network) return null;
    return `${network.explorerUrl}/tx/${txHash}`;
  }

  /**
   * Validate that a chain ID matches the configured network
   */
  static validateChainId(network: NetworkConfig, actualChainId: number): boolean {
    return network.chainId === actualChainId;
  }
}
