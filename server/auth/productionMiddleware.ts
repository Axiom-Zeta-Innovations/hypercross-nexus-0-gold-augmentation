/**
 * Production authorization middleware — Postgres/JWT backed.
 * Distinct from the legacy SQLite `server/auth.ts` middleware (kept for the
 * existing organization/wallet features); this is the commercial billing path.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, getUserById } from "./ProductionAuthService";
import { hasActiveSubscription, hasEntitlement } from "../entitlements/EntitlementService";
import type { FeatureKey } from "../config/plans";

export interface ProductionAuthedRequest extends Request {
  authUser?: { id: string; email: string };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export function requireProductionAuth(req: ProductionAuthedRequest, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required.", requestId: (req as any).requestId } });
  }
  try {
    const { userId, email } = verifyAccessToken(token);
    req.authUser = { id: userId, email };
    return next();
  } catch {
    return res.status(401).json({ error: { code: "AUTH_INVALID", message: "Invalid or expired access token.", requestId: (req as any).requestId } });
  }
}

export function requireSubscription() {
  return async (req: ProductionAuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required.", requestId: (req as any).requestId } });
    }
    const active = await hasActiveSubscription(req.authUser.id);
    if (!active) {
      return res.status(402).json({ error: { code: "SUBSCRIPTION_REQUIRED", message: "An active subscription is required.", requestId: (req as any).requestId } });
    }
    return next();
  };
}

export function requireEntitlement(feature: FeatureKey) {
  return async (req: ProductionAuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required.", requestId: (req as any).requestId } });
    }
    const allowed = await hasEntitlement(req.authUser.id, feature);
    if (!allowed) {
      return res.status(403).json({ error: { code: "ENTITLEMENT_REQUIRED", message: `Feature "${feature}" is not included in your plan.`, requestId: (req as any).requestId } });
    }
    return next();
  };
}

export async function loadAuthenticatedUser(req: ProductionAuthedRequest) {
  if (!req.authUser) return null;
  return getUserById(req.authUser.id);
}
