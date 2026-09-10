/**
 * Production authentication routes (PostgreSQL-backed).
 * Mounted only when DATABASE_URL is configured (see server.ts).
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  registerUser,
  loginUser,
  refreshSession,
  revokeRefreshToken,
  createPasswordResetToken,
  resetPasswordWithToken,
} from "./ProductionAuthService";
import { sendPasswordResetEmail } from "./EmailDeliveryService";
import { requireProductionAuth, loadAuthenticatedUser, type ProductionAuthedRequest } from "./productionMiddleware";
import { recordAuditEvent } from "../audit/AuditService";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});
const resetRequestSchema = z.object({ email: z.string().email() });
const resetConfirmSchema = z.object({ token: z.string().length(64), newPassword: z.string().min(8).max(200) });

export const productionAuthRouter = Router();

productionAuthRouter.post("/reset-password/request", authRateLimit, async (req, res) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "A valid email is required." } });
  try {
    const reset = await createPasswordResetToken(parsed.data.email);
    if (reset) {
      const baseUrl = process.env.APP_BASE_URL || process.env.HYPERCROSS_PUBLIC_URL;
      if (!baseUrl) throw new Error("APP_BASE_URL is not configured.");
      await sendPasswordResetEmail(reset.email, `${baseUrl}/reset-password?token=${reset.token}`);
    }
    return res.json({ ok: true, message: "If an account exists, a reset link has been sent." });
  } catch (error: any) {
    console.error("Password reset delivery failed:", error?.message);
    return res.status(503).json({ error: { code: "RESET_UNAVAILABLE", message: "Password reset is temporarily unavailable." } });
  }
});

productionAuthRouter.post("/reset-password/confirm", authRateLimit, async (req, res) => {
  const parsed = resetConfirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Invalid reset request." } });
  try {
    await resetPasswordWithToken(parsed.data.token, parsed.data.newPassword);
    await recordAuditEvent({ action: "password_reset_complete" });
    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: { code: "RESET_INVALID", message: "Reset link is invalid or expired." } });
  }
});

productionAuthRouter.post("/register", authRateLimit, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request." } });
  }
  try {
    const { user, tokens } = await registerUser(parsed.data);
    await recordAuditEvent({ userId: user.id, action: "register_success" });
    return res.status(201).json({ user, ...tokens });
  } catch (error: any) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: error?.message ?? "Registration failed." } });
  }
});

productionAuthRouter.post("/login", authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request." } });
  }
  try {
    const deviceInformation = String(req.headers["user-agent"] ?? "").slice(0, 300);
    const { user, tokens } = await loginUser({ ...parsed.data, deviceInformation });
    await recordAuditEvent({ userId: user.id, action: "login_success", metadata: { deviceInformation } });
    return res.json({ user, ...tokens });
  } catch (error: any) {
    await recordAuditEvent({ action: "login_failure", metadata: { email: parsed.data.email } });
    return res.status(401).json({ error: { code: "AUTH_INVALID", message: "Invalid email or password." } });
  }
});

productionAuthRouter.post("/refresh", authRateLimit, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "INVALID_REQUEST", message: "refreshToken is required." } });
  }
  try {
    const { user, tokens } = await refreshSession(parsed.data.refreshToken);
    await recordAuditEvent({ userId: user.id, action: "session_refreshed" });
    return res.json({ user, ...tokens });
  } catch (error: any) {
    return res.status(401).json({ error: { code: "AUTH_INVALID", message: error?.message ?? "Unable to refresh session." } });
  }
});

productionAuthRouter.post("/logout", async (req, res) => {
  const refreshToken = req.body?.refreshToken;
  if (typeof refreshToken === "string" && refreshToken.length > 0) {
    await revokeRefreshToken(refreshToken);
  }
  await recordAuditEvent({ action: "logout" });
  return res.json({ ok: true });
});

productionAuthRouter.get("/me", requireProductionAuth, async (req: ProductionAuthedRequest, res) => {
  const user = await loadAuthenticatedUser(req);
  if (!user) return res.status(404).json({ error: { code: "AUTH_INVALID", message: "User not found." } });
  return res.json({ user });
});
