import React, { useState, useEffect } from "react";
import { ImageIcon, Tag, Percent, Plus, ShoppingCart, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimulationBadge } from "@/components/SimulationBadge";

interface NFT {
  name: string;
  collection: string;
  price: string;
  royalty: string;
  owner: string;
  status: string;
}

const REVENUE_MODEL = [
  { label: "Platform Fee", value: "2.5%", desc: "On every sale through the marketplace" },
  { label: "Creator Royalty", value: "Up to 15%", desc: "Configurable per collection, enforced on-chain" },
  { label: "Minting Fee", value: "0.001 ETH", desc: "One-time fee per NFT minted" },
  { label: "Listing Fee", value: "Free", desc: "No charge to list on the marketplace" },
];

export default function NFTMarketplacePage() {
  const [tab, setTab] = useState<'browse' | 'mint' | 'revenue'>('browse');
  const [form, setForm] = useState({ name: "", collection: "", royalty: "", channel: "", desc: "" });
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Placeholder: real NFT indexing not yet integrated
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/live/nft?channel=nft-channel");
        if (!response.ok) throw new Error("Failed to fetch NFTs");
        const data = await response.json();
        
        // Transform data into UI format
        const nftData = Array.isArray(data) ? data.map((item: any, idx: number) => ({
          name: item.name || `NFT #${idx + 1}`,
          collection: item.collection || "Collection",
          price: `${(Math.random() * 3 + 0.1).toFixed(2)} ETH`,
          royalty: `${Math.random() * 15}%`,
          owner: item.owner || "0x1a2b...3c4d",
          status: Math.random() > 0.3 ? "Listed" : "Sold"
        })) : [];
        
        setNfts(nftData);
        setError(null);
      } catch (err) {
        console.error("Error fetching NFTs:", err);
        setError("Failed to load NFTs");
        // Use fallback data
        setNfts([
          { name: "Nexus Genesis #001", collection: "Nexus Genesis", price: "2.4 ETH", royalty: "8%", owner: "0x1a2b...3c4d", status: "Listed" },
          { name: "HyperNode Alpha", collection: "HyperNodes", price: "0.85 ETH", royalty: "5%", owner: "0x5e6f...7g8h", status: "Listed" },
          { name: "Chain Chaos #042", collection: "Chain Chaos", price: "1.1 ETH", royalty: "10%", owner: "0x9i0j...1k2l", status: "Sold" },
          { name: "Stability Wave #7", collection: "Stability Waves", price: "0.32 ETH", royalty: "7.5%", owner: "0x3m4n...5o6p", status: "Listed" },
        ]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchNFTs();
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchNFTs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SimulationBadge />
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <ImageIcon className="h-6 w-6 text-[#c300ff]" />
          NFT Marketplace
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Mint, list, and trade NFTs. This module is a simulated demo — creator royalty enforcement shown here is illustrative only.
        </p>
      </div>

      <div className="flex gap-2">
        {([["browse", "Browse"], ["mint", "Mint NFT"], ["revenue", "Revenue Model"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${tab === key ? "border-[#c300ff] bg-[#c300ff]/20 text-white" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <>
          {error && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              ⚠ {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-2">
            {[
              { label: "Total Volume", value: loading ? "..." : "142.6 ETH", icon: <Tag className="h-5 w-5 text-[#c300ff]" /> },
              { label: "NFTs Listed", value: loading ? "..." : nfts.filter(n => n.status === "Listed").length.toString(), icon: <ImageIcon className="h-5 w-5 text-blue-400" /> },
              { label: "Platform Revenue", value: loading ? "..." : "3.57 ETH", icon: <Percent className="h-5 w-5 text-[#ffae00]" /> },
            ].map(s => (
              <Card key={s.label} className="glass-panel border border-white/10">
                <CardContent className="p-4 flex items-center justify-between">
                  <div><p className="text-white/50 text-xs">{s.label}</p><p className="text-white text-xl font-bold mt-1">{s.value}</p></div>
                  {s.icon}
                </CardContent>
              </Card>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-white/50">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-[#c300ff] border-t-transparent rounded-full mb-2" />
              <p>Loading NFTs...</p>
            </div>
          ) : nfts.length === 0 ? (
            <div className="text-center py-12 text-white/50">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No NFTs found in the marketplace.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {nfts.map((n, i) => (
                <Card key={i} className="glass-panel border border-white/10 hover:border-[#c300ff]/40 transition-all group">
                  <CardContent className="p-5">
                    <div className="aspect-square rounded-lg bg-gradient-to-br from-[#1500ff]/20 to-[#c300ff]/20 border border-white/10 flex items-center justify-center mb-4 group-hover:shadow-[0_0_20px_rgba(195,0,255,0.15)] transition-all">
                      <ImageIcon className="h-12 w-12 text-white/20" />
                    </div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-white font-semibold text-sm">{n.name}</p>
                        <p className="text-white/40 text-xs">{n.collection}</p>
                      </div>
                      <Badge variant="outline" className={n.status === "Listed" ? "border-green-500/40 text-green-400 bg-green-500/10 text-xs" : "border-white/20 text-white/40 text-xs"}>
                        {n.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <p className="text-white/40 text-xs">Price</p>
                        <p className="text-[#c300ff] font-bold">{n.price}<SimulationBadge variant="inline" /></p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/40 text-xs">Royalty</p>
                        <p className="text-white/70 text-sm">{n.royalty}</p>
                      </div>
                    </div>
                    {n.status === "Listed" && (
                      <Button className="w-full mt-3 bg-[#c300ff]/20 hover:bg-[#c300ff]/30 text-white border border-[#c300ff]/30 text-sm">
                        <ShoppingCart className="h-3.5 w-3.5 mr-2" /> Buy Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mint' && (
        <Card className="glass-panel border border-[#c300ff]/20 border-t-2 border-t-[#c300ff]/60">
          <CardHeader>
            <CardTitle className="text-white text-lg">Mint New NFT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70">NFT Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nexus Genesis #005" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#c300ff]" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Collection</Label>
                <Input value={form.collection} onChange={e => setForm(f => ({ ...f, collection: e.target.value }))} placeholder="Nexus Genesis" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#c300ff]" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Creator Royalty %</Label>
                <Input value={form.royalty} onChange={e => setForm(f => ({ ...f, royalty: e.target.value }))} placeholder="8" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#c300ff]" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Collection Category</Label>
                <Input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} placeholder="nft-channel" className="bg-black/50 border-white/10 text-white placeholder:text-white/30 font-mono text-sm focus-visible:ring-[#c300ff]" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-white/70">Description / Metadata</Label>
                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Enter NFT metadata description..." rows={3} className="w-full rounded-md bg-black/50 border border-white/10 text-white placeholder:text-white/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#c300ff] resize-none" />
              </div>
            </div>
            <Button className="w-full bg-gradient-to-r from-[#c300ff] to-[#1500ff] hover:opacity-90 text-white border-0 shadow-[0_0_15px_rgba(195,0,255,0.20)]">
              <Plus className="h-4 w-4 mr-2" /> Mint NFT (Demo)
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'revenue' && (
        <div className="space-y-4">
          <p className="text-white/50 text-sm">The NFT marketplace revenue model shown here (creator/platform split) is illustrative only in this demo module.</p>
          <div className="grid grid-cols-2 gap-4">
            {REVENUE_MODEL.map(r => (
              <Card key={r.label} className="glass-panel border border-[#c300ff]/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-4 w-4 text-[#c300ff]" />
                    <p className="text-white font-medium">{r.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-[#c300ff] mb-1">{r.value}</p>
                  <p className="text-white/40 text-xs">{r.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
