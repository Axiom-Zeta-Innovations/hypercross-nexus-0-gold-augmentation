export type BlockchainProviderName = "chainstack";

export interface ProviderConnectionStatus {
  provider: BlockchainProviderName;
  connected: boolean;
  network: string;
  chainId?: number;
  blockNumber?: number;
  rpcHealthy: boolean;
  live: boolean;
  source?: string;
  error?: string | null;
  lastChecked?: string | null;
}

export interface BlockchainQueryRequest {
  network?: string;
  contractAddress?: string;
  abi?: any[];
  method?: string;
  args?: unknown[];
  rawRpcMethod?: string;
  rawRpcParams?: unknown[];
}

export interface BlockchainTransactionRequest {
  network?: string;
  contractAddress?: string;
  abi?: any[];
  method?: string;
  args?: unknown[];
  value?: string;
  gasLimit?: string;
  data?: string;
  from?: string;
}

export interface BlockchainNetworkConfig {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  websocketUrl?: string;
  explorerUrl?: string;
  nativeCurrency?: string;
}

export interface ChainstackConfig extends BlockchainNetworkConfig {
  provider: "chainstack";
  apiKey?: string;
  projectId?: string;
  nodeId?: string;
  privateKey?: string;
  walletAddress?: string;
  rpcTimeoutMs?: number;
}

export interface BlockchainResponse<T> {
  ok: boolean;
  provider: BlockchainProviderName | "chainstack";
  network: string;
  chainId: number;
  live: boolean;
  data?: T;
  error?: string;
}

export interface GasEstimateRequest {
  from?: string;
  to: string;
  data?: string;
  value?: string;
}

export interface BlockchainProvider {
  connect(): Promise<ProviderConnectionStatus>;
  disconnect(): Promise<void>;
  getStatus(): Promise<ProviderConnectionStatus>;
  query(request: BlockchainQueryRequest): Promise<any>;
  submitTransaction(request: BlockchainTransactionRequest): Promise<any>;
  getBlockNumber(): Promise<number>;
  getBalance(address: string): Promise<string>;
  getTransaction(txHash: string): Promise<any>;
  healthCheck(): Promise<boolean>;
  estimateGas(request: GasEstimateRequest): Promise<string>;
  getFeeData(): Promise<{ gasPrice: string | null; maxFeePerGas: string | null; maxPriorityFeePerGas: string | null }>;
  getWebSocketStatus(): { configured: boolean; connected: boolean; error: string | null };
}
