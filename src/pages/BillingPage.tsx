import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, CreditCard, CircleDollarSign, RefreshCw, AlertTriangle, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { readApiError } from "../lib/readApiError";

type PlanTier = "starter" | "pro" | "enterprise" | "enterprise_deluxe";

const PLAN_DETAILS: Record<PlanTier, { name: string; price: string; color: string }> = {
  starter: { name: "Starter", price: "$24.99/mo", color: "#0ea5e9" },
  pro: { name: "Pro", price: "$54.99/mo", color: "#f97316" },
  enterprise: { name: "Enterprise", price: "$99.99/mo", color: "#c300ff" },
  enterprise_deluxe: { name: "Enterprise Custom Deluxe", price: "$225/mo", color: "#facc15" },
};

interface Subscription {
  id: string;
  provider: "stripe" | "paypal" | "trial";
  planTier: PlanTier;
  status: "active" | "trialing" | "canceled" | "past_due";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  createdAt: string;
}

interface Customer {
  email: string;
  planTier: PlanTier;
  createdAt: string;
}

interface BillingPageProps {
  email: string;
  onUpgrade: () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ProviderIcon({ provider }: { provider: "stripe" | "paypal" | "trial" }) {
  return provider === "stripe"
    ? <CreditCard className="h-4 w-4 text-[#635bff]" />
    : provider === "paypal"
    ? <CircleDollarSign className="h-4 w-4 text-[#0070ba]" />
    : <Calendar className="h-4 w-4 text-white/50" />;
}

export default function BillingPage({ email, onUpgrade }: BillingPageProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadSubscription = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/subscription?email=${encodeURIComponent(email)}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({})) as any;
      setCustomer(data.customer ?? null);
      setSubscription(data.subscription ?? null);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscription();
  }, [email]);

  const handleCancel = async () => {
    setCanceling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        setCancelError(readApiError(data, "Failed to cancel subscription."));
        return;
      }
      setCancelSuccess(true);
      setShowConfirm(false);
      await loadSubscription();
    } catch (err: unknown) {
      setCancelError(err instanceof Error && err.message ? err.message : "Network error.");
    } finally {
      setCanceling(false);
    }
  };

  const plan = subscription?.planTier ?? customer?.planTier ?? "starter";
  const planDef = PLAN_DETAILS[plan];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Billing & Subscription</h2>
          <p className="text-white/50 mt-1 text-sm">Manage your current plan and payment details.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 text-white/60 hover:bg-white/10"
          onClick={() => void loadSubscription()}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Current Plan */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center justify-between">
            Current Plan
            {!loading && subscription?.status === "active" && (
              <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">Active</Badge>
            )}
            {!loading && subscription?.status === "trialing" && (
              <Badge className="bg-purple-500/20 text-purple-300 border-0 text-xs">Free Trial</Badge>
            )}
            {!loading && subscription?.status === "canceled" && (
              <Badge className="bg-red-500/20 text-red-400 border-0 text-xs">Canceled</Badge>
            )}
            {!loading && !subscription && (
              <Badge className="bg-white/10 text-white/40 border-0 text-xs">No subscription</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-32 bg-white/10" />
              <Skeleton className="h-4 w-48 bg-white/10" />
            </div>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div>
                  <div className="h-1 w-10 rounded-full mb-2" style={{ background: `linear-gradient(to right, ${planDef.color}, #7e22ce)` }} />
                  <p className="text-2xl font-bold text-white">{planDef.name}</p>
                  <p className="text-sm text-white/45 mt-0.5">{planDef.price}</p>
                  {subscription?.status === "trialing" && (
                    <p className="text-xs text-purple-300 mt-1">
                      14-day free trial — card on file, no charge until it ends unless you cancel
                    </p>
                  )}
                </div>
              </div>

              {subscription && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                      <ProviderIcon provider={subscription.provider} />
                      Payment provider
                    </p>
                    <p className="text-sm text-white capitalize">{subscription.provider}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Subscribed since</p>
                    <p className="text-sm text-white">{fmtDate(subscription.createdAt)}</p>
                  </div>
                  {subscription.currentPeriodEnd && (
                    <>
                      <div>
                        <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {subscription.status === "canceled"
                            ? "Access until"
                            : subscription.status === "trialing"
                            ? "Trial ends"
                            : "Next renewal"}
                        </p>
                        <p className="text-sm text-white">{fmtDate(subscription.currentPeriodEnd)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-1">Status</p>
                        <p
                          className={`text-sm font-medium ${
                            subscription.status === "active"
                              ? "text-green-400"
                              : subscription.status === "trialing"
                              ? "text-purple-300"
                              : "text-red-400"
                          }`}
                        >
                          {subscription.status === "active"
                            ? "Active"
                            : subscription.status === "trialing"
                            ? "Free Trial"
                            : "Canceled"}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!subscription && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/50">
                  No active subscription found for <span className="text-white/70">{email}</span>.
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter className="flex gap-3 border-t border-white/10 pt-4">
          <Button
            className="flex-1"
            style={{ background: "linear-gradient(135deg, #1500ff, #c300ff)" }}
            onClick={onUpgrade}
          >
            {subscription?.status === "active" || subscription?.status === "trialing" ? "Change Plan" : "Subscribe Now"}
          </Button>

          {(subscription?.status === "active" || subscription?.status === "trialing") && !showConfirm && (
            <Button
              variant="outline"
              className="border-white/20 text-white/60 hover:border-red-500/50 hover:text-red-400"
              onClick={() => setShowConfirm(true)}
            >
              Cancel
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Confirm cancellation */}
      {showConfirm && (
        <Card className="glass-panel border-red-500/30 bg-red-500/5">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Cancel your {planDef.name} subscription?</p>
                <p className="text-xs text-white/50 mt-1">
                  Your access continues until {fmtDate(subscription?.currentPeriodEnd ?? null)}.
                  At that point, you'll be downgraded to the free tier. This action cannot be undone.
                </p>
              </div>
            </div>
            {cancelError && (
              <p className="text-xs text-red-400 pl-8">{cancelError}</p>
            )}
            <div className="flex gap-2 pl-8">
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={canceling}
                onClick={handleCancel}
              >
                {canceling ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Canceling…</> : "Yes, cancel subscription"}
              </Button>
              <Button size="sm" variant="outline" className="border-white/20 text-white/60" onClick={() => setShowConfirm(false)}>
                Keep subscription
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancellation success */}
      {cancelSuccess && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3 text-sm text-green-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Subscription canceled. You'll retain access until the end of the current billing period.
        </div>
      )}

      {/* Payment info note */}
      <Card className="glass-panel border-white/10">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-white/5 p-2">
              <CreditCard className="h-4 w-4 text-white/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Payment Methods</p>
              <p className="text-xs text-white/45 mt-1">
                Card details and payment method management are handled securely by Stripe or PayPal.
                To update your payment method, please visit your{" "}
                <a href="https://billing.stripe.com" target="_blank" rel="noopener noreferrer" className="text-[#635bff] underline">Stripe billing portal</a>{" "}
                or{" "}
                <a href="https://www.paypal.com/myaccount" target="_blank" rel="noopener noreferrer" className="text-[#0070ba] underline">PayPal account</a>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
