import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { queries } from "../src/db";

export const AUTH_ROLES = ["OWNER", "ADMIN", "OPERATOR", "TRADER", "VIEWER"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

export const ROLE_PERMISSIONS: Record<AuthRole, string[]> = {
  OWNER: [
    "manage_organization",
    "manage_users",
    "manage_blockchain",
    "deploy_contracts",
    "transfer_assets",
    "manage_billing",
    "manage_assets",
    "execute_permitted_trading_operations",
    "execute_approved_transactions",
    "manage_operational_config",
    "create_operational_transactions"
  ],
  ADMIN: ["manage_operational_config", "manage_assets", "execute_approved_transactions"],
  OPERATOR: ["create_operational_transactions"],
  TRADER: ["execute_permitted_trading_operations"],
  VIEWER: ["read_only"],
};

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string | null;
    phone?: string | null;
    walletAddress?: string | null;
    role: AuthRole;
    organizationId?: string | null;
  };
}

const SESSION_COOKIE_NAME = "hcx_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export function getRequestOrganizationId(req: Request): string | null {
  const bodyOrg = (req.body as any)?.organizationId;
  const paramsOrg = (req.params as any)?.organizationId;
  const queryOrg = (req.query as any)?.organizationId;
  return (bodyOrg ?? paramsOrg ?? queryOrg ?? null) as string | null;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function isValidRole(role: unknown): role is AuthRole {
  return typeof role === "string" && AUTH_ROLES.includes(role as AuthRole);
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  };
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function getSessionExpiration(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME] ?? req.headers.cookie?.split(`${SESSION_COOKIE_NAME}=`)[1]?.split(";")[0];
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const session = queries.session.getById.get(token) as any;
  if (!session) {
    return res.status(401).json({ error: "Session expired or invalid." });
  }

  if (new Date(session.expiresAt) < new Date()) {
    queries.session.deleteById.run(token);
    return res.status(401).json({ error: "Session expired." });
  }

  const user = queries.user.getById.get(session.userId) as any;
  if (!user) {
    return res.status(401).json({ error: "User not found." });
  }

  const orgMembership = session.orgId ? (queries.organizationMember.getByUserAndOrg.get(session.userId, session.orgId) as any) : null;
  const effectiveRole = isValidRole(session.role) ? session.role : "VIEWER";
  req.user = {
    id: user.id,
    email: user.email,
    phone: null,
    walletAddress: user.walletAddress ?? null,
    role: effectiveRole,
    organizationId: session.orgId ?? orgMembership?.orgId ?? null,
  };
  return next();
}

export function requireRole(...allowedRoles: AuthRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const current = req.user?.role;
    if (!current || !allowedRoles.includes(current)) {
      return res.status(403).json({ error: "Forbidden: insufficient role." });
    }
    return next();
  };
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const current = req.user?.role;
    if (!current || !ROLE_PERMISSIONS[current as AuthRole]?.includes(permission)) {
      return res.status(403).json({ error: "Forbidden: missing permission." });
    }
    return next();
  };
}

export function requireOrganizationAccess(orgIdParam: string | null = null) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const organizationId = orgIdParam ?? getRequestOrganizationId(req as Request);
    const userOrg = req.user?.organizationId;
    if (organizationId && userOrg && String(organizationId) !== String(userOrg)) {
      return res.status(403).json({ error: "Forbidden: organization mismatch." });
    }
    if (organizationId && !userOrg) {
      return res.status(403).json({ error: "Forbidden: no organization access." });
    }
    return next();
  };
}

export function requireOwnershipOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === "OWNER" || req.user?.role === "ADMIN") {
    return next();
  }
  return res.status(403).json({ error: "Forbidden: owner or admin required." });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

export function requireAnyRole(...allowedRoles: AuthRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const current = req.user?.role;
    if (!current || !allowedRoles.includes(current)) {
      return res.status(403).json({ error: "Forbidden: role not allowed." });
    }
    return next();
  };
}
