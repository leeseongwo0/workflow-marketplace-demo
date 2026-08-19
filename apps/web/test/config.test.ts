import { describe, expect, it } from "vitest";

import {
  explorerObjectUrl,
  explorerTransactionUrl,
  resolveWebConfig,
} from "../src/live/config";

const PACKAGE_ID = `0x${"a".repeat(64)}`;
const MARKETPLACE_ID = `0x${"b".repeat(64)}`;
const RELEASE_ID = `0x${"c".repeat(64)}`;

const LIVE_ENV = {
  VITE_SUI_NETWORK: "testnet",
  VITE_SUI_GRPC_URL: "https://fullnode.example.test:443/",
  VITE_EXECUTOR_BASE_URL: "http://127.0.0.1:3001/api/",
  VITE_SUI_EXPLORER_BASE_URL: "https://explorer.example.test////",
  VITE_SUI_PACKAGE_ID: PACKAGE_ID,
  VITE_MARKETPLACE_ID: MARKETPLACE_ID,
  VITE_WORKFLOW_RELEASE_ID: RELEASE_ID,
};

describe("web live configuration", () => {
  it("resolves the offline fixture defaults without requiring live IDs", () => {
    expect(resolveWebConfig({})).toEqual({
      mode: "fixture",
      network: "testnet",
      suiGrpcUrl: "https://fullnode.testnet.sui.io:443",
      executorBaseUrl: "http://127.0.0.1:3001",
    });
  });

  it("accepts complete Testnet live configuration, normalizes IDs, and builds explorer URLs", () => {
    const config = resolveWebConfig({
      ...LIVE_ENV,
      VITE_SUI_PACKAGE_ID: "0xA",
      VITE_MARKETPLACE_ID: "0xB",
      VITE_WORKFLOW_RELEASE_ID: "0xC",
    });

    expect(config).toEqual({
      mode: "live",
      network: "testnet",
      suiGrpcUrl: "https://fullnode.example.test:443/",
      executorBaseUrl: "http://127.0.0.1:3001",
      explorerBaseUrl: "https://explorer.example.test",
      packageId: `0x${"0".repeat(63)}a`,
      marketplaceId: `0x${"0".repeat(63)}b`,
      releaseId: `0x${"0".repeat(63)}c`,
    });

    expect(explorerObjectUrl(config, "0x123")).toBe(
      `https://explorer.example.test/object/0x${"0".repeat(61)}123`,
    );
    expect(explorerTransactionUrl(config, "digest/with spaces")).toBe(
      "https://explorer.example.test/tx/digest%2Fwith%20spaces",
    );
  });

  it("marks partial IDs as a configuration error instead of silently entering live mode", () => {
    const config = resolveWebConfig({
      ...LIVE_ENV,
      VITE_WORKFLOW_RELEASE_ID: undefined,
    });

    expect(config).toMatchObject({
      mode: "configuration_error",
      network: "testnet",
      suiGrpcUrl: LIVE_ENV.VITE_SUI_GRPC_URL,
      executorBaseUrl: "http://127.0.0.1:3001",
      explorerBaseUrl: "https://explorer.example.test",
    });
    expect("packageId" in config).toBe(false);
    expect("marketplaceId" in config).toBe(false);
    expect("releaseId" in config).toBe(false);
  });

  it.each([
    ["mainnet", { VITE_SUI_NETWORK: "mainnet" }],
    ["non-loopback executor", { VITE_EXECUTOR_BASE_URL: "https://executor.example.test" }],
    ["executor credentials", { VITE_EXECUTOR_BASE_URL: "http://user:password@127.0.0.1:3001" }],
    ["executor query", { VITE_EXECUTOR_BASE_URL: "http://127.0.0.1:3001/?token=secret" }],
    ["invalid explorer protocol", { VITE_SUI_EXPLORER_BASE_URL: "http://explorer.example.test" }],
    ["invalid package ID", { VITE_SUI_PACKAGE_ID: "not-an-address" }],
  ] as const)("rejects %s as configuration_error", (_label, overrides) => {
    const config = resolveWebConfig({ ...LIVE_ENV, ...overrides });
    expect(config.mode).toBe("configuration_error");
  });

  it("falls back to safe fixture defaults when the required base configuration is invalid", () => {
    const config = resolveWebConfig({
      VITE_SUI_NETWORK: "testnet",
      VITE_SUI_GRPC_URL: "http://fullnode.example.test",
      VITE_EXECUTOR_BASE_URL: "http://127.0.0.1:3001",
    });

    expect(config).toEqual({
      mode: "configuration_error",
      network: "testnet",
      suiGrpcUrl: "https://fullnode.testnet.sui.io:443",
      executorBaseUrl: "http://127.0.0.1:3001",
    });
  });

  it("omits explorer links when no explorer origin is configured", () => {
    const config = resolveWebConfig({});
    expect(explorerObjectUrl(config, "0x1")).toBeUndefined();
    expect(explorerTransactionUrl(config, "digest")).toBeUndefined();
  });
});
