import React, { useState, useEffect } from "react";
import { Trophy, TrendingUp, TrendingDown, Target, Zap, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

const FALLBACK_EVENTS = [
  { home: "Lakers", away: "Celtics", sport: "NBA", homeOdds: 1.85, awayOdds: 1.95, drawOdds: null as number | null, status: "Live", time: "Q3 08:42" },
  { home: "Man City", away: "Arsenal", sport: "EPL", homeOdds: 1.70, awayOdds: 2.10, drawOdds: 3.50 as number | null, status: "Live", time: "67'" },
  { home: "Djokovic", away: "Alcaraz", sport: "Tennis", homeOdds: 1.55, awayOdds: 2.40, drawOdds: null as number | null, status: "Starting", time: "In 15 min" },
];

const MY_POSITIONS_DEFAULT = [
  { event: "Lakers vs Celtics", pick: "Lakers", stake: "0.5 ETH", odds: 1.85, pnl: "+0.425 ETH", status: "Open" },
  { event: "Man City vs Arsenal", pick: "Draw", stake: "0.2 ETH", odds: 3.50, pnl: "-0.2 ETH", status: "Open" },
];

export default function SportsTradingPage() {
  const [liveEvents, setLiveEvents] = useState(FALLBACK_EVENTS);
  const [myPositions, setMyPositions] = useState(MY_POSITIONS_DEFAULT);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<typeof FALLBACK_EVENTS[0] | null>(null);
  const [pick, setPick] = useState<"home" | "away" | "draw" | null>(null);
  const [stake, setStake] = useState("");
  const [leverage, setLeverage] = useState("1");
  const [isPlacing, setIsPlacing] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const handlePlaceTrade = async () => {
    if (!selectedEvent || !pick || !stake) {
      setTradeError("Please select an event, pick, and enter a stake.");
      return;
    }
    try {
      setIsPlacing(true);
      setTradeError(null);
      const potentialPayout = (parseFloat(stake) * (pick === "home" ? selectedEvent.homeOdds : pick === "away" ? selectedEvent.awayOdds : (selectedEvent.drawOdds ?? 1)) * parseFloat(leverage)).toFixed(4);
      const response = await fetch("/api/paper/trades/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeType: "SPORTS_PREDICTION",
          event: `${selectedEvent.home} vs ${selectedEvent.away}`,
          pick: pick === "home" ? selectedEvent.home : pick === "away" ? selectedEvent.away : "Draw",
          stake: stake,
          odds: pick === "home" ? selectedEvent.homeOdds : pick === "away" ? selectedEvent.awayOdds : selectedEvent.drawOdds,
          leverage: leverage,
          potentialPayout: potentialPayout,
          channel: "sports-trading"
        })
      });
      if (!response.ok) throw new Error("Failed to place trade");
      const newPosition = {
        event: `${selectedEvent.home} vs ${selectedEvent.away}`,
        pick: pick === "home" ? selectedEvent.home : pick === "away" ? selectedEvent.away : "Draw",
        stake: `${stake} ETH`,
        odds: pick === "home" ? selectedEvent.homeOdds : pick === "away" ? selectedEvent.awayOdds : (selectedEvent.drawOdds ?? 1),
        pnl: "+0 ETH",
        status: "Open"
      };
      setMyPositions(p => [...p, newPosition]);
      setSelectedEvent(null);
      setPick(null);
      setStake("");
      setLeverage("1");
      setTimeout(() => setTradeError(null), 2500);
    } catch (err: any) {
      setTradeError(err?.message ?? "Failed to place trade. Try again.");
    } finally {
      setIsPlacing(false);
    }
  };

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch("/api/live/sports-events");
        if (!response.ok) throw new Error("No live events");
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setLiveEvents(data.map((e: any) => ({
            home: e.home || e.homeTeam || "Home",
            away: e.away || e.awayTeam || "Away",
            sport: e.sport || "Sport",
            homeOdds: e.homeOdds || 1.90,
            awayOdds: e.awayOdds || 1.90,
            drawOdds: e.drawOdds ?? null,
            status: e.status || "Live",
            time: e.time || ""
          })));
        } else {
          setLiveEvents(FALLBACK_EVENTS);
        }
      } catch {
        setLiveEvents(FALLBACK_EVENTS);
      } finally {
        setLoadingEvents(false);
      }
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-400" />
          Sports Trading Engine
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Peer-to-peer sports prediction markets. This module is a simulated demo — no real settlement occurs.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "24h Volume", value: "142 ETH", icon: <Zap className="h-4 w-4 text-yellow-400" /> },
          { label: "Live Events", value: "24", icon: <Target className="h-4 w-4 text-green-400" /> },
          { label: "Open Positions", value: "2", icon: <Clock className="h-4 w-4 text-blue-400" /> },
          { label: "Win Rate", value: "61%", icon: <Trophy className="h-4 w-4 text-yellow-400" /> },
        ].map(s => (
          <Card key={s.label} className="glass-panel border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-white/40 text-xs">{s.label}</p><p className="text-white text-lg font-bold">{s.value}</p></div>
              {s.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Live Events */}
        <div className="space-y-3">
          <p className="text-white/50 text-xs uppercase tracking-wider">Live & Upcoming Events</p>
          {liveEvents.map((e, i) => (
            <Card key={i} onClick={() => { setSelectedEvent(e); setPick(null); }} className={`glass-panel border transition-all cursor-pointer ${selectedEvent === e ? "border-yellow-500/40" : "border-white/10 hover:border-white/20"}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className="border-white/20 text-white/50 text-xs">{e.sport}</Badge>
                  <div className="flex items-center gap-2">
                    {e.status === "Live" && <span className="flex h-2 w-2 rounded-full bg-green-400 animate-ping" />}
                    <span className="text-xs text-white/40">{e.time}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm">{e.home}</span>
                  <span className="text-white/40 text-xs">vs</span>
                  <span className="text-white font-medium text-sm">{e.away}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button onClick={ev => { ev.stopPropagation(); setSelectedEvent(e); setPick("home"); }} className={`py-1.5 rounded text-xs font-medium border transition-all ${selectedEvent === e && pick === "home" ? "border-yellow-500 bg-yellow-500/20 text-yellow-300" : "border-white/10 text-white/60 hover:border-white/30"}`}>{e.homeOdds}</button>
                  {e.drawOdds ? <button onClick={ev => { ev.stopPropagation(); setSelectedEvent(e); setPick("draw"); }} className={`py-1.5 rounded text-xs font-medium border transition-all ${selectedEvent === e && pick === "draw" ? "border-yellow-500 bg-yellow-500/20 text-yellow-300" : "border-white/10 text-white/60 hover:border-white/30"}`}>{e.drawOdds}</button> : <div />}
                  <button onClick={ev => { ev.stopPropagation(); setSelectedEvent(e); setPick("away"); }} className={`py-1.5 rounded text-xs font-medium border transition-all ${selectedEvent === e && pick === "away" ? "border-yellow-500 bg-yellow-500/20 text-yellow-300" : "border-white/10 text-white/60 hover:border-white/30"}`}>{e.awayOdds}</button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trade Panel */}
        <div className="space-y-4">
          <Card className="glass-panel border border-yellow-500/20">
            <CardHeader><CardTitle className="text-white text-base">Place Trade</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {tradeError && (
                <div className="p-3 text-sm rounded bg-red-500/10 border border-red-500/30 text-red-400">
                  ⚠ {tradeError}
                </div>
              )}
              {selectedEvent ? (
                <>
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-white/50 text-xs">Selected Event</p>
                    <p className="text-white font-medium text-sm">{selectedEvent.home} vs {selectedEvent.away}</p>
                    {pick && <p className="text-yellow-400 text-xs mt-1">Pick: <strong>{pick === "home" ? selectedEvent.home : pick === "away" ? selectedEvent.away : "Draw"}</strong> @ {pick === "home" ? selectedEvent.homeOdds : pick === "away" ? selectedEvent.awayOdds : selectedEvent.drawOdds}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Stake (ETH)</Label>
                    <Input disabled={isPlacing} value={stake} onChange={e => setStake(e.target.value)} placeholder="0.5" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-yellow-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">Leverage <span className="text-white/30">(1–5x)</span></Label>
                    <input disabled={isPlacing} type="range" min={1} max={5} value={leverage} onChange={e => setLeverage(e.target.value)} className="w-full accent-yellow-500" />
                    <p className="text-yellow-400 text-sm font-medium text-center">{leverage}x</p>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                    <p className="text-white/50 text-xs mb-1">Potential Payout</p>
                    <p className="text-yellow-400 font-bold text-lg">{stake && pick ? (parseFloat(stake) * (pick === "home" ? selectedEvent.homeOdds : pick === "away" ? selectedEvent.awayOdds : (selectedEvent.drawOdds ?? 1)) * parseFloat(leverage)).toFixed(4) : "—"} ETH</p>
                  </div>
                  <Button onClick={handlePlaceTrade} disabled={!pick || !stake || isPlacing} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold border-0 disabled:opacity-40">
                    {isPlacing ? "Placing Trade..." : "Place Trade (Demo)"}
                  </Button>
                </>
              ) : (
                <p className="text-white/40 text-sm text-center py-6">Select an event and pick to get started.</p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border border-white/10">
            <CardHeader><CardTitle className="text-white text-base">Open Positions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {myPositions.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-4">No open positions yet.</p>
              ) : (
                myPositions.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <div>
                      <p className="text-white text-sm font-medium">{p.pick}</p>
                      <p className="text-white/40 text-xs">{p.event}</p>
                      <p className="text-white/50 text-xs">Stake: {p.stake} @ {p.odds}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${p.pnl.startsWith("+") ? "text-green-400" : "text-red-400"}`}>{p.pnl}</p>
                      <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-xs mt-1">{p.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
