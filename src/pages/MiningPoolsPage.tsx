import React, { useState, useEffect } from "react";
import { HardDrive, Zap, Users, DollarSign, Plus, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

interface Pool {
  name: string;
  algo: string;
  hashrate: string;
  workers: number;
  fee: string;
  earnings24h: string;
  status: string;
}

const FALLBACK_POOLS = [
  { name: "Nexus Mining Pool Alpha", algo: "SHA-256", hashrate: "42.8 PH/s", workers: 184, fee: "1.5%", earnings24h: "0.0042 BTC", status: "Active" },
  { name: "HyperCross ETH Pool", algo: "Ethash", hashrate: "820 GH/s", workers: 67, fee: "1.0%", earnings24h: "0.91 ETH", status: "Active" },
  { name: "Demo Testnet Pool", algo: "Custom PoW", hashrate: "12 TH/s", workers: 12, fee: "0%", earnings24h: "—", status: "Test" },
];

export default function MiningPoolsPage() {
  const [showJoin, setShowJoin] = useState(false);
  const [pools, setPools] = useState<Pool[]>(FALLBACK_POOLS);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", algo: "SHA-256", wallet: "", workers: "" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fetchPools = async () => {
      try {
        const response = await fetch("/api/live/mining-stats");
        if (!response.ok) throw new Error("No mining stats");
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          setPools(data.map((pool: any) => ({
            name: pool.name || "Mining Pool",
            algo: pool.algo || "SHA-256",
            hashrate: pool.hashrate || "0 TH/s",
            workers: Number(pool.workers) || 0,
            fee: pool.fee || "1%",
            earnings24h: pool.earnings24h || "—",
            status: pool.status || "Active",
          })));
        } else {
          setPools(FALLBACK_POOLS);
        }
      } catch {
        setPools(FALLBACK_POOLS);
      } finally {
        setLoading(false);
      }
    };

    fetchPools();
    const interval = setInterval(fetchPools, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = async () => {
    setJoining(true);
    await new Promise(r => setTimeout(r, 1200));
    setJoining(false);
    setShowJoin(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <HardDrive className="h-6 w-6 text-gray-400" />
            Mining Pools
          </h2>
          <p className="text-white/50 mt-1 text-sm">
            Connect mining infrastructure to monitored pools. This module is a simulated demo. Earnings and worker stats shown are illustrative only.
          </p>
        </div>
        <Button onClick={() => setShowJoin(s => !s)} className="bg-gray-700 hover:bg-gray-600 text-white border-0">
          <Plus className="h-4 w-4 mr-2" /> Join / Add Pool
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Network Hashrate", value: loading ? "..." : pools.map((pool) => pool.hashrate).join(" · "), icon: <Zap className="h-4 w-4 text-yellow-400" /> },
          { label: "Active Workers", value: loading ? "..." : String(pools.reduce((total, pool) => total + pool.workers, 0)), icon: <HardDrive className="h-4 w-4 text-gray-400" /> },
          { label: "Pools Online", value: loading ? "..." : String(pools.filter((pool) => pool.status === "Active").length), icon: <CheckCircle2 className="h-4 w-4 text-green-400" /> },
          { label: "24h Earnings", value: loading ? "..." : pools.map((pool) => pool.earnings24h).join(" · "), icon: <DollarSign className="h-4 w-4 text-green-400" /> },
        ].map(s => (
          <Card key={s.label} className="glass-panel border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-white/40 text-xs">{s.label}</p><p className="text-white text-lg font-bold">{s.value}</p></div>
              {s.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      {showJoin && (
        <Card className="glass-panel border border-gray-500/20 border-t-2 border-t-gray-500/60">
          <CardHeader>
            <CardTitle className="text-white text-lg">Connect to a Pool</CardTitle>
            <CardDescription className="text-white/50">Add your mining workers and wallet address to start receiving on-chain payouts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70">Pool Name / ID</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nexus Alpha" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-gray-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Mining Algorithm</Label>
                <select value={form.algo} onChange={e => setForm(f => ({ ...f, algo: e.target.value }))} className="w-full h-10 rounded-md bg-black/50 border border-white/10 text-white px-3 text-sm">
                  {["SHA-256", "Ethash", "Scrypt", "RandomX", "Custom PoW"].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-white/70">Payout Wallet Address</Label>
                <Input value={form.wallet} onChange={e => setForm(f => ({ ...f, wallet: e.target.value }))} placeholder="0x..." className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-gray-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Number of Workers</Label>
                <Input value={form.workers} onChange={e => setForm(f => ({ ...f, workers: e.target.value }))} placeholder="10" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-gray-500" />
              </div>
            </div>
            <Button onClick={handleJoin} disabled={joining || !form.name || !form.wallet} className="w-full bg-gray-700 hover:bg-gray-600 text-white border-0 disabled:opacity-40">
              {joining ? <span className="flex items-center gap-2"><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Connecting…</span> : "Connect to Pool"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {pools.map((p, i) => (
          <Card key={i} className="glass-panel border border-white/10 hover:border-gray-500/30 transition-all">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-white font-semibold">{p.name}</p>
                  <p className="text-white/40 text-sm font-mono">{p.algo} · Fee: {p.fee}</p>
                </div>
                <Badge variant="outline" className={p.status === "Active" ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"}>
                  {p.status}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Hashrate", value: p.hashrate, icon: <Zap className="h-4 w-4 text-yellow-400" /> },
                  { label: "Workers", value: String(p.workers), icon: <Users className="h-4 w-4 text-blue-400" /> },
                  { label: "24h Pool Fee", value: p.fee, icon: <DollarSign className="h-4 w-4 text-white/40" /> },
                  { label: "24h Earnings", value: p.earnings24h, icon: <DollarSign className="h-4 w-4 text-green-400" /> },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    {item.icon}
                    <div><p className="text-white/40 text-xs">{item.label}</p><p className="text-white font-medium text-sm">{item.value}</p></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
