import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dataDir = path.join(os.homedir(), '.hypercross-nexus');
const dbPath = path.join(dataDir, 'app.db');
const defaultUserId = 'local-desktop-user';
const defaultOrgId = 'local-desktop-org';

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function initDb() {
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
}

const createUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, displayName)
  VALUES (?, ?, ?)
`);

const createAuthUser = db.prepare(`
  INSERT INTO authUsers (id, email, phone, passwordHash)
  VALUES (?, ?, ?, ?)
`);

const getAuthByEmail = db.prepare(`
  SELECT * FROM authUsers WHERE email = ?
`);

const getAuthByPhone = db.prepare(`
  SELECT * FROM authUsers WHERE phone = ?
`);

const touchAuthLogin = db.prepare(`
  UPDATE authUsers SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?
`);

const createOrg = db.prepare(`
  INSERT OR IGNORE INTO organizations (id, name, ownerId, config)
  VALUES (?, ?, ?, json(?))
`);

const getAssetsByOrg = db.prepare(`
  SELECT * FROM assets WHERE orgId = ? ORDER BY createdAt DESC
`);

const createAssetStatement = db.prepare(`
  INSERT INTO assets (id, name, symbol, supply, type, channel, chaincode, orgId, externalId, lastSyncedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

function ensureDefaultWorkspace(orgId = defaultOrgId) {
  createUser.run(defaultUserId, 'desktop@hypercross.local', 'Desktop User');
  createOrg.run(orgId, 'Local Desktop Workspace', defaultUserId, JSON.stringify({ source: 'electron' }));
  return orgId;
}

initDb();
ensureDefaultWorkspace();

function normalizeEmail(raw) {
  const value = raw?.trim().toLowerCase();
  return value || null;
}

function normalizePhone(raw) {
  const value = raw?.trim();
  if (!value) return null;
  return value.replace(/\s+/g, '');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function getAssets(orgId = defaultOrgId) {
  const resolvedOrgId = ensureDefaultWorkspace(orgId);
  return getAssetsByOrg.all(resolvedOrgId);
}

export function createAsset(data = {}) {
  const orgId = ensureDefaultWorkspace(data.orgId || defaultOrgId);
  const asset = {
    id: data.id || `asset_${Date.now()}`,
    name: data.name || 'Unnamed Asset',
    symbol: data.symbol || 'TBD',
    supply: data.supply?.toString() || '0',
    type: data.type || 'Fungible',
    channel: data.channel || 'default-channel',
    chaincode: data.chaincode || 'assets',
    orgId,
    externalId: data.externalId || null,
  };

  createAssetStatement.run(
    asset.id,
    asset.name,
    asset.symbol,
    asset.supply,
    asset.type,
    asset.channel,
    asset.chaincode,
    asset.orgId,
    asset.externalId,
  );

  return asset;
}

export function getDatabasePath() {
  return dbPath;
}

export function authSignup(input = {}) {
  const method = input.method === 'phone' ? 'phone' : 'email';
  const email = normalizeEmail(input.emailOrSubAccount);
  const phone = normalizePhone(input.phoneNumber);
  const password = String(input.password || '');

  if (password.length < 8) {
    return { ok: false, status: 400, error: 'Password must be at least 8 characters.' };
  }

  if (method === 'email') {
    if (!email) {
      return { ok: false, status: 400, error: 'Email is required.' };
    }

    if (getAuthByEmail.get(email)) {
      return { ok: false, status: 409, error: 'An account with that email already exists.' };
    }

    const id = crypto.randomUUID();
    createAuthUser.run(id, email, null, hashPassword(password));
    touchAuthLogin.run(id);
    return { ok: true, status: 201, user: { id, email, method: 'email' } };
  }

  if (!phone) {
    return { ok: false, status: 400, error: 'Phone number is required.' };
  }

  if (getAuthByPhone.get(phone)) {
    return { ok: false, status: 409, error: 'An account with that phone number already exists.' };
  }

  const id = crypto.randomUUID();
  createAuthUser.run(id, null, phone, hashPassword(password));
  touchAuthLogin.run(id);
  return { ok: true, status: 201, user: { id, phone, method: 'phone' } };
}

export function authSignin(input = {}) {
  const method = input.method === 'phone' ? 'phone' : 'email';
  const email = normalizeEmail(input.emailOrSubAccount);
  const phone = normalizePhone(input.phoneNumber);
  const password = String(input.password || '');

  if (!password) {
    return { ok: false, status: 400, error: 'Password is required.' };
  }

  const user = method === 'email'
    ? (email ? getAuthByEmail.get(email) : null)
    : (phone ? getAuthByPhone.get(phone) : null);

  if (!user) {
    return { ok: false, status: 401, error: 'Invalid credentials.' };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, status: 401, error: 'Invalid credentials.' };
  }

  touchAuthLogin.run(String(user.id));
  return {
    ok: true,
    status: 200,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      method,
    },
  };
}
