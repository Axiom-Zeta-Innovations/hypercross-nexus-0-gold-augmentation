export interface ExecutionReadyInput {
  walletConnected: boolean;
  walletAddress: string | undefined;
  backendHealthy: boolean;
  rpcHealthy: boolean;
  correctChain: boolean;
  signerAvailable: boolean;
  featureEnabled: boolean;
}

export interface ExecutionReadyResult {
  ready: boolean;
  error: string | null;
}

export function requireExecutionReady(input: ExecutionReadyInput): ExecutionReadyResult {
  if (!input.featureEnabled) {
    return { ready: false, error: "Feature execution is currently disabled." };
  }
  if (!input.walletConnected || !input.walletAddress) {
    return { ready: false, error: "Connect your Web3 Web3 wallet to continue." };
  }
  if (!input.signerAvailable) {
    return { ready: false, error: "No signing capability detected. Please re-connect or authorize your wallet." };
  }
  if (!input.backendHealthy) {
    return { ready: false, error: "Backend service is currently unreachable/offline." };
  }
  if (!input.rpcHealthy) {
    return { ready: false, error: "EVM RPC connectivity check has failed. Please check network selection." };
  }
  if (!input.correctChain) {
    return { ready: false, error: "Wrong Network: Please switch in your wallet to the correct network." };
  }

  return { ready: true, error: null };
}
