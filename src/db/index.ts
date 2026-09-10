import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const dataDir = path.join(os.homedir(), '.hypercross-nexus');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDb() {
  // Auth users (for email/phone + password sign-in)
  db.exec(`
    CREATE TABLE IF NOT EXISTS authUsers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastLogin DATETIME
    )
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      walletAddress TEXT UNIQUE,
      displayName TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastLogin DATETIME
    )
  `);

  // Organizations/Workspaces
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      config JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ownerId) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizationMembers (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      orgId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'VIEWER',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (orgId) REFERENCES organizations(id),
      UNIQUE(userId, orgId)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      orgId TEXT,
      role TEXT NOT NULL DEFAULT 'VIEWER',
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS passwordResetTokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES authUsers(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauthStates (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      state TEXT NOT NULL,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, state),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotencyKeys (
      id TEXT PRIMARY KEY,
      resource TEXT NOT NULL,
      key TEXT NOT NULL,
      result JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(resource, key)
    )
  `);

  // Wallet verification: nonces and verified signatures
  db.exec(`
    CREATE TABLE IF NOT EXISTS walletVerification (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      nonce TEXT NOT NULL,
      sessionId TEXT,
      verifiedAt DATETIME,
      signature TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL
    )
  `);

  // User portfolio holdings (Phase 7)
  // Tracks ERC-20 and native token balances per wallet
  db.exec(`
    CREATE TABLE IF NOT EXISTS userHoldings (
      id TEXT PRIMARY KEY,
      walletAddress TEXT NOT NULL,
      chainId INTEGER NOT NULL,
      tokenAddress TEXT,
      tokenSymbol TEXT NOT NULL,
      balance TEXT NOT NULL,
      balanceDecimal REAL,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      fetchedAt DATETIME,
      error TEXT,
      UNIQUE(walletAddress, chainId, tokenSymbol),
      UNIQUE(walletAddress, chainId, tokenAddress)
    )
  `);

  // Real on-chain transactions (transfers, approvals, swaps). Status only becomes
  // CONFIRMED after a real transaction receipt is observed — never on local state alone.
  // intentTo/intentData/intentValue capture the prepared (unsigned) transaction so the
  // submitted hash can later be proven to match what the server actually prepared.
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      userId TEXT,
      walletAddress TEXT NOT NULL,
      chainId INTEGER NOT NULL,
      network TEXT NOT NULL,
      transactionHash TEXT,
      operationType TEXT NOT NULL,
      contractAddress TEXT,
      tokenAddress TEXT,
      tokenSymbol TEXT,
      amount TEXT,
      value TEXT,
      gasEstimate TEXT,
      intentTo TEXT,
      intentData TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      submittedAt DATETIME,
      confirmedAt DATETIME,
      blockNumber INTEGER,
      failureReason TEXT,
      explorerUrl TEXT,
      UNIQUE(transactionHash, chainId)
    )
  `);

  // Migration guard: add intent columns to pre-existing local databases that predate them.
  const transactionColumns = db.prepare(`PRAGMA table_info(transactions)`).all() as Array<{ name: string }>;
  const existingColumnNames = new Set(transactionColumns.map((c) => c.name));
  if (!existingColumnNames.has("intentTo")) {
    db.exec(`ALTER TABLE transactions ADD COLUMN intentTo TEXT`);
  }
  if (!existingColumnNames.has("intentData")) {
    db.exec(`ALTER TABLE transactions ADD COLUMN intentData TEXT`);
  }

  // Digital Assets (legacy schema; not used by the active Chainstack MVP runtime)
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      supply TEXT,
      type TEXT,
      channel TEXT,
      chaincode TEXT,
      orgId TEXT NOT NULL,
      externalId TEXT,
      lastSyncedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orgId) REFERENCES organizations(id)
    )
  `);

  // Migration guard: add custom columns to pre-existing local databases for assets
  const assetCols = db.prepare(`PRAGMA table_info(assets)`).all() as Array<{ name: string }>;
  const assetColNames = new Set(assetCols.map((c) => c.name));
  if (!assetColNames.has("contractAddress")) {
    db.exec(`ALTER TABLE assets ADD COLUMN contractAddress TEXT`);
  }
  if (!assetColNames.has("txHash")) {
    db.exec(`ALTER TABLE assets ADD COLUMN txHash TEXT`);
  }
  if (!assetColNames.has("blockNumber")) {
    db.exec(`ALTER TABLE assets ADD COLUMN blockNumber INTEGER`);
  }
  if (!assetColNames.has("chainId")) {
    db.exec(`ALTER TABLE assets ADD COLUMN chainId INTEGER`);
  }
  if (!assetColNames.has("ownerAddress")) {
    db.exec(`ALTER TABLE assets ADD COLUMN ownerAddress TEXT`);
  }
  if (!assetColNames.has("status")) {
    db.exec(`ALTER TABLE assets ADD COLUMN status TEXT`);
  }

  // Append-only audit trail for wallet/transaction/swap lifecycle events.
  db.exec(`
    CREATE TABLE IF NOT EXISTS auditLog (
      id TEXT PRIMARY KEY,
      userId TEXT,
      walletAddress TEXT,
      action TEXT NOT NULL,
      metadata JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Trading positions (live state)
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      orgId TEXT NOT NULL,
      instrument TEXT NOT NULL,
      side TEXT,
      size REAL,
      entryPrice REAL,
      currentPrice REAL,
      leverage REAL,
      pnl REAL,
      status TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (orgId) REFERENCES organizations(id)
    )
  `);

  // Linked exchange/broker accounts and balances
  db.exec(`
    CREATE TABLE IF NOT EXISTS linkedAccounts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      provider TEXT NOT NULL,
      balances JSON NOT NULL,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Executed trades
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      instrument TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      notional REAL NOT NULL,
      status TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (accountId) REFERENCES linkedAccounts(id)
    )
  `);

  // API Keys (for external integrations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS apiKeys (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      service TEXT NOT NULL,
      key TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      FOREIGN KEY (orgId) REFERENCES organizations(id),
      UNIQUE(orgId, service)
    )
  `);

  // Watchlists
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlists (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      items JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  // Settings per org
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      orgId TEXT NOT NULL,
      key TEXT NOT NULL,
      value JSON,
      FOREIGN KEY (orgId) REFERENCES organizations(id),
      UNIQUE(orgId, key)
    )
  `);

  // Linked payment processors and bank rails
  db.exec(`
    CREATE TABLE IF NOT EXISTS paymentConnections (
      provider TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'disconnected',
      accountRef TEXT,
      metadata JSON,
      linkedAt DATETIME,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // OAuth tokens for payment providers
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauthTokens (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      accessToken TEXT NOT NULL,
      refreshToken TEXT,
      expiresAt DATETIME,
      scope TEXT,
      tokenType TEXT DEFAULT 'Bearer',
      metadata JSON,
      linkedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Billing customers
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      stripeCustomerId TEXT,
      paypalPayerId TEXT,
      planTier TEXT NOT NULL DEFAULT 'starter',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Subscriptions (most recent active per customer)
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      externalId TEXT,
      planTier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      currentPeriodStart DATETIME,
      currentPeriodEnd DATETIME,
      canceledAt DATETIME,
      metadata JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customerId) REFERENCES customers(id)
    )
  `);
}

// Ensure schema exists before creating prepared statements below.
initDb();

export const queries = {
  authUser: {
    create: db.prepare(`
      INSERT INTO authUsers (id, email, phone, passwordHash)
      VALUES (?, ?, ?, ?)
    `),
    getByEmail: db.prepare(`SELECT * FROM authUsers WHERE email = ?`),
    getByPhone: db.prepare(`SELECT * FROM authUsers WHERE phone = ?`),
    touchLogin: db.prepare(`
      UPDATE authUsers SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?
    `),
    updatePassword: db.prepare(`
      UPDATE authUsers SET passwordHash = ? WHERE id = ?
    `),
  },

  passwordReset: {
    create: db.prepare(`
      INSERT INTO passwordResetTokens (id, userId, tokenHash, expiresAt)
      VALUES (?, ?, ?, ?)
    `),
    invalidateForUser: db.prepare(`
      UPDATE passwordResetTokens SET usedAt = CURRENT_TIMESTAMP
      WHERE userId = ? AND usedAt IS NULL
    `),
    getActiveByHash: db.prepare(`
      SELECT * FROM passwordResetTokens
      WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP
    `),
    markUsed: db.prepare(`
      UPDATE passwordResetTokens SET usedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND usedAt IS NULL
    `),
  },

  user: {
    create: db.prepare(`
      INSERT INTO users (id, email, walletAddress, displayName) 
      VALUES (?, ?, ?, ?)
    `),
    getById: db.prepare(`SELECT * FROM users WHERE id = ?`),
    getByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
    getByWallet: db.prepare(`SELECT * FROM users WHERE walletAddress = ?`),
  },

  organization: {
    create: db.prepare(`
      INSERT INTO organizations (id, name, ownerId, config)
      VALUES (?, ?, ?, json(?))
    `),
    getById: db.prepare(`SELECT * FROM organizations WHERE id = ?`),
  },

  organizationMember: {
    add: db.prepare(`
      INSERT INTO organizationMembers (id, userId, orgId, role)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userId, orgId) DO UPDATE SET role = excluded.role
    `),
    getByUserAndOrg: db.prepare(`SELECT * FROM organizationMembers WHERE userId = ? AND orgId = ?`),
    getByUser: db.prepare(`SELECT * FROM organizationMembers WHERE userId = ?`),
    listByOrg: db.prepare(`SELECT * FROM organizationMembers WHERE orgId = ?`),
  },

  session: {
    create: db.prepare(`
      INSERT INTO sessions (id, userId, orgId, role, expiresAt)
      VALUES (?, ?, ?, ?, ?)
    `),
    deleteByUser: db.prepare(`DELETE FROM sessions WHERE userId = ?`),
    getById: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
    deleteById: db.prepare(`DELETE FROM sessions WHERE id = ?`),
  },

  oauthState: {
    save: db.prepare(`
      INSERT INTO oauthStates (id, userId, provider, state, expiresAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, state) DO UPDATE SET userId = excluded.userId, expiresAt = excluded.expiresAt
    `),
    getByProviderAndState: db.prepare(`SELECT * FROM oauthStates WHERE provider = ? AND state = ?`),
    deleteByProviderAndState: db.prepare(`DELETE FROM oauthStates WHERE provider = ? AND state = ?`),
    deleteExpired: db.prepare(`DELETE FROM oauthStates WHERE expiresAt < CURRENT_TIMESTAMP`),
  },

  idempotency: {
    get: db.prepare(`SELECT result FROM idempotencyKeys WHERE resource = ? AND key = ?`),
    set: db.prepare(`
      INSERT OR IGNORE INTO idempotencyKeys (id, resource, key, result)
      VALUES (?, ?, ?, json(?))
    `),
  },

  assets: {
    create: db.prepare(`
      INSERT INTO assets (id, name, symbol, supply, type, channel, chaincode, orgId, externalId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    createFull: db.prepare(`
      INSERT INTO assets (id, name, symbol, supply, type, channel, chaincode, orgId, contractAddress, txHash, blockNumber, chainId, ownerAddress, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getByOrg: db.prepare(`SELECT * FROM assets WHERE orgId = ? ORDER BY createdAt DESC`),
    update: db.prepare(`
      UPDATE assets SET supply = ?, lastSyncedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
  },

  positions: {
    create: db.prepare(`
      INSERT INTO positions (id, userId, orgId, instrument, side, size, entryPrice, leverage, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getByUser: db.prepare(`SELECT * FROM positions WHERE userId = ? ORDER BY createdAt DESC`),
    updatePrice: db.prepare(`
      UPDATE positions SET currentPrice = ?, pnl = (? - entryPrice) * size * leverage, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
    `),
  },

  linkedAccounts: {
    create: db.prepare(`
      INSERT INTO linkedAccounts (id, label, provider, balances)
      VALUES (?, ?, ?, json(?))
    `),
    list: db.prepare(`SELECT * FROM linkedAccounts ORDER BY label ASC`),
    getById: db.prepare(`SELECT * FROM linkedAccounts WHERE id = ?`),
    updateBalances: db.prepare(`
      UPDATE linkedAccounts
      SET balances = json(?), updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `),
  },

  trades: {
    create: db.prepare(`
      INSERT INTO trades (id, accountId, instrument, side, quantity, price, notional, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    listRecent: db.prepare(`
      SELECT * FROM trades
      ORDER BY createdAt DESC
      LIMIT ?
    `),
  },

  apiKeys: {
    set: db.prepare(`
      INSERT OR REPLACE INTO apiKeys (id, orgId, service, key, expiresAt)
      VALUES (?, ?, ?, ?, ?)
    `),
    get: db.prepare(`SELECT key FROM apiKeys WHERE orgId = ? AND service = ?`),
  },

  settings: {
    set: db.prepare(`
      INSERT OR REPLACE INTO settings (id, orgId, key, value)
      VALUES (?, ?, ?, json(?))
    `),
    get: db.prepare(`SELECT value FROM settings WHERE orgId = ? AND key = ?`),
  },

  paymentConnections: {
    upsert: db.prepare(`
      INSERT INTO paymentConnections (provider, status, accountRef, metadata, linkedAt, updatedAt)
      VALUES (?, ?, ?, json(?), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        status = excluded.status,
        accountRef = excluded.accountRef,
        metadata = excluded.metadata,
        linkedAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
    `),
    disconnect: db.prepare(`
      INSERT INTO paymentConnections (provider, status, accountRef, metadata, linkedAt, updatedAt)
      VALUES (?, 'disconnected', NULL, json('{}'), NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        status = 'disconnected',
        accountRef = NULL,
        metadata = json('{}'),
        linkedAt = NULL,
        updatedAt = CURRENT_TIMESTAMP
    `),
    list: db.prepare(`SELECT * FROM paymentConnections ORDER BY provider ASC`),
    getByProvider: db.prepare(`SELECT * FROM paymentConnections WHERE provider = ?`),
  },

  oauthTokens: {
    upsert: db.prepare(`
      INSERT INTO oauthTokens (id, provider, accessToken, refreshToken, expiresAt, scope, tokenType, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, json(?))
      ON CONFLICT(provider) DO UPDATE SET
        accessToken = excluded.accessToken,
        refreshToken = excluded.refreshToken,
        expiresAt = excluded.expiresAt,
        scope = excluded.scope,
        tokenType = excluded.tokenType,
        metadata = excluded.metadata,
        updatedAt = CURRENT_TIMESTAMP
    `),
    getByProvider: db.prepare(`SELECT * FROM oauthTokens WHERE provider = ?`),
    delete: db.prepare(`DELETE FROM oauthTokens WHERE provider = ?`),
    list: db.prepare(`SELECT provider, expiresAt, scope FROM oauthTokens ORDER BY provider ASC`),
  },

  customers: {
    upsert: db.prepare(`
      INSERT INTO customers (id, email, planTier)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        planTier = excluded.planTier,
        updatedAt = CURRENT_TIMESTAMP
    `),
    getByEmail: db.prepare(`SELECT * FROM customers WHERE email = ?`),
    setStripeId: db.prepare(`
      UPDATE customers SET stripeCustomerId = ?, updatedAt = CURRENT_TIMESTAMP WHERE email = ?
    `),
    setPayPalId: db.prepare(`
      UPDATE customers SET paypalPayerId = ?, updatedAt = CURRENT_TIMESTAMP WHERE email = ?
    `),
    setPlan: db.prepare(`
      UPDATE customers SET planTier = ?, updatedAt = CURRENT_TIMESTAMP WHERE email = ?
    `),
  },

  subscriptions: {
    create: db.prepare(`
      INSERT INTO subscriptions
        (id, customerId, email, provider, externalId, planTier, status, currentPeriodStart, currentPeriodEnd, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, json(?))
    `),
    upsertByEmail: db.prepare(`
      INSERT INTO subscriptions
        (id, customerId, email, provider, externalId, planTier, status, currentPeriodStart, currentPeriodEnd, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, json(?))
      ON CONFLICT(email) DO UPDATE SET
        provider = excluded.provider,
        externalId = excluded.externalId,
        planTier = excluded.planTier,
        status = excluded.status,
        currentPeriodStart = excluded.currentPeriodStart,
        currentPeriodEnd = excluded.currentPeriodEnd,
        metadata = excluded.metadata,
        updatedAt = CURRENT_TIMESTAMP
    `),
    getByEmail: db.prepare(`SELECT * FROM subscriptions WHERE email = ? ORDER BY createdAt DESC LIMIT 1`),
    cancel: db.prepare(`
      UPDATE subscriptions SET status = 'canceled', canceledAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE email = ? AND status = 'active'
    `),
    updateStatus: db.prepare(`
      UPDATE subscriptions SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE externalId = ?
    `),
    listByEmail: db.prepare(`SELECT * FROM subscriptions WHERE email = ? ORDER BY createdAt DESC`),
  },

  walletVerification: {
    createNonce: db.prepare(`
      INSERT INTO walletVerification (id, address, nonce, expiresAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET
        nonce = excluded.nonce,
        expiresAt = excluded.expiresAt,
        verifiedAt = NULL,
        signature = NULL,
        sessionId = NULL,
        createdAt = CURRENT_TIMESTAMP
    `),
    getNonce: db.prepare(`SELECT * FROM walletVerification WHERE address = ? AND expiresAt > CURRENT_TIMESTAMP`),
    // Consumes the nonce on successful verification (expiresAt set to now) so it can never be replayed.
    verify: db.prepare(`
      UPDATE walletVerification
      SET verifiedAt = CURRENT_TIMESTAMP, signature = ?, sessionId = ?, expiresAt = CURRENT_TIMESTAMP
      WHERE address = ? AND nonce = ?
    `),
    getByAddress: db.prepare(`SELECT * FROM walletVerification WHERE address = ?`),
    getBySession: db.prepare(`SELECT * FROM walletVerification WHERE sessionId = ?`),
    deleteExpired: db.prepare(`DELETE FROM walletVerification WHERE expiresAt < CURRENT_TIMESTAMP`),
  },

  userHoldings: {
    upsert: db.prepare(`
      INSERT INTO userHoldings (id, walletAddress, chainId, tokenAddress, tokenSymbol, balance, balanceDecimal, fetchedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(walletAddress, chainId, tokenSymbol) DO UPDATE SET
        balance = excluded.balance,
        balanceDecimal = excluded.balanceDecimal,
        fetchedAt = CURRENT_TIMESTAMP,
        error = NULL,
        updatedAt = CURRENT_TIMESTAMP
    `),
    getByWallet: db.prepare(`
      SELECT * FROM userHoldings WHERE walletAddress = ? ORDER BY updatedAt DESC
    `),
    getByWalletAndChain: db.prepare(`
      SELECT * FROM userHoldings WHERE walletAddress = ? AND chainId = ? ORDER BY tokenSymbol ASC
    `),
    getByWalletAndToken: db.prepare(`
      SELECT * FROM userHoldings WHERE walletAddress = ? AND chainId = ? AND tokenSymbol = ?
    `),
    setError: db.prepare(`
      UPDATE userHoldings SET error = ?, updatedAt = CURRENT_TIMESTAMP WHERE walletAddress = ? AND chainId = ? AND tokenSymbol = ?
    `),
    deleteByWallet: db.prepare(`DELETE FROM userHoldings WHERE walletAddress = ?`),
    deleteOlderThan: db.prepare(`DELETE FROM userHoldings WHERE fetchedAt < ?`),
  },

  transactions: {
    create: db.prepare(`
      INSERT INTO transactions
        (id, userId, walletAddress, chainId, network, operationType, contractAddress, tokenAddress, tokenSymbol, amount, value, gasEstimate, intentTo, intentData, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')
    `),
    setSubmitted: db.prepare(`
      UPDATE transactions
      SET transactionHash = ?, status = 'SUBMITTED', submittedAt = CURRENT_TIMESTAMP, explorerUrl = ?
      WHERE id = ?
    `),
    setStatus: db.prepare(`
      UPDATE transactions SET status = ? WHERE id = ?
    `),
    setConfirmed: db.prepare(`
      UPDATE transactions
      SET status = 'CONFIRMED', confirmedAt = CURRENT_TIMESTAMP, blockNumber = ?
      WHERE id = ?
    `),
    setFailed: db.prepare(`
      UPDATE transactions
      SET status = 'FAILED', confirmedAt = CURRENT_TIMESTAMP, blockNumber = ?, failureReason = ?
      WHERE id = ?
    `),
    setIntegrityFailed: db.prepare(`
      UPDATE transactions
      SET status = 'INTEGRITY_FAILED', confirmedAt = CURRENT_TIMESTAMP, failureReason = ?
      WHERE id = ?
    `),
    getById: db.prepare(`SELECT * FROM transactions WHERE id = ?`),
    getByHash: db.prepare(`SELECT * FROM transactions WHERE transactionHash = ? AND chainId = ?`),
    getByWallet: db.prepare(`
      SELECT * FROM transactions WHERE walletAddress = ? ORDER BY createdAt DESC LIMIT ?
    `),
    getPending: db.prepare(`
      SELECT * FROM transactions WHERE status IN ('SUBMITTED', 'PENDING') AND transactionHash IS NOT NULL
    `),
  },

  auditLog: {
    record: db.prepare(`
      INSERT INTO auditLog (id, userId, walletAddress, action, metadata)
      VALUES (?, ?, ?, ?, json(?))
    `),
    listByWallet: db.prepare(`
      SELECT * FROM auditLog WHERE walletAddress = ? ORDER BY createdAt DESC LIMIT ?
    `),
  },
};

export default db;
