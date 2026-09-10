import React, { useState } from "react";
import { CreditCard, ArrowLeft, Shield, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { readApiError } from "../lib/readApiError";

type PlanTier = "starter" | "pro" | "enterprise" | "enterprise_deluxe";

const PLAN_DETAILS: Record<
  PlanTier,
  { name: string; price: string; priceNote: string; color: string; features: string[] }
> = {
  starter: {
    name: "Starter",
    price: "$24.99",
    priceNote: "per month",
    color: "#0ea5e9",
    features: [
      "2 workspaces",
      "Core asset modules",
      "Stripe payments",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    price: "$54.99",
    priceNote: "per month",
    color: "#f97316",
    features: [
      "10 workspaces",
      "Derivatives + copy trading",
      "Stripe payments",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: "$99.99",
    priceNote: "per month",
    color: "#c300ff",
    features: [
      "Unlimited workspaces",
      "Stripe + bank-link payments",
      "SLA + dedicated onboarding",
      "White-label deployment",
    ],
  },
  enterprise_deluxe: {
    name: "Enterprise Custom Deluxe",
    price: "$225",
    priceNote: "per month",
    color: "#facc15",
    features: [
      "Everything in Enterprise",
      "White-glove onboarding",
      "5 bonus features, custom-selected for your business",
      "Custom app build by Axiom Zeta Innovations",
    ],
  },
};

interface CheckoutPageProps {
  plan: PlanTier;
  email: string;
  accessToken?: string;
  onBack: () => void;
  onSuccess: (plan: PlanTier) => void;
}

export default function CheckoutPage({ plan, email, accessToken, onBack, onSuccess }: CheckoutPageProps) {
  const provider = "stripe";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planDef = PLAN_DETAILS[plan];
  const isBillablePlan = true;
  // Stripe is the only active provider for all self-serve plans.
  const allowedProviders = ["stripe"];

  const handleCheckout = async () => {
    if (!isBillablePlan) return;
    setLoading(true);
    setError(null);
    try {
      const canonicalPlan = plan === "starter" ? "research" : plan === "enterprise" || plan === "enterprise_deluxe" ? "pro" : plan;
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ plan: canonicalPlan }),
      });
      const data = await res.json().catch(() => ({})) as unknown;
      const checkoutUrl =
        data && typeof data === "object" && "url" in data && typeof (data as { url?: unknown }).url === "string"
          ? (data as { url: string }).url
          : null;
      if (!res.ok || !checkoutUrl) {
        setError(
          readApiError(
            data,
            !res.ok
              ? `Failed to create ${provider} checkout session.`
              : "No redirect URL returned from payment provider.",
          ),
        );
        return;
      }
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-28 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.18)_0%,transparent_65%)]" />
        <div className="absolute -bottom-40 -right-28 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(195,0,255,0.14)_0%,transparent_65%)]" />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <button onClick={onBack} className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to plans
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Order Summary */}
          <div className="lg:col-span-2">
            <Card className="bg-black/60 border border-white/10 backdrop-blur-xl h-full">
              <CardContent className="pt-6 space-y-6">
                <div>
                  <div className="h-1 w-12 rounded-full mb-4" style={{ background: `linear-gradient(to right, ${planDef.color}, #7e22ce)` }} />
                  <p className="text-white/45 text-xs uppercase tracking-widest mb-1">Selected Plan</p>
                  <h2 className="text-2xl font-bold text-white">{planDef.name}</h2>
                  <p className="text-3xl font-bold mt-2 text-white">
                    {planDef.price}
                    <span className="text-sm text-white/45 font-normal ml-1">{planDef.priceNote}</span>
                  </p>
                </div>

                <div className="space-y-2 border-t border-white/10 pt-4">
                  {planDef.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm text-white/70">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 pt-4 space-y-1">
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Subtotal</span>
                    <span>{planDef.price}/mo</span>
                  </div>
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Billed</span>
                    <span>Monthly</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-white border-t border-white/10 pt-2 mt-2">
                    <span>Total due today</span>
                    <span>$0.00</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-white/35 mt-2">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Card required. Your 14-day trial starts today; cancel anytime before billing.</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Payment selection */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="bg-black/60 border border-white/10 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white text-lg">Payment Method</CardTitle>
                <CardDescription className="text-white/50">
                  Choose how you'd like to pay. You'll be redirected to complete the payment securely.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Stripe option */}
                {allowedProviders.includes("stripe") && (
                  <div className="w-full flex items-start gap-4 rounded-xl border border-[#635bff] bg-[#635bff]/10 p-4">
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${provider === "stripe" ? "border-[#635bff]" : "border-white/30"}`}>
                      {provider === "stripe" && <div className="h-2 w-2 rounded-full bg-[#635bff]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard className="h-4 w-4 text-[#635bff]" />
                        <span className="font-semibold text-white text-sm">Stripe</span>
                        <Badge className="text-[10px] px-1.5 py-0 bg-[#635bff]/20 text-[#a89cff] border-0">Credit / Debit Card</Badge>
                      </div>
                      <p className="text-xs text-white/45">Visa, Mastercard, Amex, and more. Powered by Stripe Checkout.</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {error}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex-col gap-3">
                <Button
                  className="w-full h-12 text-base font-semibold"
                  style={{ background: "linear-gradient(135deg, #635bff, #4f46e5)" }}
                  disabled={loading}
                  onClick={handleCheckout}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Start 14-Day Free Trial →
                    </>
                  )}
                </Button>
                <p className="text-xs text-white/30 text-center">
                  You'll be redirected to Stripe's secure checkout to add your card.
                  After payment, you'll be brought back to your dashboard.
                </p>
              </CardFooter>
            </Card>

            {/* Billing email notice */}
            <div className="flex items-center gap-2 px-1">
              <Mail className="h-3.5 w-3.5 text-white/30" />
              <p className="text-xs text-white/35">Receipt will be sent to <span className="text-white/55">{email}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
