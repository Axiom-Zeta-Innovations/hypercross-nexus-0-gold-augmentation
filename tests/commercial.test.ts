import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { featuresForPlan, getStripePriceId } from "../server/config/plans";
import { isPostgresConfigured } from "../server/db/postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Structural tests (no database required) ─────────────────────────────────

test("plan config: Trader plan includes everything in Research plus trading/portfolio", () => {
  const research = featuresForPlan("research");
  const trader = featuresForPlan("trader");
  for (const feature of research) {
    assert.ok(trader.includes(feature), `Trader plan missing Research feature: ${feature}`);
  }
  assert.ok(trader.includes("automated_trading"));
  assert.ok(trader.includes("portfolio_analytics"));
});

test("plan config: Pro plan includes everything in Trader plus advanced strategies", () => {
  const trader = featuresForPlan("trader");
  const pro = featuresForPlan("pro");
  for (const feature of trader) {
    assert.ok(pro.includes(feature), `Pro plan missing Trader feature: ${feature}`);
  }
  assert.ok(pro.includes("advanced_strategies"));
});

test("plan config: 'none' plan grants no features", () => {
  assert.deepEqual(featuresForPlan("none"), []);
});

test("plan config: Stripe price ids come from environment, not hard-coded", () => {
  const original = process.env.STRIPE_PRICE_RESEARCH;
  process.env.STRIPE_PRICE_RESEARCH = "price_test_123";
  assert.equal(getStripePriceId("research"), "price_test_123");
  process.env.STRIPE_PRICE_RESEARCH = original;
});

test("secrets: .env.example contains only placeholders for server-only secrets", () => {
  const envExample = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  const secretKeys = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "JWT_SECRET", "ENCRYPTION_KEY", "DATABASE_URL", "CHAINSTACK_API_KEY"];
  for (const key of secretKeys) {
    const match = envExample.match(new RegExp(`^${key}="([^"]*)"`, "m"));
    assert.ok(match, `.env.example is missing ${key}`);
    assert.equal(match![1], "", `.env.example must not contain a real value for ${key}`);
  }
});

test("secrets: no real Stripe/JWT/Postgres secrets are committed in tracked source", () => {
  const suspiciousPatterns = [/sk_live_[A-Za-z0-9]/, /whsec_[A-Za-z0-9]{10,}/, /-----BEGIN PRIVATE KEY-----/];
  const filesToScan = ["server.ts", ".env.example", "package.json"];
  for (const file of filesToScan) {
    const content = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    for (const pattern of suspiciousPatterns) {
      assert.doesNotMatch(content, pattern, `${file} appears to contain a committed secret matching ${pattern}`);
    }
  }
});

// ── Real integration tests (require DATABASE_URL) ────────────────────────────
const hasPostgres = isPostgresConfigured();

test(
  "auth: register + login + refresh + logout round trip",
  { skip: !hasPostgres && "Set DATABASE_URL to run this test" },
  async () => {
    const { registerUser, loginUser, refreshSession, revokeRefreshToken, verifyAccessToken } = await import("../server/auth/ProductionAuthService");
    const email = `test-${Date.now()}@example.com`;
    const { user, tokens } = await registerUser({ email, password: "SuperSecret123" });
    assert.ok(user.id);
    assert.ok(verifyAccessToken(tokens.accessToken).userId === user.id);

    const loginResult = await loginUser({ email, password: "SuperSecret123" });
    assert.equal(loginResult.user.id, user.id);

    const refreshed = await refreshSession(loginResult.tokens.refreshToken);
    assert.equal(refreshed.user.id, user.id);

    // Old refresh token must be revoked after rotation.
    await assert.rejects(() => refreshSession(loginResult.tokens.refreshToken));

    await revokeRefreshToken(refreshed.tokens.refreshToken);
    await assert.rejects(() => refreshSession(refreshed.tokens.refreshToken));
  }
);

test(
  "auth: duplicate registration and wrong password are rejected",
  { skip: !hasPostgres && "Set DATABASE_URL to run this test" },
  async () => {
    const { registerUser, loginUser } = await import("../server/auth/ProductionAuthService");
    const email = `dup-${Date.now()}@example.com`;
    await registerUser({ email, password: "SuperSecret123" });
    await assert.rejects(() => registerUser({ email, password: "AnotherPass123" }));
    await assert.rejects(() => loginUser({ email, password: "WrongPassword" }));
  }
);

test(
  "entitlements: user without an active subscription is denied a paid feature",
  { skip: !hasPostgres && "Set DATABASE_URL to run this test" },
  async () => {
    const { registerUser } = await import("../server/auth/ProductionAuthService");
    const { hasEntitlement, hasActiveSubscription } = await import("../server/entitlements/EntitlementService");
    const email = `entitlement-${Date.now()}@example.com`;
    const { user } = await registerUser({ email, password: "SuperSecret123" });
    assert.equal(await hasActiveSubscription(user.id), false);
    assert.equal(await hasEntitlement(user.id, "automated_trading"), false);
  }
);
