import React, { useState, useEffect } from "react";
import { BarChart2, TrendingUp, TrendingDown, Layers, DollarSign, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

interface Instrument {
  name: string;
  type: string;
  price: string;
  change: string;
  oi: string;
  funding: string;
}

interface Position {
  instrument: string;
  side: string;
  size: string;
  entry: string;
  liq: string;
  pnl: string;
  leverage: string;
}

export default function DerivativesPage() {
  const [instrument, setInstrument] = useState("ETH-PERP");
  const [side, setSide] = useState<"Long" | "Short">("Long");
  const [size, setSize] = useState("");
  const [leverage, setLeverage] = useState("1");
  const [tab, setTab] = useState<"market" | "limit">("market");
  const [price, setPrice] = useState("");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch live market prices from CoinGecko
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/live/market-prices?symbols=ethereum,bitcoin");
        if (!response.ok) throw new Error("Failed to fetch prices");
        const prices = await response.json();
        
        // Transform price data into instruments
        const instrumentsData: Instrument[] = [
          {
            name: "ETH-PERP",
            type: "Perpetual",
            price: `$${(prices.ethereum?.usd || 3421.80).toFixed(2)}`,
            change: "+2.4%",
            oi: "$84M",
            funding: "0.01%"
          },
          {
            name: "BTC-PERP",
            type: "Perpetual",
            price: `$${(prices.bitcoin?.usd || 67240).toFixed(2)}`,
            change: "-0.8%",
            oi: "$210M",
            funding: "-0.003%"
          },
          {
            name: "ETH-CALL-4000-JUN26",
            type: "Option",
            price: "$142.50",
            change: "+12.1%",
            oi: "$18M",
            funding: "—"
          },
          {
            name: "BTC-PUT-65000-JUN26",
            type: "Option",
            price: "$380.00",
            change: "-5.3%",
            oi: "$31M",
            funding: "—"
          },
        ];
        
        setInstruments(instrumentsData);
        
        // Mock positions data (in real implementation, fetch from /api/live/positions)
        setPositions([
          { instrument: "ETH-PERP", side: "Long", size: "5 ETH", entry: "$3,210.00", liq: "$2,568.00", pnl: "+$1,059", leverage: "5x" },
          { instrument: "BTC-PUT-65000-JUN26", side: "Long", size: "2 contracts", entry: "$402.00", liq: "0", pnl: "-$44", leverage: "1x" },
        ]);
        
        setError(null);
      } catch (err) {
        console.error("Error fetching market data:", err);
        setError("Failed to load market data");
        // Use fallback data
        const defaultInstruments: Instrument[] = [
          { name: "ETH-PERP", type: "Perpetual", price: "$3,421.80", change: "+2.4%", oi: "$84M", funding: "0.01%" },
          { name: "BTC-PERP", type: "Perpetual", price: "$67,240.00", change: "-0.8%", oi: "$210M", funding: "-0.003%" },
          { name: "ETH-CALL-4000-JUN26", type: "Option", price: "$142.50", change: "+12.1%", oi: "$18M", funding: "—" },
          { name: "BTC-PUT-65000-JUN26", type: "Option", price: "$380.00", change: "-5.3%", oi: "$31M", funding: "—" },
        ];
        setInstruments(defaultInstruments);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMarketData();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchMarketData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-red-400" />
          Derivatives
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Trade perpetual futures and options with on-chain settlement and margin management. This module is a simulated demo — no leveraged positions are opened on-chain.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          ⚠ {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "24h Volume", value: "$1.2B", icon: <DollarSign className="h-4 w-4 text-green-400" /> },
          { label: "Open Interest", value: "$343M", icon: <Layers className="h-4 w-4 text-blue-400" /> },
          { label: "My Margin", value: "$4,820", icon: <Activity className="h-4 w-4 text-[#c300ff]" /> },
          { label: "Unrealized PnL", value: "+$1,015", icon: <TrendingUp className="h-4 w-4 text-green-400" /> },
        ].map(s => (
          <Card key={s.label} className="glass-panel border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-white/40 text-xs">{s.label}</p><p className="text-white text-lg font-bold">{s.value}</p></div>
              {s.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Instruments */}
        <div className="col-span-2 space-y-3">
          <p className="text-white/50 text-xs uppercase tracking-wider">Instruments</p>
          {loading ? (
            <div className="text-center py-8 text-white/50">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-red-500 border-t-transparent rounded-full mb-2" />
              <p>Loading instruments...</p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/5">
                  <tr>{["Instrument", "Type", "Price", "24h", "Open Interest", "Funding"].map(h => <th key={h} className="px-4 py-3 text-left text-white/50 font-medium text-xs">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {instruments.map((ins, i) => (
                    <tr key={i} onClick={() => setInstrument(ins.name)} className={`border-t border-white/10 cursor-pointer transition-colors ${instrument === ins.name ? "bg-red-500/5" : "hover:bg-white/5"}`}>
                      <td className="px-4 py-3 text-white font-mono font-medium">{ins.name}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={ins.type === "Perpetual" ? "border-red-500/40 text-red-400 bg-red-500/10 text-xs" : "border-purple-500/40 text-purple-400 bg-purple-500/10 text-xs"}>{ins.type}</Badge></td>
                      <td className="px-4 py-3 text-white">{ins.price}<SimulationBadge variant="inline" /></td>
                      <td className={`px-4 py-3 font-medium ${ins.change.startsWith("+") ? "text-green-400" : "text-red-400"}`}>{ins.change}</td>
                      <td className="px-4 py-3 text-white/60">{ins.oi}</td>
                      <td className="px-4 py-3 text-white/60 font-mono text-xs">{ins.funding}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Positions */}
          <p className="text-white/50 text-xs uppercase tracking-wider mt-4">Open Positions</p>
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>{["Instrument", "Side", "Size", "Entry", "Liq.", "PnL", "Leverage"].map(h => <th key={h} className="px-4 py-3 text-left text-white/50 font-medium text-xs">{h}</th>)}</tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={i} className="border-t border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-mono text-xs">{p.instrument}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className={p.side === "Long" ? "border-green-500/40 text-green-400 bg-green-500/10 text-xs" : "border-red-500/40 text-red-400 bg-red-500/10 text-xs"}>{p.side}</Badge></td>
                    <td className="px-4 py-3 text-white/70 text-xs">{p.size}</td>
                    <td className="px-4 py-3 text-white/70 text-xs font-mono">{p.entry}</td>
                    <td className="px-4 py-3 text-red-400 text-xs font-mono">{p.liq}</td>
                    <td className={`px-4 py-3 font-bold text-xs ${p.pnl.startsWith("+") ? "text-green-400" : "text-red-400"}`}>{p.pnl}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{p.leverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Panel */}
        <Card className="glass-panel border border-red-500/20">
          <CardHeader><CardTitle className="text-white text-base">{instrument}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(["market", "limit"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 rounded text-xs font-medium border capitalize transition-all ${tab === t ? "border-red-500 bg-red-500/20 text-white" : "border-white/10 text-white/40 hover:border-white/20"}`}>{t}</button>
              ))}
            </div>
            <div className="flex gap-2">
              {(["Long", "Short"] as const).map(s => (
                <button key={s} onClick={() => setSide(s)} className={`flex-1 py-2 rounded text-sm font-semibold border transition-all ${side === s ? s === "Long" ? "border-green-500 bg-green-500/20 text-green-300" : "border-red-500 bg-red-500/20 text-red-300" : "border-white/10 text-white/40 hover:border-white/20"}`}>
                  {s === "Long" ? <TrendingUp className="h-4 w-4 inline mr-1" /> : <TrendingDown className="h-4 w-4 inline mr-1" />}{s}
                </button>
              ))}
            </div>
            {tab === "limit" && (
              <div className="space-y-2">
                <Label className="text-white/70 text-xs">Limit Price (USD)</Label>
                <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="3400.00" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 text-sm focus-visible:ring-red-500" />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-white/70 text-xs">Size</Label>
              <Input value={size} onChange={e => setSize(e.target.value)} placeholder="1.0" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 text-sm focus-visible:ring-red-500" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70 text-xs">Leverage {leverage}x</Label>
              <input type="range" min={1} max={20} value={leverage} onChange={e => setLeverage(e.target.value)} className="w-full accent-red-500" />
              <div className="flex justify-between text-xs text-white/30"><span>1x</span><span>20x</span></div>
            </div>
            <Button className={`w-full font-semibold border-0 text-white ${side === "Long" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
              {side} {instrument}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
