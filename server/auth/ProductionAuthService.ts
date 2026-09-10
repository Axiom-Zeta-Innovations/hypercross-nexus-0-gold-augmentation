/**
 * ProductionAuthService — PostgreSQL-backed authentication.
 *
 * Access tokens: short-lived JWTs (JWT_SECRET), not persisted server-side.
 * Refresh tokens: long-lived random tokens; only their SHA-256 hash is stored
 * in `sessions`, so a stolen database dump cannot be used to log in as anyone.
 * Refresh rotates on every use (old session row is revoked, a new one created).
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, and, isNull, gt } from "drizzle-orm";
import { getDb } from "../db/postgres";
import { users, sessions, passwordResetTokens } from "../../database/schema";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_WORK_FACTOR = 12;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is not configured.");
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
  };
}

function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, jwtSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

async function issueTokens(userId: string, email: string, deviceInformation?: string): Promise<AuthTokens> {
  const db = getDb();
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await db.insert(sessions).values({
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    deviceInformation: deviceInformation ?? null,
    expiresAt,
  });

  return {
    accessToken: signAccessToken(userId, email),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Throws on duplicate email or invalid password. Never logs the password. */
export async function registerUser(input: { email: string; password: string; displayName?: string }): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new Error("A valid email is required.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    // Generic message deliberately avoids confirming which detail conflicted (user enumeration hardening).
    throw new Error("Unable to create account with the provided details.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_WORK_FACTOR);
  const [created] = await db.insert(users).values({
    email,
    passwordHash,
    displayName: input.displayName ?? null,
  }).returning();

  const tokens = await issueTokens(created.id, created.email);
  return { user: toPublicUser(created), tokens };
}

/** Generic failure message regardless of whether the email exists (user enumeration hardening). */
export async function loginUser(input: { email: string; password: string; deviceInformation?: string }): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = normalizeEmail(input.email);
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const genericError = new Error("Invalid email or password.");
  if (!row) throw genericError;
  if (row.status !== "active") throw new Error("This account is not active.");

  const valid = await bcrypt.compare(input.password, row.passwordHash);
  if (!valid) throw genericError;

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));

  const tokens = await issueTokens(row.id, row.email, input.deviceInformation);
  return { user: toPublicUser(row), tokens };
}

/** Rotates the refresh token: revokes the old session row, issues a new one. */
export async function refreshSession(refreshToken: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const db = getDb();
  const tokenHash = hashRefreshToken(refreshToken);
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);

  if (!session) throw new Error("Refresh token is invalid or has been revoked.");
  if (session.expiresAt.getTime() < Date.now()) throw new Error("Refresh token has expired.");

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== "active") throw new Error("Account is not active.");

  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
  const tokens = await issueTokens(user.id, user.email, session.deviceInformation ?? undefined);
  return { user: toPublicUser(user), tokens };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const db = getDb();
  const tokenHash = hashRefreshToken(refreshToken);
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.refreshTokenHash, tokenHash));
}

/** Revokes every session for a user — used for "sign out of all devices". */
export async function revokeAllSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function createPasswordResetToken(email: string): Promise<{ email: string; token: string } | null> {
  const normalizedEmail = normalizeEmail(email);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString("hex");
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
  return { email: user.email, token };
}

export async function resetPasswordWithToken(token: string, password: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8) throw new Error("Reset link is invalid or expired.");
  const db = getDb();
  const [record] = await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, hashResetToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1);
  if (!record) throw new Error("Reset link is invalid or expired.");
  const updated = await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.id, record.id), isNull(passwordResetTokens.usedAt))).returning({ id: passwordResetTokens.id });
  if (updated.length !== 1) throw new Error("Reset link is invalid or expired.");
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, BCRYPT_WORK_FACTOR), updatedAt: new Date() }).where(eq(users.id, record.userId));
  await revokeAllSessions(record.userId);
}

export function verifyAccessToken(accessToken: string): { userId: string; email: string } {
  const decoded = jwt.verify(accessToken, jwtSecret()) as jwt.JwtPayload;
  if (!decoded.sub || typeof decoded.sub !== "string") throw new Error("Invalid token payload.");
  return { userId: decoded.sub, email: String(decoded.email ?? "") };
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ? toPublicUser(row) : null;
}
