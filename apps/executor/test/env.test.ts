import { describe, expect, it } from "vitest";

import { parsePhase3Env } from "../src/config/env.js";

const BASE_ENV = {
  SUI_NETWORK: "testnet",
  WALRUS_PUBLISHER_URL: "https://publisher.example.test",
  WALRUS_AGGREGATOR_URL: "https://aggregator.example.test",
  LOCAL_KEYRING_PATH: "./data/local-keyring.json",
};

const REQUIRED_ENDPOINT_ENV = {
  WALRUS_PUBLISHER_URL: "https://publisher.example.test",
  WALRUS_AGGREGATOR_URL: "https://aggregator.example.test",
};

function expectSecretSafeFailure(env: Record<string, string | undefined>): void {
  const secret = Object.values(env).find(
    (value) => value !== undefined && value !== "testnet",
  );
  expect(() => parsePhase3Env(env)).toThrow();
  try {
    parsePhase3Env(env);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Invalid Phase 3 environment configuration",
    );
    if (secret !== undefined) {
      expect((error as Error).message).not.toContain(secret);
    }
  }
}

describe("Phase 3 environment parser", () => {
  it("accepts Testnet defaults for bounded Walrus limits", () => {
    const parsed = parsePhase3Env(REQUIRED_ENDPOINT_ENV);

    expect(parsed.SUI_NETWORK).toBe("testnet");
    expect(parsed.WALRUS_READ_TIMEOUT_MS).toBe(10_000);
    expect(parsed.WALRUS_MAX_BLOB_BYTES).toBe(1_048_576);
    expect(parsed.WALRUS_STORAGE_EPOCHS).toBe(53);
    expect(parsed.LOCAL_KEYRING_PATH).toBe("./data/local-keyring.json");
  });

  it("accepts explicit Testnet values and preserves the keyring path", () => {
    const parsed = parsePhase3Env({
      ...BASE_ENV,
      WALRUS_READ_TIMEOUT_MS: "2500",
      WALRUS_MAX_BLOB_BYTES: "4096",
      WALRUS_STORAGE_EPOCHS: "10",
      LOCAL_KEYRING_PATH: "/tmp/demo-keyring.json",
    });

    expect(parsed).toMatchObject({
      SUI_NETWORK: "testnet",
      WALRUS_READ_TIMEOUT_MS: 2500,
      WALRUS_MAX_BLOB_BYTES: 4096,
      WALRUS_STORAGE_EPOCHS: 10,
      LOCAL_KEYRING_PATH: "/tmp/demo-keyring.json",
    });
  });

  it("rejects mainnet", () => {
    expectSecretSafeFailure({ ...BASE_ENV, SUI_NETWORK: "mainnet" });
  });

  it.each([
    ["publisher HTTP", { WALRUS_PUBLISHER_URL: "http://publisher.example.test" }],
    ["aggregator HTTP", { WALRUS_AGGREGATOR_URL: "http://aggregator.example.test" }],
    [
      "publisher credentials",
      { WALRUS_PUBLISHER_URL: "https://user:password@publisher.example.test" },
    ],
    [
      "aggregator credentials",
      { WALRUS_AGGREGATOR_URL: "https://user:password@aggregator.example.test" },
    ],
    [
      "publisher query",
      { WALRUS_PUBLISHER_URL: "https://publisher.example.test/?token=secret-query" },
    ],
    [
      "aggregator query",
      { WALRUS_AGGREGATOR_URL: "https://aggregator.example.test/?token=secret-query" },
    ],
  ] as const)("rejects %s", (_label, overrides) => {
    expectSecretSafeFailure({ ...BASE_ENV, ...overrides });
  });

  it.each([
    ["zero timeout", { WALRUS_READ_TIMEOUT_MS: "0" }],
    ["negative timeout", { WALRUS_READ_TIMEOUT_MS: "-1" }],
    ["fractional timeout", { WALRUS_READ_TIMEOUT_MS: "1.5" }],
    ["oversized timeout", { WALRUS_READ_TIMEOUT_MS: "60001" }],
    ["zero blob limit", { WALRUS_MAX_BLOB_BYTES: "0" }],
    ["negative blob limit", { WALRUS_MAX_BLOB_BYTES: "-1" }],
    ["fractional blob limit", { WALRUS_MAX_BLOB_BYTES: "1.5" }],
    ["oversized blob limit", { WALRUS_MAX_BLOB_BYTES: "10485761" }],
    ["zero storage epochs", { WALRUS_STORAGE_EPOCHS: "0" }],
    ["fractional storage epochs", { WALRUS_STORAGE_EPOCHS: "1.5" }],
    ["oversized storage epochs", { WALRUS_STORAGE_EPOCHS: "54" }],
  ] as const)("rejects %s", (_label, overrides) => {
    expectSecretSafeFailure({ ...BASE_ENV, ...overrides });
  });

  it("rejects a credential-bearing secret without echoing it", () => {
    const secret = "s3cr3t-keyring-path";
    expectSecretSafeFailure({
      ...BASE_ENV,
      LOCAL_KEYRING_PATH: secret,
      SUI_NETWORK: "mainnet",
    });
  });
});
