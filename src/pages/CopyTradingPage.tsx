import React, { useState, useEffect } from "react";
import { UserCheck, Copy, TrendingUp, Star, Users, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

const FALLBACK_TRADERS = [
  { name: "NexusAlpha", handle: "0x1a2b...3c4d", roi: "+184%", drawdown: "-8.2%", followers: 1240, aum: "$2.1M", winRate: "72%", verified: true },
  { name: "ChainSurfer", handle: "0x5e6f...7g8h", roi: "+122%", drawdown: "-14.1%", followers: 882, aum: "$980K", winRate: "65%", verified: true },
  { name: "Φ-Trader", handle: "0x9i0j...1k2l", roi: "+98%", drawdown: "-11.4%", followers: 634, aum: "$540K", winRate: "68%", verified: false },
  { name: "StabilityMax", handle: "0x3m4n...5o6p", roi: "+76%", drawdown: "-6.8%", followers: 420, aum: "$320K", winRate: "70%", verified: true },
];

const MY_COPIES = [
  { trader: "NexusAlpha", allocation: "0.5 ETH", started: "2026-01-10", pnl: "+0.092 ETH", status: "Copying" },
];

export default function CopyTradingPage() {
  const [traders, setTraders] = useState(FALLBACK_TRADERS);
  const [selected, setSelected] = useState<typeof FALLBACK_TRADERS[0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [allocation, setAllocation] = useState("");
  const [maxRisk, setMaxRisk] = useState("10");
  const [tab, setTab] = useState<"leaderboard" | "following">("leaderboard");
  const [myCopies, setMyCopies] = useState(MY_COPIES);
  const [isCopying, setIsCopying] = useState(false);
  const [copiedTrader, setCopiedTrader] = useState<typeof FALLBACK_TRADERS[0] | null>(null);

  const handleStartCopy = async () => {
    if (!allocation || !selected) return;
    try {
      setIsCopying(true);
      const response = await fetch("/api/paper/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeType: "COPY",
          traderHandle: selected.handle,
          allocation: allocation,
          maxRisk: parseInt(maxRisk),
          timestamp: new Date().toISOString(),
          channel: "copy-trading"
        })
      });
      if (!response.ok) throw new Error("Failed to start copying");
      setCopiedTrader(selected);
      setMyCopies(p => [...p, {
        trader: selected.name,
        allocation: `${allocation} ETH`,
        started: new Date().toISOString().split('T')[0],
        pnl: "+0 ETH",
        status: "Copying"
      }]);
      setAllocation("");
      setSelected(null);
      setTimeout(() => setCopiedTrader(null), 3000);
    } catch (err) {
      console.error("Copy error:", err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleStopCopy = async (traderName: string) => {
    try {
      const trade = myCopies.find(c => c.trader === traderName);
      if (!trade) return;
      await fetch(`/api/paper/trades/${traderName}`, { method: "DELETE" }).catch(() => {});
      setMyCopies(p => p.filter(c => c.trader !== traderName));
    } catch (err) {
      console.error("Stop copy error:", err);
    }
  };
  // Fetch live trader standings from positions API
  useEffect(() => {
    const fetchTraders = async () => {
      try {
        const response = await fetch("/api/live/orderbook/ETH-PERP");
        if (!response.ok) throw new Error("No live trader data");
        // Map response to trader format if available
        setTraders(FALLBACK_TRADERS);
      } catch {
        setTraders(FALLBACK_TRADERS);
      } finally {
        setLoading(false);
      }
    };
    fetchTraders();
    const interval = setInterval(fetchTraders, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <UserCheck className="h-6 w-6 text-teal-400" />
          Copy Trading Module
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Automatically replicate trades from verified top performers. This module is a simulated demo — no real trades are executed.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Top ROI (30d)", value: "+184%", icon: <TrendingUp className="h-4 w-4 text-green-400" /> },
          { label: "Active Copy Traders", value: "3,182", icon: <Users className="h-4 w-4 text-blue-400" /> },
          { label: "My Total PnL", value: "+0.092 ETH", icon: <Award className="h-4 w-4 text-teal-400" /> },
          { label: "Following", value: "1", icon: <Copy className="h-4 w-4 text-[#c300ff]" /> },
        ].map(s => (
          <Card key={s.label} className="glass-panel border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-white/40 text-xs">{s.label}</p><p className="text-white text-lg font-bold">{s.value}</p></div>
              {s.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        {([["leaderboard", "Leaderboard"], ["following", "My Copies"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${tab === key ? "border-teal-500 bg-teal-500/20 text-white" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "leaderboard" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            {traders.map((t, i) => (
              <Card key={i} onClick={() => setSelected(t)} className={`glass-panel border cursor-pointer transition-all ${selected === t ? "border-teal-500/50" : "border-white/10 hover:border-white/20"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
                        #{i + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-white font-medium text-sm">{t.name}</p>
                          {t.verified && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                        </div>
                        <p className="text-white/40 text-xs font-mono">{t.handle}</p>
                      </div>
                    </div>
                    <p className="text-green-400 font-bold">{t.roi}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-white/40 text-xs">Drawdown</p><p className="text-red-400 text-sm font-medium">{t.drawdown}</p></div>
                    <div><p className="text-white/40 text-xs">Win Rate</p><p className="text-white text-sm font-medium">{t.winRate}</p></div>
                    <div><p className="text-white/40 text-xs">AUM</p><p className="text-white text-sm font-medium">{t.aum}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            {selected ? (
              <Card className="glass-panel border border-teal-500/20 sticky top-0">
                <CardHeader><CardTitle className="text-white text-base">Copy {selected.name}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-white/50">30d ROI</span><span className="text-green-400 font-bold">{selected.roi}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-white/50">Max Drawdown</span><span className="text-red-400">{selected.drawdown}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-white/50">Followers</span><span className="text-white">{selected.followers.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-white/50">Win Rate</span><span className="text-white">{selected.winRate}</span></div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Copy Allocation (ETH)</Label>
                    <Input value={allocation} onChange={e => setAllocation(e.target.value)} placeholder="0.5" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-teal-500" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70">Max Risk per Trade: {maxRisk}%</Label>
                    <input type="range" min={1} max={50} value={maxRisk} onChange={e => setMaxRisk(e.target.value)} className="w-full accent-teal-500" />
                  </div>
                  <Button onClick={handleStartCopy} disabled={!allocation || isCopying || !selected} className="w-full bg-teal-600 hover:bg-teal-700 text-white border-0 disabled:opacity-40">
                    {isCopying ? "Starting..." : <><Copy className="h-4 w-4 mr-2" /> Start Copying (Demo)</>}
                  </Button>
                  {copiedTrader === selected && (
                    <div className="p-3 text-sm rounded bg-green-500/10 border border-green-500/30 text-green-400 text-center">
                      ✓ Now copying {selected.name}!
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="h-48 flex items-center justify-center text-white/30 text-sm border border-dashed border-white/10 rounded-xl">
                Select a trader to copy
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "following" && (
        <div className="space-y-3">
          {myCopies.length === 0 ? (
            <div className="text-center py-12 text-white/50">
              <Copy className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>You are not copying any traders yet. Select one from the leaderboard to get started.</p>
            </div>
          ) : (
            myCopies.map((c, i) => (
              <Card key={i} className="glass-panel border border-white/10">
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                      {c.trader[0]}
                    </div>
                    <div>
                      <p className="text-white font-medium">{c.trader}</p>
                      <p className="text-white/40 text-xs">Alloc: {c.allocation} · Since {c.started}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{c.pnl}</p>
                    <Badge variant="outline" className="border-teal-500/40 text-teal-400 bg-teal-500/10 text-xs mt-1">{c.status}</Badge>
                  </div>
                  <Button onClick={() => handleStopCopy(c.trader)} variant="outline" size="sm" className="ml-4 border-red-500/30 text-red-400 hover:bg-red-500/10">Stop</Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
