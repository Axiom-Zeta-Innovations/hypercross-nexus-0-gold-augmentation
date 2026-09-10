import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "../lib/readApiError";

interface TxRecord {
  id: string;
  operationType: string;
  tokenSymbol: string | null;
  amount: string | null;
  status: string;
  transactionHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: "border-green-500/50 text-green-400 bg-green-500/10",
  FAILED: "border-red-500/50 text-red-400 bg-red-500/10",
  CANCELLED: "border-white/20 text-white/40 bg-white/5",
  PENDING: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10",
  SUBMITTED: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10",
};

/** Real on-chain transaction history — separate from paper trading history. */
export function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => r.json().then((payload) => ({ ok: r.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok) {
          setError(readApiError(payload, "Failed to load transactions."));
          return;
        }
        setTransactions(payload.transactions ?? []);
      })
      .catch(() => setError("Unable to reach transaction service."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Transactions</h2>
        <p className="text-white/50 mt-1 text-sm">
          Real on-chain transaction records. Status becomes CONFIRMED only after a real receipt.
        </p>
      </div>

      <Card className="glass-panel neon-border-blue border-t-2">
        <CardHeader><CardTitle className="text-white text-lg">History</CardTitle></CardHeader>
        <CardContent>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {!error && loading && <p className="text-white/50 text-sm">Loading…</p>}
          {!error && !loading && transactions.length === 0 && (
            <p className="text-white/50 text-sm">No on-chain transactions yet.</p>
          )}
          {!error && transactions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Type</TableHead>
                  <TableHead className="text-white/60">Asset</TableHead>
                  <TableHead className="text-white/60">Amount</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">Explorer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id} className="border-white/10">
                    <TableCell className="text-white/80">{tx.operationType}</TableCell>
                    <TableCell className="text-white/80">{tx.tokenSymbol ?? "ETH"}</TableCell>
                    <TableCell className="text-white/80">{tx.amount ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLOR[tx.status] ?? "border-white/10 text-white/50"}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.explorerUrl && tx.transactionHash ? (
                        <a href={`${tx.explorerUrl}`} target="_blank" rel="noreferrer" className="text-[#1500ff] hover:underline text-xs">
                          View
                        </a>
                      ) : (
                        <span className="text-white/30 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TransactionHistoryPage;
