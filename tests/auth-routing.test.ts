import test from "node:test";
import assert from "node:assert/strict";
import { shouldRetryLegacyAuth, getAuthRoutes, readAuthError } from "../src/lib/authRouting";

test("legacy auth fallback triggers for disabled canonical auth routes", () => {
  assert.equal(shouldRetryLegacyAuth(404), true);
  assert.equal(shouldRetryLegacyAuth(410), true);
  assert.equal(shouldRetryLegacyAuth(503), true);
  assert.equal(shouldRetryLegacyAuth(401), false);
});

test("auth route selection prefers canonical auth when available", () => {
  const routes = getAuthRoutes("signin");
  assert.equal(routes.primary, "/api/auth/v2/login");
  assert.equal(routes.fallback, "/api/auth/signin");
});

test("auth error reader prefers string or nested message", () => {
  assert.equal(readAuthError({ error: "Internal server error" }), "Internal server error");
  assert.equal(
    readAuthError({ error: { code: "AUTH_INVALID", message: "Invalid email or password." } }),
    "Invalid email or password.",
  );
  assert.equal(readAuthError({}), undefined);
});
