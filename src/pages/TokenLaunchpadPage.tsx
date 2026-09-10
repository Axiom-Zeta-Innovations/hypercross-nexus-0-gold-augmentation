import React, { useState } from "react";
import { Rocket, Clock, Users, Lock, TrendingUp, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";
import { readApiError } from "../lib/readApiError";

const UPCOMING = [
  { name: "NexusAI Token", symbol: "NAI", raise: "$3M", tge: "2026-04-20", whitelist: 1240, status: "Whitelist Open" },
  { name: "ChainSport Token", symbol: "CST", raise: "$1.5M", tge: "2026-05-01", whitelist: 880, status: "Upcoming" },
];

const VESTING_SCHEDULES = [
  { label: "Team", pct: "15%", cliff: "12 months", vesting: "36 months linear" },
  { label: "Advisors", pct: "5%", cliff: "6 months", vesting: "24 months linear" },
  { label: "Public Sale", pct: "20%", cliff: "0", vesting: "10% TGE, 90% 6mo linear" },
  { label: "Ecosystem", pct: "30%", cliff: "0", vesting: "48 months linear" },
  { label: "Treasury", pct: "20%", cliff: "0", vesting: "DAO governance" },
  { label: "Private Sale", pct: "10%", cliff: "3 months", vesting: "18 months linear" },
];

export default function TokenLaunchpadPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", symbol: "", supply: "", channel: "launchpad-channel" });
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    if (!form.name || !form.symbol || !form.supply) {
      setError("Please fill out all token details.");
      return;
    }
    try {
      setIsLaunching(true);
      setError(null);
      const response = await fetch("/api/live/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          symbol: form.symbol,
          supply: form.supply,
          type: "Fungible",
          channel: form.channel || "launchpad-channel",
          status: "LAUNCHED",
          chainId: 11155111,
          contractAddress: "0x" + Math.random().toString(16).slice(2, 42).padEnd(40, '0'),
          txHash: "0x" + Math.random().toString(16).slice(2, 66).padEnd(64, '0'),
          blockNumber: 15420311
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readApiError(data, "Launch failed."));
      }
      setLaunchResult({
        contractAddress: "0x" + Math.random().toString(16).slice(2, 42).padEnd(40, '0'),
        txHash: "0x" + Math.random().toString(16).slice(2, 66).padEnd(64, '0'),
        blockNumber: 15420311,
        name: form.name,
        symbol: form.symbol,
        supply: form.supply
      });
      setStep(3);
    } catch (err: any) {
      setError(err?.message ?? "Failed to deploy launchpad assets.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Rocket className="h-6 w-6 text-orange-400" />
          Token Launchpad Infrastructure
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Launch new tokens with transparent vesting schedules, whitelist management, and on-chain TGE mechanics. This module is a simulated demo.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Tokens Launched", value: "7", icon: <Rocket className="h-5 w-5 text-orange-400" /> },
          { label: "Total TGE Raised", value: "$12.4M", icon: <TrendingUp className="h-5 w-5 text-green-400" /> },
          { label: "Whitelisted Users", value: "3,842", icon: <Users className="h-5 w-5 text-blue-400" /> },
        ].map(s => (
          <Card key={s.label} className="glass-panel border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-white/50 text-xs">{s.label}</p><p className="text-white text-xl font-bold mt-1">{s.value}</p></div>
              {s.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Launch Wizard */}
        <Card className="glass-panel border border-orange-500/20 border-t-2 border-t-orange-500/60">
          <CardHeader>
            <CardTitle className="text-white text-base">Launch New Token</CardTitle>
            <CardDescription className="text-white/50 text-xs">
              {step < 3 ? `Step ${step + 1} of 3 — ${["Token Details", "Tokenomics", "Vesting & Deploy"][step]}` : "Token Deployment Successful!"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm rounded bg-red-500/10 border border-red-500/30 text-red-400">
                ⚠ {error}
              </div>
            )}
            {step === 3 && launchResult && (
              <div className="space-y-3 p-4 rounded bg-green-500/5 border border-green-500/20 text-xs text-white/85">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-400 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Successfully Deployed!
                </div>
                <div className="space-y-1.5 font-mono">
                  <p><span className="text-white/40">Token:</span> {launchResult.name} ({launchResult.symbol})</p>
                  <p><span className="text-white/40">Supply:</span> {Number(launchResult.supply).toLocaleString()}</p>
                  <p className="break-all"><span className="text-white/40">Contract:</span> {launchResult.contractAddress}</p>
                  <p className="break-all"><span className="text-white/40">Tx Hash:</span> {launchResult.txHash}</p>
                  <p><span className="text-white/40">Block:</span> {launchResult.blockNumber}</p>
                </div>
              </div>
            )}
            {step === 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/70">Token Name</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="NexusAI Token" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Symbol</Label>
                  <Input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} placeholder="NAI" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono focus-visible:ring-orange-500" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label className="text-white/70">Total Supply</Label>
                  <Input value={form.supply} onChange={e => setForm(f => ({ ...f, supply: e.target.value }))} placeholder="1000000000" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-500" />
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-white/50 text-xs uppercase tracking-wider">Tokenomics Breakdown</p>
                {VESTING_SCHEDULES.map(v => (
                  <div key={v.label} className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-white/80 text-sm">{v.label}</span>
                    <span className="text-orange-400 font-mono text-sm font-medium">{v.pct}</span>
                  </div>
                ))}
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70">Launch Category</Label>
                  <Input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} placeholder="launchpad-channel" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-orange-500" />
                </div>
                {[
                  "Vesting contract will enforce schedule on-chain",
                  "TGE date triggers automatic unlock tranches",
                  "DAO can adjust ecosystem allocation via governance",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2 text-xs text-white/50">
                    <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {step > 0 && step < 3 && <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1 border-white/10 text-white/70 hover:bg-white/10">Back</Button>}
              {step < 2 ? (
                <Button onClick={() => setStep(s => s + 1)} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0">
                  Next →
                </Button>
              ) : step === 2 ? (
                <Button onClick={handleLaunch} disabled={isLaunching} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0 disabled:opacity-45">
                  {isLaunching ? "Deploying..." : "🚀 Launch Token"}
                </Button>
              ) : (
                <Button onClick={() => { setStep(0); setForm({ name: "", symbol: "", supply: "", channel: "launchpad-channel" }); setLaunchResult(null); }} className="w-full bg-orange-500 hover:opacity-90 text-white border-0">
                  Launch Another Token
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Launches */}
        <div className="space-y-4">
          <p className="text-white/50 text-xs uppercase tracking-wider">Upcoming TGEs</p>
          {UPCOMING.map((u, i) => (
            <Card key={i} className="glass-panel border border-white/10 hover:border-orange-500/30 transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-white font-semibold">{u.name}</p>
                    <p className="text-white/40 font-mono text-sm">{u.symbol}</p>
                  </div>
                  <Badge variant="outline" className={u.status === "Whitelist Open" ? "border-green-500/40 text-green-400 bg-green-500/10 text-xs" : "border-yellow-500/40 text-yellow-400 bg-yellow-500/10 text-xs"}>
                    {u.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-white/40 text-xs">Raise Target</p><p className="text-white font-medium text-sm">{u.raise}<SimulationBadge variant="inline" /></p></div>
                  <div><p className="text-white/40 text-xs flex items-center justify-center gap-1"><Clock className="h-3 w-3" />TGE</p><p className="text-white font-medium text-sm">{u.tge}</p></div>
                  <div><p className="text-white/40 text-xs flex items-center justify-center gap-1"><Users className="h-3 w-3" />Whitelist</p><p className="text-white font-medium text-sm">{u.whitelist.toLocaleString()}</p></div>
                </div>
                <Button className="w-full mt-4 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-sm">
                  <Lock className="h-3.5 w-3.5 mr-2" /> Apply for Whitelist
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
