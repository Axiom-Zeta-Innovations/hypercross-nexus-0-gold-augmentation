import React, { useState, useEffect } from "react";
import { TrendingUp, Target, Users, DollarSign, Plus, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";
import { readApiError } from "../lib/readApiError";

interface Campaign {
  name: string;
  token: string;
  hardCap: string;
  raised: string;
  pct: number;
  investors: number;
  endDate: string;
  status: string;
}

export default function TokenFundraisingPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", token: "", hardCap: "", softCap: "", startDate: "", endDate: "", channel: "fundraising-channel", desc: "" });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationResult, setCreationResult] = useState<any>(null);

  const handleCreateCampaign = async () => {
    if (!form.name || !form.token || !form.hardCap) {
      setError("Please fill out required fields.");
      return;
    }
    try {
      setIsCreating(true);
      setError(null);
      const response = await fetch("/api/live/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          symbol: form.token,
          supply: form.hardCap.replace(/[^\d]/g, ""),
          type: "Fundraising Campaign",
          channel: form.channel || "fundraising-channel",
          status: "LIVE",
          chainId: 11155111,
          contractAddress: "0x" + Math.random().toString(16).slice(2, 42).padEnd(40, '0'),
          txHash: "0x" + Math.random().toString(16).slice(2, 66).padEnd(64, '0'),
          blockNumber: 15420311
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readApiError(data, "Campaign creation failed."));
      }
      setCreationResult({
        ...form,
        raised: "0",
        pct: 0,
        investors: 0,
        status: "Pre-launch"
      });
      setTimeout(() => {
        setShowForm(false);
        setForm({ name: "", token: "", hardCap: "", softCap: "", startDate: "", endDate: "", channel: "fundraising-channel", desc: "" });
        setCreationResult(null);
        fetchCampaigns();
      }, 2000);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create campaign.");
    } finally {
      setIsCreating(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/live/assets?channel=fundraising-channel");
      if (!response.ok) throw new Error("Failed to fetch campaigns");
      const data = await response.json();
      
      const campaignData = Array.isArray(data) ? data.map((item: any, idx: number) => ({
        name: item.name || `Campaign ${idx + 1}`,
        token: item.symbol || "TBD",
        hardCap: `$${(Math.random() * 5000000 + 500000).toFixed(0)}`,
        raised: `$${(Math.random() * 3000000 + 100000).toFixed(0)}`,
        pct: Math.floor(Math.random() * 100),
        investors: Math.floor(Math.random() * 300 + 10),
        endDate: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: ["Live", "Completed", "Pre-launch"][Math.floor(Math.random() * 3)]
      })) : [];
      
      setCampaigns(campaignData);
      setError(null);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
      setError("Failed to load fundraising campaigns");
      setCampaigns([
        { name: "HXT Seed Round", token: "HXT", hardCap: "$2,000,000", raised: "$1,240,000", pct: 62, investors: 84, endDate: "2026-04-15", status: "Live" },
        { name: "NexusBond Series A", token: "NXB", hardCap: "$5,000,000", raised: "$5,000,000", pct: 100, investors: 210, endDate: "2026-03-01", status: "Completed" },
        { name: "GreenCredit IDO", token: "GCR", hardCap: "$800,000", raised: "$120,000", pct: 15, investors: 18, endDate: "2026-05-30", status: "Pre-launch" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-green-400" />
            Token Fundraising Module
          </h2>
          <p className="text-white/50 mt-1 text-sm">
            Run compliant token sales (ICO, IDO, private rounds) with automatic allocation tracking. This module is a simulated demo.
          </p>
        </div>
        <Button onClick={() => setShowForm(s => !s)} className="bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-90 text-white border-0 shadow-[0_0_15px_rgba(34,197,94,0.20)]">
          <Plus className="h-4 w-4 mr-2" /> New Campaign
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Raised", value: loading ? "..." : "$6.24M", icon: <DollarSign className="h-5 w-5 text-green-400" /> },
          { label: "Active Campaigns", value: loading ? "..." : "1", icon: <Target className="h-5 w-5 text-blue-400" /> },
          { label: "Total Investors", value: loading ? "..." : "312", icon: <Users className="h-5 w-5 text-purple-400" /> },
          { label: "Avg. Fill Rate", value: loading ? "..." : "59%", icon: <TrendingUp className="h-5 w-5 text-yellow-400" /> },
        ].map(s => (
          <Card key={s.label} className="glass-panel border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-white/50 text-xs">{s.label}</p>
                <p className="text-white text-xl font-bold mt-1">{s.value}</p>
              </div>
              {s.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          ⚠ {error}
        </div>
      )}

      {showForm && (
        <Card className="glass-panel border border-green-500/20 border-t-2 border-t-green-500/60">
          <CardHeader>
            <CardTitle className="text-white text-lg">Create Fundraising Campaign</CardTitle>
            <CardDescription className="text-white/50">Configure a new token sale. This module is a simulated demo — no real investments are recorded on-chain.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm rounded bg-red-500/10 border border-red-500/30 text-red-400">
                ⚠ {error}
              </div>
            )}
            {creationResult && (
              <div className="p-4 rounded bg-green-500/10 border border-green-500/30 text-green-400 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Campaign Created Successfully!</p>
                  <p className="text-sm text-green-300/80">{creationResult.name} ({creationResult.token}) is now live and ready to accept investor commitments.</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70">Campaign Name</Label>
                <Input disabled={isCreating} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="HXT Seed Round" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-green-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Token Symbol</Label>
                <Input disabled={isCreating} value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} placeholder="HXT" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono focus-visible:ring-green-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Hard Cap (USD)</Label>
                <Input disabled={isCreating} value={form.hardCap} onChange={e => setForm(f => ({ ...f, hardCap: e.target.value }))} placeholder="2000000" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-green-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Soft Cap (USD)</Label>
                <Input disabled={isCreating} value={form.softCap} onChange={e => setForm(f => ({ ...f, softCap: e.target.value }))} placeholder="500000" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-green-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Start Date</Label>
                <Input disabled={isCreating} type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="bg-black/50 border-white/10 text-white focus-visible:ring-green-500" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">End Date</Label>
                <Input disabled={isCreating} type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="bg-black/50 border-white/10 text-white focus-visible:ring-green-500" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-white/70">Campaign Category</Label>
                <Input disabled={isCreating} value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} placeholder="fundraising-channel" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowForm(false)} disabled={isCreating} variant="outline" className="flex-1 border-white/10 text-white/70 hover:bg-white/10">Cancel</Button>
              <Button onClick={handleCreateCampaign} disabled={isCreating} className="flex-1 bg-gradient-to-r from-green-600 to-teal-600 hover:opacity-90 text-white border-0 disabled:opacity-45">
                {isCreating ? "Creating..." : "Deploy Campaign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaigns */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-white/50">
            <div className="inline-block animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full mb-2" />
            <p>Loading fundraising campaigns...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No fundraising campaigns found.</p>
          </div>
        ) : (
          campaigns.map((c, i) => (
            <Card key={i} className="glass-panel border border-white/10 hover:border-white/20 transition-all">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white font-semibold text-base">{c.name}</p>
                    <p className="text-white/40 text-sm font-mono">{c.token} · Hard cap {c.hardCap}<SimulationBadge variant="inline" /></p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={c.status === "Live" ? "border-green-500/40 text-green-400 bg-green-500/10" : c.status === "Completed" ? "border-blue-500/40 text-blue-400 bg-blue-500/10" : "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"}>
                      {c.status}
                    </Badge>
                    <div className="flex items-center gap-1 text-white/40 text-xs">
                      <Clock className="h-3.5 w-3.5" />
                      {c.endDate}
                    </div>
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-green-500 to-teal-400 rounded-full transition-all" style={{ width: `${c.pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">Raised: <span className="text-green-400 font-medium">{c.raised}</span><SimulationBadge variant="inline" /></span>
                  <span className="text-white/60">{c.pct}% · <span className="text-white/80">{c.investors} investors</span></span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
