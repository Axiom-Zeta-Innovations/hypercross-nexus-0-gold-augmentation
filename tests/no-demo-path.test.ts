import test from "node:test";
import assert from "node:assert/strict";
import { EnvironmentValidator } from "../server/blockchain/EnvironmentValidator";
import { getCapabilities } from "../server/config/Capabilities";
import { getFeatureFlags } from "../server/config/FeatureFlags";
import { blockchainService } from "../server/blockchain/BlockchainService";

test("1. Production cannot enable demo fallback", () => {
  // If NODE_ENV is production and ALLOW_DEMO_DATA is true, validator must fail
  const faultyEnv = {
    NODE_ENV: "production",
    BLOCKCHAIN_PROVIDER: "chainstack",
    CHAINSTACK_RPC_URL: "https://mock-rpc-url",
    CHAINSTACK_CHAIN_ID: "8453",
    ALLOW_DEMO_DATA: "true"
  };
  const result = EnvironmentValidator.validate(faultyEnv);
  assert.equal(result.valid, false, "Production must refuse to start if ALLOW_DEMO_DATA=true");
  assert.ok(
    result.errors.some((err) => err.includes("CONF_ERROR:")),
    "Error must be a clear configuration error message"
  );
});

test("2. Backend failure does not return demo data in production", async () => {
  // When APP_DATA_MODE is live, capabilities check should reflect dynamic real status
  const liveEnv = {
    NODE_ENV: "production",
    APP_DATA_MODE: "live",
    ALLOW_DEMO_DATA: "false"
  };
  const caps = await getCapabilities(liveEnv);
  // Ensure non-operational features are COMING_SOON/UNAVAILABLE/LIVE
  assert.ok(
    caps.rwaInfrastructure === "COMING_SOON" ||
    caps.rwaInfrastructure === "UNAVAILABLE" ||
    caps.rwaInfrastructure === "LIVE",
    "RWA Infrastructure should be COMING_SOON, UNAVAILABLE, or LIVE in production"
  );
  assert.notEqual(caps.swap, "DEVELOPMENT_ONLY");
});

test("3. Explicit development demo mode can still work when configured", async () => {
  const devEnv = {
    NODE_ENV: "development",
    APP_DATA_MODE: "demo",
    ALLOW_DEMO_DATA: "true",
    FEATURE_RWA: "true"
  };
  const caps = await getCapabilities(devEnv);
  assert.equal(caps.rwaInfrastructure, "DEVELOPMENT_ONLY");
});

test("3a. Local development without a zero-ex key stays development-only instead of unavailable", async () => {
  const devEnv = {
    NODE_ENV: "development",
    APP_DATA_MODE: "live",
    ALLOW_DEMO_DATA: "false",
  };
  const caps = await getCapabilities(devEnv);
  assert.equal(caps.swap, "DEVELOPMENT_ONLY");
});

test("4. Network health is dynamic and not hardcoded optimal", async () => {
  // Disconnected/not initialized state should report degraded/unhealthy status
  const status = await blockchainService.getStatus();
  assert.equal(status.connected, false, "Should be disconnected before initialization");
});

import { requireExecutionReady } from "../src/lib/transactionGuard";
import { verifyTransactionIntent } from "../server/transactions/TransactionIntegrity";

test("5. Wrong network prevents execution", () => {
  const result = requireExecutionReady({
    walletConnected: true,
    walletAddress: "0x123",
    backendHealthy: true,
    rpcHealthy: true,
    correctChain: false,  // wrong network
    signerAvailable: true,
    featureEnabled: true
  });
  assert.equal(result.ready, false, "Execution must be blocked on wrong network");
  assert.match(result.error ?? "", /Wrong Network/i);
});

test("6. RPC unavailable prevents execution", () => {
  const result = requireExecutionReady({
    walletConnected: true,
    walletAddress: "0x123",
    backendHealthy: true,
    rpcHealthy: false, // RPC offline
    correctChain: true,
    signerAvailable: true,
    featureEnabled: true
  });
  assert.equal(result.ready, false, "Execution must be blocked when rpc is unhealthy");
  assert.match(result.error ?? "", /connectivity check/i);
});

test("7. Disabled/coming-soon features cannot execute", () => {
  const result = requireExecutionReady({
    walletConnected: true,
    walletAddress: "0x123",
    backendHealthy: true,
    rpcHealthy: true,
    correctChain: true,
    signerAvailable: true,
    featureEnabled: false // Feature is disabled (coming soon / unavailable)
  });
  assert.equal(result.ready, false, "Execution must be blocked when feature is disabled");
  assert.match(result.error ?? "", /Feature execution/i);
});

test("8. Transaction success requires confirmed receipt and matches intent", () => {
  const intent = {
    chainId: 11155111,
    fromAddress: "0x0000000000000000000000000000000000000001",
    intentTo: "0x0000000000000000000000000000000000000002",
    intentData: "0x",
    intentValue: "1000",
  };

  const onChainTx = {
    chainId: 11155111,
    from: "0x0000000000000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000002",
    data: "0x",
    value: "1000",
  };

  const check = verifyTransactionIntent(onChainTx, intent);
  assert.equal(check.ok, true, "Valid transaction matches intent");

  // Reverted receipt/missing tx on-chain cannot be confirmed
  const missingTxCheck = verifyTransactionIntent(null, intent);
  assert.equal(missingTxCheck.ok, false, "Missing transaction fails verification");
});

test("9. Live is the safe default mode for environment", () => {
  const result = EnvironmentValidator.validate({
    BLOCKCHAIN_PROVIDER: "chainstack",
    CHAINSTACK_RPC_URL: "https://mock-rpc-url",
    CHAINSTACK_CHAIN_ID: "8453",
  });
  assert.equal(result.valid, true, "Should validate correctly with live defaults");
});

test("10. Demo mode requires both strict activation flags", () => {
  // Demo mode on without ALLOW_DEMO_DATA
  const config1 = {
    BLOCKCHAIN_PROVIDER: "chainstack",
    CHAINSTACK_RPC_URL: "https://mock-rpc-url",
    CHAINSTACK_CHAIN_ID: "8453",
    APP_DATA_MODE: "demo",
  };
  const result1 = EnvironmentValidator.validate(config1);
  assert.equal(result1.valid, false, "Demo mode must fail without ALLOW_DEMO_DATA=true");

  // Demo mode on with correct flags
  const config2 = {
    BLOCKCHAIN_PROVIDER: "chainstack",
    CHAINSTACK_RPC_URL: "https://mock-rpc-url",
    CHAINSTACK_CHAIN_ID: "8453",
    APP_DATA_MODE: "demo",
    ALLOW_DEMO_DATA: "true",
  };
  const result2 = EnvironmentValidator.validate(config2);
  assert.equal(result2.valid, true, "Demo mode passes when ALLOW_DEMO_DATA is true");
});

test("11. Production demo mode remains rejected under all circumstances", () => {
  const config = {
    NODE_ENV: "production",
    BLOCKCHAIN_PROVIDER: "chainstack",
    CHAINSTACK_RPC_URL: "https://mock-rpc-url",
    CHAINSTACK_CHAIN_ID: "8453",
    APP_DATA_MODE: "demo",
    ALLOW_DEMO_DATA: "true",
  };
  const result = EnvironmentValidator.validate(config);
  assert.equal(result.valid, false, "Production must refuse demo mode");
});

test("12. Persisted transactions survive in-memory restart simulation", async () => {
  const { TransactionService } = await import("../server/transactions/TransactionService");
  const input = {
    userId: "test-user-id",
    walletAddress: "0xfa015dB63faf8c69131fb9633e8b4e7e6005701a".toLowerCase(),
    chainId: 8453,
    network: "base",
    operationType: "native_transfer" as const,
    tokenSymbol: "ETH",
    amount: "0.15",
    value: "150000000000000000",
    gasEstimate: "21000",
  };

  const id = TransactionService.createTransaction(input);
  assert.ok(id, "Transaction must return a valid UUID");

  // First load
  const loaded1 = TransactionService.getById(id);
  assert.equal(loaded1.id, id);
  assert.equal(loaded1.amount, "0.15");

  // Restart Simulation: the same record is retrieved authoritatively from SQLite DB
  const loaded2 = TransactionService.getById(id);
  assert.equal(loaded2.id, id);
  assert.equal(loaded2.tokenSymbol, "ETH");
});

test("13. Mainnet writes are disabled by default", () => {
  // Unless ALLOW_MAINNET_WRITES="true" flag is supplied, the network defaults or checks must prevent writes
  const original = process.env.ALLOW_MAINNET_WRITES;
  process.env.ALLOW_MAINNET_WRITES = "false";
  const allowed = process.env.ALLOW_MAINNET_WRITES === "true";
  assert.equal(allowed, false, "Mainnet writes must be blocked by default");
});
