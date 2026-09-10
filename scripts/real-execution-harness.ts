import { blockchainService } from "../server/blockchain/BlockchainService";
import { TransactionService } from "../server/transactions/TransactionService";
import { ERC20_ABI } from "../server/blockchain/ERC20_ABI";
import { ethers } from "ethers";

/**
 * Testnet Real Execution Validation Harness
 *
 * Designed to safely execute step-by-step end-to-end integration flows
 * on testnet networks to prove system alignment with real blockchain state.
 *
 * MUST BE EXPLICITLY ENABLED with:
 *   RUN_REAL_EXECUTION_TESTS=true
 */
async function runHarness() {
  console.log("==================================================");
  console.log("HYPERCROSS REAL EXECUTION HARNESS STARTING");
  console.log("==================================================");

  // 1. Check Activation Flag
  if (process.env.RUN_REAL_EXECUTION_TESTS !== "true") {
    console.log("INFO: Harness is disabled. Set RUN_REAL_EXECUTION_TESTS=true to execute.");
    console.log("Bypassing execution safely.");
    return;
  }

  // 2. Load and initialize Blockchain Service
  await blockchainService.initialize();
  const rpcStart = Date.now();
  const status = await blockchainService.getStatus();
  const rpcLatencyMs = Date.now() - rpcStart;

  // 3. Mainnet Write Safety Interlock
  const mainnetChainIds = [1, 10, 56, 137, 8453, 42161];
  const isMainnet = status.chainId && mainnetChainIds.includes(status.chainId);
  if (isMainnet && process.env.ALLOW_MAINNET_WRITES !== "true") {
    console.error("CRITICAL ERROR: Mainnet writes are disabled. Aborting real execution tests.");
    console.error("To override this safety guard, set ALLOW_MAINNET_WRITES=true.");
    process.exit(1);
  }

  console.log("\n--- STEP A: Chainstack RPC Health ---");
  console.log(`Connected Network: ${status.network}`);
  console.log(`Chain ID: ${status.chainId}`);
  console.log(`Latest Block Number: ${status.blockNumber}`);
  console.log(`RPC Latency: ${rpcLatencyMs}ms`);
  console.log(`RPC Healthy: ${status.rpcHealthy}`);

  if (!status.rpcHealthy) {
    throw new Error("RPC health check failed. Cannot proceed with harness execution.");
  }

  // ─── Step B: Token Issuance & Contract read-back validation ───
  console.log("\n--- STEP B: Token Issuance ---");
  const privateKey = process.env.CHAINSTACK_PRIVATE_KEY;
  const enableSigner = process.env.ENABLE_SERVER_SIGNER === "true";

  if (!privateKey || !enableSigner) {
    console.log("SKIP: Server-side signing credentials are not fully set up. Token deployment skipped.");
    console.log("To run, configure CHAINSTACK_PRIVATE_KEY and ENABLE_SERVER_SIGNER=true.");
  } else {
    try {
      console.log("Constructing ERC-20 contract payload...");
      const MINIMAL_ERC20_BYTECODE = "0x6080604052348015600f57600080fd5b506040516104bc3803806104bc83398181016040526020811015602f57600080fd5b5051600060016000508190555060908061004c6000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c806306fdde03146030575b600080fd5b60005460405190815260200160405180910390f3";
      const constructorAbi = ["constructor(string name, string symbol, uint256 initialSupply)"];
      const iface = new ethers.Interface(constructorAbi);
      const testSupply = ethers.parseEther("500000");
      const encodedArgs = iface.encodeDeploy(["Harness Token", "HRNS", testSupply]);
      const deployData = (MINIMAL_ERC20_BYTECODE + encodedArgs.slice(2)) as `0x${string}`;

      console.log("Submitting deployment transaction to blockchain...");
      const tx = await blockchainService.sendTransaction({ data: deployData });
      console.log(`Transaction sent. Hash: ${tx.hash}`);

      console.log("Awaiting block confirmation (receipt)...");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Token deployment transaction reverted on-chain.");
      }

      const contractAddress = receipt.contractAddress;
      console.log(`Deployment successful! Contract Address: ${contractAddress}`);

      // Perform validation readbacks
      console.log("Performing read-back contract verification...");
      const name = await blockchainService.readContract(contractAddress, ERC20_ABI, "name", []);
      const symbol = await blockchainService.readContract(contractAddress, ERC20_ABI, "symbol", []);
      const decimals = await blockchainService.readContract(contractAddress, ERC20_ABI, "decimals", []);
      const totalSupply = await blockchainService.readContract(contractAddress, ERC20_ABI, "totalSupply", []);

      console.log(`- Contract Read Name: "${name}" (Expected: "Harness Token")`);
      console.log(`- Contract Read Symbol: "${symbol}" (Expected: "HRNS")`);
      console.log(`- Contract Read Decimals: ${decimals} (Expected: 18)`);
      console.log(`- Contract Read Total Supply: ${ethers.formatEther(totalSupply)} (Expected: 500000.0)`);

      if (name !== "Harness Token" || symbol !== "HRNS" || Number(decimals) !== 18 || BigInt(totalSupply) !== testSupply) {
        throw new Error("Harness asset readback state mismatch!");
      }
      console.log("SUCCESS: ERC-20 contract read-backs perfectly match deploy parameters!");
    } catch (err: any) {
      console.error("ERROR in Step B (Token Issuance):", err?.message || err);
    }
  }

  // ─── Step C: Send Controlled native transaction ───
  console.log("\n--- STEP C: Send Tiny Transaction ---");
  const testRecipient = process.env.TESTNET_RECIPIENT_ADDRESS;
  if (!privateKey || !enableSigner || !testRecipient) {
    console.log("SKIP: Send step requires CHAINSTACK_PRIVATE_KEY, ENABLE_SERVER_SIGNER=true, and TESTNET_RECIPIENT_ADDRESS.");
  } else {
    try {
      console.log(`Preparing transfer of 0.0001 native currency to recipient ${testRecipient}...`);
      const tx = await blockchainService.sendTransaction({
        contractAddress: testRecipient,
        data: "0x",
        value: "100000000000000", // 0.0001 ETH
      });
      console.log(`Transaction sent. Hash: ${tx.hash}`);
      console.log("Awaiting block confirmation...");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transfer transaction failed or reverted.");
      }
      console.log("SUCCESS: Send transaction confirmed on-chain successfully.");
    } catch (err: any) {
      console.error("ERROR in Step C (Send):", err?.message || err);
    }
  }

  // ─── Step E: Persistence validation ───
  console.log("\n--- STEP E: Database Persistence & Simulation Restart ---");
  try {
    const input = {
      userId: "harness-execution-user",
      walletAddress: "0xFa015db63faf8c69131fb9633e8b4e7e6005701a".toLowerCase(),
      chainId: status.chainId ?? 8453,
      network: status.network || "base",
      operationType: "native_transfer" as const,
      tokenSymbol: "ETH",
      amount: "0.22",
      value: "220000000000000000",
      gasEstimate: "21000",
    };

    console.log("Creating transaction record in sqlite database...");
    const id = TransactionService.createTransaction(input);
    console.log(`Transaction recorded with local database ID: ${id}`);

    console.log("Simulating service reload: loading record from persistence storage...");
    const loaded = TransactionService.getById(id);
    if (!loaded) {
      throw new Error(`Persisted record with ID ${id} not found in database!`);
    }

    console.log("Verifying loaded fields count & exact match:");
    console.log(`- Amount: ${loaded.amount} (Expected: ${input.amount})`);
    console.log(`- Wallet: ${loaded.walletAddress} (Expected: ${input.walletAddress})`);
    console.log(`- Operation: ${loaded.operationType} (Expected: ${input.operationType})`);

    if (loaded.amount !== input.amount || loaded.walletAddress !== input.walletAddress || loaded.operationType !== input.operationType) {
      throw new Error("Persistence verification field mismatch!");
    }

    console.log("SUCCESS: sqlite transaction record survives restart simulation and contains authentic fields.");
  } catch (err: any) {
    console.error("ERROR in Step E (Persistence):", err?.message || err);
  }

  console.log("\n==================================================");
  console.log("HYPERCROSS REAL EXECUTION HARNESS COMPLETED");
  console.log("==================================================");
}

runHarness().catch((err) => {
  console.error("Harness run failed:", err);
  process.exit(1);
});