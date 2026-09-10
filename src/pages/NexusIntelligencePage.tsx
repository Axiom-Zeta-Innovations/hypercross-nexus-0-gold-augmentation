import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ShieldAlert, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "../lib/readApiError";

type Analysis = {
  snapshot: { symbol: string; price: number; change24h: number; freshnessMs: number; dataSources: string[] };
  signals: Array<{ type: string; direction: string; score: number; confidence: number; evidence: string[] }>;
  opportunity: { status: string; opportunityScore: number; confidence: number; expectedRisk: number; thesis: string[]; risk: { blockers: string[]; reasons: string[] } };
  proposal: { action: string; confidence: number; riskScore: number; rationale: string[]; warnings: string[]; requiresUserApproval: boolean };
};

export default function NexusIntelligencePage({ accessToken }: { accessToken?: string }) {
  const [symbol, setSymbol] = useState("BTC");
  const [price, setPrice] = useState("60000");
  const [change24h, setChange24h] = useState("4");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ symbol, price: Number(price), change24h: Number(change24h), liquidity: 100000000, volatility24h: 10, dataSources: ["user-supplied-observation"], freshnessMs: 0 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(payload, "Nexus analysis is unavailable."));
      setAnalysis(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nexus analysis is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/70">Hypercross Nexus</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Intelligence Review</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55">Transparent market observation, deterministic analysis, and approval-gated strategy proposals.</p>
        </div>
        <div className="flex items-center gap-2 border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200"><ShieldAlert size={15} /> REVIEW MODE</div>
      </div>

      <Card className="border-white/10 bg-black/30">
        <CardHeader><CardTitle className="text-white">Market Observation</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div><Label className="text-white/60">Symbol</Label><Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="mt-2 border-white/10 bg-white/5" /></div>
          <div><Label className="text-white/60">Price</Label><Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" className="mt-2 border-white/10 bg-white/5" /></div>
          <div><Label className="text-white/60">24h Change %</Label><Input value={change24h} onChange={(event) => setChange24h(event.target.value)} inputMode="decimal" className="mt-2 border-white/10 bg-white/5" /></div>
          <Button onClick={analyze} disabled={loading} className="self-end bg-cyan-500 text-black hover:bg-cyan-300"><Sparkles size={16} />{loading ? "Analyzing..." : "Analyze"}</Button>
        </CardContent>
      </Card>

      {error && <div className="border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"><AlertTriangle className="mr-2 inline" size={16} />{error}</div>}
      {analysis && <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-white/10 bg-black/30"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><Activity size={17} className="text-cyan-300" /> Nexus Analysis</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center"><Metric label="Opportunity" value={analysis.opportunity.opportunityScore.toFixed(1)} /><Metric label="Confidence" value={analysis.opportunity.confidence.toFixed(1)} /><Metric label="Risk" value={analysis.opportunity.expectedRisk.toFixed(1)} /></div>
          {analysis.signals.map((signal) => <div key={signal.type} className="border-t border-white/10 pt-3"><div className="flex justify-between text-white"><span>{signal.type}</span><span className="text-cyan-300">{signal.direction}</span></div><p className="mt-1 text-white/50">{signal.evidence.join(" · ")}</p></div>)}
        </CardContent></Card>
        <Card className="border-white/10 bg-black/30"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><ShieldAlert size={17} className="text-amber-300" /> Risk Assessment</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p className="text-white/60">{analysis.opportunity.risk.reasons.join(" ")}</p>{analysis.opportunity.risk.blockers.length ? analysis.opportunity.risk.blockers.map((blocker) => <p key={blocker} className="text-red-300"><AlertTriangle size={15} className="mr-2 inline" />{blocker}</p>) : <p className="text-emerald-300"><CheckCircle2 size={15} className="mr-2 inline" />No blockers detected.</p>}<p className="text-white/40"><Clock3 size={14} className="mr-2 inline" />Freshness: {analysis.snapshot.freshnessMs}ms · Source: {analysis.snapshot.dataSources.join(", ")}</p></CardContent></Card>
        <Card className="border-cyan-400/20 bg-cyan-400/5"><CardHeader><CardTitle className="text-white">Proposed Action</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="text-2xl font-semibold text-cyan-200">{analysis.proposal.action}</div>{analysis.proposal.rationale.map((reason) => <p key={reason} className="text-white/65">{reason}</p>)}{analysis.proposal.warnings.map((warning) => <p key={warning} className="text-amber-200"><AlertTriangle size={15} className="mr-2 inline" />{warning}</p>)}<div className="border-t border-white/10 pt-3 text-xs uppercase tracking-widest text-amber-200">{analysis.proposal.requiresUserApproval ? "User approval required" : "Invalid proposal"}</div></CardContent></Card>
      </div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-white/10 bg-white/5 p-3"><div className="text-lg font-semibold text-white">{value}</div><div className="mt-1 text-[10px] uppercase tracking-widest text-white/40">{label}</div></div>; }