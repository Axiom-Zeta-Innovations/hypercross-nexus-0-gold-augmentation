import type { ReactNode } from "react";
import { Activity, ArrowUpRight, BadgeDollarSign, Coins, ShieldAlert, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sample = {
  price: 2368.5,
  goldSpot: 2345,
  premium: 1.0,
  change24h: 1.3,
  volatility: 6.2,
  liquidity: "High",
  confidence: 82,
};

export default function MetalsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-300/70">Metals</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Gold Overview</h2>
        </div>
        <div className="flex items-center gap-2 rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <ShieldAlert size={15} /> DEMO / TESTNET
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Current PAXG Price" value={`$${sample.price.toLocaleString()}`} icon={<BadgeDollarSign size={14} />} />
        <Metric label="Gold Spot Reference" value={`$${sample.goldSpot.toLocaleString()}`} icon={<Coins size={14} />} />
        <Metric label="Premium / Discount" value={`${sample.premium.toFixed(2)}%`} icon={<ArrowUpRight size={14} />} />
        <Metric label="24H Change" value={`${sample.change24h.toFixed(1)}%`} icon={<Activity size={14} />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-white/10 bg-black/30">
          <CardHeader><CardTitle className="text-white">Nexus Gold Signal</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-white/70">
            <div className="flex items-center gap-2 text-amber-300"><Sparkles size={16} /> Bullish</div>
            <p>Confidence: {sample.confidence}%</p>
            <p>Factor: PAXG premium to XAU remains within a moderate band.</p>
            <p>Data quality: Acceptable, with live market intelligence required before production execution.</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/30">
          <CardHeader><CardTitle className="text-white">Volatility / Liquidity</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-white/70">
            <p>Volatility: {sample.volatility.toFixed(1)}%</p>
            <p>Liquidity: {sample.liquidity}</p>
            <p>Relationship: Gold and crypto remain in a monitored regime rather than a guaranteed hedging relationship.</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/30">
          <CardHeader><CardTitle className="text-white">Portfolio Exposure</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-white/70">
            <p>PAXG balance: 0.40 oz</p>
            <p>USD value: $945</p>
            <p>Allocation: 16% of portfolio</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <Card className="border-white/10 bg-black/30">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
          <div className="mt-2 text-xl font-medium text-white">{value}</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 p-2 text-amber-300">{icon}</div>
      </CardContent>
    </Card>
  );
}
