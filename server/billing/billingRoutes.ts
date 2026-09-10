/**
 * Production Stripe billing routes (PostgreSQL-backed).
 *
 * Stripe webhooks are the authoritative source of subscription state — the
 * browser returning from Stripe checkout never grants entitlement by itself.
 */

import { Router } from "express";
import express from "express";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "../db/postgres";
import { subscriptions, users, webhookEvents } from "../../database/schema";
import { requireProductionAuth, type ProductionAuthedRequest } from "../auth/productionMiddleware";
import { getStripePriceId, planForStripePriceId, type PlanId } from "../config/plans";
import { syncEntitlementsFromSubscription } from "../entitlements/EntitlementService";
import { recordAuditEvent } from "../audit/AuditService";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(key);
}

async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const stripe = stripeClient();
  const customer = await stripe.customers.create({ email, metadata: { hypercrossUserId: userId } });

  if (existing) {
    await db.update(subscriptions).set({ stripeCustomerId: customer.id }).where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values({ userId, stripeCustomerId: customer.id });
  }
  return customer.id;
}

export const billingRouter = Router();

billingRouter.post("/create-checkout-session", requireProductionAuth, async (req: ProductionAuthedRequest, res) => {
  try {
    const plan = String(req.body?.plan ?? "").toLowerCase() as Exclude<PlanId, "none">;
    if (!["research", "trader", "pro"].includes(plan)) {
      return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "plan must be research, trader, or pro." } });
    }
    const priceId = getStripePriceId(plan);
    if (!priceId) {
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: `Stripe price for plan "${plan}" is not configured.` } });
    }

    const customerId = await getOrCreateStripeCustomer(req.authUser!.id, req.authUser!.email);
    const stripe = stripeClient();
    const publicUrl = process.env.HYPERCROSS_PUBLIC_URL || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${publicUrl}/dashboard?checkout=success`,
      cancel_url: `${publicUrl}/dashboard?checkout=canceled`,
      metadata: { hypercrossUserId: req.authUser!.id, plan },
    });

    return res.json({ url: session.url });
  } catch (error: any) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error?.message ?? "Unable to create checkout session." } });
  }
});

billingRouter.post("/create-portal-session", requireProductionAuth, async (req: ProductionAuthedRequest, res) => {
  try {
    const db = getDb();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.authUser!.id)).limit(1);
    if (!sub?.stripeCustomerId) {
      return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "No Stripe customer on file." } });
    }
    const stripe = stripeClient();
    const publicUrl = process.env.HYPERCROSS_PUBLIC_URL || "http://localhost:5173";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${publicUrl}/dashboard`,
    });
    return res.json({ url: portalSession.url });
  } catch (error: any) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error?.message ?? "Unable to create portal session." } });
  }
});

billingRouter.get("/subscription", requireProductionAuth, async (req: ProductionAuthedRequest, res) => {
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.authUser!.id)).limit(1);
  return res.json({ subscription: sub ?? null });
});

billingRouter.post("/subscription/cancel", requireProductionAuth, async (req: ProductionAuthedRequest, res) => {
  try {
    const db = getDb();
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.authUser!.id)).limit(1);
    if (!sub?.stripeSubscriptionId) {
      return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "No active subscription to cancel." } });
    }
    const stripe = stripeClient();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.update(subscriptions).set({ cancelAtPeriodEnd: true, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await recordAuditEvent({ userId: req.authUser!.id, action: "subscription_changed", metadata: { action: "cancel_at_period_end" } });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: error?.message ?? "Unable to cancel subscription." } });
  }
});

/** Applies a Stripe subscription object to our subscriptions table, then resyncs entitlements. */
async function applySubscriptionUpdate(stripeSubscription: Stripe.Subscription): Promise<void> {
  const db = getDb();
  const customerId = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : stripeSubscription.customer.id;
  const item = stripeSubscription.items.data[0];
  const priceId = item?.price?.id ?? "";
  const plan = planForStripePriceId(priceId);
  // Stripe API 2025+ moved period fields onto the subscription item, not the subscription itself.
  const periodStart = (item as any)?.current_period_start ?? (stripeSubscription as any).current_period_start;
  const periodEnd = (item as any)?.current_period_end ?? (stripeSubscription as any).current_period_end;

  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1);
  if (!existing) {
    console.warn("Received Stripe subscription update for unknown customer:", customerId);
    return;
  }

  await db.update(subscriptions).set({
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: priceId,
    plan,
    status: stripeSubscription.status,
    currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, existing.id));

  await syncEntitlementsFromSubscription(existing.userId);
  await recordAuditEvent({ userId: existing.userId, action: "subscription_changed", metadata: { status: stripeSubscription.status, plan } });
}

/**
 * Stripe webhook — mounted with express.raw() body parsing (see server.ts).
 * Idempotent: every event id is recorded in `webhook_events` before processing;
 * a duplicate delivery is acknowledged with 200 but not reprocessed.
 */
export async function handleStripeWebhook(req: express.Request, res: express.Response) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.headers["stripe-signature"];
  if (!webhookSecret || !signature) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Missing Stripe webhook signature/secret." } });
  }

  let event: Stripe.Event;
  try {
    const stripe = stripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error: any) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: `Webhook signature verification failed: ${error?.message}` } });
  }

  const db = getDb();
  try {
    await db.insert(webhookEvents).values({ id: event.id, type: event.type });
  } catch {
    // Primary key conflict = already processed this exact event id.
    return res.json({ ok: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const stripe = stripeClient();
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          await applySubscriptionUpdate(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Stripe API 2025+ nests the subscription reference under `parent`.
        const subscriptionId = (invoice as any).subscription ?? (invoice as any).parent?.subscription_details?.subscription;
        if (subscriptionId) {
          const stripe = stripeClient();
          const sub = await stripe.subscriptions.retrieve(String(subscriptionId));
          await applySubscriptionUpdate(sub);
        }
        break;
      }
      default:
        break;
    }
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("Stripe webhook handling error:", error?.message ?? error);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Webhook processing failed." } });
  }
}
