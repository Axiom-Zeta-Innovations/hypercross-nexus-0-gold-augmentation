import { useState, useEffect } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireExecutionReady } from "../lib/transactionGuard";
import { readApiError } from "../lib/readApiError";

type AssetOption = "ETH" | "USDC" | "DAI" | "WETH";

/**
 * Real send flow: prepare (validate + estimate gas) -> wallet signs & broadcasts via wagmi
 * -> report the real hash back to the transaction record -> poll for receipt.
 * Never displays "Transfer successful" before a receipt confirms it.
 */
export function SendPage() {
  const { address, isConnected, chainId } = useAccount();
  const { sendTransactionAsync, isPending: sending } = useSendTransaction();

  const [asset, setAsset] = useState<AssetOption>("ETH");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<any>(null);
  const [backendConfig, setBackendConfig] = useState<any>(null);
  const [sendState, setSendState] = useState<"IDLE" | "VALIDATE" | "AWAITING_SIGNATURE" | "SUBMITTED" | "PENDING" | "CONFIRMED" | "FAILED" | "REJECTED">("IDLE");

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
      console.error("Failed to load capabilities or status for Send (offline or unreachable backend):", err);
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

  useEffect(() => {
    if (!txHash) {
      if (sendState !== "VALIDATE" && sendState !== "AWAITING_SIGNATURE" && sendState !== "REJECTED") {
        setSendState("IDLE");
      }
      return;
    }
    if (waitingForReceipt) {
      setSendState("PENDING");
    } else if (receipt) {
      if (receipt.status === "success" || receipt.status === 1 || receipt.status === true) {
        setSendState("CONFIRMED");
      } else {
        setSendState("FAILED");
      }
    }
  }, [txHash, receipt, waitingForReceipt]);

  const status = !txHash
    ? (sendState === "VALIDATE" ? "Validating recipient, balance, and network..." : sendState === "AWAITING_SIGNATURE" ? "Awaiting wallet signature..." : sendState === "REJECTED" ? "Rejected: signature rejected or failed validation." : null)
    : sendState === "PENDING"
      ? "Transaction submitted — waiting for confirmation on-chain…"
      : sendState === "CONFIRMED"
        ? "Transaction confirmed successfully"
        : sendState === "FAILED"
          ? "Transaction failed (reverted on-chain)"
          : "Transaction submitted";

  const handlePrepareAndSend = async () => {
    setError(null);
    setTxHash(null);
    setTransactionId(null);
    setSendState("VALIDATE");

    // 1. Validation checks
    if (!recipient || !recipient.startsWith("0x") || recipient.length !== 42) {
      setError("Invalid address format. Must be a 42-character hexadecimal EVM address.");
      setSendState("REJECTED");
      return;
    }

    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      setError("Amount must be a positive number.");
      setSendState("REJECTED");
      return;
    }

    // Dynamic readiness guard verification
    const rpcHealthy = backendConfig?.rpcHealthy ?? false;
    const backendHealthy = capabilities?.backendApi === "LIVE";
    const correctChain = chainId === backendConfig?.chainId;
    const isSendEnabled = capabilities?.send === "LIVE" || capabilities?.send === "DEVELOPMENT_ONLY";

    const guardResult = requireExecutionReady({
      walletConnected: isConnected,
      walletAddress: address,
      backendHealthy,
      rpcHealthy,
      correctChain,
      signerAvailable: isConnected && !!address,
      featureEnabled: isSendEnabled
    });

    if (!guardResult.ready) {
      setError(guardResult.error);
      setSendState("REJECTED");
      return;
    }

    setPreparing(true);
    try {
      const endpoint = asset === "ETH" ? "/api/transfers/native/prepare" : "/api/transfers/erc20/prepare";
      const body = asset === "ETH" ? { to: recipient, amount } : { token: asset, to: recipient, amount };

      const prepRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const prepared = await prepRes.json();
      if (!prepRes.ok) {
        setError(readApiError(prepared, "Failed to prepare transfer."));
        setSendState("REJECTED");
        setPreparing(false);
        return;
      }

      setTransactionId(prepared.transactionId);
      setGasEstimate(prepared.gasEstimate);
      setSendState("AWAITING_SIGNATURE");

      // The wallet signs and broadcasts — Hypercross never sees the private key.
      const hash = await sendTransactionAsync({
        to: prepared.to as `0x${string}`,
        data: prepared.data as `0x${string}` | undefined,
        value: BigInt(prepared.value || "0"),
      });

      setTxHash(hash);
      setSendState("SUBMITTED");
      await fetch(`/api/transactions/${prepared.transactionId}/submitted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash: hash }),
      });
    } catch (err: any) {
      setSendState("REJECTED");
      // Wallet rejection is a user decision, not a backend failure.
      if (transactionId) {
        await fetch(`/api/transactions/${transactionId}/cancelled`, { method: "POST" }).catch(() => {});
      }
      
      // Translate common wallet/provider errors
      const msg = err?.message || "";
      if (msg.includes("rejected") || msg.includes("User rejected")) {
        setError("User rejected signature request in wallet.");
      } else if (msg.includes("insufficient funds") || msg.includes("gas required exceeds allowance")) {
        setError("Insufficient ETH for amount plus gas.");
      } else if (msg.includes("Wrong network") || msg.includes("chain mismatch")) {
        setError("Switch wallet network to match backend Chain ID.");
      } else {
        setError(err?.shortMessage || err?.message || "Transaction was not sent.");
      }
    } finally {
      setPreparing(false);
    }
  };

  const isSendActive = capabilities?.send === "LIVE" || capabilities?.send === "DEVELOPMENT_ONLY";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Send</h2>
        <p className="text-white/50 mt-1 text-sm">
          Real transfer — signed by your connected wallet. Nothing is simulated.
        </p>
      </div>

      {!isSendActive && capabilities && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-red-300 text-sm">
          <div>
            <p className="font-semibold">Send feature is completely unavailable.</p>
            <p className="text-white/60 text-xs">EVM RPC connection has failed or is disconnected. Real operations are disabled.</p>
          </div>
        </div>
      )}

      <Card className="glass-panel neon-border-blue border-t-2">
        <CardHeader>
          <CardTitle className="text-white text-lg">Transfer Details</CardTitle>
          <CardDescription className="text-white/50">Select an asset, recipient, and amount.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white/70">Asset</Label>
            <div className="flex gap-2">
              {(["ETH", "USDC", "DAI", "WETH"] as AssetOption[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAsset(a)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${asset === a ? "border-[#1500ff] bg-[#1500ff]/20 text-white" : "border-white/10 text-white/50"}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">Recipient Address</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." className="bg-black/50 border-white/10 text-white font-mono text-sm" />
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">Amount</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" className="bg-black/50 border-white/10 text-white font-mono text-sm" />
          </div>

          {gasEstimate && (
            <p className="text-white/40 text-xs">Estimated gas: {gasEstimate} units</p>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
          )}

          {status && (
            <div className={`p-3 rounded-lg border text-sm ${receipt?.status === "success" ? "bg-green-500/10 border-green-500/30 text-green-300" : receipt?.status === "reverted" ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"}`}>
              {status}
              {txHash && (
                <p className="font-mono text-xs mt-1 break-all">
                  <a href={backendConfig?.explorerUrl ? `${backendConfig.explorerUrl}/tx/${txHash}` : `https://base.org/explorer/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    {txHash}
                  </a>
                </p>
              )}
            </div>
          )}

          <Button
            disabled={!isSendActive || !isConnected || preparing || sending || !recipient || !amount}
            onClick={handlePrepareAndSend}
            className="w-full bg-gradient-to-r from-[#1500ff] to-[#c300ff] text-white border-0 disabled:opacity-40"
          >
            {preparing || sending ? "Awaiting wallet…" : "Review & Send"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default SendPage;
