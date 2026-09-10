import { ChainstackProvider } from "./providers/ChainstackProvider";
import { BlockchainConfigurationError } from "./errors";
import type { BlockchainNetworkConfig, BlockchainProvider, ChainstackConfig } from "./types";

// Network metadata only (name/nativeCurrency/explorerUrl). The rpcUrl fields below are
// NEVER used for connectivity — Chainstack mode requires CHAINSTACK_RPC_URL explicitly
// and never falls back to a public RPC endpoint.
const NETWORK_METADATA: Record<string, { name: string; chainId: number; nativeCurrency: string; explorerUrl?: string }> = {
  ethereum: { name: "Ethereum", chainId: 1, nativeCurrency: "ETH", explorerUrl: "https://etherscan.io" },
  polygon: { name: "Polygon", chainId: 137, nativeCurrency: "POL", explorerUrl: "https://polygonscan.com" },
  arbitrum: { name: "Arbitrum", chainId: 42161, nativeCurrency: "ETH", explorerUrl: "https://arbiscan.io" },
  optimism: { name: "Optimism", chainId: 10, nativeCurrency: "ETH", explorerUrl: "https://optimistic.etherscan.io" },
  base: { name: "Base", chainId: 8453, nativeCurrency: "ETH", explorerUrl: "https://basescan.org" },
  "base-sepolia": { name: "Base Sepolia", chainId: 84532, nativeCurrency: "ETH", explorerUrl: "https://sepolia.basescan.org" },
  bnb: { name: "BNB Chain", chainId: 56, nativeCurrency: "BNB", explorerUrl: "https://bscscan.com" },
  avalanche: { name: "Avalanche", chainId: 43114, nativeCurrency: "AVAX", explorerUrl: "https://snowtrace.io" },
};

export class BlockchainProviderFactory {
  static getSupportedNetworks(): BlockchainNetworkConfig[] {
    return Object.entries(NETWORK_METADATA).map(([id, meta]) => ({
      id,
      name: meta.name,
      chainId: meta.chainId,
      rpcUrl: "", // Metadata only; real connectivity always requires CHAINSTACK_RPC_URL.
      nativeCurrency: meta.nativeCurrency,
      explorerUrl: meta.explorerUrl,
    }));
  }

  static createFromEnvironment(env: NodeJS.ProcessEnv = process.env): BlockchainProvider {
    const providerName = (env.BLOCKCHAIN_PROVIDER || "chainstack").toLowerCase();

    if (providerName !== "chainstack") {
      throw new BlockchainConfigurationError(`Unsupported BLOCKCHAIN_PROVIDER value: ${providerName}. Only "chainstack" is supported.`);
    }

    const networkName = (env.CHAINSTACK_NETWORK || "ethereum").toLowerCase();
    const metadata = NETWORK_METADATA[networkName];

    // Chainstack-only enforcement: CHAINSTACK_RPC_URL is required and is the ONLY
    // accepted RPC source. There is no fallback to mainnet.base.org, Ankr, Infura,
    // Alchemy, or any other public RPC.
    const rpcUrl = env.CHAINSTACK_RPC_URL?.trim();
    if (!rpcUrl) {
      throw new BlockchainConfigurationError(
        "CHAINSTACK_RPC_URL is required when BLOCKCHAIN_PROVIDER=chainstack. No public RPC fallback is permitted."
      );
    }

    const chainId = Number(env.CHAINSTACK_CHAIN_ID || metadata?.chainId || 1);

    const chainstackConfig: ChainstackConfig = {
      provider: "chainstack",
      id: networkName,
      name: metadata?.name || networkName,
      chainId,
      rpcUrl,
      websocketUrl: env.CHAINSTACK_WSS_URL,
      explorerUrl: env.CHAINSTACK_EXPLORER_URL || metadata?.explorerUrl,
      nativeCurrency: env.CHAINSTACK_NATIVE_CURRENCY || metadata?.nativeCurrency || "ETH",
      apiKey: env.CHAINSTACK_API_KEY,
      projectId: env.CHAINSTACK_PROJECT_ID,
      nodeId: env.CHAINSTACK_NODE_ID,
      privateKey: env.CHAINSTACK_PRIVATE_KEY,
      walletAddress: env.CHAINSTACK_WALLET_ADDRESS,
      rpcTimeoutMs: Number(env.CHAINSTACK_RPC_TIMEOUT_MS || 15000),
    };

    return new ChainstackProvider(chainstackConfig);
  }
}
