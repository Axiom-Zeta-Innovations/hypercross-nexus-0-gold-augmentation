import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import whiteLabelConfig from "./config/whiteLabelConfig.json";
import { queries } from "./src/db";
import { BlockchainProviderFactory } from "./server/blockchain/BlockchainProviderFactory";
import { blockchainService } from "./server/blockchain/BlockchainService";
import { WalletVerificationService } from "./server/wallet/WalletVerificationService";
import { PortfolioService } from "./server/portfolio/PortfolioService";
import { TransferService } from "./server/transactions/TransferService";
import { TransactionService } from "./server/transactions/TransactionService";
import { SwapService } from "./server/swap/SwapService";
import { OnChainTradingService } from "./server/trading/OnChainTradingService";
import {
  kaleidoNotImplementedBody,
  liveExecuteTradeNotImplementedBody,
  paperFilledTradeNote,
  paperTradingMeta,
} from "./server/trading/paperTrading";
import { toErrorPayload } from "./server/blockchain/errors";
import { getFeatureFlags, type FeatureFlags } from "./server/config/FeatureFlags";
import { productionAuthRouter } from "./server/auth/productionAuthRoutes";
import { buildAllowedOrigins, isAllowedBrowserOrigin } from "./server/http/allowedOrigins";
import { isPostgresConfigured, checkPostgresHealth, closePostgresPool } from "./server/db/postgres";
import { billingRouter, handleStripeWebhook } from "./server/billing/billingRoutes";
import { intelligenceRouter } from "./server/intelligence/intelligenceRoutes";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  getSessionExpiration,
  clearSessionCookie,
  requireAuth,
  requireRole,
  requirePermission,
  requireOrganizationAccess,
  isValidRole,
  type AuthenticatedRequest,
} from "./server/auth";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.createHash("sha256").update("hypercross-default-key").digest("hex").slice(0, 32);

function encryptValue(value: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptValue(value: string): string {
  const [ivHex, encryptedHex] = value.split(":");
  if (!ivHex || !encryptedHex) return value;
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

function storeEncryptedOAuthToken(provider: string, accessToken: string, refreshToken?: string | null, expiresAt?: string | null, scope?: string, tokenType?: string, metadata?: Record<string, unknown>) {
  const tokenId = `oauth_${provider}_${Date.now()}`;
  queries.oauthTokens.upsert.run(
    tokenId,
    provider,
    encryptValue(accessToken),
    refreshToken ? encryptValue(refreshToken) : null,
    expiresAt ?? null,
    scope ?? "",
    tokenType ?? "Bearer",
    JSON.stringify(metadata ?? {})
  );
}

function getStoredOAuthToken(provider: string): any | null {
  const row = queries.oauthTokens.getByProvider.get(provider) as any;
  if (!row) return null;
  return {
    ...row,
    accessToken: row.accessToken ? decryptValue(row.accessToken) : null,
    refreshToken: row.refreshToken ? decryptValue(row.refreshToken) : null,
  };
}

function recordIdempotency(resource: string, key: string, payload: unknown): boolean {
  const existing = queries.idempotency.get.get(resource, key) as any;
  if (existing) return false;
  queries.idempotency.set.run(crypto.randomUUID(), resource, key, JSON.stringify(payload));
  return true;
}

function getWebhookEventId(event: any): string {
  return String(event?.id ?? event?.resource?.id ?? event?.event_id ?? `${event?.type ?? "webhook"}-${Date.now()}`);
}

function checkDuplicateWebhook(resource: string, eventId: string): boolean {
  const key = `${resource}:${eventId}`;
  return !recordIdempotency(resource, key, { eventId });
}

function requireVerifiedStripeSignature(payload: Buffer, signature: string | undefined, secret: string | undefined): { ok: boolean; event?: any; error?: string } {
  if (!secret) return { ok: false, error: "Missing Stripe webhook secret." };
  if (!signature) return { ok: false, error: "Missing stripe-signature header." };

  const parts = signature.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));
  if (!tPart || !v1Part) return { ok: false, error: "Malformed stripe signature header." };

  const timestamp = tPart.slice(2);
  const expectedSignature = v1Part.slice(3);
  const signedPayload = `${timestamp}.${payload.toString("utf8")}`;
  const computed = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expected = Buffer.from(expectedSignature, "hex");
  const actual = Buffer.from(computed, "hex");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, error: "Stripe signature mismatch." };
  }

  return { ok: true, event: JSON.parse(payload.toString("utf8")) };
}

async function verifyPayPalWebhook(req: express.Request): Promise<{ ok: boolean; event?: any; error?: string }> {
  const webhookId = String(req.headers["paypal-transmission-id"] || "");
  const timestamp = String(req.headers["paypal-transmission-time"] || "");
  const signature = String(req.headers["paypal-transmission-sig"] || "");
  const certUrl = String(req.headers["paypal-cert-url"] || "");
  const eventBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body ?? {});

  if (!webhookId || !timestamp || !signature || !certUrl) {
    return { ok: false, error: "Missing PayPal webhook headers." };
  }

  const paypalSecret = process.env.PAYPAL_WEBHOOK_SECRET;
  if (!paypalSecret) {
    return { ok: false, error: "PayPal webhook secret is not configured." };
  }

  const payload = `${webhookId}|${timestamp}|${eventBody}`;
  const computed = crypto.createHmac("sha256", paypalSecret).update(payload).digest("base64");
  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
    return { ok: false, error: "PayPal signature mismatch." };
  }

  try {
    return { ok: true, event: JSON.parse(eventBody) };
  } catch {
    return { ok: false, error: "Malformed PayPal webhook payload." };
  }
}

type AccountBalances = Record<string, number>;
type PaymentProvider = "stripe" | "paypal" | "bank-link";
type PlanTier = "starter" | "pro" | "enterprise" | "enterprise_deluxe";

// Plan-tier feature matrix: which payment providers can be linked per subscription tier.
const PLAN_PAYMENT_FEATURES: Record<PlanTier, PaymentProvider[]> = {
  starter: ["stripe"],
  pro: ["stripe"],
  enterprise: ["stripe", "bank-link"],
  enterprise_deluxe: ["stripe"],
};

const SUBSCRIPTION_PLANS: Record<
  PlanTier,
  { name: string; priceUsd: number; interval: "month"; stripePriceId: string | null; paypalPlanId: string | null }
> = {
  starter: {
    name: "Starter",
    priceUsd: 24.99,
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_STARTER || null,
    paypalPlanId: process.env.PAYPAL_PLAN_STARTER || null,
  },
  pro: {
    name: "Pro",
    priceUsd: 54.99,
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_PRO || null,
    paypalPlanId: process.env.PAYPAL_PLAN_PRO || null,
  },
  enterprise: {
    name: "Enterprise",
    priceUsd: 99.99,
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || null,
    paypalPlanId: process.env.PAYPAL_PLAN_ENTERPRISE || null,
  },
  enterprise_deluxe: {
    name: "Enterprise Custom Deluxe",
    priceUsd: 225,
    interval: "month",
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE_CUSTOM_DELUXE || null,
    paypalPlanId: null,
  },
};

// OAuth configuration - load from environment or use defaults
const OAUTH_CONFIG = {
  stripe: {
    clientId: process.env.STRIPE_OAUTH_CLIENT_ID || "ca_test_stripe_oauth_client_id",
    clientSecret: process.env.STRIPE_OAUTH_CLIENT_SECRET || "secret_test_stripe_oauth_secret",
    redirectUri: `${process.env.OAUTH_REDIRECT_BASE || "http://localhost:10000"}/api/oauth/stripe/callback`,
    authorizationUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
  },
  paypal: {
    clientId: process.env.PAYPAL_OAUTH_CLIENT_ID || "AZBLp0test_paypal_client_id",
    clientSecret: process.env.PAYPAL_OAUTH_CLIENT_SECRET || "secret_test_paypal_client_secret",
    redirectUri: `${process.env.OAUTH_REDIRECT_BASE || "http://localhost:10000"}/api/oauth/paypal/callback`,
    authorizationUrl: process.env.PAYPAL_SANDBOX ? 
      "https://www.sandbox.paypal.com/oauth2/auth" : 
      "https://www.paypal.com/oauth2/auth",
    tokenUrl: process.env.PAYPAL_SANDBOX ? 
      "https://api.sandbox.paypal.com/v1/oauth2/token" : 
      "https://api.paypal.com/v1/oauth2/token",
  },
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID || "test_plaid_client_id",
    secret: process.env.PLAID_SECRET || "secret_test_plaid_secret",
    publicKey: process.env.PLAID_PUBLIC_KEY || "test_plaid_public_key",
    environment: process.env.PLAID_ENV || "sandbox",
  },
};

function envFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 10000;

  app.set("trust proxy", 1); // Railway/other PaaS run behind a reverse proxy

  app.use(helmet({
    contentSecurityPolicy: false, // the SPA sets its own CSP needs; avoid breaking Vite/dev assets
    // Coinbase Smart Wallet requires window.opener access from its authorization popup.
    crossOriginOpenerPolicy: false,
  }));

  const allowedOrigins = buildAllowedOrigins({
    allowedOriginsEnv: process.env.ALLOWED_ORIGINS,
    renderExternalUrl: process.env.RENDER_EXTERNAL_URL,
    hypercrossPublicUrl: process.env.HYPERCROSS_PUBLIC_URL,
  });
  console.log(`CORS allow-list (${allowedOrigins.length}): ${allowedOrigins.join(", ")}`);
  app.use(cors({
    origin(origin, callback) {
      // Requests without an Origin header are same-origin, Electron, or CLI calls.
      if (isAllowedBrowserOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }
      console.warn(`[CORS Request Blocked]: ${origin} (allow-list: ${allowedOrigins.join(", ")})`);
      return callback(null, false);
    },
    credentials: true,
  }));


  // Stripe webhook endpoints require the raw request body for signature
  // verification — they must never be parsed by the JSON body parser below.
  const RAW_BODY_PATHS = new Set(["/api/webhooks/stripe", "/api/billing/webhook"]);
  app.use((req, res, next) => {
    if (RAW_BODY_PATHS.has(req.path)) return next();
    return express.json({ limit: "1mb" })(req, res, next);
  });

  app.use((req, _res, next) => {
    const rawCookies = String(req.headers.cookie ?? "");
    const cookies: Record<string, string> = {};
    for (const part of rawCookies.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf("=");
      const key = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
      const rawValue = idx >= 0 ? trimmed.slice(idx + 1) : "";
      // A malformed %-encoding (from third-party/extension cookies) must not 500 every request.
      let value = rawValue;
      try {
        value = idx >= 0 ? decodeURIComponent(rawValue) : "";
      } catch {
        value = rawValue;
      }
      cookies[key] = value;
    }
    (req as any).cookies = cookies;
    next();
  });

  function normalizeEmail(raw: string | undefined): string | null {
    const value = raw?.trim().toLowerCase();
    if (!value) return null;
    return value;
  }

  function normalizePhone(raw: string | undefined): string | null {
    const value = raw?.trim();
    if (!value) return null;
    return value.replace(/\s+/g, "");
  }

  function parseBalances(value: unknown): AccountBalances {
    try {
      if (!value) return {};
      if (typeof value === "string") return JSON.parse(value) as AccountBalances;
      if (typeof value === "object") return value as AccountBalances;
      return {};
    } catch {
      return {};
    }
  }

  function round(value: number, decimals = 8): number {
    const p = 10 ** decimals;
    return Math.round(value * p) / p;
  }

  function normalizePaymentProvider(raw: unknown): PaymentProvider | null {
    const value = String(raw ?? "").trim().toLowerCase();
    if (value === "stripe" || value === "paypal" || value === "bank-link") {
      return value as PaymentProvider;
    }
    return null;
  }

  function parseJson(value: unknown): Record<string, any> {
    try {
      if (!value) return {};
      if (typeof value === "string") return JSON.parse(value);
      if (typeof value === "object") return value as Record<string, any>;
      return {};
    } catch {
      return {};
    }
  }

  // OAuth helper functions
  function generateOAuthState(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  function getAuthorizedProvidersForPlan(planTier: unknown): PaymentProvider[] {
    const tier = String(planTier ?? "starter").toLowerCase() as PlanTier;
    return PLAN_PAYMENT_FEATURES[tier] || PLAN_PAYMENT_FEATURES.starter;
  }

  function isProviderAllowedForPlan(provider: PaymentProvider, planTier: unknown): boolean {
    return getAuthorizedProvidersForPlan(planTier).includes(provider);
  }

  async function exchangeOAuthCode(
    provider: "stripe" | "paypal",
    code: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope: string }> {
    const config = OAUTH_CONFIG[provider];
    
    try {
      const params = new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      });

      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const data = await response.json() as any;
      if (!response.ok) {
        throw new Error(data?.error_description || data?.error || "OAuth token exchange failed");
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        scope: data.scope || "",
      };
    } catch (err: any) {
      throw new Error(`Failed to exchange OAuth code for ${provider}: ${err?.message}`);
    }
  }

  function generateStripeConnectAuthUrl(state: string): string {
    const config = OAUTH_CONFIG.stripe;
    const params = new URLSearchParams({
      client_id: config.clientId,
      state,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "read_write",
      suggested_capabilities: "card_payments,transfers",
    });
    return `${config.authorizationUrl}?${params.toString()}`;
  }

  function generatePayPalAuthUrl(state: string): string {
    const config = OAUTH_CONFIG.paypal;
    const params = new URLSearchParams({
      client_id: config.clientId,
      state,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "https://api.paypal.com/v1/payments/payment/create https://api.paypal.com/v1/vault/credit-card",
    });
    return `${config.authorizationUrl}?${params.toString()}`;
  }

  function generatePlaidLinkToken(userId: string): Promise<string> {
    // For Plaid Link, return the public key and user token info
    // The frontend will initialize Plaid Link SDK with this
    return Promise.resolve(OAUTH_CONFIG.plaid.publicKey || "test_plaid_token");
  }

  function ensureDefaultLinkedAccounts() {
    const existing = queries.linkedAccounts.list.all() as any[];
    if (existing.length > 0) return;

    const seed = [
      {
        id: "acc-prime-01",
        label: "Prime Broker Account",
        provider: "Hyper-Cross Prime",
        balances: { USD: 250000, BTC: 2.4, ETH: 45.2, SOL: 1500 },
      },
      {
        id: "acc-cex-02",
        label: "Exchange Operations",
        provider: "Global CEX",
        balances: { USD: 92000, BTC: 0.85, ETH: 12.6, USDT: 180000 },
      },
    ];

    for (const account of seed) {
      queries.linkedAccounts.create.run(
        account.id,
        account.label,
        account.provider,
        JSON.stringify(account.balances)
      );
    }
  }

  ensureDefaultLinkedAccounts();

  app.post("/api/auth/signup", (req, res) => {
    if (isPostgresConfigured()) return res.status(410).json({ error: "Legacy authentication is disabled when canonical authentication is configured." });
    try {
      const method = req.body?.method === "phone" ? "phone" : "email";
      const email = normalizeEmail(req.body?.emailOrSubAccount);
      const phone = normalizePhone(req.body?.phoneNumber);
      const password = String(req.body?.password || "");

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters." });
      }

      if (method === "email") {
        if (!email) return res.status(400).json({ error: "Email is required." });
        const existing = queries.authUser.getByEmail.get(email) as any;
        if (existing) return res.status(409).json({ error: "An account with that email already exists." });

        const id = crypto.randomUUID();
        const orgId = crypto.randomUUID();
        const orgName = `${email.split("@")[0]}'s workspace`;
        queries.authUser.create.run(id, email, null, hashPassword(password));
        queries.user.create.run(id, email, null, null);
        queries.organization.create.run(orgId, orgName, id, JSON.stringify({}));
        queries.organizationMember.add.run(crypto.randomUUID(), id, orgId, "OWNER");
        queries.authUser.touchLogin.run(id);

        const sessionId = createSessionToken();
        queries.session.create.run(sessionId, id, orgId, "OWNER", getSessionExpiration().toISOString());
        res.cookie(getSessionCookieName(), sessionId, getSessionCookieOptions());
        return res.status(201).json({ ok: true, user: { id, email, method: "email", organizationId: orgId, role: "OWNER" } });
      }

      if (!phone) return res.status(400).json({ error: "Phone number is required." });
      const existing = queries.authUser.getByPhone.get(phone) as any;
      if (existing) return res.status(409).json({ error: "An account with that phone number already exists." });

      const id = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const orgName = `${phone} workspace`;
      queries.authUser.create.run(id, null, phone, hashPassword(password));
      queries.user.create.run(id, null, null, null);
      queries.organization.create.run(orgId, orgName, id, JSON.stringify({}));
      queries.organizationMember.add.run(crypto.randomUUID(), id, orgId, "OWNER");
      queries.authUser.touchLogin.run(id);

      const sessionId = createSessionToken();
      queries.session.create.run(sessionId, id, orgId, "OWNER", getSessionExpiration().toISOString());
      res.cookie(getSessionCookieName(), sessionId, getSessionCookieOptions());
      return res.status(201).json({ ok: true, user: { id, phone, method: "phone", organizationId: orgId, role: "OWNER" } });
    } catch (error) {
      console.error("Signup error:", error);
      return res.status(500).json({ error: "Unable to create account." });
    }
  });

  app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
    return res.json({ ok: true, user: req.user });
  });

  app.post("/api/auth/logout", requireAuth, (req: AuthenticatedRequest, res) => {
    const sessionId = (req as any).cookies?.[getSessionCookieName()];
    if (sessionId) queries.session.deleteById.run(sessionId);
    clearSessionCookie(res);
    return res.json({ ok: true, loggedOut: true });
  });

  app.post("/api/auth/signin", (req, res) => {
    if (isPostgresConfigured()) return res.status(410).json({ error: "Legacy authentication is disabled when canonical authentication is configured." });
    try {
      const method = req.body?.method === "phone" ? "phone" : "email";
      const email = normalizeEmail(req.body?.emailOrSubAccount);
      const phone = normalizePhone(req.body?.phoneNumber);
      const password = String(req.body?.password || "");

      if (!password) {
        return res.status(400).json({ error: "Password is required." });
      }

      const user = method === "email"
        ? (email ? (queries.authUser.getByEmail.get(email) as any) : null)
        : (phone ? (queries.authUser.getByPhone.get(phone) as any) : null);

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials." });
      }

      if (!verifyPassword(password, String(user.passwordHash))) {
        return res.status(401).json({ error: "Invalid credentials." });
      }

      const membership = (queries.organizationMember.getByUser.get(user.id) as any[]) ?? [];
      const primaryOrg = membership[0];
      const sessionId = createSessionToken();
      const orgId = primaryOrg?.orgId ?? null;
      const role = isValidRole(primaryOrg?.role) ? primaryOrg.role : "OWNER";

      queries.authUser.touchLogin.run(String(user.id));
      queries.session.create.run(sessionId, user.id, orgId, role, getSessionExpiration().toISOString());
      res.cookie(getSessionCookieName(), sessionId, getSessionCookieOptions());
      return res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          method,
          organizationId: orgId,
          role,
        },
      });
    } catch (error) {
      console.error("Signin error:", error);
      return res.status(500).json({ error: "Unable to sign in." });
    }
  });

  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many password reset attempts. Please try again later." },
  });

  app.post("/api/auth/reset-password/request", passwordResetLimiter, (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const user = email ? queries.authUser.getByEmail.get(email) as any : null;
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        queries.passwordReset.invalidateForUser.run(user.id);
        queries.passwordReset.create.run(crypto.randomUUID(), user.id, crypto.createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 15 * 60 * 1000).toISOString());
        const baseUrl = process.env.HYPERCROSS_PUBLIC_URL || "http://localhost:5173";
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        if (process.env.NODE_ENV === "production") {
          if (!process.env.EMAIL_PROVIDER_URL) {
            console.error("[SECURITY] Password reset requested but no email provider is configured.");
          } else {
            console.warn("[SECURITY] EMAIL_PROVIDER_URL is configured but delivery is not implemented; reset remains unavailable.");
          }
        } else {
          console.info(`[DEVELOPMENT ONLY] Password reset URL for ${email}: ${resetUrl}`);
        }
      }
      return res.json({ ok: true, message: "If an account exists, a reset link has been sent." });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ error: "Unable to request password reset." });
    }
  });

  app.post("/api/auth/reset-password/confirm", passwordResetLimiter, (req, res) => {
    try {
      const token = String(req.body?.token || "");
      const password = String(req.body?.newPassword || "");
      if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8) {
        return res.status(400).json({ error: "Invalid reset request." });
      }
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const reset = queries.passwordReset.getActiveByHash.get(tokenHash) as any;
      if (!reset) return res.status(400).json({ error: "Reset link expired or invalid." });
      const updated = queries.passwordReset.markUsed.run(reset.id);
      if (updated.changes !== 1) return res.status(400).json({ error: "Reset link expired or invalid." });
      queries.authUser.updatePassword.run(hashPassword(password), reset.userId);
      queries.session.deleteByUser.run(reset.userId);
      return res.json({ ok: true, message: "Password reset successful. You can now log in." });
    } catch (error) {
      console.error("Reset password confirmation error:", error);
      return res.status(500).json({ error: "Unable to reset password." });
    }
  });

  app.post("/api/auth/reset-password", (_req, res) => {
    return res.status(410).json({ error: "This endpoint is disabled. Use the password reset request and confirm flow." });
  });

  // Health check endpoint (application process health)
  app.get("/api/health", async (req, res) => {
    let rpcHealthy = false;
    let chainId: number | null = null;
    let blockNumber: number | null = null;
    let error: string | null = null;

    try {
      rpcHealthy = await blockchainService.healthCheck();
      if (rpcHealthy) {
        const status = await blockchainService.getStatus();
        chainId = status.chainId ?? null;
        blockNumber = status.blockNumber ?? null;
        if (blockNumber === null) {
          blockNumber = await blockchainService.getBlockNumber().catch(() => null);
        }
      } else {
        error = "Chainstack RPC check failed.";
      }
    } catch (err: any) {
      rpcHealthy = false;
      error = err?.message ?? "Failed to query blockchain dependency";
    }

    const payload = {
      ok: rpcHealthy,
      backend: "online",
      rpc: rpcHealthy ? "online" : "offline",
      chainId,
      blockNumber,
      timestamp: new Date().toISOString(),
      ...(error && { error }),
    };

    if (!rpcHealthy) {
      return res.status(503).json(payload);
    }

    res.json(payload);
  });

  // Readiness check endpoint (infrastructure dependencies)
  app.get("/api/ready", async (req, res) => {
    try {
      const healthy = await blockchainService.healthCheck();
      if (!healthy) {
        return res.status(503).json({
          ready: false,
          blockchain: "degraded",
          timestamp: new Date().toISOString(),
        });
      }
      res.json({
        ready: true,
        blockchain: "healthy",
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        ready: false,
        blockchain: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Commercial deployment health endpoints (Railway-facing) ──
  // ROLE 1: /health/live - Process exists. Verifies the HTTP server is running.
  app.get("/health/live", (req, res) => {
    res.json({ status: "ok", role: "process-live", timestamp: new Date().toISOString() });
  });

  // ROLE 2: /health/ready - Server and required database/RPC dependencies are ready or operational.
  app.get("/health/ready", async (req, res) => {
    const [chainstackHealthy, postgres] = await Promise.all([
      blockchainService.healthCheck().catch(() => false),
      checkPostgresHealth(),
    ]);

    const dependencies = {
      postgres: isPostgresConfigured() ? (postgres.healthy ? "healthy" : "unavailable") : "not_configured",
      chainstack: chainstackHealthy ? "healthy" : "unavailable",
    };

    // Postgres is required for commercial account/billing state once configured;
    // Chainstack degradation disables blockchain features but does not fail readiness by itself.
    const ready = isPostgresConfigured() ? postgres.healthy : true;

    return res.status(ready ? 200 : 503).json({
      ready,
      dependencies,
      timestamp: new Date().toISOString(),
    });
  });

  // ROLE 3: /health - Legacy/redundant checkpoint. Aliased to /health/live.
  app.get("/health", (req, res) => {
    res.redirect(301, "/health/live");
  });

  // ── Commercial (PostgreSQL-backed) auth + billing ──
  // Mounted only when DATABASE_URL is configured; distinct paths from the
  // legacy SQLite-backed /api/auth/signup|signin (see docs/DEPLOYMENT.md).
  if (isPostgresConfigured()) {
    app.use("/api/auth/v2", productionAuthRouter);
    app.use("/api/billing", billingRouter);
    app.use("/api/intelligence", intelligenceRouter);
    app.post("/api/billing/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
    console.log("✓ PostgreSQL-backed auth/billing routes mounted at /api/auth/v2 and /api/billing");
  } else {
    console.warn("⚠ DATABASE_URL not set — commercial auth/billing routes (/api/auth/v2, /api/billing) are disabled. Using legacy SQLite auth only.");
  }

  // GET /api/config/features - Resolved feature flags for the frontend (no secrets).
  app.get("/api/config/features", (req, res) => {
    res.json({ ok: true, features: getFeatureFlags() satisfies FeatureFlags });
  });

  // GET /api/config/capabilities - Central capability registry mapping feature states dynamically
  app.get("/api/config/capabilities", async (req, res) => {
    try {
      const { getCapabilities } = await import("./server/config/Capabilities");
      const capabilities = await getCapabilities();
      res.json({ ok: true, capabilities });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch capabilities" });
    }
  });

  // Blockchain status endpoint (detailed blockchain information)
  app.get("/api/blockchain/status", async (req, res) => {
    try {
      const startedAt = Date.now();
      const status = await blockchainService.getStatus();
      const rpcLatencyMs = Date.now() - startedAt;
      const networkInfo = blockchainService.getNetworkInfo();
      const wss = blockchainService.getWebSocketStatus();
      const allowMainnet = ["true", "1"].includes((process.env.ALLOW_MAINNET || "false").trim().toLowerCase());

      return res.json({
        provider: status.provider,
        network: status.network,
        chainId: status.chainId ?? null,
        connected: status.connected,
        rpcHealthy: status.rpcHealthy,
        wssHealthy: wss.connected,
        wssConfigured: wss.configured,
        live: status.live,
        blockNumber: status.blockNumber ?? null,
        rpcLatencyMs,
        testnet: networkInfo?.testnet ?? false,
        mainnetWritesAllowed: (networkInfo?.testnet ?? true) ? true : allowMainnet,
        explorerUrl: networkInfo?.explorerUrl ?? null,
        error: status.error ?? null,
        lastChecked: status.lastChecked ?? null,
      });
    } catch (error: any) {
      return res.status(200).json({
        provider: "chainstack",
        network: process.env.CHAINSTACK_NETWORK || "ethereum",
        chainId: Number(process.env.CHAINSTACK_CHAIN_ID || 1),
        connected: false,
        rpcHealthy: false,
        wssHealthy: false,
        wssConfigured: Boolean(process.env.CHAINSTACK_WSS_URL),
        live: false,
        blockNumber: null,
        rpcLatencyMs: null,
        testnet: true,
        mainnetWritesAllowed: false,
        explorerUrl: null,
        error: error?.message ?? "Chainstack RPC is not configured.",
        lastChecked: new Date().toISOString(),
      });
    }
  });

  // ── Wallet Verification Endpoints (Phase 6) ──
  // These endpoints enable users to prove wallet ownership via signature verification
  // without exposing private keys to the server.

  // POST /api/wallet/nonce - Generate a nonce for signing
  // Query param: ?address=0x...
  // Response: { nonce, expiresAt }
  app.post("/api/wallet/nonce", (req, res) => {
    try {
      const address = String(req.query.address || req.body?.address || "").trim();

      // Add address format validation:
      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({
          error: "Invalid wallet address. Expected format: 0x[40 hex characters]",
        });
      }

      const result = WalletVerificationService.createNonce(address);

      return res.json({
        ok: true,
        address,
        nonce: result.nonce,
        expiresAt: result.expiresAt,
        message: `Sign this message to verify ownership of wallet ${address}\n\nNonce: ${result.nonce}`,
      });
    } catch (error: any) {
      return res.status(400).json({
        error: error?.message || "Invalid wallet address",
      });
    }
  });

  // POST /api/wallet/verify - Verify wallet signature
  // Body: { address, signature, nonce }
  // Response: { ok, sessionToken, address, verifiedAt } | { ok: false, error }
  app.post("/api/wallet/verify", (req, res) => {
    try {
      const { address, signature, nonce } = req.body;

      if (!address || !signature || !nonce) {
        return res.status(400).json({
          error: "Missing required fields: address, signature, nonce",
        });
      }

      const result = WalletVerificationService.verifySignature({
        address,
        signature,
        nonce,
      });

      if (!result.ok) {
        return res.status(401).json({
          ok: false,
          error: result.error,
        });
      }

      // Set session cookie with the verified session token
      res.cookie(getSessionCookieName(), result.sessionToken, getSessionCookieOptions());

      return res.json({
        ok: true,
        sessionToken: result.sessionToken,
        address: result.address,
        verifiedAt: result.verifiedAt,
        message: "Wallet verified successfully",
      });
    } catch (error: any) {
      console.error("Wallet verification error:", error);
      return res.status(500).json({
        ok: false,
        error: error?.message || "Verification failed",
      });
    }
  });

  // GET /api/wallet/:address - Get wallet verification status
  // Returns: { ok, address, verifiedAt, sessionId } | { ok: false, error }
  app.get("/api/wallet/:address", (req, res) => {
    try {
      const { address } = req.params;

      const info = WalletVerificationService.getWalletInfo(address);

      if (!info) {
        return res.json({
          ok: false,
          address,
          verifiedAt: null,
          sessionId: null,
          message: "No verification record for this address",
        });
      }

      return res.json({
        ok: true,
        address: info.address,
        verifiedAt: info.verifiedAt,
        sessionId: info.sessionId,
      });
    } catch (error: any) {
      return res.status(400).json({
        ok: false,
        error: error?.message || "Invalid wallet address",
      });
    }
  });

  // GET /api/wallet/session - Resolve the current session cookie to a verified wallet
  // Returns: { ok, address, expiresAt } | { ok: false, error }
  app.get("/api/wallet/session", (req, res) => {
    const token = req.cookies?.[getSessionCookieName()];
    if (!token) {
      return res.status(401).json({ ok: false, error: "WALLET_NOT_VERIFIED", message: "No active wallet session." });
    }
    const info = WalletVerificationService.getSessionInfo(token);
    if (!info) {
      return res.status(401).json({ ok: false, error: "WALLET_NOT_VERIFIED", message: "Session is invalid or expired." });
    }
    return res.json({ ok: true, address: info.address, expiresAt: info.expiresAt });
  });

  // DELETE /api/wallet/session - Revoke the current wallet session (sign out)
  app.delete("/api/wallet/session", (req, res) => {
    const token = req.cookies?.[getSessionCookieName()];
    if (token) {
      WalletVerificationService.revokeSession(token);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  // ── Portfolio Service Endpoints (Phase 7) ──
  // These endpoints provide real-time access to wallet holdings across multiple EVM chains

  // GET /api/portfolio/:address - Get cached portfolio for wallet
  // Query params: ?refresh=true (force blockchain query), ?chainId=11155111 (specific chain)
  // Returns: { walletAddress, holdings: [...], updatedAt }
  app.get("/api/portfolio/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;
      const forceRefresh = req.query.refresh === "true";

      const portfolio = await PortfolioService.getPortfolio(address, chainId, forceRefresh);
      const status = await blockchainService.getStatus();

      return res.json({
        ok: true,
        isPublic: true,
        warning: "This endpoint shows testnet data publicly. Do not assume privacy.",
        chainId: chainId || status.chainId || 11155111,
        testnetLabel: status.network || "Ethereum Sepolia",
        portfolio,
      });
    } catch (error: any) {
      return res.status(400).json({
        ok: false,
        error: error?.message || "Failed to fetch portfolio",
      });
    }
  });

  // POST /api/portfolio/:address/refresh - Force refresh portfolio from blockchain
  // Body: { chainId: 11155111 } (optional, defaults to configured chain)
  // Returns: { ok, portfolio }
  app.post("/api/portfolio/:address/refresh", async (req, res) => {
    try {
      const { address } = req.params;
      const { chainId } = req.body;

      if (!chainId || typeof chainId !== "number") {
        return res.status(400).json({
          error: "chainId is required and must be a number",
        });
      }

      const status = await blockchainService.getStatus();
      const networkInfo = blockchainService.getNetworkInfo();

      if (status.chainId !== chainId) {
        return res.status(400).json({
          error: `Portfolio refresh only supported for configured chain (${status.chainId})`,
        });
      }

      const portfolio = await PortfolioService.refreshPortfolio(
        address,
        chainId,
        networkInfo?.networkConfig?.id || "unknown"
      );

      return res.json({
        ok: true,
        isPublic: true,
        warning: "This endpoint shows testnet data publicly. Do not assume privacy.",
        chainId: chainId,
        testnetLabel: status.network || "Ethereum Sepolia",
        portfolio,
      });
    } catch (error: any) {
      return res.status(400).json({
        ok: false,
        error: error?.message || "Portfolio refresh failed",
      });
    }
  });

  // GET /api/portfolio/:address/balance/:symbol - Get balance for specific token
  // Query params: ?chainId=11155111
  // Returns: { ok, balance: { symbol, balance, balanceDecimal, network, updatedAt } }
  app.get("/api/portfolio/:address/balance/:symbol", async (req, res) => {
    try {
      const { address, symbol: symbolParam } = req.params;
      const { chainId } = req.query;
      const symbol = String(symbolParam);

      if (!chainId || typeof chainId === "string" && isNaN(Number(chainId))) {
        return res.status(400).json({
          error: "chainId query parameter is required and must be a number",
        });
      }

      const balance = await PortfolioService.getTokenBalance(
        address,
        Number(chainId),
        String(symbol).toUpperCase()
      );

      if (!balance) {
        return res.status(404).json({
          ok: false,
          error: `No balance found for ${symbol} on chain ${chainId}`,
        });
      }

      const status = await blockchainService.getStatus();

      return res.json({
        ok: true,
        isPublic: true,
        warning: "This endpoint shows testnet data publicly. Do not assume privacy.",
        chainId: Number(chainId),
        testnetLabel: status.network || "Ethereum Sepolia",
        balance,
      });
    } catch (error: any) {
      return res.status(400).json({
        ok: false,
        error: error?.message || "Failed to fetch token balance",
      });
    }
  });

  // ── Transaction Manager ──
  // Persistent record of real on-chain transactions. Status only becomes CONFIRMED
  // after a real transaction receipt is observed AND its intent has been verified.
  // Every lookup below is ownership-aware: the record must belong to the
  // authenticated user (by userId or verified wallet address) or the request is
  // rejected with 404 — never merely because the caller is authenticated.

  app.get("/api/transactions/:id", requireAuth, (req: AuthenticatedRequest, res) => {
    const record = TransactionService.getForUser(req.params.id, { id: req.user?.id, walletAddress: req.user?.walletAddress });
    if (!record) return res.status(404).json({ ok: false, error: "Transaction not found." });
    return res.json({ ok: true, transaction: record });
  });

  app.get("/api/transactions", requireAuth, (req: AuthenticatedRequest, res) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(400).json({ ok: false, error: "WALLET_NOT_VERIFIED", message: "No verified wallet on this session." });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
    const transactions = TransactionService.listByWallet(walletAddress, limit);
    return res.json({ ok: true, transactions });
  });

  // POST /api/transactions/:id/submitted - Record the REAL hash the wallet returned after broadcast.
  app.post("/api/transactions/:id/submitted", requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const owned = TransactionService.getForUser(req.params.id, { id: req.user?.id, walletAddress: req.user?.walletAddress });
      if (!owned) return res.status(404).json({ ok: false, error: "Transaction not found." });
      const { transactionHash } = req.body;
      if (!transactionHash || typeof transactionHash !== "string") {
        return res.status(400).json({ ok: false, error: "transactionHash is required." });
      }
      TransactionService.recordSubmitted(req.params.id, transactionHash);
      return res.json({ ok: true, transaction: TransactionService.getById(req.params.id) });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  // POST /api/transactions/:id/cancelled - Wallet rejected the signature (not a backend failure).
  app.post("/api/transactions/:id/cancelled", requireAuth, (req: AuthenticatedRequest, res) => {
    const owned = TransactionService.getForUser(req.params.id, { id: req.user?.id, walletAddress: req.user?.walletAddress });
    if (!owned) return res.status(404).json({ ok: false, error: "Transaction not found." });
    TransactionService.markWalletRejected(req.params.id);
    return res.json({ ok: true, transaction: TransactionService.getById(req.params.id) });
  });

  // GET /api/transactions/:id/poll - Poll Chainstack for a receipt and update status.
  app.get("/api/transactions/:id/poll", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const owned = TransactionService.getForUser(req.params.id, { id: req.user?.id, walletAddress: req.user?.walletAddress });
      if (!owned) return res.status(404).json({ ok: false, error: "Transaction not found." });
      const status = await TransactionService.pollReceipt(req.params.id);
      return res.json({ ok: true, status, transaction: TransactionService.getById(req.params.id) });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  // ── Native / ERC-20 Transfers ──
  // These endpoints only PREPARE an unsigned transaction (validate, estimate gas,
  // enforce mainnet policy). The user's connected wallet signs and broadcasts it;
  // the resulting real hash is then reported back via /api/transactions/:id/submitted.

  app.post("/api/transfers/native/prepare", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { to, amount } = req.body;
      const prepared = await TransferService.prepareNativeTransfer(req.user?.id ?? null, walletAddress, String(to), String(amount));
      return res.status(201).json({ ok: true, ...prepared });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  app.post("/api/transfers/erc20/prepare", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { token, to, amount } = req.body;
      const prepared = await TransferService.prepareErc20Transfer(req.user?.id ?? null, walletAddress, String(token), String(to), String(amount));
      return res.status(201).json({ ok: true, ...prepared });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  // ── Swap (DEX) ──
  // Real quotes/allowance/approval via the 0x Swap API. Requires ZEROX_API_KEY.

  app.post("/api/swap/quote", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { tokenIn, tokenOut, amountIn, slippageBps } = req.body;
      const quote = await SwapService.requestQuote({
        tokenIn: String(tokenIn),
        tokenOut: String(tokenOut),
        amountIn: String(amountIn),
        takerAddress: walletAddress,
        slippageBps: Number(slippageBps ?? 50),
      });
      return res.json({ ok: true, quote });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  app.get("/api/swap/allowance", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { tokenAddress, spender, requiredAmount } = req.query;
      if (!requiredAmount) return res.status(400).json({ ok: false, error: "requiredAmount is required." });
      const result = await SwapService.checkAllowance(String(tokenAddress), walletAddress, String(spender), String(requiredAmount));
      return res.json({ ok: true, ...result });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  app.post("/api/swap/approve/prepare", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { tokenAddress, spender, unlimited } = req.body;
      const prepared = await SwapService.prepareApproval(req.user?.id ?? null, walletAddress, String(tokenAddress), String(spender), {
        unlimited: unlimited === true,
      });
      return res.status(201).json({ ok: true, ...prepared });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  // Requires explicit user confirmation on the frontend — never auto-executed after approval.
  app.post("/api/swap/execute/prepare", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { tokenIn, tokenOut } = req.body;
      const prepared = await SwapService.prepareSwap(req.user?.id ?? null, walletAddress, String(tokenIn), String(tokenOut));
      return res.status(201).json({ ok: true, ...prepared });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  // ── On-chain Trading (BUY/SELL implemented as swaps) ──
  app.post("/api/trading/quote", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const walletAddress = req.user?.walletAddress;
      if (!walletAddress) return res.status(400).json({ ok: false, code: "WALLET_NOT_VERIFIED", error: "No verified wallet on this session." });
      const { side, base, quote, amount, slippageBps } = req.body;
      const result = await OnChainTradingService.quoteTrade({
        side: side === "SELL" ? "SELL" : "BUY",
        base: String(base),
        quote: String(quote),
        amount: String(amount),
        takerAddress: walletAddress,
        slippageBps: Number(slippageBps ?? 50),
      });
      return res.json({ ok: true, mode: "onchain", realExecution: true, quote: result });
    } catch (error: any) {
      const payload = toErrorPayload(error);
      return res.status(400).json({ ok: false, ...payload });
    }
  });

  // ── Live Data Routes for Modules ──

  // OAuth endpoints for payment provider authorization

  app.get("/api/oauth/authorize", requireAuth, requirePermission("manage_billing"), (req, res) => {
    const { provider, plan } = req.query;
    const providerStr = String(provider ?? "").toLowerCase() as PaymentProvider;
    const planStr = String(plan ?? "starter");

    // Check if provider is allowed for plan tier
    if (!isProviderAllowedForPlan(providerStr, planStr)) {
      return res.status(403).json({
        error: `${providerStr} is not available for ${planStr} tier`,
        availableProviders: getAuthorizedProvidersForPlan(planStr),
      });
    }

    if (providerStr === "stripe") {
      const state = generateOAuthState();
      // Store state in session/db for verification on callback (in production, use session store)
      res.json({
        authUrl: generateStripeConnectAuthUrl(state),
        state,
        provider: "stripe",
      });
    } else if (providerStr === "paypal") {
      const state = generateOAuthState();
      res.json({
        authUrl: generatePayPalAuthUrl(state),
        state,
        provider: "paypal",
      });
    } else if (providerStr === "bank-link") {
      const state = generateOAuthState();
      res.json({
        authUrl: generateStripeConnectAuthUrl(state),
        state,
        provider: "bank-link",
        message: "Authorize Stripe Connect, then add and verify the bank account in Stripe.",
      });
    } else {
      res.status(400).json({
        error: "provider must be one of stripe, paypal, bank-link",
        example: "/api/oauth/authorize?provider=stripe&plan=pro",
      });
    }
  });

  app.post("/api/oauth/stripe/callback", async (req, res) => {
    try {
      const { code, state } = req.body;
      if (!code) {
        return res.status(400).json({ error: "code is required" });
      }

      const tokenData = await exchangeOAuthCode("stripe", code);
      storeEncryptedOAuthToken(
        "stripe",
        tokenData.accessToken,
        tokenData.refreshToken || null,
        tokenData.expiresIn ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString() : null,
        tokenData.scope,
        "Bearer",
        { state, linkedAt: new Date().toISOString() }
      );

      // Also update paymentConnections to mark as connected
      const tokenId = `oauth_stripe_${Date.now()}`;
      queries.paymentConnections.upsert.run(
        "stripe",
        "connected",
        code, // Store the authorization code as reference
        JSON.stringify({ oauthTokenId: tokenId, method: "oauth" })
      );

      res.json({
        ok: true,
        provider: "stripe",
        status: "connected",
        message: "Stripe Connect linked successfully",
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || "Failed to process Stripe callback",
      });
    }
  });

  // Stripe redirects the browser with GET after Connect authorization.
  app.get("/api/oauth/stripe/callback", async (req, res) => {
    try {
      const code = String(req.query.code ?? "").trim();
      const state = String(req.query.state ?? "").trim();
      if (!code) {
        return res.status(400).send("Stripe authorization was not completed.");
      }

      const tokenData = await exchangeOAuthCode("stripe", code);
      const tokenId = `oauth_stripe_${Date.now()}`;
      storeEncryptedOAuthToken(
        "stripe",
        tokenData.accessToken,
        tokenData.refreshToken || null,
        tokenData.expiresIn ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString() : null,
        tokenData.scope,
        "Bearer",
        { state, linkedAt: new Date().toISOString() }
      );
      queries.paymentConnections.upsert.run(
        "stripe",
        "connected",
        code,
        JSON.stringify({ oauthTokenId: tokenId, method: "oauth" })
      );

      res.type("html").send(`<!doctype html><title>Stripe connected</title><p>Stripe connected successfully. You can close this window.</p><script>window.close()</script>`);
    } catch (err: any) {
      res.status(500).send(`Stripe authorization failed: ${err?.message || "unknown error"}`);
    }
  });

  app.post("/api/oauth/paypal/callback", async (req, res) => {
    try {
      const { code, state } = req.body;
      if (!code) {
        return res.status(400).json({ error: "code is required" });
      }

      const tokenData = await exchangeOAuthCode("paypal", code);
      storeEncryptedOAuthToken(
        "paypal",
        tokenData.accessToken,
        tokenData.refreshToken || null,
        tokenData.expiresIn ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString() : null,
        tokenData.scope,
        "Bearer",
        { state, linkedAt: new Date().toISOString() }
      );

      // Also update paymentConnections to mark as connected
      const tokenId = `oauth_paypal_${Date.now()}`;
      queries.paymentConnections.upsert.run(
        "paypal",
        "connected",
        code, // Store the authorization code as reference
        JSON.stringify({ oauthTokenId: tokenId, method: "oauth" })
      );

      res.json({
        ok: true,
        provider: "paypal",
        status: "connected",
        message: "PayPal Partner account linked successfully",
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || "Failed to process PayPal callback",
      });
    }
  });

  app.post("/api/oauth/plaid/exchange", async (req, res) => {
    try {
      const { publicToken, userId } = req.body;
      if (!publicToken) {
        return res.status(400).json({ error: "publicToken is required" });
      }

      // In production, exchange publicToken for accessToken via Plaid API
      // For now, store the public token reference
      storeEncryptedOAuthToken(
        "bank-link",
        publicToken,
        null,
        null,
        "bank_account_access",
        "Bearer",
        { linkedAt: new Date().toISOString(), userId }
      );

      // Also update paymentConnections to mark as connected
      const tokenId = `oauth_plaid_${Date.now()}`;
      queries.paymentConnections.upsert.run(
        "bank-link",
        "connected",
        publicToken,
        JSON.stringify({ oauthTokenId: tokenId, method: "plaid_link" })
      );

      res.json({
        ok: true,
        provider: "bank-link",
        status: "connected",
        message: "Bank account linked successfully via Plaid",
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || "Failed to process Plaid exchange",
      });
    }
  });

  app.post("/api/oauth/revoke", requireAuth, requirePermission("manage_billing"), (req, res) => {
    try {
      const { provider } = req.body;
      const providerStr = normalizePaymentProvider(provider);
      if (!providerStr) {
        return res.status(400).json({ error: "provider must be one of stripe, paypal, bank-link" });
      }

      queries.oauthTokens.delete.run(providerStr);
      queries.paymentConnections.disconnect.run(providerStr);

      res.json({
        ok: true,
        provider: providerStr,
        message: `${providerStr} OAuth connection revoked`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to revoke OAuth connection" });
    }
  });

  app.get("/api/payments/connections", requireAuth, requirePermission("manage_billing"), (req, res) => {
    try {
      const plan = (req.query.plan as string) || "starter";
      const allowedProviders = getAuthorizedProvidersForPlan(plan);

      const rows = queries.paymentConnections.list.all() as any[];
      const byProvider = new Map(rows.map((row) => [String(row.provider), row]));
      const providers: PaymentProvider[] = ["stripe", "paypal", "bank-link"];

      const payload = providers
        .filter((p) => allowedProviders.includes(p))
        .map((provider) => {
          const row = byProvider.get(provider);
          return {
            provider,
            status: row?.status ?? "disconnected",
            accountRef: row?.accountRef ?? null,
            metadata: parseJson(row?.metadata),
            linkedAt: row?.linkedAt ?? null,
            updatedAt: row?.updatedAt ?? null,
            allowed: true,
          };
        });

      // Add disallowed providers info (optional)
      const disallowedProviders = providers.filter((p) => !allowedProviders.includes(p));
      for (const provider of disallowedProviders) {
        payload.push({
          provider,
          status: "not-available",
          accountRef: null,
          metadata: { reason: `Not available for ${plan} tier` },
          linkedAt: null,
          updatedAt: null,
          allowed: false,
        });
      }

      res.json({ connections: payload, plan, allowedProviders });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch payment connections" });
    }
  });

  app.post("/api/payments/connect", requireAuth, requirePermission("manage_billing"), (req, res) => {
    try {
      const plan = (req.body?.plan as string) || "starter";
      const provider = normalizePaymentProvider(req.body?.provider);
      
      if (!provider) {
        return res.status(400).json({ error: "provider must be one of stripe, paypal, bank-link" });
      }

      // Check if provider is allowed for this plan tier
      if (!isProviderAllowedForPlan(provider, plan)) {
        return res.status(403).json({
          error: `${provider} is not available for ${plan} tier`,
          availableProviders: getAuthorizedProvidersForPlan(plan),
        });
      }

      const accountRef = String(req.body?.accountRef ?? "").trim();
      const metadata = typeof req.body?.metadata === "object" && req.body?.metadata
        ? req.body.metadata
        : {};

      if (!accountRef) {
        return res.status(400).json({ error: "accountRef is required" });
      }

      queries.paymentConnections.upsert.run(
        provider,
        "connected",
        accountRef,
        JSON.stringify(metadata),
      );

      const row = queries.paymentConnections.getByProvider.get(provider) as any;
      return res.status(201).json({
        ok: true,
        connection: {
          provider,
          status: row?.status ?? "connected",
          accountRef: row?.accountRef ?? accountRef,
          metadata: parseJson(row?.metadata),
          linkedAt: row?.linkedAt ?? null,
          updatedAt: row?.updatedAt ?? null,
          allowed: true,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to connect payment provider" });
    }
  });

  app.post("/api/payments/disconnect", requireAuth, requirePermission("manage_billing"), (req, res) => {
    try {
      const provider = normalizePaymentProvider(req.body?.provider);
      if (!provider) {
        return res.status(400).json({ error: "provider must be one of stripe, paypal, bank-link" });
      }

      queries.paymentConnections.disconnect.run(provider);
      const row = queries.paymentConnections.getByProvider.get(provider) as any;
      return res.json({
        ok: true,
        connection: {
          provider,
          status: row?.status ?? "disconnected",
          accountRef: null,
          metadata: {},
          linkedAt: null,
          updatedAt: row?.updatedAt ?? null,
          allowed: true,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to disconnect payment provider" });
    }
  });

  app.get("/api/paper/accounts", requireAuth, requirePermission("manage_assets"), (req, res) => {
    try {
      const accounts = (queries.linkedAccounts.list.all() as any[]).map((row) => {
        const balances = parseBalances(row.balances);
        const totalUsd = Object.entries(balances).reduce((sum, [asset, amount]) => {
          if (asset === "USD" || asset === "USDT") return sum + Number(amount || 0);
          return sum;
        }, 0);

        return {
          id: row.id,
          label: row.label,
          provider: row.provider,
          balances,
          totalUsd: round(totalUsd, 2),
          updatedAt: row.updatedAt,
        };
      });

      res.json({ ...paperTradingMeta(), accounts });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch linked accounts" });
    }
  });

  app.get("/api/paper/trades", requireAuth, requirePermission("manage_assets"), (req, res) => {
    try {
      const rawLimit = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;
      const trades = queries.trades.listRecent.all(limit);
      res.json({ ...paperTradingMeta(), trades });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch trades" });
    }
  });

  // PAPER TRADING ONLY — mutates a local demo ledger. No blockchain transaction is
  // submitted. Every response is explicitly labeled { mode: "paper", realExecution: false }.
  // For real on-chain trading, see /api/trading/quote (OnChainTradingService + SwapService).
  app.post("/api/paper/trades/execute", requireAuth, requirePermission("execute_permitted_trading_operations"), (req, res) => {
    try {
      const accountId = String(req.body?.accountId ?? "").trim();
      const instrument = String(req.body?.instrument ?? "").trim().toUpperCase();
      const side = String(req.body?.side ?? "").trim().toUpperCase();
      const quantity = Number(req.body?.quantity);
      const price = Number(req.body?.price);

      if (!accountId || !instrument || !["BUY", "SELL"].includes(side)) {
        return res.status(400).json({ error: "accountId, instrument, and side (BUY/SELL) are required." });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "Quantity must be a positive number." });
      }
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ error: "Price must be a positive number." });
      }

      const account = queries.linkedAccounts.getById.get(accountId) as any;
      if (!account) return res.status(404).json({ error: "Linked account not found." });

      const [baseRaw, quoteRaw] = instrument.split("-");
      const base = (baseRaw || "").trim();
      const quote = (quoteRaw || "USD").trim() || "USD";
      if (!base) return res.status(400).json({ error: "Instrument must be formatted like BTC-USD." });

      const balances = parseBalances(account.balances);
      const notional = round(quantity * price, 2);

      if (side === "BUY") {
        const quoteAvailable = Number(balances[quote] ?? 0);
        if (quoteAvailable < notional) {
          return res.status(400).json({ error: `Insufficient ${quote} balance.` });
        }
        balances[quote] = round(quoteAvailable - notional, 2);
        balances[base] = round(Number(balances[base] ?? 0) + quantity, 8);
      } else {
        const baseAvailable = Number(balances[base] ?? 0);
        if (baseAvailable < quantity) {
          return res.status(400).json({ error: `Insufficient ${base} balance.` });
        }
        balances[base] = round(baseAvailable - quantity, 8);
        balances[quote] = round(Number(balances[quote] ?? 0) + notional, 2);
      }

      queries.linkedAccounts.updateBalances.run(JSON.stringify(balances), accountId);

      const tradeId = crypto.randomUUID();
      queries.trades.create.run(tradeId, accountId, instrument, side, quantity, price, notional, "FILLED");

      const updated = queries.linkedAccounts.getById.get(accountId) as any;
      res.status(201).json({
        ok: true,
        ...paperTradingMeta(),
        trade: {
          id: tradeId,
          accountId,
          instrument,
          side,
          quantity,
          price,
          notional,
          status: "FILLED",
          ...paperFilledTradeNote(),
        },
        account: {
          id: updated.id,
          label: updated.label,
          provider: updated.provider,
          balances: parseBalances(updated.balances),
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to execute trade" });
    }
  });

  // Legacy live path — never implies a real fill. Paper trading is at PAPER_TRADES_EXECUTE_PATH.
  app.post("/api/live/execute-trade", (_req, res) => {
    return res.status(501).json(liveExecuteTradeNotImplementedBody());
  });

  const kaleidoDisabled = (_req: express.Request, res: express.Response) => {
    return res.status(501).json(kaleidoNotImplementedBody());
  };
  app.get("/api/kaleido", kaleidoDisabled);
  app.post("/api/kaleido", kaleidoDisabled);
  app.post("/api/fabric-connect", kaleidoDisabled);
  app.get("/api/fabric-query", kaleidoDisabled);
  app.post("/api/fabric-query", kaleidoDisabled);
  app.post("/api/fabric-invoke", kaleidoDisabled);
  app.get("/api/fabric-invoke", kaleidoDisabled);

  app.get("/api/live/assets", requireAuth, requirePermission("manage_assets"), async (req, res) => {
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const channel = (req.query.channel as string) ?? "default-channel";
      const assets = await dataSourceManager.getAssets(channel);
      res.json(assets);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch assets" });
    }
  });

  app.post("/api/live/assets", requireAuth, requirePermission("manage_assets"), async (req, res) => {
    try {
      const { name, symbol, supply, type, channel, chaincode, contractAddress, txHash, blockNumber, chainId, ownerAddress, status } = req.body ?? {};
      if (!name || !symbol || !supply) {
        return res.status(400).json({ error: "Name, symbol, and supply are required parameters." });
      }

      const id = `asset_${Date.now()}`;
      queries.assets.createFull.run(
        id,
        name,
        symbol,
        supply.toString(),
        type || "Fungible",
        channel || "default-channel",
        chaincode || "assets",
        "local-desktop-org",
        contractAddress || null,
        txHash || null,
        blockNumber ? Number(blockNumber) : null,
        chainId ? Number(chainId) : null,
        ownerAddress || null,
        status || "CREATED"
      );

      res.status(201).json({ ok: true, message: "Asset recorded successfully.", id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to create asset" });
    }
  });

  app.get("/api/live/assets/:symbol", requireAuth, requirePermission("manage_assets"), async (req, res) => {
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const channel = (req.query.channel as string) ?? "default-channel";
      const asset = await dataSourceManager.getAssetBySymbol(req.params.symbol, channel);
      res.json(asset);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch asset" });
    }
  });

  app.post("/api/live/assets/:symbol/transfer", requireAuth, requirePermission("transfer_assets"), async (req, res) => {
    try {
      const { symbol } = req.params;
      const { to, amount, channel, chaincode } = req.body ?? {};

      if (!to || !amount) {
        return res.status(400).json({ error: "Recipient (to) and amount are required." });
      }
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number." });
      }

      const ch = String(channel || "default-channel");
      const cc = String(chaincode || "assets");

      // Asset transfers via blockchain are not yet implemented
      // This endpoint will be implemented in Phase 11 (Asset Transfer)
      return res.status(501).json({
        error: "Asset transfers not yet implemented",
        symbol,
        to,
        amount,
        status: "PLACEHOLDER",
        message: "Use portfolio/transfer endpoints instead (Phase 11)",
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Transfer failed" });
    }
  });

  app.post("/api/live/assets/:symbol/burn", requireAuth, requirePermission("manage_assets"), async (req, res) => {
    try {
      const { symbol } = req.params;
      const { amount, channel, chaincode } = req.body ?? {};

      if (!amount) {
        return res.status(400).json({ error: "Amount is required." });
      }
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number." });
      }

      const ch = String(channel || "default-channel");
      const cc = String(chaincode || "assets");

      // Asset burn operations are not yet implemented
      // This endpoint will be implemented in Phase 11 (Asset Management)
      return res.status(501).json({
        error: "Asset burn not yet implemented",
        symbol,
        amount,
        status: "PLACEHOLDER",
        message: "Use portfolio endpoints instead (Phase 11)",
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Burn failed" });
    }
  });

  app.post("/api/live/assets/:symbol/sync", requireAuth, requirePermission("manage_assets"), async (req, res) => {
    try {
      const { symbol } = req.params;
      const { channel, chaincode } = req.body ?? {};
      const ch = String(channel || "default-channel");
      const cc = String(chaincode || "assets");

      // Asset sync operations are not yet implemented
      // This endpoint will be implemented in Phase 11 (Asset Management)
      return res.status(501).json({
        error: "Asset sync not yet implemented",
        symbol,
        status: "PLACEHOLDER",
        message: "Use portfolio endpoints instead (Phase 11)",
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Sync failed" });
    }
  });

  app.get("/api/live/market-prices", async (req, res) => {
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const symbols = (req.query.symbols as string)?.split(",") ?? [];
      const prices = await dataSourceManager.getMarketPrices(symbols);
      res.json(prices);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch prices" });
    }
  });

  app.get("/api/live/orderbook/:instrument", async (req, res) => {
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const orderbook = await dataSourceManager.getLiveOrderBook(req.params.instrument);
      res.json(orderbook);
    } catch (err: any) {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: err?.message ?? "Live order book provider is not configured." });
    }
  });

  app.get("/api/live/rwa", async (req, res) => {
    if (!getFeatureFlags().rwa) {
      return res.status(404).json({ error: "FEATURE_DISABLED", message: "RWA module is disabled (FEATURE_RWA=false)." });
    }
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const channel = (req.query.channel as string) ?? "rwa-channel";
      const rwas = await dataSourceManager.getRWAssets(channel);
      res.json(rwas);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch RWAs" });
    }
  });

  app.get("/api/live/nft", async (req, res) => {
    if (!getFeatureFlags().nft) {
      return res.status(404).json({ error: "FEATURE_DISABLED", message: "NFT module is disabled (FEATURE_NFT=false)." });
    }
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const channel = (req.query.channel as string) ?? "nft-channel";
      const nfts = await dataSourceManager.getNFTs(channel);
      res.json(nfts);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch NFTs" });
    }
  });

  app.get("/api/live/sports-events", async (req, res) => {
    if (!getFeatureFlags().sports) {
      return res.status(404).json({ error: "FEATURE_DISABLED", message: "Sports module is disabled (FEATURE_SPORTS=false)." });
    }
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const events = await dataSourceManager.getLiveSportsEvents();
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch sports events" });
    }
  });

  app.get("/api/live/mining-stats", async (req, res) => {
    if (!getFeatureFlags().mining) {
      return res.status(404).json({ error: "FEATURE_DISABLED", message: "Mining module is disabled (FEATURE_MINING=false)." });
    }
    try {
      const { dataSourceManager } = await import("./src/services/dataSourceManager");
      const stats = await dataSourceManager.getMiningPoolStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch mining stats" });
    }
  });

  // ─── Stripe ────────────────────────────────────────────────────────────────

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || null;

  async function stripeRequest(
    method: string,
    path: string,
    body?: Record<string, string>
  ): Promise<any> {
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
    const url = `https://api.stripe.com/v1${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };
    if (body) opts.body = new URLSearchParams(body).toString();
    const res = await fetch(url, opts);
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data?.error?.message || `Stripe API error (${res.status})`);
    return data;
  }

  async function stripeCreateCustomer(email: string): Promise<string> {
    const cust = await stripeRequest("POST", "/customers", { email, description: "AZ Innovations subscriber" });
    return cust.id as string;
  }

  async function stripeCreateCheckoutSession(
    plan: PlanTier,
    email: string,
    stripeCustomerId: string,
    successUrl: string,
    cancelUrl: string,
    trialDays = 0
  ): Promise<{ id: string; url: string }> {
    const planDef = SUBSCRIPTION_PLANS[plan];
    if (!planDef.stripePriceId) {
      // Create a one-time price on-the-fly (sandbox / no pre-created price IDs)
      const price = await stripeRequest("POST", "/prices", {
        currency: "usd",
        unit_amount: String(planDef.priceUsd * 100),
        "recurring[interval]": planDef.interval,
        "product_data[name]": `AZ Innovations — ${planDef.name}`,
      });
      planDef.stripePriceId = price.id as string;
    }

    const params: Record<string, string> = {
      mode: "subscription",
      customer: stripeCustomerId,
      "line_items[0][price]": planDef.stripePriceId,
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "subscription_data[metadata][plan_tier]": plan,
      "metadata[plan_tier]": plan,
      "metadata[email]": email,
    };

    if (trialDays > 0) {
      // Card is collected by Checkout (mode: subscription always requires a payment
      // method) but nothing is charged until the trial ends and Stripe auto-bills.
      params["subscription_data[trial_period_days]"] = String(trialDays);
      params["metadata[trial_granted]"] = "true";
    }

    const session = await stripeRequest("POST", "/checkout/sessions", params);
    return { id: session.id as string, url: session.url as string };
  }

  async function stripeRetrieveSubscription(subscriptionId: string): Promise<any> {
    return stripeRequest("GET", `/subscriptions/${subscriptionId}`);
  }

  // Maps Stripe's subscription lifecycle statuses onto the small set this app tracks locally.
  function mapStripeSubscriptionStatus(stripeStatus: string): string {
    if (stripeStatus === "trialing") return "trialing";
    if (stripeStatus === "active") return "active";
    if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
    return "canceled";
  }

  async function stripeRetrieveSession(sessionId: string): Promise<any> {
    return stripeRequest("GET", `/checkout/sessions/${sessionId}`);
  }

  async function stripeCancelSubscription(externalId: string): Promise<void> {
    await stripeRequest("DELETE", `/subscriptions/${externalId}`);
  }

  // ─── PayPal ────────────────────────────────────────────────────────────────

  const paypalClientId = process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_OAUTH_CLIENT_ID || null;
  const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_OAUTH_CLIENT_SECRET || null;
  const paypalBase = process.env.PAYPAL_SANDBOX === "false"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  async function paypalGetAccessToken(): Promise<string> {
    if (!paypalClientId || !paypalClientSecret) throw new Error("PayPal credentials are not configured.");
    const res = await fetch(`${paypalBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data?.error_description || "PayPal auth failed");
    return data.access_token as string;
  }

  async function paypalRequest(method: string, path: string, body?: object): Promise<any> {
    const token = await paypalGetAccessToken();
    const res = await fetch(`${paypalBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data?.message || data?.error_description || `PayPal error (${res.status})`);
    return data;
  }

  async function paypalCreateOrder(
    plan: PlanTier,
    email: string,
    returnUrl: string,
    cancelUrl: string
  ): Promise<{ id: string; approvalUrl: string }> {
    const planDef = SUBSCRIPTION_PLANS[plan];
    const order = await paypalRequest("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: String(planDef.priceUsd) },
          description: `AZ Innovations — ${planDef.name} (Monthly)`,
          custom_id: `plan:${plan}:email:${email}`,
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: "HyperCross Nexus",
        user_action: "PAY_NOW",
      },
    });

    const approvalLink = (order.links as any[]).find((l: any) => l.rel === "approve");
    return { id: order.id as string, approvalUrl: approvalLink?.href as string };
  }

  async function paypalCaptureOrder(orderId: string): Promise<any> {
    return paypalRequest("POST", `/v2/checkout/orders/${orderId}/capture`);
  }

  // ─── Checkout & Subscription Routes ────────────────────────────────────────

  // Create a Stripe checkout session for self-serve subscription plans.
  app.post("/api/checkout/session", async (req, res) => {
    if (isPostgresConfigured()) return res.status(410).json({ error: "Legacy checkout is disabled. Use /api/billing/create-checkout-session." });
    try {
      const provider = String(req.body?.provider ?? "").toLowerCase();
      const plan = String(req.body?.plan ?? "").toLowerCase() as PlanTier;
      const email = normalizeEmail(req.body?.email);
      const baseUrl = process.env.HYPERCROSS_PUBLIC_URL
        || process.env.RENDER_EXTERNAL_URL
        || process.env.OAUTH_REDIRECT_BASE
        || "http://localhost:10000";

      if (!email) return res.status(400).json({ error: "email is required" });
      if (plan !== "starter" && plan !== "pro" && plan !== "enterprise" && plan !== "enterprise_deluxe") {
        return res.status(400).json({ error: "plan must be starter, pro, enterprise, or enterprise_deluxe" });
      }
      if (provider !== "stripe") {
        return res.status(400).json({ error: "Stripe is the only available checkout provider." });
      }

      // Ensure customer record exists
      let customer = queries.customers.getByEmail.get(email) as any;
      if (!customer) {
        const custId = crypto.randomUUID();
        queries.customers.upsert.run(custId, email, plan);
        customer = queries.customers.getByEmail.get(email) as any;
      }

      if (provider === "stripe") {
        // Get or create Stripe customer
        let stripeCustomerId = customer?.stripeCustomerId as string | null;
        if (!stripeCustomerId) {
          stripeCustomerId = await stripeCreateCustomer(email);
          queries.customers.setStripeId.run(stripeCustomerId, email);
        }

        const successUrl = `${baseUrl}/?checkout=stripe-success&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`;
        const cancelUrl = `${baseUrl}/?checkout=canceled&plan=${plan}`;
        // Only give a Stripe trial to customers who have never had a subscription before.
        const priorSubscriptions = queries.subscriptions.listByEmail.all(email) as any[];
        const trialDays = priorSubscriptions.length === 0 ? 14 : 0;
        const session = await stripeCreateCheckoutSession(
          plan,
          email,
          stripeCustomerId,
          successUrl,
          cancelUrl,
          trialDays
        );

        return res.json({ provider: "stripe", sessionId: session.id, url: session.url });

      }
    } catch (err: any) {
      console.error("[checkout/session]", err?.message);
      return res.status(500).json({ error: err?.message || "Failed to create checkout session" });
    }
  });

  // Confirm Stripe checkout (called after user returns from Stripe with session_id)
  app.post("/api/checkout/stripe/confirm", async (req, res) => {
    if (isPostgresConfigured()) return res.status(410).json({ error: "Legacy checkout confirmation is disabled; Stripe webhooks are authoritative." });
    try {
      const sessionId = String(req.body?.session_id ?? "").trim();
      const email = normalizeEmail(req.body?.email);

      if (!sessionId) return res.status(400).json({ error: "session_id is required" });
      if (!email) return res.status(400).json({ error: "email is required" });

      const session = await stripeRetrieveSession(sessionId);
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return res.status(402).json({ error: "Payment not yet completed.", sessionStatus: session.status });
      }

      const plan = (session.metadata?.plan_tier || "starter") as PlanTier;
      const stripeSubscriptionId = session.subscription as string | null;

      // Upsert customer record
      let customer = queries.customers.getByEmail.get(email) as any;
      if (!customer) {
        const custId = crypto.randomUUID();
        queries.customers.upsert.run(custId, email, plan);
        customer = queries.customers.getByEmail.get(email) as any;
      } else {
        queries.customers.setPlan.run(plan, email);
      }
      if (session.customer && !customer?.stripeCustomerId) {
        queries.customers.setStripeId.run(session.customer as string, email);
      }

      // Calculate billing period (monthly)
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subId = crypto.randomUUID();
      queries.subscriptions.upsertByEmail.run(
        subId,
        customer.id,
        email,
        "stripe",
        stripeSubscriptionId || sessionId,
        plan,
        "active",
        now.toISOString(),
        periodEnd.toISOString(),
        JSON.stringify({ stripeSessionId: sessionId, stripeSubscriptionId })
      );

      const subscription = queries.subscriptions.getByEmail.get(email) as any;
      return res.json({ ok: true, plan, subscription });
    } catch (err: any) {
      console.error("[checkout/stripe/confirm]", err?.message);
      return res.status(500).json({ error: err?.message || "Failed to confirm Stripe checkout" });
    }
  });

  // Capture PayPal order (called after user returns from PayPal approval)
  app.post("/api/checkout/paypal/capture", async (req, res) => {
    if (isPostgresConfigured()) return res.status(410).json({ error: "Legacy checkout capture is disabled when canonical billing is configured." });
    try {
      const orderId = String(req.body?.order_id ?? "").trim();
      const plan = String(req.body?.plan ?? "starter") as PlanTier;
      const email = normalizeEmail(req.body?.email);

      if (!orderId) return res.status(400).json({ error: "order_id is required" });
      if (!email) return res.status(400).json({ error: "email is required" });

      const captureResult = await paypalCaptureOrder(orderId);
      const captureStatus = captureResult?.status as string;

      if (captureStatus !== "COMPLETED") {
        return res.status(402).json({ error: "Payment not completed.", captureStatus });
      }

      const payerId = captureResult?.payer?.payer_id as string | null;

      // Upsert customer record
      let customer = queries.customers.getByEmail.get(email) as any;
      if (!customer) {
        const custId = crypto.randomUUID();
        queries.customers.upsert.run(custId, email, plan);
        customer = queries.customers.getByEmail.get(email) as any;
      } else {
        queries.customers.setPlan.run(plan, email);
      }
      if (payerId && !customer?.paypalPayerId) {
        queries.customers.setPayPalId.run(payerId, email);
      }

      // Calculate billing period (monthly)
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const subId = crypto.randomUUID();
      queries.subscriptions.upsertByEmail.run(
        subId,
        customer.id,
        email,
        "paypal",
        orderId,
        plan,
        "active",
        now.toISOString(),
        periodEnd.toISOString(),
        JSON.stringify({ orderId, captureResult })
      );

      const subscription = queries.subscriptions.getByEmail.get(email) as any;
      return res.json({ ok: true, plan, subscription });
    } catch (err: any) {
      console.error("[checkout/paypal/capture]", err?.message);
      return res.status(500).json({ error: err?.message || "Failed to capture PayPal order" });
    }
  });

  // Get current subscription for an email
  app.get("/api/subscription", (req, res) => {
    try {
      const email = normalizeEmail(req.query.email as string | undefined);
      if (!email) return res.status(400).json({ error: "email is required" });

      const customer = queries.customers.getByEmail.get(email) as any;
      const subscription = queries.subscriptions.getByEmail.get(email) as any;

      return res.json({
        customer: customer
          ? { email: customer.email, planTier: customer.planTier, createdAt: customer.createdAt }
          : null,
        subscription: subscription
          ? {
              id: subscription.id,
              provider: subscription.provider,
              planTier: subscription.planTier,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              canceledAt: subscription.canceledAt,
              createdAt: subscription.createdAt,
            }
          : null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to fetch subscription" });
    }
  });

  // Cancel active subscription
  app.post("/api/subscription/cancel", async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: "email is required" });

      const subscription = queries.subscriptions.getByEmail.get(email) as any;
      if (!subscription || !["active", "trialing"].includes(subscription.status)) {
        return res.status(404).json({ error: "No active subscription found." });
      }

      // Cancel at payment provider
      try {
        if (subscription.provider === "stripe" && subscription.externalId?.startsWith("sub_")) {
          await stripeCancelSubscription(subscription.externalId);
        }
        // PayPal subscription cancellation would go here (not needed for one-time orders)
      } catch (providerErr: any) {
        console.warn("[subscription/cancel] Provider cancellation failed:", providerErr?.message);
        // Still cancel locally even if provider fails
      }

      queries.subscriptions.cancel.run(email);
      queries.customers.setPlan.run("starter", email);

      return res.json({ ok: true, message: "Subscription canceled." });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to cancel subscription" });
    }
  });

  // Stripe webhook handler
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const signature = req.headers["stripe-signature"] as string | undefined;
      const verification = requireVerifiedStripeSignature(payload, signature, webhookSecret);
      if (!verification.ok) {
        return res.status(400).json({ error: verification.error ?? "Invalid signature" });
      }
      const event = verification.event ?? JSON.parse(payload.toString("utf8"));
      const eventId = getWebhookEventId(event);
      if (checkDuplicateWebhook("stripe", eventId)) {
        return res.status(409).json({ error: "Duplicate Stripe webhook event." });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const email = session.metadata?.email;
        const plan = session.metadata?.plan_tier || "starter";
        if (email) {
          let customer = queries.customers.getByEmail.get(email) as any;
          if (!customer) {
            const custId = crypto.randomUUID();
            queries.customers.upsert.run(custId, email, plan);
            customer = queries.customers.getByEmail.get(email) as any;
          }

          // Pull the real subscription status/period from Stripe rather than assuming
          // "active" — a trial (with the $1 card-verification charge already collected)
          // starts life as "trialing" and only becomes "active" once Stripe auto-bills.
          let status = "active";
          let periodStart = new Date().toISOString();
          let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          if (session.subscription) {
            try {
              const sub = await stripeRetrieveSubscription(session.subscription as string);
              status = mapStripeSubscriptionStatus(sub.status);
              if (sub.current_period_start) periodStart = new Date(sub.current_period_start * 1000).toISOString();
              if (sub.current_period_end) periodEnd = new Date(sub.current_period_end * 1000).toISOString();
            } catch (err: any) {
              console.warn("[webhooks/stripe] Failed to retrieve subscription for status:", err?.message);
            }
          }

          queries.subscriptions.upsertByEmail.run(
            crypto.randomUUID(), customer.id, email, "stripe",
            session.subscription || session.id, plan, status, periodStart, periodEnd,
            JSON.stringify({ webhookEvent: event.type })
          );
        }
      }

      if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
        const sub = event.data.object;
        const status = mapStripeSubscriptionStatus(sub.status);
        queries.subscriptions.updateStatus.run(status, sub.id);
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error("[webhooks/stripe]", err?.message);
      return res.status(400).json({ error: "Webhook handling failed" });
    }
  });

  // PayPal webhook handler
  app.post("/api/webhooks/paypal", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
      const verification = await verifyPayPalWebhook({ ...req, body: rawBody } as any);
      if (!verification.ok) {
        return res.status(400).json({ error: verification.error ?? "Invalid PayPal signature" });
      }
      const event = verification.event ?? JSON.parse(rawBody.toString("utf8"));
      const eventId = getWebhookEventId(event);
      if (checkDuplicateWebhook("paypal", eventId)) {
        return res.status(409).json({ error: "Duplicate PayPal webhook event." });
      }
      if (event?.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const customId: string = event?.resource?.custom_id || "";
        const match = customId.match(/plan:(\w+):email:(.+)/);
        if (match) {
          const plan = match[1] as PlanTier;
          const email = match[2];
          let customer = queries.customers.getByEmail.get(email) as any;
          if (!customer) {
            const custId = crypto.randomUUID();
            queries.customers.upsert.run(custId, email, plan);
            customer = queries.customers.getByEmail.get(email) as any;
          }
          const now = new Date().toISOString();
          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          queries.subscriptions.upsertByEmail.run(
            crypto.randomUUID(), customer.id, email, "paypal",
            event?.resource?.id || event?.id, plan, "active", now, periodEnd,
            JSON.stringify({ webhookEvent: event.event_type })
          );
        }
      }
      return res.json({ received: true });
    } catch (err: any) {
      console.error("[webhooks/paypal]", err?.message);
      return res.status(400).json({ error: "Webhook handling failed" });
    }
  });

  // Serve the built frontend whenever it exists, regardless of NODE_ENV — a
  // misconfigured/missing NODE_ENV=production on a host (e.g. Render) must
  // never silently fall through to dev-only Vite middleware or a blank page.
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(serverDir, "dist");
  const distIndexPath = path.join(distPath, "index.html");
  const hasBuiltAssets = fs.existsSync(distIndexPath);

  if (hasBuiltAssets) {
    console.log(`Serving built frontend from ${distPath}`);
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        // The SPA shell must be revalidated after each deploy; hashed assets can remain cached.
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        }
      },
    }));
    app.get("/assets/*splat", (_req, res) => {
      return res.status(404).json({ error: "Built asset not found." });
    });
    // Express 5 / path-to-regexp v6+ require a named wildcard param, not bare "*"
    app.get("/*splat", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.sendFile(distIndexPath);
    });
  } else if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.error(
      `No built frontend found at ${distIndexPath}. The deploy's build command must run the production build ` +
      `(vite build via "npm run build") before the start command runs — otherwise every route serves nothing ` +
      `and the browser shows a blank screen.`
    );
  }

  // Initialize blockchain service before starting server
  try {
    await blockchainService.initialize();
  } catch (error) {
    console.error("Failed to initialize blockchain service:", error);
    process.exit(1);
  }

  // Background poller: reconciles SUBMITTED/PENDING transactions against real receipts.
  setInterval(() => {
    TransactionService.pollAllPending().catch((err) => {
      console.error("Transaction poll cycle failed:", err?.message ?? err);
    });
  }, 15000);

  // Last-resort handler: without this, any error passed to next(err) (e.g. from
  // the CORS origin callback) falls through to Express's opaque default error
  // page, hiding the real cause from both logs and the client.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`Unhandled request error on ${req.method} ${req.path}:`, err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: "Internal server error", message: err?.message ?? String(err) });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Clean shutdown on SIGTERM/SIGINT (required for Railway/containerized deploys).
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      try {
        await blockchainService.disconnect();
      } catch { /* best effort */ }
      try {
        await closePostgresPool();
      } catch { /* best effort */ }
      console.log("Shutdown complete.");
      process.exit(0);
    });
    // Force-exit if close() hangs (e.g. a long-lived connection refuses to end).
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
