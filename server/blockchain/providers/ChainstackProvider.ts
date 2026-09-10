import { Contract, JsonRpcProvider, Wallet, WebSocketProvider } from "ethers";
import {
  BlockchainConfigurationError,
  BlockchainConnectionError,
  BlockchainRpcError,
  BlockchainSigningError,
  BlockchainTransactionError,
} from "../errors";
import type {
  BlockchainProvider,
  BlockchainQueryRequest,
  BlockchainTransactionRequest,
  ChainstackConfig,
  ProviderConnectionStatus,
} from "../types";

export class ChainstackProvider implements BlockchainProvider {
  private provider: JsonRpcProvider;
  private wallet?: Wallet;
  private status: ProviderConnectionStatus;
  private readonly rpcTimeoutMs: number;
  // Optional subscription transport. HTTPS is always the primary transport;
  // a WSS failure here must never affect HTTPS RPC operations.
  private wsProvider?: WebSocketProvider;
  private wsError: string | null = null;
  private wsReconnectAttempts = 0;
  private wsReconnectTimer?: ReturnType<typeof setTimeout>;
  private wsHeartbeatTimer?: ReturnType<typeof setInterval>;
  private wsShuttingDown = false;
  private wsLastPongAt = 0;
  private readonly wsSubscriptions = new Map<string, (...args: any[]) => void>();
  private static readonly WS_MAX_RECONNECT_ATTEMPTS = 20;
  private static readonly WS_BASE_DELAY_MS = 1000;
  private static readonly WS_MAX_DELAY_MS = 30000;
  private static readonly WS_HEARTBEAT_INTERVAL_MS = 30000;
  private static readonly WS_STALE_THRESHOLD_MS = 90000;

  constructor(private readonly config: ChainstackConfig) {
    const rpcUrl = config.rpcUrl?.trim();
    if (!rpcUrl) {
      throw new BlockchainConfigurationError("CHAINSTACK_RPC_URL is required.");
    }

    this.rpcTimeoutMs = Number(config.rpcTimeoutMs) > 0 ? Number(config.rpcTimeoutMs) : 15000;
    this.provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });

    // Server-side signing is disabled by default even if CHAINSTACK_PRIVATE_KEY is
    // set. Normal user operations (transfers, approvals, swaps) are always signed
    // by the connected wallet client-side; this is only for optional automation.
    const serverSignerEnabled = ["true", "1"].includes((process.env.ENABLE_SERVER_SIGNER || "false").trim().toLowerCase());
    this.wallet = serverSignerEnabled && config.privateKey ? new Wallet(config.privateKey, this.provider) : undefined;
    this.status = {
      provider: "chainstack",
      connected: false,
      network: config.name || config.id || "chainstack",
      chainId: Number(config.chainId) || undefined,
      rpcHealthy: false,
      live: false,
      source: "chainstack",
      error: null,
      lastChecked: null,
    };

    if (config.websocketUrl?.trim()) {
      this.connectWebSocket();
    }
  }

  /**
   * Establishes the optional WSS connection with resilient reconnect behavior:
   * exponential backoff + jitter, a heartbeat to detect stale connections, and
   * resubscription of any tracked listeners after reconnect. Never throws —
   * failures only populate `wsError`, and HTTPS is unaffected either way.
   */
  private connectWebSocket(): void {
    const websocketUrl = this.config.websocketUrl?.trim();
    if (!websocketUrl || this.wsShuttingDown) return;

    try {
      this.wsProvider = new WebSocketProvider(websocketUrl);
      this.wsError = null;
      this.wsLastPongAt = Date.now();

      const socket: any = (this.wsProvider as any).websocket;
      if (socket && typeof socket.on === "function") {
        // Node 'ws' client event surface (ethers uses this under the hood in Node.js).
        socket.on("open", () => {
          this.wsReconnectAttempts = 0;
          this.wsLastPongAt = Date.now();
          this.resubscribeAll();
          this.startHeartbeat();
        });
        socket.on("close", () => {
          console.warn("Chainstack WSS connection closed — scheduling reconnect.");
          this.stopHeartbeat();
          this.scheduleReconnect();
        });
        socket.on("error", (err: Error) => {
          this.wsError = err?.message ?? "Chainstack WSS error";
          console.warn("Chainstack WSS error (sanitized):", this.wsError);
        });
        socket.on("pong", () => {
          this.wsLastPongAt = Date.now();
        });
      }
    } catch (error) {
      this.wsProvider = undefined;
      this.wsError = error instanceof Error ? error.message : "Unable to initialize Chainstack WebSocket provider.";
      this.scheduleReconnect();
    }
  }

  /** Exponential backoff with jitter; caps at WS_MAX_RECONNECT_ATTEMPTS so a permanently down endpoint doesn't spin forever. */
  private scheduleReconnect(): void {
    if (this.wsShuttingDown) return;
    if (this.wsReconnectTimer) return; // already scheduled
    if (this.wsReconnectAttempts >= ChainstackProvider.WS_MAX_RECONNECT_ATTEMPTS) {
      console.error("Chainstack WSS: max reconnect attempts reached; giving up until next process restart.");
      return;
    }

    this.wsReconnectAttempts += 1;
    const backoff = Math.min(
      ChainstackProvider.WS_BASE_DELAY_MS * 2 ** (this.wsReconnectAttempts - 1),
      ChainstackProvider.WS_MAX_DELAY_MS
    );
    const jitter = Math.random() * 0.3 * backoff;
    const delay = Math.round(backoff + jitter);

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = undefined;
      this.connectWebSocket();
    }, delay);
  }

  /** Detects a stale connection (no pong within threshold) and forces a reconnect. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.wsHeartbeatTimer = setInterval(() => {
      const socket: any = (this.wsProvider as any)?.websocket;
      if (!socket) return;

      if (Date.now() - this.wsLastPongAt > ChainstackProvider.WS_STALE_THRESHOLD_MS) {
        console.warn("Chainstack WSS heartbeat stale — forcing reconnect.");
        try { socket.terminate?.(); } catch { /* best effort */ }
        return;
      }
      try {
        socket.ping?.();
      } catch { /* non-fatal: next stale check will catch a truly dead socket */ }
    }, ChainstackProvider.WS_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.wsHeartbeatTimer) {
      clearInterval(this.wsHeartbeatTimer);
      this.wsHeartbeatTimer = undefined;
    }
  }

  /**
   * Register a named subscription so it survives reconnects. Duplicate
   * registration under the same name replaces the previous listener rather
   * than stacking duplicate listeners after reconnection.
   */
  subscribeWebSocketEvent(name: string, eventName: string | string[], listener: (...args: any[]) => void): void {
    this.wsSubscriptions.set(name, listener);
    (this as any)._wsEventNames = (this as any)._wsEventNames || new Map();
    (this as any)._wsEventNames.set(name, eventName);
    this.wsProvider?.on(eventName as any, listener).catch(() => {});
  }

  unsubscribeWebSocketEvent(name: string): void {
    const eventName = (this as any)._wsEventNames?.get(name);
    const listener = this.wsSubscriptions.get(name);
    if (eventName && listener) {
      this.wsProvider?.off(eventName, listener).catch(() => {});
    }
    this.wsSubscriptions.delete(name);
    (this as any)._wsEventNames?.delete(name);
  }

  private resubscribeAll(): void {
    const eventNames: Map<string, any> | undefined = (this as any)._wsEventNames;
    if (!eventNames) return;
    for (const [name, listener] of this.wsSubscriptions.entries()) {
      const eventName = eventNames.get(name);
      if (eventName) {
        this.wsProvider?.on(eventName, listener).catch(() => {});
      }
    }
  }

  /**
   * Reserved for future subscription/event functionality (e.g. newHeads, pending tx feeds).
   * Not required for initial Chainstack connectivity — HTTPS remains the primary transport.
   */
  getWebSocketStatus(): { configured: boolean; connected: boolean; error: string | null } {
    return {
      configured: Boolean(this.config.websocketUrl?.trim()),
      connected: Boolean(this.wsProvider) && !this.wsError,
      error: this.wsError,
    };
  }


  /**
   * Races a Chainstack RPC call against a timeout. Never exposes the endpoint URL.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new BlockchainRpcError("Chainstack RPC timed out"));
      }, this.rpcTimeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  async connect(): Promise<ProviderConnectionStatus> {
    try {
      const network = await this.withTimeout(this.provider.getNetwork());
      const chainId = Number(network.chainId);
      const configuredChainId = Number(this.config.chainId || chainId);

      if (configuredChainId && chainId !== configuredChainId) {
        throw new BlockchainConfigurationError(
          `Configured chain ID ${configuredChainId} does not match Chainstack RPC endpoint chain ID ${chainId}.`
        );
      }

      const blockNumber = await this.getBlockNumber();
      const nextStatus: ProviderConnectionStatus = {
        provider: "chainstack",
        connected: true,
        network: this.config.name || network.name || "chainstack",
        chainId,
        blockNumber,
        rpcHealthy: true,
        live: true,
        source: "chainstack",
        error: null,
        lastChecked: new Date().toISOString(),
      };
      this.status = nextStatus;
      return nextStatus;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Unable to connect to Chainstack RPC.";
      const nextStatus: ProviderConnectionStatus = {
        provider: "chainstack",
        connected: false,
        network: this.config.name || this.config.id || "chainstack",
        chainId: Number(this.config.chainId) || undefined,
        rpcHealthy: false,
        live: false,
        source: "chainstack",
        error: message,
        lastChecked: new Date().toISOString(),
      };
      this.status = nextStatus;
      throw new BlockchainConnectionError(message);
    }
  }

  async disconnect(): Promise<void> {
    this.wsShuttingDown = true;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = undefined;
    }
    this.stopHeartbeat();
    if (this.wsProvider) {
      try {
        await this.wsProvider.destroy();
      } catch {
        // Non-fatal: WSS is not the primary transport.
      }
      this.wsProvider = undefined;
    }
    this.status = {
      ...this.status,
      connected: false,
      rpcHealthy: false,
      live: false,
      lastChecked: new Date().toISOString(),
      error: "Disconnected from Chainstack.",
    };
  }

  async getStatus(): Promise<ProviderConnectionStatus> {
    try {
      const network = await this.withTimeout(this.provider.getNetwork());
      const blockNumber = await this.getBlockNumber();
      const nextStatus: ProviderConnectionStatus = {
        provider: "chainstack",
        connected: true,
        network: this.config.name || network.name || "chainstack",
        chainId: Number(network.chainId),
        blockNumber,
        rpcHealthy: true,
        live: true,
        source: "chainstack",
        error: null,
        lastChecked: new Date().toISOString(),
      };
      this.status = nextStatus;
      return nextStatus;
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Chainstack RPC unavailable.";
      const fallback: ProviderConnectionStatus = {
        ...this.status,
        connected: false,
        rpcHealthy: false,
        live: false,
        error: message,
        lastChecked: new Date().toISOString(),
      };
      this.status = fallback;
      return fallback;
    }
  }

  /**
   * Health requires BOTH eth_chainId (via getNetwork) and eth_blockNumber to succeed.
   * A provider that responds to only one of these is not considered healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await Promise.all([
        this.withTimeout(this.provider.getNetwork()),
        this.withTimeout(this.provider.getBlockNumber()),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async getBlockNumber(): Promise<number> {
    try {
      return Number(await this.withTimeout(this.provider.getBlockNumber()));
    } catch (error) {
      throw new BlockchainRpcError(error instanceof Error ? error.message : "Unable to read block number.");
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      const value = await this.provider.getBalance(address);
      return value.toString();
    } catch (error) {
      throw new BlockchainRpcError(error instanceof Error ? error.message : `Unable to fetch balance for ${address}.`);
    }
  }

  async getTransaction(txHash: string): Promise<any> {
    try {
      return await this.provider.getTransaction(txHash);
    } catch (error) {
      throw new BlockchainRpcError(error instanceof Error ? error.message : `Unable to fetch transaction ${txHash}.`);
    }
  }

  async estimateGas(request: { from?: string; to: string; data?: string; value?: string }): Promise<string> {
    try {
      const gas = await this.withTimeout(
        this.provider.estimateGas({
          from: request.from,
          to: request.to,
          data: request.data,
          value: request.value ? BigInt(request.value) : undefined,
        })
      );
      return gas.toString();
    } catch (error) {
      throw new BlockchainRpcError(error instanceof Error ? error.message : "Unable to estimate gas.");
    }
  }

  async getFeeData(): Promise<{ gasPrice: string | null; maxFeePerGas: string | null; maxPriorityFeePerGas: string | null }> {
    try {
      const fee = await this.withTimeout(this.provider.getFeeData());
      return {
        gasPrice: fee.gasPrice != null ? fee.gasPrice.toString() : null,
        maxFeePerGas: fee.maxFeePerGas != null ? fee.maxFeePerGas.toString() : null,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas != null ? fee.maxPriorityFeePerGas.toString() : null,
      };
    } catch (error) {
      throw new BlockchainRpcError(error instanceof Error ? error.message : "Unable to fetch fee data.");
    }
  }

  async query(request: BlockchainQueryRequest): Promise<any> {
    if (request.rawRpcMethod) {
      return this.provider.send(request.rawRpcMethod, request.rawRpcParams ?? []);
    }

    if (request.contractAddress && request.abi && request.method) {
      const contract = new Contract(request.contractAddress, request.abi, this.provider);
      const fn = contract[request.method as keyof typeof contract] as (...args: any[]) => Promise<any>;
      if (typeof fn !== "function") {
        throw new BlockchainRpcError(`Contract method ${request.method} is not available.`);
      }
      return fn(...(request.args ?? []));
    }

    throw new BlockchainConfigurationError("Either rawRpcMethod or contractAddress + method + abi are required.");
  }

  async submitTransaction(request: BlockchainTransactionRequest): Promise<any> {
    if (!this.wallet) {
      throw new BlockchainSigningError("No private key configured for server-side signing. Use a user wallet for transaction signing.");
    }

    if (request.data) {
      const tx = {
        to: request.contractAddress,
        data: request.data,
        value: request.value ? BigInt(request.value) : undefined,
        gasLimit: request.gasLimit ? BigInt(request.gasLimit) : undefined,
      };
      return this.wallet.sendTransaction(tx);
    }

    if (request.contractAddress && request.abi && request.method) {
      const contract = new Contract(request.contractAddress, request.abi, this.wallet);
      const fn = contract[request.method as keyof typeof contract] as (...args: any[]) => Promise<any>;
      if (typeof fn !== "function") {
        throw new BlockchainTransactionError(`Contract method ${request.method} is not available for execution.`);
      }
      return fn(...(request.args ?? []), {
        value: request.value ? BigInt(request.value) : undefined,
        gasLimit: request.gasLimit ? BigInt(request.gasLimit) : undefined,
      });
    }

    throw new BlockchainTransactionError("Contract address + method or transaction data is required for submission.");
  }
}
