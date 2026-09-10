import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAllowedOrigins,
  isAllowedBrowserOrigin,
  isHypercrossVercelOrigin,
} from "../server/http/allowedOrigins";

test("missing Origin is allowed for same-origin, Electron, and curl", () => {
  assert.equal(isAllowedBrowserOrigin(undefined, []), true);
  assert.equal(isAllowedBrowserOrigin("", []), true);
});

test("explicit allowlist matches after normalization", () => {
  const allowlist = buildAllowedOrigins({
    allowedOriginsEnv: "https://hypercross-nexus-0-gold-augmentation.onrender.com",
  });
  assert.equal(
    isAllowedBrowserOrigin("https://hypercross-nexus-0-gold-augmentation.onrender.com/", allowlist),
    true,
  );
});

test("this project's Vercel production and preview hosts are allowed", () => {
  const allowlist = buildAllowedOrigins({
    allowedOriginsEnv: "https://hypercross-nexus-0-gold-augmentation.onrender.com",
  });
  assert.equal(isHypercrossVercelOrigin("https://hypercross-nexus-gold.vercel.app"), true);
  assert.equal(isHypercrossVercelOrigin("https://hypercross-nexus-gold-az-apex.vercel.app"), true);
  assert.equal(
    isHypercrossVercelOrigin("https://hypercross-nexus-gold-git-main-az-apex.vercel.app"),
    true,
  );
  assert.equal(
    isHypercrossVercelOrigin("https://hypercross-nexus-gold-git-cursor-vercel-auth-api-9ea588-az-apex.vercel.app"),
    true,
  );
  assert.equal(
    isAllowedBrowserOrigin("https://hypercross-nexus-gold-az-apex.vercel.app", allowlist),
    true,
  );
});

test("other Vercel apps and non-https origins are rejected", () => {
  const allowlist = buildAllowedOrigins({
    allowedOriginsEnv: "https://hypercross-nexus-0-gold-augmentation.onrender.com",
  });
  assert.equal(isHypercrossVercelOrigin("https://some-other-app.vercel.app"), false);
  assert.equal(isHypercrossVercelOrigin("https://hypercross-nexus-gold.vercel.app.evil.test"), false);
  assert.equal(isHypercrossVercelOrigin("http://hypercross-nexus-gold-az-apex.vercel.app"), false);
  assert.equal(isAllowedBrowserOrigin("https://evil.example", allowlist), false);
});
