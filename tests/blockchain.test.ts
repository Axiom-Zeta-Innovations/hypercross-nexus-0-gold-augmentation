import test from "node:test";
import assert from "node:assert/strict";
import { isAddress } from "ethers";
import { validateTokenRegistry, getTokenConfig, getAllTokens } from "../server/blockchain/TokenRegistry";
import { BlockchainProviderFactory } from "../server/blockchain/BlockchainProviderFactory";
import { BlockchainConfigurationError } from "../server/blockchain/errors";

// ── Structural tests (no network required) ──────────────────────────────────

test("token registry: every configured token address is valid", () => {
  assert.doesNotThrow(() => validateTokenRegistry(isAddress));
});

test("token registry: at least one token is registered per supported testnet chain", () => {
  assert.ok(getTokenConfig("USDC", 11155111), "Ethereum Sepolia USDC missing");
  assert.ok(getTokenConfig("USDC", 84532), "Base Sepolia USDC missing");
  assert.ok(getAllTokens().length > 0);
});

test("BlockchainProviderFactory: throws CHAINSTACK_CONFIGURATION_ERROR when CHAINSTACK_RPC_URL is missing", () => {
  assert.throws(
    () => BlockchainProviderFactory.createFromEnvironment({ BLOCKCHAIN_PROVIDER: "chainstack" } as any),
    BlockchainConfigurationError
  );
});

test("BlockchainProviderFactory: never falls back to a public RPC when CHAINSTACK_RPC_URL is absent", () => {
  // Even with a recognized network name configured, no rpcUrl should be synthesized.
  try {
    BlockchainProviderFactory.createFromEnvironment({
      BLOCKCHAIN_PROVIDER: "chainstack",
      CHAINSTACK_NETWORK: "base",
      CHAINSTACK_CHAIN_ID: "8453",
    } as any);
    assert.fail("Expected CHAINSTACK_CONFIGURATION_ERROR");
  } catch (error: any) {
    assert.equal(error.code, "CHAINSTACK_CONFIGURATION_ERROR");
    assert.doesNotMatch(error.message, /mainnet\.base\.org|ankr|infura|alchemy/i);
  }
});

// ── Real integration tests ───────────────────────────────────────────────────
// Only run when integration-test environment variables are present. No private
// credentials are hardcoded — set these in your own environment to exercise them.
const hasIntegrationEnv = Boolean(process.env.CHAINSTACK_RPC_URL && process.env.CHAINSTACK_CHAIN_ID);

test(
  "Chainstack integration: eth_chainId and eth_blockNumber succeed against the configured RPC",
  { skip: !hasIntegrationEnv && "Set CHAINSTACK_RPC_URL and CHAINSTACK_CHAIN_ID to run this test" },
  async () => {
    const { blockchainService } = await import("../server/blockchain/BlockchainService");
    await blockchainService.initialize();
    const healthy = await blockchainService.healthCheck();
    assert.equal(healthy, true, "Chainstack RPC must respond to both eth_chainId and eth_blockNumber");
    const blockNumber = await blockchainService.getBlockNumber();
    assert.ok(blockNumber > 0);
  }
);

test(
  "Chainstack integration: ERC-20 symbol()/decimals() resolve for a registered token",
  { skip: !hasIntegrationEnv && "Set CHAINSTACK_RPC_URL and CHAINSTACK_CHAIN_ID to run this test" },
  async () => {
    const { blockchainService } = await import("../server/blockchain/BlockchainService");
    const { ERC20_ABI } = await import("../server/blockchain/ERC20_ABI");
    await blockchainService.initialize();
    const status = await blockchainService.getStatus();
    const token = getTokenConfig("USDC", status.chainId ?? 0);
    if (!token) return; // No USDC registered for this chain — nothing to verify.
    const symbol = await blockchainService.readContract(token.address, ERC20_ABI, "symbol", []);
    const decimals = await blockchainService.readContract(token.address, ERC20_ABI, "decimals", []);
    assert.equal(symbol, token.symbol);
    assert.equal(Number(decimals), token.decimals);
  }
);

test(
  "ERC-20 Deployment Artifact: Deploy token, read back info, and verify request consistency",
  { skip: (!hasIntegrationEnv || !process.env.CHAINSTACK_PRIVATE_KEY || process.env.ENABLE_SERVER_SIGNER !== "true") && "Set CHAINSTACK_RPC_URL, CHAINSTACK_PRIVATE_KEY and ENABLE_SERVER_SIGNER=true to run this integration test" },
  async () => {
    const { blockchainService } = await import("../server/blockchain/BlockchainService");
    const { ERC20_ABI } = await import("../server/blockchain/ERC20_ABI");
    const { ethers } = await import("ethers");
    await blockchainService.initialize();

    const MINIMAL_ERC20_BYTECODE = "0x6080604052348015600f57600080fd5b506040516104bc3803806104bc83398181016040526020811015602f57600080fd5b5051600060016000508190555060908061004c6000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c806306fdde03146030575b600080fd5b60005460405190815260200160405180910390f3";
    const constructorAbi = ["constructor(string name, string symbol, uint256 initialSupply)"];
    const iface = new ethers.Interface(constructorAbi);
    const initialSupply = ethers.parseEther("1000000");
    const encodedArgs = iface.encodeDeploy(["Test Deployment", "TDPLY", initialSupply]);
    const deployData = (MINIMAL_ERC20_BYTECODE + encodedArgs.slice(2)) as `0x${string}`;

    const tx = await blockchainService.sendTransaction({
      data: deployData,
    });
    const receipt = await tx.wait();
    assert.ok(receipt, "Transaction receipt must exist");
    assert.equal(receipt.status, 1, "Deployment transaction must be successful");
    const contractAddress = receipt.contractAddress;
    assert.ok(contractAddress, "Contract address must be returned");

    // Read back name
    const deployedName = await blockchainService.readContract(contractAddress, ERC20_ABI, "name", []);
    assert.equal(deployedName, "Test Deployment");

    // Read back symbol
    const deployedSymbol = await blockchainService.readContract(contractAddress, ERC20_ABI, "symbol", []);
    assert.equal(deployedSymbol, "TDPLY");

    // Read back decimals
    const deployedDecimals = await blockchainService.readContract(contractAddress, ERC20_ABI, "decimals", []);
    assert.equal(Number(deployedDecimals), 18);

    // Read back totalSupply
    const deployedTotalSupply = await blockchainService.readContract(contractAddress, ERC20_ABI, "totalSupply", []);
    assert.equal(BigInt(deployedTotalSupply), initialSupply);
  }
);
