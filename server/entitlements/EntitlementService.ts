/**
 * EntitlementService — resolves what a user is allowed to do, independent of
 * Stripe implementation details. Subscriptions determine entitlements, but
 * callers (middleware) only ever ask "does this user have feature X".
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/postgres";
import { subscriptions, entitlements } from "../../database/schema";
import { featuresForPlan, type FeatureKey, type PlanId } from "../config/plans";

export async function getActiveSubscription(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return row ?? null;
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await getActiveSubscription(userId);
  return Boolean(sub && ["active", "trialing"].includes(sub.status));
}

/** Recomputes and persists per-feature entitlement rows from the user's current plan/status. */
export async function syncEntitlementsFromSubscription(userId: string): Promise<void> {
  const db = getDb();
  const sub = await getActiveSubscription(userId);
  const active = Boolean(sub && ["active", "trialing"].includes(sub.status));
  const plan = (active ? (sub?.plan as PlanId) : "none") ?? "none";
  const enabledFeatures = new Set(featuresForPlan(plan));

  const allFeatures: FeatureKey[] = [
    "research_mode",
    "live_market_data",
    "blockchain_analysis",
    "nonlinear_engine",
    "automated_trading",
    "advanced_strategies",
    "portfolio_analytics",
    "desktop_access",
  ];

  for (const feature of allFeatures) {
    const enabled = enabledFeatures.has(feature);
    await db
      .insert(entitlements)
      .values({ userId, feature, enabled })
      .onConflictDoUpdate({
        target: [entitlements.userId, entitlements.feature],
        set: { enabled, updatedAt: new Date() },
      });
  }
}

export async function hasEntitlement(userId: string, feature: FeatureKey): Promise<boolean> {
  const db = getDb();
  const all = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  const found = all.find((e) => e.feature === feature);
  return Boolean(found?.enabled);
}
