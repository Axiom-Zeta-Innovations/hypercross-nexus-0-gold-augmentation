/**
 * Production PostgreSQL schema (Drizzle ORM).
 *
 * This is the authoritative schema for commercial Hypercross account/platform
 * state. Local SQLite (src/db/index.ts) remains available for local-only
 * development and desktop-specific state, but production deployments MUST set
 * DATABASE_URL and use this schema.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  status: text("status").notNull().default("active"), // active | suspended | deleted
  emailVerified: boolean("email_verified").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  deviceInformation: text("device_information"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("sessions_user_id_idx").on(table.userId),
}));

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  plan: text("plan").notNull().default("none"), // research | trader | pro | none
  status: text("status").notNull().default("inactive"), // active | trialing | past_due | canceled | incomplete | inactive
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("subscriptions_user_id_idx").on(table.userId),
  stripeSubUnique: uniqueIndex("subscriptions_stripe_subscription_id_unique").on(table.stripeSubscriptionId),
}));

export const entitlements = pgTable("entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  usageLimit: integer("usage_limit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userFeatureUnique: uniqueIndex("entitlements_user_feature_unique").on(table.userId, table.feature),
}));

export const linkedAccounts = pgTable("linked_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // e.g. "binance", "coinbase", wallet address, etc.
  accountRef: text("account_ref"), // non-secret label/identifier only
  // Encrypted at rest (AES-256-GCM via ENCRYPTION_KEY) — never store plaintext exchange secrets.
  encryptedCredentials: text("encrypted_credentials"),
  status: text("status").notNull().default("connected"), // connected | revoked
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("linked_accounts_user_id_idx").on(table.userId),
}));

export const strategies = pgTable("strategies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("strategies_user_id_idx").on(table.userId),
}));

export const tradeHistory = pgTable("trade_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // BUY | SELL
  quantity: numeric("quantity").notNull(),
  price: numeric("price"),
  executionStatus: text("execution_status").notNull().default("pending"), // pending | filled | rejected | failed | cancelled
  exchange: text("exchange"),
  clientOrderId: text("client_order_id"),
  exchangeOrderId: text("exchange_order_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  userIdx: index("trade_history_user_id_idx").on(table.userId),
  clientOrderIdUnique: uniqueIndex("trade_history_client_order_id_unique").on(table.clientOrderId),
}));

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata").default({}),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("audit_log_user_id_idx").on(table.userId),
  actionIdx: index("audit_log_action_idx").on(table.action),
}));

/** Idempotency ledger for Stripe webhook events — the event id is the primary key. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // Stripe event id, e.g. "evt_..."
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const intelligenceSnapshots = pgTable("intelligence_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  signals: jsonb("signals").notNull(),
  opportunity: jsonb("opportunity").notNull(),
  proposal: jsonb("proposal").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("intelligence_snapshots_user_id_idx").on(table.userId),
  symbolIdx: index("intelligence_snapshots_symbol_idx").on(table.symbol),
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
  userIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
}));
