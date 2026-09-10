# FIX PRIORITY LIST — EXACT CODE LOCATIONS

## P0 STATUS (2026-09-10)

P0 items below are **fixed** on the MVP-honest pass. Original write-ups are kept for history and struck through.

| ID | Status | What landed |
|----|--------|-------------|
| ~~P0-1~~ | **FIXED** | `react-is` is in `package.json` dependencies; Vite `dedupe`/`optimizeDeps` include it. |
| ~~P0-2~~ | **FIXED** | Paper trading stays at `POST /api/paper/trades/execute` with `mode: "PAPER_TRADING"`, `warning`, and trade `note`. `POST /api/live/execute-trade` returns **501 NOT_IMPLEMENTED** and does not fabricate fills. |
| ~~P0-3~~ | **FIXED** | Kaleido Fabric portal is gated by `VITE_ENABLE_LEGACY_KALEIDO_PORTAL` (default `false`). Enabled state shows a deprecation notice only — no `/api/kaleido` or `/api/fabric-*` calls. Those routes return 501. |
| ~~P0-4~~ | **FIXED** | NFT / RWA / TokenFundraising (and similar demo modules) render `SimulationBadge` (banner + inline Demo on simulated prices). |

P1 and P2 below remain open.

---

## PRIORITY P0 (MUST FIX BEFORE MVP)

### ~~P0-1: Build Failure — Missing Dependency~~ **FIXED**

`react-is` is present in `package.json` (`"react-is": "^19.2.8"`).

**Command:**
```bash
npm install react-is
npm run build  # Verify it succeeds
```

**Expected Result:**
```
✓ 2445 modules transformed
✓ Build complete
dist/
```

**Time:** 5 minutes

---

### ~~P0-2: Trade Status Fabrication~~ **FIXED**

**Resolution (Option B + live 501):** Keep simulated fills on `POST /api/paper/trades/execute` with `mode: "PAPER_TRADING"`, `warning: "This is simulated trading. No real blockchain execution."`, and `trade.note`. The old live path `POST /api/live/execute-trade` now returns 501 `NOT_IMPLEMENTED` pointing at `/api/paper/trades/execute`. Dashboard paper balances/trades are labeled Simulation / Paper, not live fills.

~~Original issue:~~

**File:** [server.ts](server.ts#L1135-L1210)  
**Function:** `POST /api/live/execute-trade`  
**Problem:** Hardcodes status "FILLED" without blockchain submission

**Current Code (Lines 1135-1196):**
```typescript
app.post("/api/live/execute-trade", 
  requireAuth, 
  requirePermission("execute_permitted_trading_operations"), 
  (req, res) => {
    // ... validation ...
    
    const tradeId = crypto.randomUUID();
    queries.trades.create.run(
      tradeId, 
      accountId, 
      instrument, 
      side, 
      quantity, 
      price, 
      notional, 
      "FILLED"  // 🚨 HARDCODED
    );

    res.status(201).json({
      ok: true,
      trade: {
        id: tradeId,
        status: "FILLED",  // 🚨 USER SEES FILLED
      },
    });
  }
);
```

**Fix Option A: Disable Endpoint**
```typescript
// Replace entire POST /api/live/execute-trade with:

app.post("/api/live/execute-trade", 
  requireAuth, 
  requirePermission("execute_permitted_trading_operations"), 
  (req, res) => {
    return res.status(501).json({
      ok: false,
      error: "Trade execution not yet implemented",
      status: "NOT_IMPLEMENTED",
      note: "Real on-chain trading coming in Phase 8-11",
      testnet: "Use paper trading instead at /api/paper-trading/execute-trade"
    });
  }
);
```

**Fix Option B: Rename to Paper Trading + Label**
```typescript
app.post("/api/paper-trading/execute-trade", 
  requireAuth, 
  requirePermission("execute_permitted_trading_operations"), 
  (req, res) => {
    // ... existing code ...
    
    // Add to response:
    res.status(201).json({
      ok: true,
      mode: "PAPER_TRADING",  // ← NEW
      warning: "This is simulated trading. No real blockchain execution.",  // ← NEW
      trade: {
        id: tradeId,
        status: "FILLED",
        note: "Paper trading only - not settled on-chain",  // ← NEW
      },
    });
  }
);
```

**Recommended:** Option B (preserve for demo, clear labeling)  
**Time:** 30 minutes

---

### ~~P0-3: Kaleido UI Active~~ **FIXED**

**Resolution:** `VITE_ENABLE_LEGACY_KALEIDO_PORTAL` defaults to `"false"` in `.env.example`. `src/App.tsx` only renders a deprecation notice when the flag is `"true"` and never fetches `/api/kaleido`, `/api/fabric-connect`, `/api/fabric-query`, or `/api/fabric-invoke`. Those routes return 501 `NOT_IMPLEMENTED`.

~~Original issue:~~

**File:** [src/App.tsx](src/App.tsx#L136-L571)  
**Problem:** Renders entire Kaleido Fabric portal with non-existent endpoints

**Current Code (Example - Line 341):**
```typescript
const [fabricStrictMode, setFabricStrictMode] = useState(false);

// Line 1951-2323
const fabricPageContent = (
  <div>
    <h1>Kaleido Hyperledger Fabric Portal</h1>
    {/* ... full UI for Fabric interaction ... */}
  </div>
);

// Navigation
{showFabricPortal && <Tab label="Kaleido Fabric">{fabricPageContent}</Tab>}
```

**Fix: Add Feature Flag**

1. **In `.env.example` add:**
```bash
# Enable legacy Kaleido Hyperledger Fabric portal (deprecated)
ENABLE_LEGACY_KALEIDO_PORTAL="false"
```

2. **In `src/App.tsx` (top of component):**
```typescript
const enableKaleidoPortal = import.meta.env.VITE_ENABLE_LEGACY_KALEIDO_PORTAL === "true";
```

3. **Update navigation condition (replace line 1951-2323 render):**
```typescript
{enableKaleidoPortal && fabricPageContent}
```

4. **Or remove entirely and replace with deprecation notice:**
```typescript
{enableKaleidoPortal && (
  <Tab label="Kaleido Fabric">
    <DeprecationNotice>
      Kaleido Hyperledger Fabric integration has been superseded by Chainstack.
      This interface is maintained for legacy compatibility only.
    </DeprecationNotice>
  </Tab>
)}
```

**Delete:** Lines referencing these non-existent endpoints:
- `GET /api/kaleido` (line 459)
- `POST /api/fabric-connect` (line 2023)
- `GET /api/fabric-query` (line 2046)
- `POST /api/fabric-invoke` (line 2046)

**Time:** 30 minutes

---

### ~~P0-4: Demo Data Not Labeled~~ **FIXED**

**Resolution:** `components/SimulationBadge.tsx` renders a page banner (`SIMULATED DATA (Demo Mode)`) and an inline `Demo` chip next to simulated prices. Applied on NFT / RWA / TokenFundraising plus similar demo surfaces (launchpad, sports, copy trading, derivatives, mining, custody). `APP_DATA_MODE="live"` remains the default in `.env.example`.

~~Original issue:~~

**Files:**
- [src/pages/NFTMarketplacePage.tsx](src/pages/NFTMarketplacePage.tsx#L45-L48)
- [src/pages/RWAPage.tsx](src/pages/RWAPage.tsx#L46-L49)
- [src/pages/TokenFundraisingPage.tsx](src/pages/TokenFundraisingPage.tsx#L40-L45)

**Current Code (Example - NFTMarketplacePage):**
```typescript
const nfts = nftData.map(nft => ({
  ...nft,
  price: Math.random() * 100,     // 🚨 No label
  floorPrice: Math.random() * 50,
}));

return <NFTGrid items={nfts} />;  // 🚨 Shows prices as real
```

**Fix Option 1: Add Badge Component**

1. **Create [src/components/SimulationBadge.tsx](src/components/SimulationBadge.tsx):**
```typescript
export function SimulationBadge() {
  return (
    <div style={{
      position: "fixed",
      top: 10,
      right: 10,
      padding: "8px 16px",
      background: "#ff6b6b",
      color: "white",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: "bold",
      zIndex: 9999
    }}>
      ⚠️ SIMULATED DATA (Demo Mode)
    </div>
  );
}
```

2. **Add to pages that show demo data:**
```typescript
import { SimulationBadge } from "../components/SimulationBadge";

export function NFTMarketplacePage() {
  return (
    <>
      <SimulationBadge />  // ← ADD HERE
      <NFTGrid items={nfts} />
    </>
  );
}
```

**Fix Option 2: Set APP_MODE=live and Block Demo**

1. **Update [.env.example](.env.example):**
```bash
# OLD:
APP_MODE="demo"

# NEW:
APP_MODE="live"  # Demo mode disabled by default
```

2. **Update [src/services/dataSourceManager.ts](src/services/dataSourceManager.ts):**
```typescript
async getMarketPrices(symbols: string[]): Promise<MarketPriceMap> {
  try {
    const coingecko = this.httpClients.get('coingecko');
    if (!coingecko) return this.getDemoMarketPrices(symbols);
    
    // ... real API call ...
    return res.data;
  } catch (err) {
    console.error('Failed to fetch market prices:', err);
    
    // 🚨 CHANGE: Throw in live mode, only fallback in demo mode
    const isLiveMode = process.env.APP_DATA_MODE === "live";
    if (isLiveMode) {
      throw new Error("Failed to fetch real market data. Set APP_DATA_MODE=demo to use simulated data.");
    }
    
    if (this.liveStrictMode) throw err;
    return this.getDemoMarketPrices(symbols);
  }
}
```

**Recommended:** Option 1 (add badge) + Option 2 (set live mode default)  
**Time:** 1 hour

---

## PRIORITY P1 (HIGH - Fix ASAP)

### P1-1: Portfolio Endpoints Unprotected

**File:** [server.ts](server.ts#L679-L780)  
**Endpoints:** 
- `GET /api/portfolio/:address`
- `POST /api/portfolio/:address/refresh`
- `GET /api/portfolio/:address/balance/:symbol`

**Problem:** No authentication required, any user queries any wallet

**Fix Option A: Add requireAuth (Restrict to Owner)**

```typescript
// Before:
app.get("/api/portfolio/:address", async (req, res) => {
  const { address } = req.params;
  // ...
});

// After:
app.get("/api/portfolio/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userWallet = (req.session as any)?.walletAddress;
  if (!userWallet) {
    return res.status(401).json({ error: "Wallet not verified" });
  }
  const portfolio = await PortfolioService.getPortfolio(userWallet);
  return res.json({ ok: true, portfolio });
});
```

**Fix Option B: Keep Public, Add Testnet Label**

```typescript
// Existing code + add response wrapper:
app.get("/api/portfolio/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const portfolio = await PortfolioService.getPortfolio(address);
    
    return res.json({
      ok: true,
      isPublic: true,  // ← NEW
      warning: "This endpoint shows testnet data publicly. Do not assume privacy.",  // ← NEW
      chainId: 11155111,  // ← NEW
      testnetLabel: "Ethereum Sepolia",  // ← NEW
      portfolio,
    });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error?.message });
  }
});
```

**Recommended:** Option B (testnet should be observable)  
**Time:** 30 minutes

---

### P1-2: Private Key Support Enabled

**File:** [server/blockchain/EnvironmentValidator.ts](server/blockchain/EnvironmentValidator.ts#L50-L56)  
**Problem:** If CHAINSTACK_PRIVATE_KEY is set, server can sign txs

**Current Code:**
```typescript
if (env.CHAINSTACK_PRIVATE_KEY?.trim()) {
  warnings.push(
    `CHAINSTACK_PRIVATE_KEY is set. For MVP, user wallet signing is recommended.`
  );
}
```

**Fix: Throw Error**
```typescript
if (env.CHAINSTACK_PRIVATE_KEY?.trim()) {
  throw new Error(
    "CHAINSTACK_PRIVATE_KEY is not supported for MVP. " +
    "User wallet signing is required for all transactions. " +
    "Remove this variable from .env and verify no private keys are stored server-side."
  );
}
```

**Time:** 10 minutes

---

### P1-3: Wallet Address Validation Missing

**File:** [server.ts](server.ts#L570-L591)  
**Function:** `POST /api/wallet/nonce`

**Current Code:**
```typescript
app.post("/api/wallet/nonce", (req, res) => {
  try {
    const address = String(req.query.address || req.body?.address || "").trim();

    if (!address) {  // 🚨 Only checks for empty string
      return res.status(400).json({
        error: "Wallet address is required",
      });
    }
    // ...
  }
});
```

**Fix: Add Regex Validation**
```typescript
app.post("/api/wallet/nonce", (req, res) => {
  try {
    const address = String(req.query.address || req.body?.address || "").trim();

    // Add address format validation:
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {  // ← NEW
      return res.status(400).json({
        error: "Invalid wallet address. Expected format: 0x[40 hex characters]",
      });
    }
    // ...
  }
});
```

**Time:** 15 minutes

---

### P1-4: No Security Headers

**File:** [server.ts](server.ts#L1-L100)  
**Problem:** Missing CSRF, CSP, X-Frame-Options

**Fix: Add Helmet**

1. **Install:**
```bash
npm install helmet
```

2. **Add to [server.ts](server.ts) (after imports, before app setup):**
```typescript
import helmet from 'helmet';

// After: const app = express();
app.use(helmet());  // Adds security headers
```

**Security Headers Added:**
```
Strict-Transport-Security
X-Content-Type-Options
X-Frame-Options
X-XSS-Protection
Content-Security-Policy
```

**Time:** 20 minutes

---

## PRIORITY P2 (Medium - Fix Before Next Release)

### P2-1: Add Blockchain Integration Tests

**Create:** [tests/blockchain.test.ts](tests/blockchain.test.ts)

```typescript
import { describe, it, assert } from "node:test";
import { blockchainService } from "../server/blockchain/BlockchainService";
import { WalletVerificationService } from "../server/wallet/WalletVerificationService";
import { PortfolioService } from "../server/portfolio/PortfolioService";

describe("Blockchain Integration", () => {
  
  it("BlockchainService.getStatus returns valid network info", async () => {
    const status = await blockchainService.getStatus();
    assert(status.chainId === 11155111, "Should be Sepolia testnet");
    assert(status.network === "ethereum-sepolia", "Network name should be Sepolia");
    assert(status.blockNumber > 0, "Should have block number");
    assert(status.healthy === true, "RPC should be healthy");
  });

  it("WalletVerificationService.createNonce generates valid nonce", () => {
    const result = WalletVerificationService.createNonce("0x742d35Cc6634C0532925a3b844Bc7e7595f42bE");
    assert(result.nonce.length === 64, "Nonce should be 32 bytes hex (64 chars)");
    assert(result.expiresAt instanceof Date, "Should have expiry timestamp");
  });

  it("PortfolioService.fetchNativeBalance queries eth_getBalance", async () => {
    const balance = await PortfolioService.fetchNativeBalance("0x742d35Cc6634C0532925a3b844Bc7e7595f42bE");
    assert(typeof balance.balance === "bigint", "Should return BigInt balance");
    assert(typeof balance.balanceDecimal === "number", "Should have formatted decimal");
  });

  it("PortfolioService.getPortfolio returns portfolio structure", async () => {
    const portfolio = await PortfolioService.getPortfolio("0x742d35Cc6634C0532925a3b844Bc7e7595f42bE");
    assert(portfolio.walletAddress, "Should have wallet address");
    assert(Array.isArray(portfolio.holdings), "Holdings should be array");
  });
});
```

**Time:** 2-3 hours

---

## SUMMARY TABLE

| ID | Issue | File | Fix | Time | Priority |
|----|-------|------|-----|------|----------|
| ~~P0-1~~ | Build fails | package.json | **FIXED** — `react-is` in dependencies | 5 min | P0 |
| ~~P0-2~~ | Trade FILLED fake | server.ts paper + live 501 | **FIXED** — PAPER_TRADING labels; live route 501 | 30 min | P0 |
| ~~P0-3~~ | Kaleido UI active | src/App.tsx | **FIXED** — `VITE_ENABLE_LEGACY_KALEIDO_PORTAL=false` | 30 min | P0 |
| ~~P0-4~~ | Demo data unlabeled | src/pages/*.tsx | **FIXED** — SimulationBadge on demo surfaces | 1 hour | P0 |
| P1-1 | Portfolio unprotected | server.ts:679 | Add testnet label | 30 min | P1 |
| P1-2 | Private key enabled | EnvironmentValidator | Throw error if set | 10 min | P1 |
| P1-3 | No address validation | server.ts:571 | Add regex check | 15 min | P1 |
| P1-4 | No security headers | server.ts:30 | Add helmet middleware | 20 min | P1 |
| P2-1 | No blockchain tests | tests/blockchain.test.ts | Write 4+ tests | 2-3 hours | P2 |

**Total P0 (Blocking MVP):** 2 hours  
**Total P1 (High Priority):** 1.5 hours  
**Total P2 (Nice to Have):** 2-3 hours  
**Grand Total:** 5.5-6.5 hours

---

## Testing Each Fix

### After Fix P0-1 (Build):
```bash
npm run build
# Should complete without error
ls dist/
# Should have index.html, assets/, etc.
```

### After Fix P0-2 (Trade):
```bash
curl -X POST http://localhost:3000/api/paper-trading/execute-trade \
  -H "Cookie: sessionToken=..." \
  -d '{"accountId":"acc123","instrument":"BTC-USD","side":"BUY","quantity":1,"price":60000}' \
  | jq '.trade.mode, .trade.warning'
# Should show: "PAPER_TRADING", "This is simulated trading..."
```

### After Fix P0-3 (Kaleido):
```bash
# Kaleido tab should not appear in UI
# src/App.tsx should not render fabricPageContent
```

### After Fix P0-4 (Demo Label):
```bash
# NFT, RWA, Fundraising pages should show:
# "⚠️ SIMULATED DATA (Demo Mode)" badge
```

### After Fix P1-1 (Portfolio):
```bash
curl http://localhost:3000/api/portfolio/0x742d35Cc6634C0532925a3b844Bc7e7595f42bE \
  | jq '.isPublic, .warning, .testnetLabel'
# Should show: true, "Do not assume privacy", "Ethereum Sepolia"
```

### After Fix P1-2 (Private Key):
```bash
# Set CHAINSTACK_PRIVATE_KEY in .env, start server
# Server should fail to start with error message about private keys
```

### After Fix P1-3 (Address Validation):
```bash
curl -X POST http://localhost:3000/api/wallet/nonce \
  -d '{"address":"invalid-address"}' \
  | jq '.error'
# Should show: "Invalid wallet address. Expected format: 0x[40 hex characters]"
```

### After Fix P1-4 (Headers):
```bash
curl -I http://localhost:3000/
# Should include: Strict-Transport-Security, X-Content-Type-Options, etc.
```
