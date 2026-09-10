import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { queries, initDb } from "../src/db";
import { hashPassword, verifyPassword, createSessionToken, getSessionCookieName, getSessionExpiration, ROLE_PERMISSIONS, requireAuth } from "../server/auth";

initDb();

test("password hashing verifies correctly", () => {
  const pw = "SecurePass!123";
  const hash = hashPassword(pw);
  assert.equal(verifyPassword(pw, hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
});

test("session token and cookie helpers are present", () => {
  const token = createSessionToken();
  assert.ok(token.length > 20);
  assert.equal(typeof getSessionCookieName(), "string");
  assert.ok(getSessionExpiration() instanceof Date);
});

test("role permissions include required access", () => {
  assert.ok(ROLE_PERMISSIONS.OWNER.includes("manage_blockchain"));
  assert.ok(ROLE_PERMISSIONS.ADMIN.includes("manage_assets"));
  assert.ok(ROLE_PERMISSIONS.TRADER.includes("execute_permitted_trading_operations"));
  assert.ok(ROLE_PERMISSIONS.VIEWER.includes("read_only"));
});

test("organization membership is enforced by identity", () => {
  const userId = crypto.randomUUID();
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  queries.user.create.run(userId, `u${Date.now()}@example.com`, null, "display");
  queries.organization.create.run(orgA, "Org A", userId, JSON.stringify({}));
  queries.organization.create.run(orgB, "Org B", userId, JSON.stringify({}));
  queries.organizationMember.add.run(memberId, userId, orgA, "OWNER");

  const member = queries.organizationMember.getByUserAndOrg.get(userId, orgA) as any;
  assert.equal(member?.orgId, orgA);
  const missing = queries.organizationMember.getByUserAndOrg.get(userId, orgB) as any;
  assert.equal(missing, undefined);
});

test("requireAuth rejects missing session", () => {
  const mockReq: any = { cookies: {}, headers: {} };
  const res: any = {
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  const next = () => { throw new Error("next should not be called"); };

  requireAuth(mockReq, res, next);
  assert.equal(res.code, 401);
});
