import { useState, useEffect } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireExecutionReady } from "../lib/transactionGuard";
import { readApiError } from "../lib/readApiError";

const SLIPPAGE_OPTIONS = [10, 50, 100]; // bps: 0.1%, 0.5%, 1.0%

/**
 * Real swap flow via the 0x Swap API (ZeroExSwapProvider). Requires ZEROX_API_KEY
 * to be configured server-side; without it, quotes fail with SWAP_UNAVAILABLE
 * rather than falling back to a fabricated quote.
 */
export function SwapPage() {
  const { address, isConnected, chainId } = useAccount();
  const { sendTransactionAsync, isPending: sending } = useSendTransaction();

  const [tokenIn, setTokenIn] = useState("");
  const [tokenOut, setTokenOut] = useState("");
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<any>(null);
  const [backendConfig, setBackendConfig] = useState<any>(null);

  const { data: receipt, isLoading: waitingForReceipt } = useWaitForTransactionReceipt({
    hash: (txHash as `0x${string}`) || undefined,
    query: { enabled: Boolean(txHash) },
  });

  const loadCapabilitiesAndStatus = async () => {
    try {
      const [capRes, statusRes] = await Promise.all([
        fetch("/api/config/capabilities"),
        fetch("/api/blockchain/status")
      ]);
      const capPayload = await capRes.json().catch(() => ({}));
      const statusPayload = await statusRes.json().catch(() => ({}));
      if (capRes.ok && capPayload.capabilities) {
        setCapabilities(capPayload.capabilities);
      } else {
        setCapabilities({
          backendApi: "UNAVAILABLE",
          blockchainRpc: "UNAVAILABLE",
          wallet: "LIVE",
          chainstackConnectivity: "UNAVAILABLE",
          digitalAssetIssuance: "UNAVAILABLE",
          send: "UNAVAILABLE",
          swap: "UNAVAILABLE",
          transactions: "UNAVAILABLE",
        });
      }
      if (statusRes.ok && statusPayload) {
        setBackendConfig(statusPayload);
      }
    } catch (err) {
      console.error("Failed to load capabilities or status for Swap (offline or unreachable backend):", err);
      setCapabilities({
        backendApi: "UNAVAILABLE",
        blockchainRpc: "UNAVAILABLE",
        wallet: "LIVE",
        chainstackConnectivity: "UNAVAILABLE",
        digitalAssetIssuance: "UNAVAILABLE",
        send: "UNAVAILABLE",
        swap: "UNAVAILABLE",
        transactions: "UNAVAILABLE",
      });
    }
  };

  useEffect(() => {
    loadCapabilitiesAndStatus();
  }, []);

  const quoteExpired = quote && new Date(quote.quoteExpiresAt).getTime() < Date.now();

  const fetchQuote = async () => {
    setError(null);
    setQuote(null);

    // Guard quote request as well
    const rpcHealthy = backendConfig?.rpcHealthy ?? false;
    const backendHealthy = capabilities?.backendApi === "LIVE";
    const correctChain = chainId === backendConfig?.chainId;
    const isSwapEnabled = capabilities?.swap === "LIVE" || capabilities?.swap === "DEVELOPMENT_ONLY";

    const guardResult = requireExecutionReady({
      walletConnected: isConnected,
      walletAddress: address,
      backendHealthy,
      rpcHealthy,
      correctChain,
      signerAvailable: isConnected && !!address,
      featureEnabled: isSwapEnabled
    });

    if (!guardResult.ready) {
      setError(guardResult.error);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenIn, tokenOut, amountIn, slippageBps }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(readApiError(payload, "Unable to fetch swap quote."));
        return;
      }
      setQuote(payload.quote);
    } catch {
      setError("Unable to reach swap service.");
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!quote?.allowanceTarget) return;
    setError(null);

    // Guard approval write operation
    const rpcHealthy = backendConfig?.rpcHealthy ?? false;
    const backendHealthy = capabilities?.backendApi === "LIVE";
    const correctChain = chainId === backendConfig?.chainId;
    const isSwapEnabled = capabilities?.swap === "LIVE" || capabilities?.swap === "DEVELOPMENT_ONLY";

    const guardResult = requireExecutionReady({
      walletConnected: isConnected,
      walletAddress: address,
      backendHealthy,
      rpcHealthy,
      correctChain,
      signerAvailable: isConnected && !!address,
      featureEnabled: isSwapEnabled
    });

    if (!guardResult.ready) {
      setError(guardResult.error);
      return;
    }

    try {
      const res = await fetch("/api/swap/approve/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: tokenIn, spender: quote.allowanceTarget }),
      });
      const prepared = await res.json();
      if (!res.ok) {
        setError(readApiError(prepared, "Approval preparation failed."));
        return;
      }
      const hash = await sendTransactionAsync({
        to: prepared.to as `0x${string}`,
        data: prepared.data as `0x${string}`,
        value: 0n,
      });
      await fetch(`/api/transactions/${prepared.transactionId}/submitted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash: hash }),
      });
    } catch (err: any) {
      // Translate complex provider errors
      const msg = err?.message || "";
      if (msg.includes("rejected") || msg.includes("User rejected")) {
        setError("User rejected signature request.");
      } else {
        setError(err?.shortMessage || err?.message || "Approval was not sent.");
      }
    }
  };

  const executeSwap = async () => {
    if (quoteExpired) {
      setError("0x quote expired. Request a new quote.");
      return;
    }
    setError(null);

    // Guard execution write operation
    const rpcHealthy = backendConfig?.rpcHealthy ?? false;
    const backendHealthy = capabilities?.backendApi === "LIVE";
    const correctChain = chainId === backendConfig?.chainId;
    const isSwapEnabled = capabilities?.swap === "LIVE" || capabilities?.swap === "DEVELOPMENT_ONLY";

    const guardResult = requireExecutionReady({
      walletConnected: isConnected,
      walletAddress: address,
      backendHealthy,
      rpcHealthy,
      correctChain,
      signerAvailable: isConnected && !!address,
      featureEnabled: isSwapEnabled
    });

    if (!guardResult.ready) {
      setError(guardResult.error);
      return;
    }

    try {
      const res = await fetch("/api/swap/execute/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenIn, tokenOut }),
      });
      const prepared = await res.json();
      if (!res.ok) {
        setError(readApiError(prepared, "Swap preparation failed."));
        return;
      }
      // Explicit user confirmation happened via this button click — never auto-executed.
      const hash = await sendTransactionAsync({
        to: prepared.to as `0x${string}`,
        data: prepared.data as `0x${string}`,
        value: BigInt(prepared.value || "0"),
      });
      setTxHash(hash);
      await fetch(`/api/transactions/${prepared.transactionId}/submitted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash: hash }),
      });
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("rejected") || msg.includes("User rejected")) {
        setError("User rejected signature request.");
      } else {
        setError(err?.shortMessage || err?.message || "Swap was not sent.");
      }
    }
  };

  const isSwapActive = capabilities?.swap === "LIVE" || capabilities?.swap === "DEVELOPMENT_ONLY";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Swap</h2>
        <p className="text-white/50 mt-1 text-sm">Real quotes via 0x. Requires ZEROX_API_KEY server-side.</p>
      </div>

      {!isSwapActive && capabilities && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-red-300 text-sm">
          <div>
            <p className="font-semibold">Swap Execution Unavailable</p>
            <p className="text-white/60 text-xs">Real swaps are disabled in this environment because the 0x API key (ZEROX_API_KEY) is not configured, or the RPC connectivity check failed.</p>
          </div>
        </div>
      )}

      <Card className="glass-panel neon-border-purple border-t-2">
        <CardHeader>
          <CardTitle className="text-white text-lg">Trade</CardTitle>
          <CardDescription className="text-white/50">Token addresses (contract address, or the 0x native ETH sentinel).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white/70">Token In (address)</Label>
            <Input value={tokenIn} onChange={(e) => setTokenIn(e.target.value)} placeholder="0x..." className="bg-black/50 border-white/10 text-white font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-white/70">Token Out (address)</Label>
            <Input value={tokenOut} onChange={(e) => setTokenOut(e.target.value)} placeholder="0x..." className="bg-black/50 border-white/10 text-white font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-white/70">Amount In</Label>
            <Input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="0.0" className="bg-black/50 border-white/10 text-white font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-white/70">Slippage</Label>
            <div className="flex gap-2">
              {SLIPPAGE_OPTIONS.map((bps) => (
                <button
                  key={bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${slippageBps === bps ? "border-[#c300ff] bg-[#c300ff]/20 text-white" : "border-white/10 text-white/50"}`}
                >
                  {(bps / 100).toFixed(2)}%
                </button>
              ))}
            </div>
            {slippageBps >= 300 && <p className="text-yellow-400 text-xs text-yellow-500/70">High slippage tolerance — you may receive significantly less than expected.</p>}
          </div>

          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

          <Button disabled={!isSwapActive || !isConnected || loading || !tokenIn || !tokenOut || !amountIn} onClick={fetchQuote} className="w-full bg-white/10 hover:bg-white/20 text-white border-0 disabled:opacity-40">
            {loading ? "Fetching quote…" : "Get Real Quote"}
          </Button>

          {quote && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-white/50">Estimated Out</span><span className="text-white">{quote.estimatedAmountOut}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Minimum Out</span><span className="text-white">{quote.minimumAmountOut}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Price</span><span className="text-white">{quote.price}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Estimated Gas</span><span className="text-white">{quote.estimatedGas}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Provider</span><span className="text-white">{quote.provider}</span></div>
              {quoteExpired && <p className="text-yellow-400 text-xs pt-1">0x quote expired. Request a new quote.</p>}

              {quote.allowanceRequired && (
                <Button onClick={approve} className="w-full mt-2 bg-yellow-600 hover:bg-yellow-700 text-white border-0">
                  Approve Token
                </Button>
              )}
              <Button disabled={sending || quoteExpired} onClick={executeSwap} className="w-full mt-2 bg-gradient-to-r from-[#1500ff] to-[#c300ff] text-white border-0 disabled:opacity-40">
                {sending ? "Awaiting wallet…" : "Confirm Swap"}
              </Button>
            </div>
          )}

          {txHash && (
            <div className={`p-3 rounded-lg border text-sm ${receipt?.status === "success" ? "bg-green-500/10 border-green-500/30 text-green-300" : "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"}`}>
              {waitingForReceipt ? "Pending…" : receipt?.status === "success" ? "Confirmed" : "Failed"}
              <p className="font-mono text-xs mt-1 break-all">
                <a href={backendConfig?.explorerUrl ? `${backendConfig.explorerUrl}/tx/${txHash}` : `https://base.org/explorer/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  {txHash}
                </a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SwapPage;
