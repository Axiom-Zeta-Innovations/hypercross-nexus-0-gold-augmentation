import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("P0-1: react-is is declared as a runtime dependency", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies["react-is"], "package.json must include react-is");
});

test("P0-2: POST /api/live/execute-trade returns 501 and never fabricates FILLED", () => {
  const src = read("server.ts");
  const match = src.match(/app\.post\("\/api\/live\/execute-trade"[\s\S]*?\n  \}\);/);
  assert.ok(match, "live execute-trade route must exist");
  assert.match(match![0], /status\(501\)/);
  assert.match(match![0], /liveExecuteTradeNotImplementedBody/);
  assert.doesNotMatch(match![0], /FILLED/);
});

test("P0-2: paper execute path is labeled PAPER_TRADING", () => {
  const src = read("server.ts");
  assert.match(src, /app\.post\("\/api\/paper\/trades\/execute"/);
  assert.match(src, /paperTradingMeta/);
  assert.match(src, /paperFilledTradeNote/);
  const helper = read("server/trading/paperTrading.ts");
  assert.match(helper, /PAPER_TRADING/);
  assert.match(helper, /simulated trading/i);
});

test("P0-3: Kaleido portal is gated off by default and does not call fabric APIs", () => {
  const app = read("src/App.tsx");
  assert.match(app, /VITE_ENABLE_LEGACY_KALEIDO_PORTAL/);
  assert.match(app, /enableLegacyKaleidoPortal/);
  assert.match(app, /LegacyKaleidoDeprecationPage/);
  assert.doesNotMatch(app, /fetch\(\s*["']\/api\/kaleido/);
  assert.doesNotMatch(app, /fetch\(\s*["']\/api\/fabric-/);
  const envExample = read(".env.example");
  assert.match(envExample, /VITE_ENABLE_LEGACY_KALEIDO_PORTAL="false"/);
});

test("P0-4: simulated NFT/RWA/fundraising (and similar) surfaces render SimulationBadge", () => {
  const pages = [
    "src/pages/NFTMarketplacePage.tsx",
    "src/pages/RWAPage.tsx",
    "src/pages/TokenFundraisingPage.tsx",
    "src/pages/TokenLaunchpadPage.tsx",
    "src/pages/SportsTradingPage.tsx",
    "src/pages/CopyTradingPage.tsx",
    "src/pages/DerivativesPage.tsx",
    "src/pages/MiningPoolsPage.tsx",
    "src/pages/CustodyPage.tsx",
  ];
  for (const page of pages) {
    const src = read(page);
    assert.match(src, /SimulationBadge/, `${page} must render SimulationBadge`);
  }
});
