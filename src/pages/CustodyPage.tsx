import React, { useState } from "react";
import { KeyRound, Shield, Lock, Eye, EyeOff, ArrowUpRight, Users, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

const VAULT_ASSETS = [
  { asset: "Bitcoin", symbol: "BTC", balance: "4.2180", usd: "$283,610", network: "Bitcoin", custody: "Multi-sig 2/3" },
  { asset: "Ethereum", symbol: "ETH", balance: "82.40", usd: "$281,989", network: "Ethereum", custody: "MPC Wallet" },
  { asset: "HyperToken", symbol: "HXT", balance: "500,000", usd: "$62,500", network: "Demo Network", custody: "HSM" },
  { asset: "NexusBond", symbol: "NXB", balance: "12,000", usd: "$14,400", network: "Demo Network", custody: "HSM" },
];

const SIGNERS = [
  { name: "Primary Key (HSM)", type: "Hardware", status: "Active", lastUsed: "2026-03-28" },
  { name: "Recovery Key (Cold)", type: "Cold Storage", status: "Standby", lastUsed: "2026-01-12" },
  { name: "Admin Key (Ledger)", type: "Hardware", status: "Active", lastUsed: "2026-03-27" },
];

export default function CustodyPage() {
  const [showBalance, setShowBalance] = useState(true);
  const [tab, setTab] = useState<"vault" | "signers" | "withdraw">("vault");
  const [withdrawForm, setWithdrawForm] = useState({ asset: "BTC", to: "", amount: "" });

  const totalUsd = "$642,499";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-[#ffae00]" />
            Custody & Secure Storage
          </h2>
          <p className="text-white/50 mt-1 text-sm">
            Institutional-grade MPC and HSM-backed custody for digital assets. This module is a simulated demo — no real custody operations occur.
          </p>
        </div>
        <button onClick={() => setShowBalance(s => !s)} className="p-2 text-white/40 hover:text-white transition-colors">
          {showBalance ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
      </div>

      {/* Balance Card */}
      <Card className="glass-panel border border-[#ffae00]/20 border-t-2 border-t-[#ffae00]/60">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/50 text-sm">Total Assets Under Custody</p>
              <p className={`text-4xl font-bold text-white mt-1 transition-all ${!showBalance ? "blur-sm select-none" : ""}`}>{totalUsd}</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500/30 bg-green-500/10">
              <Shield className="h-4 w-4 text-green-400" />
              <span className="text-green-400 text-sm font-medium">Secured</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {([["vault", "Vault"], ["signers", "Signers"], ["withdraw", "Withdraw"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${tab === key ? "border-[#ffae00] bg-[#ffae00]/20 text-white" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "vault" && (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>{["Asset", "Balance", "USD Value", "Network", "Custody Type"].map(h => <th key={h} className="px-4 py-3 text-left text-white/50 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {VAULT_ASSETS.map((a, i) => (
                <tr key={i} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#ffae00]/30 to-[#ff6600]/30 flex items-center justify-center text-xs font-bold text-[#ffae00]">{a.symbol[0]}</div>
                      <div><p className="text-white font-medium">{a.asset}</p><p className="text-white/40 text-xs font-mono">{a.symbol}</p></div>
                    </div>
                  </td>
                  <td className={`px-4 py-4 font-mono text-white/80 transition-all ${!showBalance ? "blur-sm select-none" : ""}`}>{a.balance}</td>
                  <td className={`px-4 py-4 text-white font-medium transition-all ${!showBalance ? "blur-sm select-none" : ""}`}>{a.usd}</td>
                  <td className="px-4 py-4"><Badge variant="outline" className="border-white/20 text-white/60 text-xs">{a.network}</Badge></td>
                  <td className="px-4 py-4 flex items-center gap-1 text-white/60 text-xs"><Lock className="h-3.5 w-3.5 text-[#ffae00]" />{a.custody}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "signers" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-[#ffae00]/20 bg-[#ffae00]/5 flex items-start gap-3">
            <Shield className="h-5 w-5 text-[#ffae00] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[#ffae00] font-medium text-sm">Multi-Signature Policy: 2 of 3</p>
              <p className="text-white/50 text-xs mt-0.5">Any withdrawal requires 2 out of 3 authorized signers to approve. This is a demo — no signing events are recorded on any real ledger.</p>
            </div>
          </div>

          {SIGNERS.map((s, i) => (
            <Card key={i} className="glass-panel border border-white/10">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${s.status === "Active" ? "bg-green-500/20 border border-green-500/30" : "bg-white/10 border border-white/10"}`}>
                    <KeyRound className={`h-5 w-5 ${s.status === "Active" ? "text-green-400" : "text-white/40"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{s.name}</p>
                      {s.status === "Active" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                    </div>
                    <p className="text-white/40 text-xs">{s.type} · Last used: {s.lastUsed}</p>
                  </div>
                </div>
                <Badge variant="outline" className={s.status === "Active" ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-white/20 text-white/50"}>
                  {s.status}
                </Badge>
              </CardContent>
            </Card>
          ))}

          <Button className="w-full border border-dashed border-white/20 bg-transparent hover:bg-white/5 text-white/50 hover:text-white">
            <Users className="h-4 w-4 mr-2" /> Add Signer Key
          </Button>
        </div>
      )}

      {tab === "withdraw" && (
        <Card className="glass-panel border border-[#ffae00]/20">
          <CardHeader>
            <CardTitle className="text-white text-base">Initiate Withdrawal</CardTitle>
            <CardDescription className="text-white/50 text-xs">Withdrawals require 2/3 multi-sig approval. Approval request will be sent to all signers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Asset</Label>
              <select value={withdrawForm.asset} onChange={e => setWithdrawForm(f => ({ ...f, asset: e.target.value }))} className="w-full h-10 rounded-md bg-black/50 border border-white/10 text-white px-3 text-sm">
                {VAULT_ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.asset} ({a.symbol})</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Destination Address</Label>
              <Input value={withdrawForm.to} onChange={e => setWithdrawForm(f => ({ ...f, to: e.target.value }))} placeholder="0x... or wallet address" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-[#ffae00]" />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Amount</Label>
              <Input value={withdrawForm.amount} onChange={e => setWithdrawForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#ffae00]" />
            </div>
            <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 flex items-start gap-2">
              <Shield className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-400/80 text-xs">This will initiate a multi-sig approval request. 2 of 3 signers must approve before the withdrawal executes on-chain.</p>
            </div>
            <Button disabled={!withdrawForm.to || !withdrawForm.amount} className="w-full bg-gradient-to-r from-[#ffae00] to-[#ff6600] hover:opacity-90 text-black font-semibold border-0 disabled:opacity-40">
              <ArrowUpRight className="h-4 w-4 mr-2" /> Request Withdrawal Approval
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
