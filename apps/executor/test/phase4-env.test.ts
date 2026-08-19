import { describe, expect, it } from "vitest";

import { parsePhase4Env } from "../src/config/phase4-env.js";

function validEnv(): Record<string, string> {
  return {
    SUI_NETWORK: "testnet",
    SUI_GRPC_URL: "https://fullnode.testnet.sui.io:443",
    SUI_PACKAGE_ID: "0x1",
    WALRUS_AGGREGATOR_URL: "https://aggregator.testnet.walrus.space",
    EXECUTOR_PRIVATE_KEY: "test-only-secret",
  };
}

describe("Phase 4 environment", () => {
  it("applies local-only and bounded defaults", () => {
    expect(parsePhase4Env(validEnv())).toMatchObject({
      SUI_NETWORK: "testnet",
      EXECUTOR_HOST: "127.0.0.1",
      EXECUTOR_PORT: 3001,
      CHALLENGE_TTL_MS: 300_000,
      WALRUS_READ_TIMEOUT_MS: 10_000,
      WALRUS_MAX_BLOB_BYTES: 1_048_576,
      CORS_ORIGIN: "http://127.0.0.1:5173",
    });
  });

  it.each([
    ["mainnet", { SUI_NETWORK: "mainnet" }],
    ["insecure RPC", { SUI_GRPC_URL: "http://fullnode.testnet.sui.io" }],
    ["public bind", { EXECUTOR_HOST: "0.0.0.0" }],
    ["wildcard CORS", { CORS_ORIGIN: "*" }],
    ["long challenge", { CHALLENGE_TTL_MS: "300001" }],
    ["empty signer", { EXECUTOR_PRIVATE_KEY: "" }],
  ])("rejects %s with one secret-safe error", (_label, override) => {
    const secret = "test-only-secret";
    const environment = { ...validEnv(), ...override };
    let caught: unknown;
    try {
      parsePhase4Env(environment);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      "Invalid Phase 4 environment configuration",
    );
    expect((caught as Error).message).not.toContain(secret);
  });
});
