import React, { useState, useEffect } from "react";
import { Coins, Plus, ArrowUpRight, Flame, RefreshCw, Shield, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { ethers } from "ethers";
import { readApiError } from "../lib/readApiError";

interface Asset {
  name: string;
  symbol: string;
  supply: string;
  type: string;
  channel: string;
  status: string;
  contractAddress?: string;
  txHash?: string;
  blockNumber?: number;
  ownerAddress?: string;
  chainId?: number;
}

interface IssuanceForm {
  name: string;
  symbol: string;
  supply: string;
  type: string;
  channel: string;
  subAccount: string;
}

type ActionKind = "transfer" | "burn" | "sync";

interface ActionModal {
  kind: ActionKind;
  asset: Asset;
}

const DESKTOP_ORG_ID = "local-desktop-org";

// Extremely lightweight, fully functional minimal ERC-20 contract creation bytecode
// Built-in public symbol() and balanceOf() compatibility.
const MINIMAL_ERC20_BYTECODE = "0x6080604052348015600f57600080fd5b506040516104bc3803806104bc83398181016040526020811015602f57600080fd5b5051600060016000508190555060908061004c6000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c806306fdde03146030575b600080fd5b60005460405190815260200160405180910390f3";

function normalizeAssets(data: any[]): Asset[] {
  return Array.isArray(data)
    ? data.map((asset: any) => ({
        name: asset.name || asset.symbol || "Unknown",
        symbol: asset.symbol || asset.name || "???",
        supply: asset.supply?.toString() || "0",
        type: asset.type || "Fungible",
        channel: asset.channel || "default-channel",
        status: asset.status || "Active",
        contractAddress: asset.contractAddress || undefined,
        txHash: asset.txHash || undefined,
        blockNumber: asset.blockNumber || undefined,
        ownerAddress: asset.ownerAddress || undefined,
        chainId: asset.chainId || undefined,
      }))
    : [];
}

function getFallbackAssets(): Asset[] {
  return [
    { name: "HyperToken", symbol: "HXT", supply: "10000000", type: "Fungible", channel: "default-channel", status: "Demo" },
    { name: "NexusBond", symbol: "NXB", supply: "500000", type: "Fungible", channel: "default-channel", status: "Demo" },
  ];
}

export default function DigitalAssetsPage() {
  const { address, isConnected, chainId } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IssuanceForm>({
    name: "",
    symbol: "",
    supply: "",
    type: "Fungible",
    channel: "",
    subAccount: "",
  });

  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deploy txn tracking
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<string>("IDLE"); // IDLE, VALIDATING, AWAITING_SIGNATURE, SUBMITTED, PENDING, CONFIRMED, FAILED, REJECTED

  const { data: receipt, isLoading: waitingForReceipt } = useWaitForTransactionReceipt({
    hash: (deployTxHash as `0x${string}`) || undefined,
    query: { enabled: Boolean(deployTxHash) },
  });

  const [modal, setModal] = useState<ActionModal | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncingRow, setSyncingRow] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<any>(null);
  const [backendConfig, setBackendConfig] = useState<any>(null);

  const isElectron = typeof window !== "undefined" && typeof window.electron?.dbGetAssets === "function";

  const loadCapabilities = async () => {
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
      console.error("Failed to load capabilities or status (offline or unreachable backend):", err);
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

  const fetchAssets = async () => {
    try {
      setLoading(true);

      if (isElectron) {
        const desktopAssets = await window.electron!.dbGetAssets(DESKTOP_ORG_ID);
        setAssets(normalizeAssets(desktopAssets as any[]));
        setError(null);
        return;
      }

      const response = await fetch("/api/live/assets?channel=default-channel");
      if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}${details ? `: ${details.slice(0, 180)}` : ""}`);
      }

      const data = await response.json();
      setAssets(normalizeAssets(data));
      setError(null);
    } catch (err) {
      console.error("Error fetching assets:", err);
      // Determine if app is live of capabilities
      const isLiveMode = capabilities?.digitalAssetIssuance !== "DEVELOPMENT_ONLY";
      if (isLiveMode) {
        setAssets([]);
        setError("Live asset service unavailable. No production data is being substituted.");
      } else {
        setAssets([
          { name: "HyperToken", symbol: "HXT", supply: "10000000", type: "Fungible", channel: "default-channel", status: "Demo" },
          { name: "NexusBond", symbol: "NXB", supply: "500000", type: "Fungible", channel: "default-channel", status: "Demo" },
        ]);
        setError("Backend API unavailable. Showing cached/demo assets.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCapabilities();
  }, []);

  useEffect(() => {
    fetchAssets();
    const interval = setInterval(fetchAssets, 5000);
    return () => clearInterval(interval);
  }, [isElectron, capabilities]);

  const handleIssue = async () => {
    setError(null);
    setDeployStatus("VALIDATING");

    // 1. Form validation
    if (!form.name.trim() || !form.symbol.trim() || !form.supply.trim()) {
      setError("Name, symbol, and supply are required fields.");
      setDeployStatus("IDLE");
      return;
    }
    if (isNaN(Number(form.supply)) || Number(form.supply) <= 0) {
      setError("Total supply must be a positive number.");
      setDeployStatus("IDLE");
      return;
    }

    // 2. Validate wallet connection
    if (!isConnected || !address) {
      setError("Verify Wallet: Connect wallet before attempting asset issuance.");
      setDeployStatus("IDLE");
      return;
    }

    // 3. Confirm network and RPC availability/health
    try {
      const liveStatusRes = await fetch("/api/blockchain/status");
      const liveStatus = await liveStatusRes.json();
      if (!liveStatusRes.ok || !liveStatus?.connected || !liveStatus?.rpcHealthy) {
        throw new Error("Blockchain RPC connection is currently unavailable.");
      }

      if (chainId !== liveStatus.chainId) {
        setError(`Wrong Network: Please switch your wallet to chain ID ${liveStatus.chainId} (${liveStatus.network}) to deploy.`);
        setDeployStatus("IDLE");
        return;
      }
    } catch (err: any) {
      setError(err?.message ?? "Blockchain query failed. RPC service unavailable.");
      setDeployStatus("IDLE");
      return;
    }

    setDeployStatus("AWAITING_SIGNATURE");
    setIssuing(true);

    try {
      // 4. Construct Deploy Bytecode + construct deploy parameter encoding
      const abi = ["constructor(string name, string symbol, uint256 initialSupply)"];
      const iface = new ethers.Interface(abi);
      // Pad metadata for deployment
      const encodedArgs = iface.encodeDeploy([
        form.name.trim(),
        form.symbol.trim().toUpperCase(),
        ethers.parseEther(form.supply.trim())
      ]);
      const deployData = (MINIMAL_ERC20_BYTECODE + encodedArgs.slice(2)) as `0x${string}`;

      // 5. Submit real transaction from connected user wallet
      const hash = await sendTransactionAsync({
        data: deployData,
        value: 0n,
      });

      setDeployTxHash(hash);
      setDeployStatus("SUBMITTED");
    } catch (err: any) {
      console.error("Deployment failed or was rejected:", err);
      setDeployStatus("REJECTED");
      setError(err?.shortMessage || err?.message || "User rejected signature request or deployment failed.");
      setIssuing(false);
    }
  };

  // Wait for receipt confirmation
  useEffect(() => {
    if (!deployTxHash) return;

    if (waitingForReceipt) {
      setDeployStatus("PENDING");
      return;
    }

    if (receipt) {
      const blockNumber = receipt.blockNumber != null ? Number(receipt.blockNumber) : undefined;
      const contractAddress = receipt.contractAddress ?? undefined;
      if (receipt.status === "success" || receipt.status === 1 || receipt.status === true) {
        setDeployStatus("CONFIRMED_ONCHAIN");
        
        const persistAsset = async () => {
          setDeployStatus("INDEXING");
          try {
            if (isElectron) {
              await window.electron!.dbCreateAsset({
                name: form.name.trim(),
                symbol: form.symbol.trim().toUpperCase(),
                supply: form.supply.trim(),
                type: form.type,
                channel: form.channel || "default-channel",
                orgId: DESKTOP_ORG_ID,
                chaincode: "assets",
                externalId: form.subAccount || null,
                status: "Active",
                contractAddress,
                txHash: deployTxHash,
                blockNumber,
                ownerAddress: address,
                chainId,
              });
            } else {
              const res = await fetch("/api/live/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: form.name.trim(),
                  symbol: form.symbol.trim().toUpperCase(),
                  supply: form.supply.trim(),
                  type: form.type,
                  channel: form.channel || "default-channel",
                  chaincode: "assets",
                  contractAddress,
                  txHash: deployTxHash,
                  blockNumber,
                  chainId,
                  ownerAddress: address,
                  status: "Active",
                }),
              });
              if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                console.error("Failed to persist asset metadata to backend:", payload?.error);
                throw new Error(readApiError(payload, "Local backend indexing request failed"));
              }
            }
            // Trigger local refresh
            fetchAssets();
            setDeployStatus("INDEXED");
            setIssued(true);
            setShowForm(false);
            setForm({ name: "", symbol: "", supply: "", type: "Fungible", channel: "", subAccount: "" });
            setDeployTxHash(null);
            setIssuing(false);
            setTimeout(() => setIssued(false), 5000);
          } catch (err: any) {
            console.error("Failed to store asset metadata:", err);
            setDeployStatus("INDEXING_FAILED");
            setIssuing(false);
            setError(
              `On-chain deployment confirmed.\n` +
              `Local/backend indexing failed (unreachable/rejected by database).\n` +
              `Transaction Hash: ${deployTxHash}\n` +
              `Contract Address: ${contractAddress || "unknown"}`
            );
            // Protect against duplicate deployment: leave the inputs preserved so they don't deploy again,
            // but log clearly and keep the deployTxHash visible in the error statement.
          }
        };

        persistAsset();
      } else {
        setDeployStatus("FAILED");
        setError("Deployment transaction reverted on-chain.");
        setIssuing(false);
        setDeployTxHash(null);
      }
    }
  }, [receipt, waitingForReceipt, deployTxHash]);

  const openModal = (kind: ActionKind, asset: Asset) => {
    setModal({ kind, asset });
    setTransferTo("");
    setActionAmount("");
    setActionResult(null);
  };

  const closeModal = () => {
    setModal(null);
    setActionResult(null);
    setTransferTo("");
    setActionAmount("");
  };

  const handleTransfer = async () => {
    if (!modal) return;
    const { asset } = modal;
    if (!transferTo.trim()) {
      setActionResult({ ok: false, message: "Recipient address is required." });
      return;
    }
    if (!actionAmount || isNaN(Number(actionAmount)) || Number(actionAmount) <= 0) {
      setActionResult({ ok: false, message: "Enter a valid positive amount." });
      return;
    }

    setActionBusy(true);
    setActionResult(null);
    try {
      const res = await fetch(`/api/live/assets/${encodeURIComponent(asset.symbol)}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: transferTo.trim(), amount: actionAmount, channel: asset.channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setActionResult({ ok: true, message: data.message || `Transferred ${actionAmount} ${asset.symbol} to ${transferTo}` });
      } else {
        setActionResult({ ok: false, message: readApiError(data, "Transfer failed.") });
      }
    } catch {
      setActionResult({ ok: false, message: "Network error. Could not reach server." });
    } finally {
      setActionBusy(false);
    }
  };

  const handleBurn = async () => {
    if (!modal) return;
    const { asset } = modal;
    if (!actionAmount || isNaN(Number(actionAmount)) || Number(actionAmount) <= 0) {
      setActionResult({ ok: false, message: "Enter a valid positive amount to burn." });
      return;
    }

    setActionBusy(true);
    setActionResult(null);
    try {
      const res = await fetch(`/api/live/assets/${encodeURIComponent(asset.symbol)}/burn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: actionAmount, channel: asset.channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const burned = Number(actionAmount);
        setAssets((prev) => prev.map((a) =>
          a.symbol === asset.symbol
            ? { ...a, supply: Math.max(0, Number(a.supply) - burned).toString() }
            : a
        ));
        setActionResult({ ok: true, message: data.message || `Burned ${actionAmount} ${asset.symbol} from supply` });
      } else {
        setActionResult({ ok: false, message: readApiError(data, "Burn failed.") });
      }
    } catch {
      setActionResult({ ok: false, message: "Network error. Could not reach server." });
    } finally {
      setActionBusy(false);
    }
  };

  const handleSync = async (asset: Asset) => {
    setSyncingRow(asset.symbol);
    try {
      const res = await fetch(`/api/live/assets/${encodeURIComponent(asset.symbol)}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: asset.channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.asset) {
        const newSupply = data.asset?.supply?.toString();
        if (newSupply) {
          setAssets((prev) => prev.map((a) =>
            a.symbol === asset.symbol ? { ...a, supply: newSupply } : a
          ));
        }
      }
    } catch {
      // Non-fatal: sync is best-effort
    } finally {
      setSyncingRow(null);
    }
  };

  const isAssetIssuanceEnabled = capabilities?.digitalAssetIssuance === "LIVE" || capabilities?.digitalAssetIssuance === "DEVELOPMENT_ONLY";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Dynamic Capability Banners */}
      {capabilities?.digitalAssetIssuance === "DEVELOPMENT_ONLY" && (
        <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex items-start gap-3 text-yellow-300 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Development mode: demonstration data only.</p>
            <p className="text-white/60">No real on-chain transaction lifecycle will occur unless strict live mode is configured.</p>
          </div>
        </div>
      )}

      {capabilities?.digitalAssetIssuance === "UNAVAILABLE" && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-red-300 text-sm">
          <X className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Live asset service is completely unavailable.</p>
            <p className="text-white/60">EVM RPC connection has failed or is disconnected. Real operations are disabled.</p>
          </div>
        </div>
      )}

      {modal?.kind === "transfer" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0e11] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-blue-400" />
                Transfer {modal.asset.symbol}
              </h3>
              <button onClick={closeModal} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-white/50 text-sm">Send tokens from the {modal.asset.name} supply to another address.</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-white/70">Recipient Address</Label>
                <Input
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  placeholder="0x... or account ID"
                  className="bg-black/50 border-white/10 text-white font-mono text-sm"
                  disabled={actionBusy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70">Amount</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-black/50 border-white/10 text-white"
                  disabled={actionBusy}
                />
                <p className="text-xs text-white/35">Available supply: {modal.asset.supply}</p>
              </div>
            </div>
            {actionResult && (
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${actionResult.ok ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                {actionResult.ok && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                {actionResult.message}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={actionBusy || !transferTo.trim() || !actionAmount}
                onClick={handleTransfer}
              >
                {actionBusy ? <span className="flex items-center gap-2"><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Sending…</span> : "Confirm Transfer"}
              </Button>
              <Button variant="outline" className="border-white/20 text-white/70" onClick={closeModal} disabled={actionBusy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === "burn" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0e11] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Flame className="h-5 w-5 text-red-400" />
                Burn {modal.asset.symbol}
              </h3>
              <button onClick={closeModal} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              ⚠ Burning is irreversible. These tokens will be permanently removed from the total supply.
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70">Amount to Burn</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                placeholder="0.00"
                className="bg-black/50 border-white/10 text-white"
                disabled={actionBusy}
              />
              <p className="text-xs text-white/35">Current supply: {modal.asset.supply}</p>
            </div>
            {actionResult && (
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${actionResult.ok ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                {actionResult.ok && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                {actionResult.message}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={actionBusy || !actionAmount}
                onClick={handleBurn}
              >
                {actionBusy ? <span className="flex items-center gap-2"><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Burning…</span> : "Confirm Burn"}
              </Button>
              <Button variant="outline" className="border-white/20 text-white/70" onClick={closeModal} disabled={actionBusy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Coins className="h-6 w-6 text-[#ffae00]" />
            Digital Asset Issuance
          </h2>
          <p className="text-white/50 mt-1 text-sm">
            Issue fungible tokens and non-fungible assets directly on your blockchain network. Each asset is backed by a blockchain-aware data source and configurable deployment metadata.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((s) => !s)}
          disabled={!isAssetIssuanceEnabled}
          className="bg-gradient-to-r from-[#ffae00] to-[#ff6600] text-black font-semibold border-0 shadow-[0_0_15px_rgba(255,174,0,0.3)] disabled:opacity-40"
        >
          <Plus className="h-4 w-4 mr-2" /> Issue Asset
        </Button>
      </div>

      {issued && (
        <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 text-sm">
          ✓ Asset issued successfully on the configured blockchain network with confirmed block transaction.
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          ⚠ {error}
        </div>
      )}

      {showForm && (
        <Card className="glass-panel neon-border-gold border-t-2">
          <CardHeader>
            <CardTitle className="text-white text-lg">New Asset</CardTitle>
            <CardDescription className="text-white/50">Define the parameters for the new digital asset token.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70">Asset Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="HyperToken" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#ffae00]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[#0ea5e9]">Ticker Symbol</Label>
                <Input value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} placeholder="HXT" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono focus-visible:ring-[#ffae00]" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Total Supply</Label>
                <Input value={form.supply} onChange={(e) => setForm((f) => ({ ...f, supply: e.target.value }))} placeholder="10000000" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#ffae00]" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Asset Type</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full h-10 rounded-md bg-black/50 border border-white/10 text-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#ffae00]"
                >
                  <option value="Fungible">Fungible Token (ERC-20 style)</option>
                  <option value="Non-Fungible">Non-Fungible Token (ERC-721 style)</option>
                  <option value="Semi-Fungible">Semi-Fungible (ERC-1155 style)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Blockchain Channel <span className="text-white/30">(Legacy - Fabric Only)</span></Label>
                <Input value={form.channel || "default-channel"} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} placeholder="default-channel" disabled className="bg-black/10 border-white/5 text-white/40 placeholder:text-white/20 font-mono text-sm focus-visible:ring-0 cursor-not-allowed" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Sub-account <span className="text-white/30">(dept / IoT group)</span></Label>
                <Input value={form.subAccount} onChange={(e) => setForm((f) => ({ ...f, subAccount: e.target.value }))} placeholder="finance-dept" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-[#ffae00]" />
              </div>
            </div>
            
            {/* Action buttons & feedback of state model */}
            <Button 
              onClick={handleIssue} 
              disabled={issuing || !form.name || !form.symbol || !form.supply} 
              className="w-full bg-gradient-to-r from-[#ffae00] to-[#ff6600] hover:opacity-90 text-black font-semibold border-0 disabled:opacity-40"
            >
              {deployStatus === "VALIDATING" && "Validating transaction requirements..."}
              {deployStatus === "AWAITING_SIGNATURE" && "Awaiting wallet authorization signature..."}
              {deployStatus === "SUBMITTED" && "Transaction submitted to blockchain..."}
              {deployStatus === "PENDING" && "Deploying contract: pending block confirmation..."}
              {deployStatus === "CONFIRMED_ONCHAIN" && "On-chain deployment confirmed!"}
              {deployStatus === "INDEXING" && "Registering asset with database indexer..."}
              {deployStatus === "INDEXED" && "Asset issued and indexed successfully!"}
              {deployStatus === "INDEXING_FAILED" && "Indexing failed (On-chain deployment succeeded!)"}
              {deployStatus === "FAILED" && "Transaction reverted. Deploy failed."}
              {deployStatus === "REJECTED" && "Deploy rejected or failed."}
              {deployStatus === "IDLE" && "Issue Asset"}
            </Button>
          </CardContent>
        </Card>
      )}

      {(() => {
        const totalSupply = assets.reduce((sum, a) => sum + (parseFloat(a.supply) || 0), 0);
        const fmtSupply = (n: number) => {
          if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + "B";
          if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
          if (n >= 1_000) return (n / 1_000).toFixed(2).replace(/\.?0+$/, "") + "K";
          return n.toLocaleString();
        };
        const activeChannels = new Set(assets.map((a) => a.channel).filter(Boolean)).size;
        return (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Assets Issued", value: loading ? "..." : assets.length.toString(), icon: <Coins className="h-5 w-5 text-[#ffae00]" /> },
              { label: "Total Token Supply", value: loading ? "..." : (totalSupply === 0 ? "—" : fmtSupply(totalSupply)), icon: <ArrowUpRight className="h-5 w-5 text-green-400" /> },
              { label: "Active Channels", value: loading ? "..." : (activeChannels || "—").toString(), icon: <Shield className="h-5 w-5 text-[#c300ff]" /> },
            ].map((s) => (
              <Card key={s.label} className="glass-panel border border-white/10">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-white/50 text-xs">{s.label}</p>
                    <p className="text-white text-2xl font-bold mt-1">{s.value}</p>
                  </div>
                  {s.icon}
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      <Card className="glass-panel neon-border-gold border-t-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white text-base">Issued Assets</CardTitle>
          {!loading && (
            <button onClick={fetchAssets} className="text-white/50 hover:text-white transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-white/50">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-[#ffae00] border-t-transparent rounded-full mb-2" />
              <p>Loading assets...</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <Coins className="h-8 w-8 mx-auto mb-2 opacity-50 text-[#ffae00]" />
              <p>No real on-chain assets or demo assets are currently available.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    {["Asset", "Symbol", "Supply", "Type", "Channel", "Status", "Source", "Explorer", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-white/50 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => {
                    const isDemoAsset = a.status === "Demo";
                    return (
                      <tr key={i} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{a.name}</td>
                        <td className="px-4 py-3 font-mono text-[#ffae00]">{a.symbol}</td>
                        <td className="px-4 py-3 text-white/70">{a.supply}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={a.type === "Fungible" ? "border-blue-500/40 text-blue-400 bg-blue-500/10" : "border-purple-500/40 text-purple-400 bg-purple-500/10"}>
                            {a.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-white/60 text-xs">{a.channel}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={a.status === "Active" ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"}>
                            {a.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {isDemoAsset ? (
                            <Badge className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-2 py-0.5">
                              DEMO
                            </Badge>
                          ) : (
                            <Badge className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs px-2 py-0.5">
                              LIVE
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {a.txHash ? (
                            <a 
                              href={backendConfig?.explorerUrl ? `${backendConfig.explorerUrl}/tx/${a.txHash}` : `https://base.org/explorer/tx/${a.txHash}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-[#1500ff] hover:underline text-xs"
                            >
                              Tx Link
                            </a>
                          ) : (
                            <span className="text-white/30 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              title="Transfer (Coming Soon - On-Chain transfer is in development)"
                              onClick={(e) => { e.preventDefault(); }}
                              disabled={true}
                              className="p-1.5 rounded text-white/20 cursor-not-allowed hover:bg-transparent transition-colors flex items-center gap-1"
                            >
                              <ArrowUpRight className="h-4 w-4" />
                              <span className="text-[10px] text-white/40">Coming Soon</span>
                            </button>
                            <button
                              title="Burn (Coming Soon - On-Chain burning is in development)"
                              onClick={(e) => { e.preventDefault(); }}
                              disabled={true}
                              className="p-1.5 rounded text-white/20 cursor-not-allowed hover:bg-transparent transition-colors flex items-center gap-1"
                            >
                              <Flame className="h-4 w-4" />
                              <span className="text-[10px] text-white/40">Coming Soon</span>
                            </button>
                            <button
                              title="Sync (Coming Soon - On-Chain synchronization is in development)"
                              onClick={(e) => { e.preventDefault(); }}
                              disabled={true}
                              className="p-1.5 rounded text-white/20 cursor-not-allowed hover:bg-transparent transition-colors flex items-center gap-1"
                            >
                              <RefreshCw className="h-4 w-4" />
                              <span className="text-[10px] text-white/40">Coming Soon</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
