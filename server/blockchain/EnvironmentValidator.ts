/**
 * EnvironmentValidator
 *
 * Validates blockchain environment configuration on startup.
 * Fails fast with clear error messages if required configuration is missing.
 */

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class EnvironmentValidator {
  static validate(env: NodeJS.ProcessEnv = process.env): EnvironmentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ─── CORE REQUIRED CONFIG ───────────────────────────────────────────────
    const provider = (env.BLOCKCHAIN_PROVIDER || "chainstack").toLowerCase();
    if (provider !== "chainstack") {
      errors.push(
        `[CORE] BLOCKCHAIN_PROVIDER must be "chainstack". Got: "${provider}"`
      );
    }

    const rpcUrl = env.CHAINSTACK_RPC_URL?.trim();
    if (!rpcUrl) {
      errors.push(
        `[CORE] CHAINSTACK_RPC_URL is required. Set this to your Chainstack RPC endpoint (e.g., https://...chainstack.com/...)`
      );
    }

    const chainIdStr = env.CHAINSTACK_CHAIN_ID?.trim();
    if (!chainIdStr) {
      errors.push(
        `[CORE] CHAINSTACK_CHAIN_ID is required to identify the target EVM network (e.g., 8453 for Base, 11155111 for Sepolia)`
      );
    } else if (!/^\d+$/.test(chainIdStr)) {
      errors.push(`[CORE] CHAINSTACK_CHAIN_ID must be a numeric chain ID. Got: "${chainIdStr}"`);
    }

    const network = env.CHAINSTACK_NETWORK?.trim();
    if (!network) {
      warnings.push(`[CORE] CHAINSTACK_NETWORK not specified. Defaulting to "ethereum".`);
    }

    // ─── OPTIONAL FEATURE CONFIG ────────────────────────────────────────────
    // 0x Swap features
    const enableSwap = env.FEATURE_SWAP !== "false";
    if (enableSwap && !env.ZEROX_API_KEY?.trim()) {
      warnings.push(
        `[FEATURE] ZEROX_API_KEY is not set. 0x Swap operations will be disabled/unavailable.`
      );
    }

    // PayPal Webhook feature
    const enablePayPal = env.FEATURE_PAYPAL === "true";
    if (enablePayPal && !env.PAYPAL_WEBHOOK_SECRET?.trim()) {
      errors.push(
        `[FEATURE] PayPal Webhook integration is enabled (FEATURE_PAYPAL=true) but PAYPAL_WEBHOOK_SECRET is not configured.`
      );
    }

    // ─── DEMO MODE CONFIG ───────────────────────────────────────────────────
    const appMode = env.APP_DATA_MODE?.trim() || "live";
    const allowDemo = env.ALLOW_DEMO_DATA === "true";
    const isProd = env.NODE_ENV === "production";

    if (isProd && (allowDemo || appMode === "demo")) {
      errors.push(
        "CONF_ERROR: Demo data fallback is not allowed in production. " +
        "To run in production, set APP_DATA_MODE=live, ALLOW_DEMO_DATA=false, and configure real credentials."
      );
    }

    if (appMode && !["live", "demo", "test"].includes(appMode)) {
      errors.push(
        `[DEMO] APP_DATA_MODE value "${appMode}" is not recognized. Use: live, demo, or test.`
      );
    }

    if (appMode === "demo") {
      if (!allowDemo) {
        errors.push(
          "[DEMO] Invalid configuration: To enable demo mode, both APP_DATA_MODE=demo and ALLOW_DEMO_DATA=true must be set."
        );
      }
    } else {
      // appMode is "live" or "test"
      if (allowDemo && !isProd) {
        errors.push(
          "[DEMO] Invalid configuration: ALLOW_DEMO_DATA=true is not allowed when APP_DATA_MODE is " + appMode + ". Set ALLOW_DEMO_DATA=false."
        );
      }
    }

    const liveStrict = env.LIVE_FEED_STRICT?.trim();
    if (liveStrict && !["true", "false", "1", "0"].includes(liveStrict.toLowerCase())) {
      warnings.push(
        `[DEMO] LIVE_FEED_STRICT value "${liveStrict}" is not recognized. Use: true, false, 1, or 0.`
      );
    }

    // ─── SAFETY & REAL EXECUTION CONFIG ─────────────────────────────────────
    if (env.CHAINSTACK_PRIVATE_KEY?.trim()) {
      errors.push(
        "CHAINSTACK_PRIVATE_KEY is not supported for MVP. " +
        "User wallet signing is required for all transactions. " +
        "Remove this variable from .env and verify no private keys are stored server-side."
      );
    }

    const mainnetWrites = env.ALLOW_MAINNET_WRITES === "true";
    if (mainnetWrites) {
      warnings.push(
        `[SAFETY] ALLOW_MAINNET_WRITES is enabled. Live writes on Mainnet networks are active.`
      );
    }

    // ─── Compile Result ────────────────────────────────────────────────────
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static throwIfInvalid(env: NodeJS.ProcessEnv = process.env): void {
    const result = this.validate(env);
    if (!result.valid) {
      const errorMessage =
        `Environment validation failed:\n\n` +
        result.errors.map((e) => `  • ${e}`).join("\n") +
        `\n\n` +
        `See .env.example for configuration template.`;
      throw new Error(errorMessage);
    }
    if (result.warnings.length > 0) {
      console.warn(
        `Environment warnings:\n` +
        result.warnings.map((w) => `  ⚠ ${w}`).join("\n")
      );
    }
  }

  /**
   * Extracts only the hostname from a URL for safe logging.
   * Chainstack endpoints may embed access tokens/credentials in the path or query string,
   * so the full URL must never be logged — only the hostname (or "configured"/"not set").
   */
  private static safeHost(url: string | undefined): string {
    if (!url?.trim()) return "not set";
    try {
      return new URL(url).hostname || "configured";
    } catch {
      return "configured";
    }
  }

  static logStartupInfo(env: NodeJS.ProcessEnv = process.env): void {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`  BLOCKCHAIN CONFIGURATION`);
    console.log(`${"─".repeat(70)}`);
    console.log(`  Provider: ${env.BLOCKCHAIN_PROVIDER || "chainstack"}`);
    console.log(`  Network: ${env.CHAINSTACK_NETWORK || "ethereum"}`);
    console.log(`  Chain ID: ${env.CHAINSTACK_CHAIN_ID || "1"}`);
    console.log(`  RPC URL: ${env.CHAINSTACK_RPC_URL ? `configured (${this.safeHost(env.CHAINSTACK_RPC_URL)})` : "not set"}`);
    console.log(`  WSS URL: ${env.CHAINSTACK_WSS_URL ? `configured (${this.safeHost(env.CHAINSTACK_WSS_URL)})` : "not set"}`);
    const appMode = env.APP_DATA_MODE || "live";
    console.log(`  Data Mode: ${appMode}`);
    const strict = env.LIVE_FEED_STRICT === "true" || env.LIVE_FEED_STRICT === "1";
    console.log(`  Strict Mode: ${strict ? "ENABLED (no fallback to demo)" : "disabled (fallback to demo)"}`);
    console.log(`${"─".repeat(70)}\n`);
  }
}
