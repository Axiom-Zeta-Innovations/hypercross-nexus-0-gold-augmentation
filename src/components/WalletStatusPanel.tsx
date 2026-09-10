import { useEffect, useState } from "react";
import { useAccount, useBalance, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type WalletUiState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "WRONG_CHAIN" | "ERROR";

interface ChainstackStatusSummary {
  chainId: number | null;
  network: string;
  connected: boolean;
  testnet: boolean;
}

/**
 * Displays REAL wallet state (checksum address, connected chain, native balance)
 * sourced from wagmi — never shows CONNECTED unless the wallet's chain matches
 * the chain Hypercross is actually configured for (Chainstack chainId).
 */
export function WalletStatusPanel() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: balance } = useBalance({ address, query: { enabled: Boolean(address) } });

  const [chainstackStatus, setChainstackStatus] = useState<ChainstackStatusSummary | null>(null);
  const [rpcUnavailable, setRpcUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/blockchain/status");
        const result = await res.json();
        if (cancelled) return;
        setChainstackStatus({
          chainId: result.chainId ?? null,
          network: result.network ?? "unknown",
          connected: Boolean(result.connected),
          testnet: Boolean(result.testnet),
        });
        setRpcUnavailable(!result.connected);
      } catch {
        if (!cancelled) setRpcUnavailable(true);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const expectedChainId = chainstackStatus?.chainId ?? null;
  const wrongNetwork = isConnected && expectedChainId != null && chainId !== expectedChainId;

  let state: WalletUiState = "DISCONNECTED";
  if (rpcUnavailable) state = "ERROR";
  else if (isConnecting) state = "CONNECTING";
  else if (wrongNetwork) state = "WRONG_CHAIN";
  else if (isConnected) state = "CONNECTED";

  const stateLabel: Record<WalletUiState, { text: string; className: string }> = {
    DISCONNECTED: { text: "Disconnected", className: "text-white/40" },
    CONNECTING: { text: "Connecting…", className: "text-yellow-400" },
    CONNECTED: { text: "Connected", className: "text-green-400" },
    WRONG_CHAIN: { text: "Wrong Chain", className: "text-red-400" },
    ERROR: { text: "Chainstack RPC Error", className: "text-red-400" },
  };

  return (
    <Card className="glass-panel neon-border-blue border-t-2">
      <CardHeader>
        <CardTitle className="text-white text-lg flex items-center justify-between">
          <span>Wallet</span>
          <span className={`text-xs font-semibold uppercase tracking-wider ${stateLabel[state].className}`}>
            {stateLabel[state].text}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!isConnected && (
          <p className="text-white/50">Connect a wallet to view your address, network, and balance.</p>
        )}

        {isConnected && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Address</p>
              <p className="text-white/90 font-mono text-xs break-all">{address}</p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Wallet Chain ID</p>
              <p className="text-white/90 font-mono">{chainId}</p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Native Balance</p>
              <p className="text-white/90 font-mono">
                {balance ? `${Number(balance.formatted).toFixed(5)} ${balance.symbol}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Hypercross Network</p>
              <p className="text-white/90">
                {chainstackStatus?.network ?? "unknown"} ({chainstackStatus?.testnet ? "Testnet" : "Mainnet"})
              </p>
            </div>
          </div>
        )}

        {wrongNetwork && expectedChainId != null && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-2">
            <p>
              Wrong network. Hypercross is connected to chain {expectedChainId}
              {chainstackStatus?.network ? ` (${chainstackStatus.network})` : ""}. Switch your wallet to continue.
            </p>
            <Button
              size="sm"
              disabled={switching}
              onClick={() => switchChain({ chainId: expectedChainId })}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              {switching ? "Switching…" : "Switch Network"}
            </Button>
          </div>
        )}

        {rpcUnavailable && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            Chainstack RPC is unreachable. Signing is disabled until connectivity is restored.
          </div>
        )}

        {isConnected && (
          <Button
            size="sm"
            variant="outline"
            className="w-full border-white/20 text-white/70 hover:bg-white/10"
            onClick={() => disconnect()}
          >
            Disconnect Wallet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default WalletStatusPanel;
