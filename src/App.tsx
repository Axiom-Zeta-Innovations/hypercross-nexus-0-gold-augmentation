import React, { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import CheckoutPage from "./pages/CheckoutPage";
import BillingPage from "./pages/BillingPage";
import DigitalAssetsPage from "./pages/DigitalAssetsPage";
import RWAPage from "./pages/RWAPage";
import TokenFundraisingPage from "./pages/TokenFundraisingPage";
import NFTMarketplacePage from "./pages/NFTMarketplacePage";
import TokenLaunchpadPage from "./pages/TokenLaunchpadPage";
import SportsTradingPage from "./pages/SportsTradingPage";
import DerivativesPage from "./pages/DerivativesPage";
import CopyTradingPage from "./pages/CopyTradingPage";
import MiningPoolsPage from "./pages/MiningPoolsPage";
import CustodyPage from "./pages/CustodyPage";
import SendPage from "./pages/SendPage";
import SwapPage from "./pages/SwapPage";
import TransactionHistoryPage from "./pages/TransactionHistoryPage";
import NexusIntelligencePage from "./pages/NexusIntelligencePage";
import WalletStatusPanel from "./components/WalletStatusPanel";
import { 
  Activity, 
  Box, 
  LayoutDashboard, 
  Settings, 
  Wallet,
  Zap,
  QrCode,
  Mail,
  Smartphone,
  Lock,
  ArrowRight,
  MonitorSmartphone,
  ShieldCheck,
  ShieldAlert,
  Network,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Send,
  Coins,
  Landmark,
  TrendingUp,
  ImageIcon,
  Rocket,
  Trophy,
  BarChart2,
  UserCheck,
  HardDrive,
  KeyRound,
  CreditCard,
  Building2,
  CircleDollarSign,
  Receipt,
  Sparkles,
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shouldRetryLegacyAuth, getAuthRoutes, readAuthError } from "./lib/authRouting";
import { readApiError } from "./lib/readApiError";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Chainstack-derived status shown on the overview dashboard (no fabricated data).
interface ChainstackStatusData {
  nodeState: string;
  chaosLevel: string;
  damping: string;
  syncStatus: string;
  networkHealth: "OPTIMAL" | "DEGRADED" | "OFFLINE";
  recentBlocks: Array<{
    id: string;
    timestamp: string;
    transactions: number;
    status: string;
  }>;
  chartData: Array<{
    time: string;
    stability: number;
    chaos: number;
  }>;
}

interface LinkedAccount {
  id: string;
  label: string;
  provider: string;
  balances: Record<string, number>;
  totalUsd: number;
  updatedAt: string;
}

interface ExecutedTrade {
  id: string;
  accountId: string;
  instrument: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  notional: number;
  status: string;
  createdAt?: string;
}

type PaymentProvider = "stripe" | "paypal" | "bank-link";

interface PaymentConnection {
  provider: PaymentProvider;
  status: "connected" | "disconnected";
  accountRef: string | null;
  metadata: Record<string, any>;
  linkedAt: string | null;
  updatedAt: string | null;
}

type PlanTier = 'starter' | 'pro' | 'enterprise' | 'enterprise_deluxe';

export default function App() {
  const { isConnected: isWalletConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect, isPending: isDisconnecting } = useDisconnect();
  const [data, setData] = useState<ChainstackStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(window.localStorage.getItem("hcx-access-token")));
  const [userEmail, setUserEmail] = useState<string>(() => window.localStorage.getItem("hcx-user-email") || "");
  const [checkoutPlan, setCheckoutPlan] = useState<PlanTier | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [recentTrades, setRecentTrades] = useState<ExecutedTrade[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [trading, setTrading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [tradeInstrument, setTradeInstrument] = useState("BTC-USD");
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [tradeQuantity, setTradeQuantity] = useState("0.05");
  const [tradePrice, setTradePrice] = useState("64000");
  const [paymentConnections, setPaymentConnections] = useState<PaymentConnection[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier | null>(null);
  const [accessToken, setAccessToken] = useState(() => window.localStorage.getItem("hcx-access-token"));
  const [oauthWindow, setOAuthWindow] = useState<Window | null>(null);
  type PageKey = 'overview' | 'intelligence' | 'chainstack' | 'kaleido' | 'send' | 'swap' | 'transactions' | 'assets' | 'rwa' | 'fundraising' | 'nft' | 'launchpad' | 'sports' | 'derivatives' | 'copytrading' | 'mining' | 'custody' | 'settings' | 'billing';
  const [activePage, setActivePage] = useState<PageKey>('overview');
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const enableLegacyKaleidoPortal = import.meta.env.VITE_ENABLE_LEGACY_KALEIDO_PORTAL === "true";

  const connectInjectedWallet = () => {
    const injectedConnector = connectors.find((connector) => connector.id === "injected") ?? connectors[0];
    if (!injectedConnector) return;
    connect({ connector: injectedConnector });
  };

  useEffect(() => {
    fetch("/api/config/features")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => { if (payload?.features) setFeatureFlags(payload.features); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/billing/subscription", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const plan = payload?.subscription?.plan;
        if (plan === "research" || plan === "trader" || plan === "pro") setSelectedPlan(plan);
      })
      .catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (payload?.ok && payload?.user) {
          setIsLoggedIn(true);
          const email = payload.user.email;
          if (email) {
            setUserEmail(email);
            window.localStorage.setItem('hcx-user-email', email);
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadPaymentConnections = async () => {
    try {
      setPaymentsLoading(true);
      setPaymentsError(null);
      const planQuery = selectedPlan ? `?plan=${selectedPlan}` : "?plan=starter";
      const res = await fetch(`/api/payments/connections${planQuery}`);
      const payload = await res.json().catch(() => ({ connections: [] }));
      if (!res.ok) {
        setPaymentsError(readApiError(payload, "Failed to load payment connections."));
        return;
      }
      // Handle both array response (legacy) and object response (new with plan gating)
      const connections = Array.isArray(payload) ? payload : payload.connections || [];
      setPaymentConnections(connections);
    } catch {
      setPaymentsError("Unable to reach payment connection service.");
    } finally {
      setPaymentsLoading(false);
    }
  };

  const initiateOAuthFlow = async (provider: "stripe" | "paypal" | "bank-link") => {
    try {
      const res = await fetch(`/api/oauth/authorize?provider=${provider}&plan=${selectedPlan || 'starter'}`);
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(readApiError(data, `Failed to initiate ${provider} OAuth`));
      }

      if (data.authUrl) {
        // Open OAuth provider in new window
        const width = 600;
        const height = 700;
        const left = window.innerWidth / 2 - width / 2;
        const top = window.innerHeight / 2 - height / 2;
        const popup = window.open(
          data.authUrl,
          `${provider}_oauth`,
          `width=${width},height=${height},left=${left},top=${top}`
        );
        setOAuthWindow(popup);

        // Poll for callback result
        const checkInterval = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkInterval);
            // Reload connections after OAuth window closes
            setTimeout(() => loadPaymentConnections(), 1000);
          }
        }, 1000);
      }
    } catch (err: unknown) {
      setPaymentsError(err instanceof Error && err.message ? err.message : "Failed to start OAuth flow");
    }
  };

  const connectPaymentProvider = async (provider: PaymentProvider, accountRef: string, metadata: Record<string, any>) => {
    const res = await fetch("/api/payments/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, accountRef, metadata, plan: selectedPlan || 'starter' }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(readApiError(payload, "Failed to link provider."));
    }
    await loadPaymentConnections();
  };

  const disconnectPaymentProvider = async (provider: PaymentProvider) => {
    const res = await fetch("/api/payments/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(readApiError(payload, "Failed to disconnect provider."));
    }
    await loadPaymentConnections();
  };

  useEffect(() => {
    // Checkout redirects are informational only. Subscription state must come
    // from the server after webhook processing, never from URL parameters.
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'stripe-success' || checkout === 'paypal-return') {
      setCheckoutSuccess('Payment return received. Subscription access will update after server verification.');
      window.history.replaceState({}, '', '/');
    } else if (checkout === 'canceled') {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;

    const loadTradingData = async () => {
      try {
        setAccountsLoading(true);
        const [accountsRes, tradesRes] = await Promise.all([
          fetch("/api/paper/accounts"),
          fetch("/api/paper/trades?limit=8"),
        ]);

        if (accountsRes.ok) {
          const payload = await accountsRes.json();
          const accounts: LinkedAccount[] = payload.accounts ?? [];
          setLinkedAccounts(accounts);
          if (!selectedAccountId && accounts.length > 0) {
            setSelectedAccountId(accounts[0].id);
          }
        }

        if (tradesRes.ok) {
          const payload = await tradesRes.json();
          setRecentTrades(payload.trades ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch paper trading dashboard data:", err);
      } finally {
        setAccountsLoading(false);
      }
    };

    loadTradingData();
    const interval = setInterval(loadTradingData, 10000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadPaymentConnections();
  }, [isLoggedIn]);

  useEffect(() => {
    // Chainstack is the sole blockchain provider; no legacy fallback on failure.
    const fetchData = async () => {
      try {
        const response = await fetch("/api/blockchain/status");
        const result = await response.json().catch(() => null);
        const connected = response.ok && result?.connected === true;
        const rpcHealthy = result?.rpcHealthy === true;
        const networkHealth = response.ok
          ? (connected && rpcHealthy ? "OPTIMAL" : "DEGRADED")
          : "OFFLINE";
        setData({
          nodeState: result?.network ?? "unknown",
          chaosLevel: result?.live ? "Live" : "Degraded",
          damping: result?.blockNumber != null ? String(result.blockNumber) : "—",
          syncStatus: connected ? "Synced" : "Disconnected",
          networkHealth,
          recentBlocks: [],
          chartData: [],
        });
      } catch (error) {
        console.error("Failed to fetch Chainstack status:", error);
        setData({
          nodeState: "unknown",
          chaosLevel: "Degraded",
          damping: "—",
          syncStatus: "Disconnected",
          networkHealth: "OFFLINE",
          recentBlocks: [],
          chartData: [],
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (!isLoggedIn) {
    return <LoginScreen onLogin={(email?: string, token?: string) => {
      setIsLoggedIn(true);
      if (email) {
        setUserEmail(email);
        window.localStorage.setItem('hcx-user-email', email);
      }
      if (token) {
        setAccessToken(token);
        window.localStorage.setItem("hcx-access-token", token);
      }
    }} data={data} />;
  }

  // Show checkout page when user picked a plan but hasn't paid yet
  if (checkoutPlan) {
    const emailForCheckout = userEmail;
    return (
      <CheckoutPage
        plan={checkoutPlan}
        email={emailForCheckout}
        accessToken={accessToken ?? undefined}
        onBack={() => setCheckoutPlan(null)}
        onSuccess={(plan) => {
          setCheckoutPlan(null);
          setSelectedPlan(plan);
          setCheckoutSuccess(`Successfully subscribed to the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan!`);
        }}
      />
    );
  }

  if (!selectedPlan) {
    const emailForCheckout = userEmail;
    return <PaywallScreen onSelectPlan={(plan) => {
      setCheckoutPlan(plan);
    }} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-white/10 glass-panel flex flex-col z-10">
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#1500ff] to-[#c300ff] flex items-center justify-center shadow-[0_0_15px_rgba(195,0,255,0.5)]">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <h1 className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            Hyper-Cross Nexus
          </h1>
        </div>
        <nav className="flex-1 p-4 overflow-y-auto">
          <SidebarSection label="Platform" />
          <NavItem icon={<LayoutDashboard size={18} />} label="Overview" active={activePage === 'overview'} onClick={() => setActivePage('overview')} />
          <NavItem icon={<Sparkles size={18} />} label="Nexus Intelligence" active={activePage === 'intelligence'} onClick={() => setActivePage('intelligence')} />
          <NavItem icon={<Network size={18} />} label="Chainstack Connect" active={activePage === 'chainstack'} onClick={() => setActivePage('chainstack')} />
          {enableLegacyKaleidoPortal && (
            <NavItem icon={<ShieldAlert size={18} />} label="Kaleido Fabric (Legacy)" active={activePage === 'kaleido'} onClick={() => setActivePage('kaleido')} badge="Deprecated" />
          )}
          <NavItem icon={<Send size={18} />} label="Send" active={activePage === 'send'} onClick={() => setActivePage('send')} />
          <NavItem icon={<ChevronRight size={18} />} label="Swap" active={activePage === 'swap'} onClick={() => setActivePage('swap')} />
          <NavItem icon={<Receipt size={18} />} label="Transactions" active={activePage === 'transactions'} onClick={() => setActivePage('transactions')} />

          <SidebarSection label="Asset Services" />
          <NavItem icon={<Coins size={18} />} label="Digital Assets" active={activePage === 'assets'} onClick={() => setActivePage('assets')} />
          <NavItem icon={<Landmark size={18} />} label="RWA Infrastructure" active={activePage === 'rwa'} onClick={() => setActivePage('rwa')} badge={featureFlags.rwa ? undefined : "Soon"} />
          <NavItem icon={<ImageIcon size={18} />} label="NFT Marketplace" active={activePage === 'nft'} onClick={() => setActivePage('nft')} badge={featureFlags.nft ? undefined : "Soon"} />

          <SidebarSection label="Finance" />
          <NavItem icon={<TrendingUp size={18} />} label="Token Fundraising" active={activePage === 'fundraising'} onClick={() => setActivePage('fundraising')} badge={featureFlags.launchpad ? undefined : "Soon"} />
          <NavItem icon={<Rocket size={18} />} label="Token Launchpad" active={activePage === 'launchpad'} onClick={() => setActivePage('launchpad')} badge={featureFlags.launchpad ? undefined : "Soon"} />
          <NavItem icon={<BarChart2 size={18} />} label="Derivatives" active={activePage === 'derivatives'} onClick={() => setActivePage('derivatives')} badge={featureFlags.derivatives ? undefined : "Soon"} />
          <NavItem icon={<UserCheck size={18} />} label="Copy Trading" active={activePage === 'copytrading'} onClick={() => setActivePage('copytrading')} badge={featureFlags.copyTrading ? undefined : "Soon"} />

          <SidebarSection label="Trading" />
          <NavItem icon={<Trophy size={18} />} label="Sports Trading" active={activePage === 'sports'} onClick={() => setActivePage('sports')} badge={featureFlags.sports ? undefined : "Soon"} />

          <SidebarSection label="Infrastructure" />
          <NavItem icon={<HardDrive size={18} />} label="Mining Pools" active={activePage === 'mining'} onClick={() => setActivePage('mining')} badge={featureFlags.mining ? undefined : "Soon"} />
          <NavItem icon={<KeyRound size={18} />} label="Custody & Storage" active={activePage === 'custody'} onClick={() => setActivePage('custody')} badge={featureFlags.custody ? undefined : "Soon"} />

          <SidebarSection label="Account" />
          <NavItem icon={<Receipt size={18} />} label="Billing" active={activePage === 'billing'} onClick={() => setActivePage('billing')} />
          <NavItem icon={<Settings size={18} />} label="Settings" active={activePage === 'settings'} onClick={() => setActivePage('settings')} />
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/40 text-center">
          v2.4.1-enterprise
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
        {/* Checkout success banner */}
        {checkoutSuccess && (
          <div className="flex-shrink-0 flex items-center justify-between gap-2 px-6 py-2.5 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-b border-green-500/30 text-green-300 text-xs font-medium z-20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {checkoutSuccess}
            </div>
            <button onClick={() => setCheckoutSuccess(null)} className="text-green-400/60 hover:text-green-300 text-lg leading-none">×</button>
          </div>
        )}
        {/* Header */}
        <header className="h-20 flex-shrink-0 border-b border-white/10 glass-panel flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                data?.networkHealth === "OPTIMAL" ? "bg-green-400" : data?.networkHealth === "DEGRADED" ? "bg-yellow-400" : "bg-red-400"
              } opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                data?.networkHealth === "OPTIMAL" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" : data?.networkHealth === "DEGRADED" ? "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
              }`}></span>
            </div>
            <span className="text-sm font-medium text-white/80 tracking-wide uppercase">
              Network Health: {data?.networkHealth ?? "OFFLINE"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10" onClick={() => setIsLoggedIn(false)}>
              Sign Out
            </Button>
            <Badge className="bg-[#ffae00]/20 text-[#ffae00] border border-[#ffae00]/40 uppercase tracking-wider">
              {selectedPlan}
            </Badge>
            {isWalletConnected && (
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white/70 hover:bg-white/10"
                disabled={isDisconnecting}
                onClick={() => disconnect()}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect Wallet"}
              </Button>
            )}
            {!isWalletConnected ? (
              <Button
                variant="outline"
                size="sm"
                className="border-[#ffae00]/40 bg-[#ffae00]/10 text-[#ffae00] hover:bg-[#ffae00]/20"
                disabled={isConnecting}
                onClick={connectInjectedWallet}
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            ) : null}
          </div>
        </header>

        {/* Page Content */}
        {activePage === 'chainstack' && (
          <div className="flex-1 overflow-y-auto p-8">
            <ChainstackConnectPage />
          </div>
        )}
        {enableLegacyKaleidoPortal && activePage === 'kaleido' && (
          <div className="flex-1 overflow-y-auto p-8">
            <LegacyKaleidoDeprecationPage />
          </div>
        )}
        {activePage === 'intelligence' && (
          <div className="flex-1 overflow-y-auto p-8"><NexusIntelligencePage accessToken={accessToken ?? undefined} /></div>
        )}
        {activePage === 'assets' && (
          <div className="flex-1 overflow-y-auto p-8"><DigitalAssetsPage /></div>
        )}
        {activePage === 'send' && (
          <div className="flex-1 overflow-y-auto p-8"><SendPage /></div>
        )}
        {activePage === 'swap' && (
          <div className="flex-1 overflow-y-auto p-8"><SwapPage /></div>
        )}
        {activePage === 'transactions' && (
          <div className="flex-1 overflow-y-auto p-8"><TransactionHistoryPage /></div>
        )}
        {activePage === 'rwa' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.rwa ? <RWAPage /> : <ComingSoonPage label="RWA Infrastructure" />}</div>
        )}
        {activePage === 'fundraising' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.launchpad ? <TokenFundraisingPage /> : <ComingSoonPage label="Token Fundraising" />}</div>
        )}
        {activePage === 'nft' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.nft ? <NFTMarketplacePage /> : <ComingSoonPage label="NFT Marketplace" />}</div>
        )}
        {activePage === 'launchpad' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.launchpad ? <TokenLaunchpadPage /> : <ComingSoonPage label="Token Launchpad" />}</div>
        )}
        {activePage === 'sports' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.sports ? <SportsTradingPage /> : <ComingSoonPage label="Sports Trading" />}</div>
        )}
        {activePage === 'derivatives' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.derivatives ? <DerivativesPage /> : <ComingSoonPage label="Derivatives" />}</div>
        )}
        {activePage === 'copytrading' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.copyTrading ? <CopyTradingPage /> : <ComingSoonPage label="Copy Trading" />}</div>
        )}
        {activePage === 'mining' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.mining ? <MiningPoolsPage /> : <ComingSoonPage label="Mining Pools" />}</div>
        )}
        {activePage === 'custody' && (
          <div className="flex-1 overflow-y-auto p-8">{featureFlags.custody ? <CustodyPage /> : <ComingSoonPage label="Custody & Storage" />}</div>
        )}
        {activePage === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8">
            <PaymentSettingsPage
              connections={paymentConnections}
              loading={paymentsLoading}
              error={paymentsError}
              onRefresh={loadPaymentConnections}
              onConnect={connectPaymentProvider}
              onDisconnect={disconnectPaymentProvider}
              plan={selectedPlan || 'starter'}
              onInitiateOAuth={initiateOAuthFlow}
              onInitiateBankLink={() => initiateOAuthFlow("bank-link")}
            />
          </div>
        )}
        {activePage === 'billing' && (
          <div className="flex-1 overflow-y-auto p-8">
            <BillingPage
              email={userEmail || window.localStorage.getItem('hcx-user-email') || ''}
              onUpgrade={() => {
                setSelectedPlan(null);
              }}
            />
          </div>
        )}
        {activePage === 'overview' && (
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Real wallet state (wagmi) */}
          <WalletStatusPanel />

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Network" 
              value={data?.nodeState} 
              loading={loading} 
              borderClass="neon-border-blue"
            />
            <StatCard 
              title="Status" 
              value={data?.chaosLevel} 
              loading={loading} 
              borderClass="neon-border-red"
            />
            <StatCard 
              title="Block Number" 
              value={data?.damping} 
              loading={loading} 
              borderClass="neon-border-purple"
            />
            <StatCard 
              title="Sync Status" 
              value={data?.syncStatus} 
              loading={loading} 
              borderClass="neon-border-gold"
              valueClass={data?.syncStatus === "Synced" ? "text-green-400" : data?.syncStatus === "Disconnected" ? "text-red-400" : "text-yellow-400"}
            />
          </div>

          {/* Linked balances + trading */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="glass-panel neon-border-gold glow-hover border-t-2">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-white/90 flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-[#ffae00]" />
                  Paper Trading Accounts
                  <Badge className="bg-[#ff4d4d]/20 text-[#ff4d4d] border-[#ff4d4d]/40 uppercase tracking-wider text-[10px]">
                    Simulation
                  </Badge>
                </CardTitle>
                <CardDescription className="text-white/55">
                  Simulated paper-trading balances. Not live market data and not on-chain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {accountsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full bg-white/5" />
                    <Skeleton className="h-16 w-full bg-white/5" />
                  </div>
                ) : linkedAccounts.length === 0 ? (
                  <p className="text-sm text-white/60">No linked accounts available.</p>
                ) : (
                  <div className="space-y-3">
                    {linkedAccounts.map((account) => (
                      <div key={account.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-white/90 font-medium text-sm">{account.label}</p>
                            <p className="text-white/45 text-xs">{account.provider}</p>
                          </div>
                          <Badge className="bg-[#ffae00]/15 text-[#ffae00] border-[#ffae00]/35">
                            ${account.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {Object.entries(account.balances).map(([asset, amount]) => (
                            <span key={`${account.id}-${asset}`} className="px-2 py-1 rounded bg-black/30 border border-white/10 text-white/75">
                              {asset}: {Number(amount).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-panel neon-border-blue glow-hover border-t-2">
              <CardHeader>
                <CardTitle className="text-lg font-medium text-white/90 flex items-center gap-2">
                  <Send className="h-5 w-5 text-[#1500ff]" />
                  Trading
                </CardTitle>
                <CardDescription className="text-white/55">
                  On-chain swaps are signed by your connected wallet. Recent rows below are paper trades only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm text-white/60">The previous dashboard form used a local paper ledger and did not submit transactions.</p>
                  <Button type="button" onClick={() => setActivePage('swap')} className="w-full bg-gradient-to-r from-[#1500ff] to-[#c300ff] hover:opacity-90">
                    Open Live Swap
                  </Button>
                </div>

                <div className="border-t border-white/10 pt-3">
                  <p className="text-xs text-white/50 mb-2 uppercase tracking-wider">Recent Paper Trades (simulated)</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {recentTrades.length === 0 ? (
                      <p className="text-sm text-white/55">No paper trades executed yet.</p>
                    ) : recentTrades.map((trade) => (
                      <div key={trade.id} className="text-xs rounded border border-white/10 bg-black/30 p-2 flex items-center justify-between gap-2">
                        <span className={trade.side === "BUY" ? "text-green-400" : "text-red-400"}>{trade.side}</span>
                        <span className="text-white/75">{trade.quantity} {trade.instrument}</span>
                        <span className="text-white/55">${Number(trade.notional).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        <Badge className="bg-[#ff4d4d]/20 text-[#ff4d4d] border-[#ff4d4d]/40 uppercase tracking-wider text-[10px]">
                          Paper
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart Section */}
          <Card className="glass-panel neon-border-purple glow-hover border-t-2">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-white/90 flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#c300ff]" />
                Real-time Stability Chart
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-4">
                {loading ? (
                  <Skeleton className="h-full w-full bg-white/5 rounded-lg" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="rgba(255,255,255,0.3)" 
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.3)" 
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(0,0,0,0.8)', 
                          borderColor: 'rgba(195,0,255,0.5)',
                          borderRadius: '8px',
                          boxShadow: '0 0 15px rgba(195,0,255,0.3)'
                        }} 
                        itemStyle={{ color: '#fff' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="stability" 
                        stroke="#c300ff" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, fill: "#c300ff", stroke: "#fff", strokeWidth: 2 }}
                        style={{ filter: 'drop-shadow(0 0 8px rgba(195,0,255,0.8))' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="chaos" 
                        stroke="#ff2600" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        style={{ filter: 'drop-shadow(0 0 5px rgba(255,38,0,0.5))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table Section */}
          <Card className="glass-panel neon-border-blue glow-hover border-t-2">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-white/90 flex items-center gap-2">
                <Box className="h-5 w-5 text-[#1500ff]" />
                Recent Blocks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3 mt-4">
                  <Skeleton className="h-10 w-full bg-white/5" />
                  <Skeleton className="h-10 w-full bg-white/5" />
                  <Skeleton className="h-10 w-full bg-white/5" />
                  <Skeleton className="h-10 w-full bg-white/5" />
                </div>
              ) : (
                <div className="rounded-md border border-white/10 overflow-hidden mt-4">
                  <Table>
                    <TableHeader className="bg-white/5">
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white/60">Block ID</TableHead>
                        <TableHead className="text-white/60">Timestamp</TableHead>
                        <TableHead className="text-white/60 text-right">Transactions</TableHead>
                        <TableHead className="text-white/60 text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.recentBlocks.map((block) => (
                        <TableRow key={block.id} className="border-white/10 hover:bg-white/5 transition-colors">
                          <TableCell className="font-mono text-white/80">{block.id}</TableCell>
                          <TableCell className="text-white/60">
                            {new Date(block.timestamp).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="text-right text-white/80">{block.transactions}</TableCell>
                          <TableCell className="text-right">
                            <Badge 
                              variant="outline" 
                              className={`
                                ${block.status === 'Confirmed' 
                                  ? 'border-green-500/50 text-green-400 bg-green-500/10 shadow-[0_0_10px_rgba(34,197,94,0.2)]' 
                                  : 'border-yellow-500/50 text-yellow-400 bg-yellow-500/10 shadow-[0_0_10px_rgba(234,179,8,0.2)]'}
                              `}
                            >
                              {block.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}
      </main>
    </div>
  );
}

function LoginScreen({ onLogin, data }: { onLogin: (email?: string, accessToken?: string) => void, data: any }) {
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const [loginMethod, setLoginMethod] = useState<'form' | 'qr'>('form');
  const [authTab, setAuthTab] = useState<'email' | 'phone'>('email');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [emailOrSubAccount, setEmailOrSubAccount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const connectInjectedWallet = () => {
    const injectedConnector = connectors.find((connector) => connector.id === "injected") ?? connectors[0];
    if (!injectedConnector) return;
    connect({ connector: injectedConnector });
  };

  const featureHighlights = [
    "Chainstack-native EVM connectivity with real-time RPC health status",
    "Digital assets, RWAs, NFT marketplace, fundraising, and launchpad in one control plane",
    "Institutional custody, mining telemetry, and derivatives modules",
    "Desktop + web runtime with optional local SQLite persistence",
    "Real-time market, orderbook, and chain health visibility",
    "White-label architecture for enterprise branding and deployment",
  ];



  const switchTab = (tab: 'email' | 'phone') => {
    setAuthTab(tab);
    setLoginError(null);
    setPassword('');
  };

  const switchAuthMode = (mode: 'signin' | 'signup' | 'forgot') => {
    setAuthMode(mode);
    setLoginError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const submitAuth = async (): Promise<{
    ok: boolean;
    status: number;
    error?: string;
    message?: string;
    user?: Record<string, unknown>;
    accessToken?: string;
  }> => {
    const buildRequest = (primary: string, fallback: string, requestBody: Record<string, unknown>) => async () => {
      const primaryResponse = await fetch(primary, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const primaryPayload = await primaryResponse.json().catch(() => ({}));
      if (primaryResponse.ok) {
        return {
          ok: true,
          status: primaryResponse.status,
          error: undefined,
          message: primaryPayload?.message,
          user: primaryPayload?.user,
          accessToken: primaryPayload?.accessToken,
        };
      }

      if (!shouldRetryLegacyAuth(primaryResponse.status)) {
        return {
          ok: false,
          status: primaryResponse.status,
          error: readAuthError(primaryPayload),
          message: primaryPayload?.message,
        };
      }

      const fallbackResponse = await fetch(fallback, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const fallbackPayload = await fallbackResponse.json().catch(() => ({}));
      return {
        ok: fallbackResponse.ok,
        status: fallbackResponse.status,
        error: readAuthError(fallbackPayload),
        message: fallbackPayload?.message,
        user: fallbackPayload?.user,
        accessToken: fallbackPayload?.accessToken,
      };
    };

    if (authMode === 'forgot') {
      const routes = getAuthRoutes('forgot');
      const result = await buildRequest(routes.primary, routes.fallback, { email: emailOrSubAccount.trim() })();
      return result;
    }

    if (authTab === "phone") {
      return { ok: false, status: 400, error: "Canonical web authentication currently requires email." };
    }

    const payload = {
      method: authTab,
      emailOrSubAccount,
      phoneNumber,
      password,
    };

    // In packaged Electron (file://), REST API routes are unavailable, so prefer IPC auth.
    if (window.electron?.authSignup && window.electron?.authSignin) {
      const result = authMode === 'signup'
        ? await window.electron.authSignup(payload)
        : await window.electron.authSignin(payload);
      return {
        ok: Boolean(result?.ok),
        status: Number(result?.status ?? 200),
        error: typeof result?.error === 'string' ? result.error : undefined,
        message: typeof result?.message === 'string' ? result.message : undefined,
        user: result?.user && typeof result.user === 'object' ? result.user as Record<string, unknown> : undefined,
      };
    }

    const routes = getAuthRoutes(authMode);
    const requestBody = authMode === 'signup'
      ? { email: emailOrSubAccount.trim(), password }
      : { email: emailOrSubAccount.trim(), password };

    const result = await buildRequest(routes.primary, routes.fallback, requestBody)();
    return result;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setLoginError(null);

    if (authTab === 'email') {
      if (!emailOrSubAccount.trim()) { setLoginError('Enter your email or sub-account.'); return; }
      if (!password.trim()) { setLoginError('Enter your password.'); return; }
    } else {
      if (!phoneNumber.trim()) { setLoginError('Enter your phone number.'); return; }
      if (!password.trim()) { setLoginError('Enter your password.'); return; }
    }

    if (authMode === 'signup' && password.trim().length < 8) {
      setLoginError('Use at least 8 characters for your password.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await submitAuth();
      if (!result?.ok) {
        if (result?.status === 404) {
          setLoginError('Authentication endpoint is unavailable in this runtime.');
          return;
        }
        setLoginError(readApiError({ error: result?.error }, 'Authentication failed.'));
        return;
      }

      if (authMode === 'forgot') {
        alert(result.message || 'Password reset successful! You can now sign in with your new password.');
        switchAuthMode('signin');
        return;
      }

      const loginEmail = authTab === 'email' ? emailOrSubAccount.trim() : undefined;
      onLogin(loginEmail, (result as any).accessToken);
    } catch {
      setLoginError('Unable to reach authentication service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full text-foreground overflow-hidden" style={{ background: '#050505' }}>
      {/* Ambient background orbs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-15%] w-[800px] h-[800px] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(21,0,255,0.20) 0%, transparent 55%)' }} />
        <div className="absolute bottom-[-20%] right-[-15%] w-[700px] h-[700px] rounded-full"
             style={{ background: 'radial-gradient(circle, rgba(195,0,255,0.16) 0%, transparent 55%)' }} />
        <div className="absolute top-[40%] left-[42%] w-[500px] h-[500px] rounded-full hidden lg:block"
             style={{ background: 'radial-gradient(circle, rgba(255,174,0,0.08) 0%, transparent 60%)' }} />
      </div>

      {/* ── Left Branding Panel ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative z-10">
        <div className="absolute inset-0 opacity-10 pointer-events-none z-0">
          {data?.chartData && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chartData}>
                <Line type="monotone" dataKey="stability" stroke="#c300ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="chaos" stroke="#ff2600" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1500ff] to-[#c300ff] flex items-center justify-center shadow-[0_0_20px_rgba(195,0,255,0.6)]">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <h1 className="font-bold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Hyper-Cross Nexus
            </h1>
          </div>
          <h2 className="text-5xl font-bold tracking-tighter text-white mb-5 leading-tight">
            Institutional DeFi &amp;<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1500ff] via-[#c300ff] to-[#ffae00]">
              Asset Infrastructure
            </span>
          </h2>
          <p className="text-white/55 text-lg max-w-md leading-relaxed">
            One platform for wallet-verified portfolio tracking, real Chainstack RPC connectivity, and on-chain asset operations.
          </p>
        </div>

        <div className="relative z-10 rounded-2xl border border-[#1500ff]/30 bg-black/40 backdrop-blur-md p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-5">
            <ShieldCheck className="h-5 w-5 text-[#1500ff] flex-shrink-0" />
            <h3 className="text-white font-semibold text-sm">Why Teams Choose Hyper-Cross Nexus</h3>
          </div>
          <ul className="space-y-2.5">
            {featureHighlights.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-white/65">
                <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-sm mt-6">
          <p className="font-semibold text-white/80">Hyper-Cross Financial</p>
          <p className="text-white/35 text-xs mt-1">Enterprise onboarding, partnerships &amp; deployment support.</p>
        </div>
      </div>

      {/* ── Right Login Panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="relative w-full max-w-md">

          {/* QR toggle – outside scroll area */}
          <button
            type="button"
            onClick={() => setLoginMethod(loginMethod === 'form' ? 'qr' : 'form')}
            aria-label="Toggle QR login"
            className="absolute top-3 right-3 z-30 p-2.5 rounded-lg text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          >
            {loginMethod === 'form' ? <QrCode size={20} /> : <MonitorSmartphone size={20} />}
          </button>

          {/* Panel */}
          <div
            className="w-full rounded-2xl bg-black/70 backdrop-blur-xl"
            style={{
              border: '1px solid rgba(195,0,255,0.25)',
              borderTop: '2px solid rgba(195,0,255,0.60)',
              boxShadow: '0 0 60px rgba(195,0,255,0.14)',
              maxHeight: '92vh',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >

            {/* Mobile banner */}
            <div className="lg:hidden mx-5 mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-[#1500ff] to-[#c300ff] flex items-center justify-center flex-shrink-0">
                  <Zap className="h-2.5 w-2.5 text-white" />
                </div>
                <p className="text-white/85 text-sm font-semibold">Hyper-Cross Nexus</p>
              </div>
              <p className="text-white/40 text-xs">Chainstack-native EVM · Wallet-signed transactions · Enterprise onboarding</p>
            </div>

            {/* Title */}
            <div className="px-6 pt-7 pb-5 pr-14">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {loginMethod === 'form'
                  ? (authMode === 'signin' ? 'Sign in to your account' : authMode === 'signup' ? 'Create your account' : 'Reset your password')
                  : 'Scan to sign in'}
              </h2>
              <p className="text-white/40 text-sm mt-1">
                {loginMethod === 'form'
                  ? (authMode === 'signin'
                    ? 'Welcome back to Hyper-Cross Nexus'
                    : authMode === 'signup'
                    ? 'Set up your Hyper-Cross account with email or phone'
                    : 'Enter your email or phone number to set a new password')
                  : 'Open the mobile app and scan the code below'}
              </p>
            </div>

            {/* Body */}
            <div className="px-6 pb-6">
              {loginMethod === 'qr' ? (
                <div className="flex flex-col items-center py-6 gap-5">
                  {/* SVG mock QR — crisp, no sizing issues */}
                  <div className="p-4 bg-white rounded-xl shadow-[0_0_30px_rgba(195,0,255,0.2)]">
                    <svg width="176" height="176" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
                      {/* Top-left finder */}
                      <rect x="0" y="0" width="7" height="7" fill="black"/>
                      <rect x="1" y="1" width="5" height="5" fill="white"/>
                      <rect x="2" y="2" width="3" height="3" fill="black"/>
                      {/* Top-right finder */}
                      <rect x="14" y="0" width="7" height="7" fill="black"/>
                      <rect x="15" y="1" width="5" height="5" fill="white"/>
                      <rect x="16" y="2" width="3" height="3" fill="black"/>
                      {/* Bottom-left finder */}
                      <rect x="0" y="14" width="7" height="7" fill="black"/>
                      <rect x="1" y="15" width="5" height="5" fill="white"/>
                      <rect x="2" y="16" width="3" height="3" fill="black"/>
                      {/* Timing strips */}
                      <rect x="8" y="6" width="1" height="1" fill="black"/>
                      <rect x="10" y="6" width="1" height="1" fill="black"/>
                      <rect x="12" y="6" width="1" height="1" fill="black"/>
                      <rect x="6" y="8" width="1" height="1" fill="black"/>
                      <rect x="6" y="10" width="1" height="1" fill="black"/>
                      <rect x="6" y="12" width="1" height="1" fill="black"/>
                      {/* Data modules */}
                      <rect x="8" y="0" width="1" height="1" fill="black"/>
                      <rect x="10" y="0" width="1" height="1" fill="black"/>
                      <rect x="12" y="0" width="1" height="1" fill="black"/>
                      <rect x="9" y="1" width="1" height="1" fill="black"/>
                      <rect x="11" y="1" width="1" height="1" fill="black"/>
                      <rect x="8" y="2" width="1" height="1" fill="black"/>
                      <rect x="10" y="2" width="2" height="1" fill="black"/>
                      <rect x="9" y="3" width="1" height="1" fill="black"/>
                      <rect x="12" y="3" width="1" height="1" fill="black"/>
                      <rect x="8" y="4" width="2" height="1" fill="black"/>
                      <rect x="11" y="4" width="2" height="1" fill="black"/>
                      <rect x="9" y="5" width="1" height="1" fill="black"/>
                      <rect x="0" y="8" width="1" height="1" fill="black"/>
                      <rect x="2" y="8" width="2" height="1" fill="black"/>
                      <rect x="8" y="8" width="1" height="1" fill="black"/>
                      <rect x="10" y="8" width="2" height="1" fill="black"/>
                      <rect x="13" y="8" width="1" height="1" fill="black"/>
                      <rect x="15" y="8" width="2" height="1" fill="black"/>
                      <rect x="19" y="8" width="1" height="1" fill="black"/>
                      <rect x="1" y="9" width="1" height="1" fill="black"/>
                      <rect x="4" y="9" width="1" height="1" fill="black"/>
                      <rect x="7" y="9" width="1" height="1" fill="black"/>
                      <rect x="9" y="9" width="1" height="1" fill="black"/>
                      <rect x="12" y="9" width="1" height="1" fill="black"/>
                      <rect x="14" y="9" width="1" height="1" fill="black"/>
                      <rect x="17" y="9" width="2" height="1" fill="black"/>
                      <rect x="0" y="10" width="2" height="1" fill="black"/>
                      <rect x="3" y="10" width="1" height="1" fill="black"/>
                      <rect x="5" y="10" width="2" height="1" fill="black"/>
                      <rect x="8" y="10" width="2" height="1" fill="black"/>
                      <rect x="11" y="10" width="1" height="1" fill="black"/>
                      <rect x="13" y="10" width="2" height="1" fill="black"/>
                      <rect x="16" y="10" width="1" height="1" fill="black"/>
                      <rect x="18" y="10" width="2" height="1" fill="black"/>
                      <rect x="1" y="11" width="1" height="1" fill="black"/>
                      <rect x="4" y="11" width="1" height="1" fill="black"/>
                      <rect x="9" y="11" width="1" height="1" fill="black"/>
                      <rect x="12" y="11" width="1" height="1" fill="black"/>
                      <rect x="15" y="11" width="1" height="1" fill="black"/>
                      <rect x="19" y="11" width="1" height="1" fill="black"/>
                      <rect x="0" y="12" width="1" height="1" fill="black"/>
                      <rect x="3" y="12" width="2" height="1" fill="black"/>
                      <rect x="8" y="12" width="1" height="1" fill="black"/>
                      <rect x="10" y="12" width="2" height="1" fill="black"/>
                      <rect x="14" y="12" width="1" height="1" fill="black"/>
                      <rect x="17" y="12" width="1" height="1" fill="black"/>
                      <rect x="8" y="14" width="1" height="1" fill="black"/>
                      <rect x="10" y="14" width="2" height="1" fill="black"/>
                      <rect x="13" y="14" width="1" height="1" fill="black"/>
                      <rect x="16" y="14" width="2" height="1" fill="black"/>
                      <rect x="9" y="15" width="1" height="1" fill="black"/>
                      <rect x="12" y="15" width="1" height="1" fill="black"/>
                      <rect x="15" y="15" width="1" height="1" fill="black"/>
                      <rect x="18" y="15" width="2" height="1" fill="black"/>
                      <rect x="8" y="16" width="2" height="1" fill="black"/>
                      <rect x="11" y="16" width="2" height="1" fill="black"/>
                      <rect x="14" y="16" width="1" height="1" fill="black"/>
                      <rect x="17" y="16" width="1" height="1" fill="black"/>
                      <rect x="9" y="17" width="1" height="1" fill="black"/>
                      <rect x="13" y="17" width="1" height="1" fill="black"/>
                      <rect x="16" y="17" width="2" height="1" fill="black"/>
                      <rect x="8" y="18" width="1" height="1" fill="black"/>
                      <rect x="11" y="18" width="1" height="1" fill="black"/>
                      <rect x="14" y="18" width="1" height="1" fill="black"/>
                      <rect x="18" y="18" width="2" height="1" fill="black"/>
                      <rect x="10" y="19" width="2" height="1" fill="black"/>
                      <rect x="13" y="19" width="1" height="1" fill="black"/>
                      <rect x="17" y="19" width="1" height="1" fill="black"/>
                      <rect x="9" y="20" width="1" height="1" fill="black"/>
                      <rect x="12" y="20" width="2" height="1" fill="black"/>
                      <rect x="15" y="20" width="1" height="1" fill="black"/>
                      <rect x="19" y="20" width="1" height="1" fill="black"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-white/80 font-medium">Open the Hyper-Cross App</p>
                    <p className="text-white/40 text-sm mt-1">Point your camera at the QR code to sign in</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLoginMethod('form')}
                    className="text-sm text-[#c300ff] hover:text-[#ffae00] transition-colors"
                  >
                    ← Back to password sign in
                  </button>
                </div>
              ) : (
                <>
                  {/* Custom tab bar */}
                  <div className="flex rounded-lg overflow-hidden border border-white/10 mb-5">
                    <button
                      type="button"
                      onClick={() => switchTab('email')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        authTab === 'email'
                          ? 'bg-white/10 text-white'
                          : 'bg-transparent text-white/45 hover:text-white/70'
                      }`}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTab('phone')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-white/10 ${
                        authTab === 'phone'
                          ? 'bg-white/10 text-white'
                          : 'bg-transparent text-white/45 hover:text-white/70'
                      }`}
                    >
                      Phone
                    </button>
                  </div>

                  {/* Login / Sign-up form */}
                  <form onSubmit={handleLoginSubmit} noValidate>
                    {authTab === 'email' ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="email" className="text-white/60 text-sm">Email / Sub-account</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                            <Input
                              id="email"
                              type="email"
                              value={emailOrSubAccount}
                              onChange={(e) => setEmailOrSubAccount(e.target.value)}
                              autoComplete="username"
                              placeholder="you@example.com"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-[#c300ff] focus-visible:border-[#c300ff]/50"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="password" className="text-white/60 text-sm">
                              {authMode === 'forgot' ? 'New Password' : 'Password'}
                            </Label>
                            {authMode !== 'forgot' && (
                              <button type="button" onClick={() => switchAuthMode('forgot')} className="text-xs text-[#c300ff] hover:text-[#ffae00] transition-colors">
                                Forgot password?
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                            <Input
                              id="password"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="current-password"
                              placeholder={authMode === 'forgot' ? "Enter new password" : "Enter password"}
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-[#c300ff] focus-visible:border-[#c300ff]/50"
                            />
                          </div>
                        </div>
                        {authMode === 'forgot' && (
                          <div className="space-y-1.5">
                            <Label htmlFor="confirm-password" className="text-white/60 text-sm">Confirm New Password</Label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                              <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                placeholder="Confirm new password"
                                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-[#c300ff] focus-visible:border-[#c300ff]/50"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="phone" className="text-white/60 text-sm">Phone Number</Label>
                          <div className="relative">
                            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                            <Input
                              id="phone"
                              type="tel"
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              autoComplete="tel"
                              placeholder="+1 (555) 000-0000"
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-[#c300ff] focus-visible:border-[#c300ff]/50"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="password-phone" className="text-white/60 text-sm">
                              {authMode === 'forgot' ? 'New Password' : 'Password'}
                            </Label>
                            {authMode !== 'forgot' && (
                              <button type="button" onClick={() => switchAuthMode('forgot')} className="text-xs text-[#c300ff] hover:text-[#ffae00] transition-colors">
                                Forgot password?
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                            <Input
                              id="password-phone"
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="current-password"
                              placeholder={authMode === 'forgot' ? "Enter new password" : "Enter password"}
                              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-[#c300ff] focus-visible:border-[#c300ff]/50"
                            />
                          </div>
                        </div>
                        {authMode === 'forgot' && (
                          <div className="space-y-1.5">
                            <Label htmlFor="confirm-password-phone" className="text-white/60 text-sm">Confirm New Password</Label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                              <Input
                                id="confirm-password-phone"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                placeholder="Confirm new password"
                                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-[#c300ff] focus-visible:border-[#c300ff]/50"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {loginError && (
                      <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full mt-5 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity
                        bg-gradient-to-r from-[#1500ff] to-[#c300ff] shadow-[0_0_20px_rgba(195,0,255,0.3)]
                        hover:opacity-90 active:opacity-80 disabled:opacity-55 disabled:cursor-not-allowed"
                    >
                      {isSubmitting
                        ? (authMode === 'signin' ? 'Signing in...' : authMode === 'signup' ? 'Creating account...' : 'Resetting password...')
                        : (authMode === 'signin' ? 'Sign in' : authMode === 'signup' ? 'Create account' : 'Reset Password')}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                    </button>
                  </form>

                  <div className="mt-4 text-center text-xs text-white/45">
                    {authMode === 'signin' ? "Don't have an account?" : authMode === 'signup' ? 'Already have an account?' : 'Remembered your password?'}
                    {" "}
                    <button
                      type="button"
                      onClick={() => switchAuthMode(authMode === 'signin' ? 'signup' : authMode === 'signup' ? 'signin' : 'signin')}
                      className="text-[#c300ff] hover:text-[#ffae00] transition-colors"
                    >
                      {authMode === 'signin' ? 'Sign up' : 'Sign in'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mt-6">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[11px] text-white/30 uppercase tracking-wider">Or connect wallet</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div className="mt-4">
                    <div>
                      <button
                        type="button"
                        onClick={connectInjectedWallet}
                        disabled={isConnecting}
                        className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white/70 bg-white/5 border border-[#ffae00]/20 hover:bg-[#ffae00]/10 hover:text-white hover:border-[#ffae00]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Wallet className="h-4 w-4 text-[#ffae00]" />
                        {isConnecting ? "Connecting wallet..." : "Connect Web3 Wallet"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm text-white/70 font-medium mb-1">Get started</p>
              <p className="text-xs text-white/35 mb-4">
                Create an account to access wallet-connected onboarding and platform modules.
              </p>
              <button
                type="button"
                onClick={() => switchAuthMode('signup')}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white/65 bg-transparent border border-[#1500ff]/30 hover:bg-[#1500ff]/10 hover:text-white hover:border-[#1500ff]/55 transition-colors"
              >
                Create Account
              </button>
              <p className="text-xs text-white/30 mt-4">
                <span className="text-white/50 font-medium">Hyper-Cross Financial</span>
                {" · "}Enterprise onboarding &amp; deployment support
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentSettingsPage({
  connections,
  loading,
  error,
  onRefresh,
  onConnect,
  onDisconnect,
  plan = 'starter',
  onInitiateOAuth,
  onInitiateBankLink,
}: {
  connections: PaymentConnection[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onConnect: (provider: PaymentProvider, accountRef: string, metadata: Record<string, any>) => Promise<void>;
  onDisconnect: (provider: PaymentProvider) => Promise<void>;
  plan?: PlanTier;
  onInitiateOAuth?: (provider: "stripe" | "paypal") => Promise<void>;
  onInitiateBankLink?: () => Promise<void>;
}) {
  const [stripeAccountRef, setStripeAccountRef] = useState("");
  const [bankAccountRef, setBankAccountRef] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankLast4, setBankLast4] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<PaymentProvider | null>(null);
  const [useOAuth, setUseOAuth] = useState(false);

  // Plan-tier availability matrix
  const PLAN_FEATURES: Record<PlanTier, PaymentProvider[]> = {
    starter: ["stripe"],
    pro: ["stripe"],
    enterprise: ["stripe", "bank-link"],
    enterprise_deluxe: ["stripe"],
  };

  const allowedProviders = PLAN_FEATURES[plan] || [];
  const byProvider = new Map(connections.map((conn) => [conn.provider, conn]));

  const stripe = byProvider.get("stripe");
  const bank = byProvider.get("bank-link") ?? byProvider.get("stripe");

  const isStripeAllowed = allowedProviders.includes("stripe");
  const isBankAllowed = allowedProviders.includes("bank-link");

  const handleConnect = async (provider: PaymentProvider, accountRef: string, metadata: Record<string, any>) => {
    try {
      setActionError(null);
      setBusyProvider(provider);
      await onConnect(provider, accountRef, metadata);
    } catch (err: any) {
      setActionError(err?.message ?? "Unable to connect provider.");
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDisconnect = async (provider: PaymentProvider) => {
    try {
      setActionError(null);
      setBusyProvider(provider);
      await onDisconnect(provider);
    } catch (err: any) {
      setActionError(err?.message ?? "Unable to disconnect provider.");
    } finally {
      setBusyProvider(null);
    }
  };

  const handleOAuthInitiate = async (provider: "stripe" | "paypal") => {
    try {
      setActionError(null);
      setBusyProvider(provider);
      if (onInitiateOAuth) {
        await onInitiateOAuth(provider);
      }
    } catch (err: any) {
      setActionError(err?.message ?? "OAuth flow failed");
    } finally {
      setBusyProvider(null);
    }
  };

  const handleBankLinkInitiate = async () => {
    try {
      setActionError(null);
      setBusyProvider("bank-link");
      if (onInitiateBankLink) {
        await onInitiateBankLink();
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Stripe bank-link authorization failed");
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Payment Integrations</h2>
          <p className="text-white/55 mt-1">
            Link Stripe and bank-link rails for subscriptions and payouts.
            {plan !== 'enterprise' && (
              <span className="block text-xs mt-1 text-yellow-400">
                📦 Current Plan: <span className="capitalize">{plan}</span> 
                {!isBankAllowed && " (Upgrade for bank linking)"}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" className="border-white/20 text-white/70 hover:bg-white/10" onClick={() => void onRefresh()}>
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2">
        <label className="flex items-center gap-2 cursor-pointer flex-1 px-2">
          <input
            type="checkbox"
            checked={useOAuth}
            onChange={(e) => setUseOAuth(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm text-white/70">Use OAuth (automatic setup) instead of manual account IDs</span>
        </label>
      </div>

      {(error || actionError) && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error ?? actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stripe Card */}
        <Card className={`glass-panel border-white/10 ${!isStripeAllowed ? 'opacity-60 scale-98' : ''}`}>
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[#635bff]" />
                Stripe
              </span>
              {!isStripeAllowed && <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 font-normal">Pro+</span>}
            </CardTitle>
            <CardDescription className="text-white/50">Connect your Stripe account for card subscriptions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isStripeAllowed ? (
              <div className="rounded p-3 bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-200">
                Available on Pro and Enterprise plans. <a href="#" className="underline">Upgrade now</a>
              </div>
            ) : (
              <>
                {useOAuth ? (
                  <div className="text-sm text-white/70">
                    <p className="mb-2">Click below to authorize via Stripe Connect OAuth:</p>
                  </div>
                ) : (
                  <>
                    <Label className="text-white/70">Account ID / Connected Account</Label>
                    <Input
                      value={stripeAccountRef}
                      onChange={(e) => setStripeAccountRef(e.target.value)}
                      placeholder="acct_1234abcd"
                      className="bg-white/5 border-white/10 text-white"
                      disabled={loading || busyProvider === "stripe"}
                    />
                  </>
                )}
                <div className="text-xs text-white/50">
                  Status: <span className={stripe?.status === "connected" ? "text-green-400 font-semibold" : "text-white/40"}>{stripe?.status ?? "disconnected"}</span>
                </div>
                {stripe?.accountRef && <p className="text-xs text-white/45">Linked as {stripe.accountRef}</p>}
              </>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {isStripeAllowed && (
              <>
                {useOAuth ? (
                  <Button
                    className="flex-1 bg-[#635bff] hover:bg-[#544cd6]"
                    disabled={loading || busyProvider === "stripe"}
                    onClick={() => void handleOAuthInitiate("stripe")}
                  >
                    {busyProvider === "stripe" ? "Authorizing..." : "Authorize with Stripe"}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-[#635bff] hover:bg-[#544cd6]"
                    disabled={loading || busyProvider === "stripe" || !stripeAccountRef.trim()}
                    onClick={() => void handleConnect("stripe", stripeAccountRef.trim(), { platform: "stripe" })}
                  >
                    {busyProvider === "stripe" ? "Linking..." : "Link Stripe"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-white/20 text-white/70"
                  disabled={loading || busyProvider === "stripe"}
                  onClick={() => void handleDisconnect("stripe")}
                >
                  Unlink
                </Button>
              </>
            )}
          </CardFooter>
        </Card>

        {/* Bank Link Card */}
        <Card className={`glass-panel border-white/10 ${!isBankAllowed ? 'opacity-60 scale-98' : ''}`}>
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#10b981]" />
                Bank Link
              </span>
              {!isBankAllowed && <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 font-normal">Enterprise</span>}
            </CardTitle>
            <CardDescription className="text-white/50">Connect your Stripe account to manage bank payouts and ACH rails through Stripe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isBankAllowed ? (
              <div className="rounded p-3 bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
                Available on Enterprise plan only. <a href="#" className="underline">Upgrade now</a>
              </div>
            ) : (
              <>
                {useOAuth ? (
                  <div className="text-sm text-white/70">
                    <p className="mb-2">Authorize through Stripe Connect. Your bank account is added and verified in Stripe.</p>
                  </div>
                ) : (
                  <>
                    <Label className="text-white/70">Bank Link ID</Label>
                    <Input
                      value={bankAccountRef}
                      onChange={(e) => setBankAccountRef(e.target.value)}
                      placeholder="bank-link-token-or-id"
                      className="bg-white/5 border-white/10 text-white"
                      disabled={loading || busyProvider === "bank-link"}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="Bank name"
                        className="bg-white/5 border-white/10 text-white"
                        disabled={loading || busyProvider === "bank-link"}
                      />
                      <Input
                        value={bankLast4}
                        onChange={(e) => setBankLast4(e.target.value)}
                        placeholder="Last4"
                        className="bg-white/5 border-white/10 text-white"
                        disabled={loading || busyProvider === "bank-link"}
                      />
                    </div>
                  </>
                )}
                <div className="text-xs text-white/50">
                  Status: <span className={bank?.status === "connected" ? "text-green-400 font-semibold" : "text-white/40"}>{bank?.status ?? "disconnected"}</span>
                </div>
                {bank?.accountRef && <p className="text-xs text-white/45">Linked as {bank.accountRef}</p>}
              </>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {isBankAllowed && (
              <>
                {useOAuth ? (
                  <Button
                    className="flex-1 bg-[#10b981] hover:bg-[#0e9f6e]"
                    disabled={loading || busyProvider === "bank-link"}
                    onClick={() => void handleBankLinkInitiate()}
                  >
                    {busyProvider === "bank-link" ? "Authorizing..." : "Connect Bank Through Stripe"}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-[#10b981] hover:bg-[#0e9f6e]"
                    disabled={loading || busyProvider === "bank-link" || !bankAccountRef.trim()}
                    onClick={() => void handleConnect("bank-link", bankAccountRef.trim(), {
                      bankName: bankName.trim(),
                      last4: bankLast4.trim(),
                    })}
                  >
                    {busyProvider === "bank-link" ? "Linking..." : "Link Bank"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-white/20 text-white/70"
                  disabled={loading || busyProvider === "bank-link"}
                  onClick={() => void handleDisconnect("bank-link")}
                >
                  Unlink
                </Button>
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function PaywallScreen({ onSelectPlan }: { onSelectPlan: (plan: PlanTier) => void }) {
  const tiers: Array<{
    id: PlanTier;
    label: string;
    price: string;
    summary: string;
    features: string[];
    accent: string;
  }> = [
    {
      id: 'starter',
      label: 'Starter',
      price: '$24.99/mo',
      summary: 'For solo operators validating a market strategy.',
      features: ['2 workspaces', 'Core asset modules', 'Email support'],
      accent: 'from-[#0ea5e9] to-[#0284c7]',
    },
    {
      id: 'pro',
      label: 'Pro',
      price: '$54.99/mo',
      summary: 'For active desks running multi-asset operations.',
      features: ['10 workspaces', 'Derivatives + copy trading', 'Priority support'],
      accent: 'from-[#ffae00] to-[#f97316]',
    },
    {
      id: 'enterprise',
      label: 'Enterprise',
      price: '$99.99/mo',
      summary: 'For institutions requiring governance and dedicated infra.',
      features: ['Unlimited workspaces', 'SLA + dedicated onboarding', 'White-label deployment'],
      accent: 'from-[#c300ff] to-[#7e22ce]',
    },
    {
      id: 'enterprise_deluxe',
      label: 'Enterprise Custom Deluxe',
      price: '$225/mo',
      summary: 'Custom onboarding, selected enhancements, and a bespoke app engagement.',
      features: ['Everything in Enterprise', 'White-glove onboarding', '5 bonus features, custom-selected for you', 'Custom app by Axiom Zeta Innovations'],
      accent: 'from-[#facc15] to-[#c300ff]',
    },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-28 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.20)_0%,transparent_65%)]" />
        <div className="absolute -bottom-48 -right-36 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(195,0,255,0.16)_0%,transparent_70%)]" />
      </div>
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <p className="text-[#ffae00] uppercase tracking-[0.2em] text-xs mb-3">Billing Gateway</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Choose Your Access Tier</h1>
          <p className="text-white/55 mt-3 max-w-2xl mx-auto">Select a subscription plan to unlock platform modules and continue to the dashboard.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {tiers.map((tier) => (
            <div key={tier.id} className="rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl p-6 flex flex-col">
              <div className={`h-1.5 w-20 rounded-full bg-gradient-to-r ${tier.accent} mb-6`} />
              <p className="text-sm uppercase tracking-widest text-white/45">{tier.label}</p>
              <p className="text-3xl font-bold mt-2">{tier.price}</p>
              <p className="text-sm text-white/55 mt-3">{tier.summary}</p>
              <ul className="mt-6 space-y-2 text-sm text-white/70">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onSelectPlan(tier.id)}
                className={`mt-8 rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r ${tier.accent} hover:opacity-90 transition-opacity`}
              >
                Continue with {tier.label}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ label }: { label: string }) {
  return (
    <div className="px-4 pt-4 pb-1">
      <p className="text-white/25 text-[10px] uppercase tracking-widest font-medium">{label}</p>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick, badge }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; badge?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300
        ${active 
          ? 'bg-white/10 text-white shadow-[inset_2px_0_0_#1500ff]' 
          : 'text-white/60 hover:bg-white/5 hover:text-white'}
      `}
    >
      <span className={active ? 'text-[#1500ff] drop-shadow-[0_0_8px_rgba(21,0,255,0.8)]' : ''}>
        {icon}
      </span>
      <span className="font-medium text-sm flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/40">
          {badge}
        </span>
      )}
    </button>
  );
}

function ComingSoonPage({ label }: { label: string }) {
  return (
    <div className="max-w-lg mx-auto text-center py-24 space-y-3">
      <h2 className="text-2xl font-bold text-white">{label}</h2>
      <p className="text-white/50 text-sm">
        This module is not part of the active MVP and is disabled by default. No financial
        execution is available here. Enable it explicitly via the corresponding FEATURE_* flag
        for local demo purposes only.
      </p>
      <div className="inline-block px-4 py-1.5 rounded-full border border-white/10 text-white/40 text-xs uppercase tracking-widest">
        Coming Soon
      </div>
    </div>
  );
}

function LegacyKaleidoDeprecationPage() {
  return (
    <div className="max-w-lg mx-auto text-center py-24 space-y-4">
      <h2 className="text-2xl font-bold text-white">Kaleido Hyperledger Fabric</h2>
      <p className="text-white/50 text-sm">
        Kaleido Hyperledger Fabric integration has been superseded by Chainstack.
        This interface is maintained for legacy compatibility only and does not call
        Fabric endpoints. Connect via Chainstack Connect for live RPC status.
      </p>
      <div className="inline-block px-4 py-1.5 rounded-full border border-yellow-500/30 text-yellow-400 text-xs uppercase tracking-widest">
        Deprecated — not implemented
      </div>
    </div>
  );
}

// ─── Chainstack Connection Status (read-only, no signing) ──────────────────

interface ChainstackStatus {
  provider: string;
  network: string;
  chainId: number | null;
  connected: boolean;
  rpcHealthy: boolean;
  live: boolean;
  blockNumber: number | null;
  testnet: boolean;
  explorerUrl: string | null;
  error: string | null;
  lastChecked: string | null;
}

function ChainstackConnectPage() {
  const [status, setStatus] = useState<ChainstackStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/blockchain/status");
      const result = await res.json().catch(() => ({}));
      const errorText =
        typeof result?.error === "string"
          ? result.error
          : readApiError(result, "");
      setStatus({ ...result, error: errorText || null });
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const connected = status?.connected === true;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Network className="h-6 w-6 text-[#1500ff]" />
          Chainstack Connection
        </h2>
        <p className="text-white/50 mt-1 text-sm">
          Live RPC connection status for the configured Chainstack provider. Read-only — no signing keys are managed here.
        </p>
      </div>

      <Card className={`glass-panel border-t-2 ${connected ? "neon-border-blue" : "border-red-500/50"}`}>
        <CardHeader>
          <CardTitle className="text-white text-lg flex items-center gap-2">
            {loading ? (
              <span className="animate-spin h-4 w-4 border-2 border-white/50 border-t-transparent rounded-full" />
            ) : connected ? (
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-400" />
            )}
            {loading ? "Checking Chainstack connection…" : connected ? "Connected" : "Disconnected"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Network</p>
              <p className="text-white/90 font-mono">{status?.network ?? "—"}</p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Chain ID</p>
              <p className="text-white/90 font-mono">{status?.chainId ?? "—"}</p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">RPC Health</p>
              <p className={status?.rpcHealthy ? "text-green-400" : "text-red-400"}>
                {status?.rpcHealthy ? "Healthy" : "Unhealthy"}
              </p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Block Number</p>
              <p className="text-white/90 font-mono">{status?.blockNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Environment</p>
              <p className="text-white/90">{status?.testnet ? "Testnet" : "Mainnet"}</p>
            </div>
            <div>
              <p className="text-white/40 uppercase text-xs tracking-wider">Last Checked</p>
              <p className="text-white/90 font-mono">
                {status?.lastChecked ? new Date(status.lastChecked).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>

          {status?.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{status.error}</span>
            </div>
          )}

          {status?.explorerUrl && (
            <a
              href={status.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#1500ff] hover:underline text-xs"
            >
              View on block explorer <ChevronRight className="h-3 w-3" />
            </a>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setLoading(true); loadStatus(); }}
            className="text-white/50 hover:text-white hover:bg-white/10 gap-2"
          >
            Refresh Status
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  loading, 
  borderClass,
  valueClass = "text-white"
}: { 
  title: string; 
  value?: string; 
  loading: boolean;
  borderClass: string;
  valueClass?: string;
}) {
  return (
    <Card className={`glass-panel ${borderClass} glow-hover border-t-2 overflow-hidden relative group`}>
      {/* Subtle background gradient that appears on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <CardHeader className="pb-2 relative z-10">
        <CardTitle className="text-sm font-medium text-white/60 uppercase tracking-wider">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10">
        {loading ? (
          <Skeleton className="h-10 w-24 bg-white/10 rounded" />
        ) : (
          <div className={`text-3xl font-bold font-mono tracking-tight ${valueClass}`}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
