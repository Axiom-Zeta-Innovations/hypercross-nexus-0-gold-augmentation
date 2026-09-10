import React, { useState, useEffect } from "react";
import { Landmark, FileCheck, TrendingUp, Lock, Globe, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

interface RWA {
  name: string;
  type: string;
  valuation: string;
  tokens: string;
  yield: string;
  kyc: boolean;
}

const ASSET_CATEGORIES = [
  { label: "Real Estate", color: "border-blue-500/40 text-blue-400 bg-blue-500/10", count: 4 },
  { label: "Commodities", color: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10", count: 2 },
  { label: "Treasury Bills", color: "border-green-500/40 text-green-400 bg-green-500/10", count: 6 },
  { label: "Private Credit", color: "border-purple-500/40 text-purple-400 bg-purple-500/10", count: 1 },
  { label: "Carbon Credits", color: "border-teal-500/40 text-teal-400 bg-teal-500/10", count: 3 },
  { label: "Equipment", color: "border-orange-500/40 text-orange-400 bg-orange-500/10", count: 2 },
];

export default function RWAPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", category: "Real Estate", valuation: "", tokens: "", yield_: "", channel: "" });
  const [rwas, setRwas] = useState<RWA[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Placeholder: real RWA data source not yet integrated
  useEffect(() => {
    const fetchRWAs = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/live/rwa?channel=rwa-channel");
        if (!response.ok) throw new Error("Failed to fetch RWAs");
        const data = await response.json();
        
        const rwaData = Array.isArray(data) ? data.map((item: any, idx: number) => ({
          name: item.name || `RWA Asset ${idx + 1}`,
          type: item.type || "Real Estate",
          valuation: `$${(Math.random() * 4000000 + 500000).toFixed(0)}`,
          tokens: `${Math.floor(Math.random() * 10000 + 100)}`,
          yield: `${(Math.random() * 8 + 2).toFixed(1)}%`,
          kyc: Math.random() > 0.2
        })) : [];
        
        setRwas(rwaData);
        setError(null);
      } catch (err) {
        console.error("Error fetching RWAs:", err);
        setError("Failed to load RWAs");
        setRwas([
          { name: "125 Wall St, NYC", type: "Real Estate", valuation: "$4,200,000", tokens: "4,200", yield: "6.8%", kyc: true },
          { name: "Gold Bar Lot #4422", type: "Commodities", valuation: "$980,000", tokens: "980", yield: "3.1%", kyc: true },
          { name: "US T-Bill 2025-Q3", type: "Treasury Bills", valuation: "$1,000,000", tokens: "10,000", yield: "5.2%", kyc: false },
        ]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRWAs();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchRWAs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Landmark className="h-6 w-6 text-blue-400" />
          Real World Asset Infrastructure
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Tokenize physical and off-chain assets with built-in KYC/AML compliance checks. This module is a simulated demo.
        </p>
      </div>

      {/* Asset Category Pills */}
      <div className="flex flex-wrap gap-3">
        {ASSET_CATEGORIES.map(c => (
          <div key={c.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${c.color}`}>
            {c.label}
            <span className="opacity-60">({c.count})</span>
          </div>
        ))}
      </div>

      {/* Compliance Banner */}
      <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-3">
        <FileCheck className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-300 font-medium text-sm">Compliance & KYC Layer Active</p>
          <p className="text-white/50 text-xs mt-0.5">All RWA token transfers shown here are demo data. Accredited investor checks enforced per Reg D / Reg S in a production deployment.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Tokenization Wizard */}
        <Card className="glass-panel border border-blue-500/20 border-t-2 border-t-blue-500/60">
          <CardHeader>
            <CardTitle className="text-white text-base">Tokenize a New Asset</CardTitle>
            <CardDescription className="text-white/50 text-xs">Step {step + 1} of 3 — {["Asset Details", "Valuation & Supply", "Compliance & Deploy"][step]}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label className="text-white/70">Asset Name / Description</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="125 Wall St Suite 400" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Asset Category</Label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-10 rounded-md bg-black/50 border border-white/10 text-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                    {ASSET_CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label className="text-white/70">Appraised Valuation (USD)</Label>
                  <Input value={form.valuation} onChange={e => setForm(f => ({ ...f, valuation: e.target.value }))} placeholder="4200000" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Token Supply (fractions)</Label>
                  <Input value={form.tokens} onChange={e => setForm(f => ({ ...f, tokens: e.target.value }))} placeholder="4200" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Expected Annual Yield %</Label>
                  <Input value={form.yield_} onChange={e => setForm(f => ({ ...f, yield_: e.target.value }))} placeholder="6.8" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-blue-500" />
                </div>
              </>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                  <FileCheck className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-green-400 text-sm font-medium">KYC Module</p>
                    <p className="text-white/40 text-xs">Enabled — transfers restricted to verified wallets</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                  <Globe className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-green-400 text-sm font-medium">Jurisdictions</p>
                    <p className="text-white/40 text-xs">US (Reg D 506c) · EU (MiCA) · Singapore (MAS)</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Asset Category</Label>
                  <Input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} placeholder="rwa-channel" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-blue-500" />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {step > 0 && <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1 border-white/10 text-white/70 hover:bg-white/10">Back</Button>}
              <Button onClick={() => setStep(s => Math.min(s + 1, 2))} disabled={step === 2 && !form.channel} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-0 disabled:opacity-40">
                {step < 2 ? "Next →" : "Submit (Demo)"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="space-y-4">
          {[
            { label: "Total RWA Value Locked", value: "$6.18M", sub: "across 18 tokenized assets", icon: <Lock className="h-5 w-5 text-blue-400" /> },
            { label: "Avg. Annual Yield", value: "5.4%", sub: "weighted by TVL", icon: <TrendingUp className="h-5 w-5 text-green-400" /> },
            { label: "Pending KYC Reviews", value: "3", sub: "investor verifications", icon: <AlertCircle className="h-5 w-5 text-yellow-400" /> },
          ].map(s => (
            <Card key={s.label} className="glass-panel border border-white/10">
              <CardContent className="p-4 flex items-center gap-4">
                {s.icon}
                <div>
                  <p className="text-white/50 text-xs">{s.label}</p>
                  <p className="text-white text-xl font-bold">{s.value}</p>
                  <p className="text-white/30 text-xs">{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* RWA Portfolio */}
      <Card className="glass-panel border border-blue-500/20 border-t-2 border-t-blue-500/60">
        <CardHeader><CardTitle className="text-white text-base">Tokenized Asset Portfolio</CardTitle></CardHeader>
        <CardContent>
          {error && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm mb-4">
              ⚠ {error}
            </div>
          )}
          {loading ? (
            <div className="text-center py-8 text-white/50">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2" />
              <p>Loading RWA assets...</p>
            </div>
          ) : rwas.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <Landmark className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No RWA assets found.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>{["Asset", "Category", "Valuation", "Tokens", "Yield", "KYC Required"].map(h => <th key={h} className="px-4 py-3 text-left text-white/50 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rwas.map((r, i) => (
                    <tr key={i} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{r.name}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-xs">{r.type}</Badge></td>
                      <td className="px-4 py-3 text-white/70">{r.valuation}<SimulationBadge variant="inline" /></td>
                      <td className="px-4 py-3 text-white/70">{r.tokens}</td>
                      <td className="px-4 py-3 text-green-400 font-medium">{r.yield}<SimulationBadge variant="inline" /></td>
                      <td className="px-4 py-3">{r.kyc ? <Badge variant="outline" className="border-green-500/40 text-green-400 bg-green-500/10 text-xs">Enforced</Badge> : <Badge variant="outline" className="border-white/20 text-white/40 text-xs">Optional</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
