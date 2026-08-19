import { describe, expect, it, vi } from "vitest";

import type { ExecutionResponse } from "../src/execution/execution-service.js";
import { InMemoryChallengeStore } from "../src/execution/challenge.js";
import { ExecutorError } from "../src/errors.js";
import { createExecutorApp } from "../src/api/app.js";

const CHALLENGE_ID = "55555555-5555-4555-8555-555555555555";
const CORS_ORIGIN = "http://127.0.0.1:5173";

function challengeStore(): InMemoryChallengeStore {
  return new InMemoryChallengeStore({
    clock: { now: () => new Date("2026-08-19T00:00:00.000Z") },
    random: {
      uuid: () => CHALLENGE_ID,
      bytes: (length) => new Uint8Array(length).fill(7),
    },
  });
}

const executionResponse: ExecutionResponse = {
  executionId: "66666666-6666-4666-8666-666666666666",
  workflow: {
    releaseId: `0x${"2".repeat(64)}`,
    version: "1.0.0",
    workflowType: "google_news_rss/v1",
  },
  input: { query: "Sui news", inputHash: "11".repeat(32) },
  result: { items: [], outputHash: "22".repeat(32) },
  trace: ["WALLET_SIGNATURE_VERIFIED", "RESULT_SIGNED"],
  receipt: {
    payload: {
      releaseId: `0x${"2".repeat(64)}`,
      licenseId: `0x${"3".repeat(64)}`,
      runner: `0x${"1".repeat(64)}`,
      inputHash: "11".repeat(32),
      outputHash: "22".repeat(32),
      executedAtMs: 1_776_729_600_000,
      nonceHash: "33".repeat(32),
    },
    bcsBase64: "AA==",
    signatureBase64: "AA==",
    executorPublicKeyBase64: "AA==",
  },
  security: {
    executionMode: "local_server",
    nautilus: false,
    teeAttestation: false,
    keyProvider: "local_demo",
  },
};

function createApp(execute = vi.fn(async () => executionResponse)) {
  return {
    app: createExecutorApp({
      challenges: challengeStore(),
      executionService: { execute },
      corsOrigin: CORS_ORIGIN,
    }),
    execute,
  };
}

describe("executor HTTP API", () => {
  it("returns the exact canonical personal-message bytes and preview", async () => {
    const { app } = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/execution/challenges",
      payload: {
        runnerAddress: "0x1",
        releaseId: "0x2",
        licenseId: "0x3",
        query: "  Sui   news  ",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      challengeId: string;
      personalMessage: { bytesBase64: string; preview: string };
    }>();
    expect(body.challengeId).toBe(CHALLENGE_ID);
    expect(Buffer.from(body.personalMessage.bytesBase64, "base64").toString()).toBe(
      body.personalMessage.preview,
    );
    expect(JSON.parse(body.personalMessage.preview)).toMatchObject({
      domain: "AIWF_EXECUTION_REQUEST_V1",
      challengeId: CHALLENGE_ID,
    });
  });

  it.each([
    ["extra field", JSON.stringify({ runnerAddress: "0x1", releaseId: "0x2", licenseId: "0x3", query: "Sui news", extra: true })],
    ["invalid address", JSON.stringify({ runnerAddress: "bad", releaseId: "0x2", licenseId: "0x3", query: "Sui news" })],
    ["malformed JSON", "{"],
  ])("returns a stable public error for %s", async (_label, payload) => {
    const { app } = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/execution/challenges",
      headers: { "content-type": "application/json" },
      payload,
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Request is invalid" },
    });
    expect(response.body).not.toMatch(/stack|cause/iu);
  });

  it("passes a strict execution request to the service", async () => {
    const { app, execute } = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/executions",
      payload: { challengeId: CHALLENGE_ID, walletSignature: "serialized" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(executionResponse);
    expect(execute).toHaveBeenCalledWith({
      challengeId: CHALLENGE_ID,
      walletSignature: "serialized",
    });
  });

  it("redacts typed and unexpected errors", async () => {
    const secret = "do-not-return-this";
    const typed = createApp(vi.fn(async () => {
      throw new ExecutorError("CHALLENGE_EXPIRED", secret);
    }));
    const typedResponse = await typed.app.inject({
      method: "POST",
      url: "/api/executions",
      payload: { challengeId: CHALLENGE_ID, walletSignature: "serialized" },
    });
    await typed.app.close();
    expect(typedResponse.statusCode).toBe(410);
    expect(typedResponse.json()).toEqual({
      error: { code: "CHALLENGE_EXPIRED", message: "Challenge has expired" },
    });
    expect(typedResponse.body).not.toContain(secret);

    const unexpected = createApp(vi.fn(async () => {
      throw new Error(secret);
    }));
    const unexpectedResponse = await unexpected.app.inject({
      method: "POST",
      url: "/api/executions",
      payload: { challengeId: CHALLENGE_ID, walletSignature: "serialized" },
    });
    await unexpected.app.close();
    expect(unexpectedResponse.statusCode).toBe(500);
    expect(unexpectedResponse.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal executor error" },
    });
    expect(unexpectedResponse.body).not.toContain(secret);
  });

  it("emits CORS only for the configured exact origin", async () => {
    const { app } = createApp();
    const accepted = await app.inject({
      method: "OPTIONS",
      url: "/api/executions",
      headers: {
        origin: CORS_ORIGIN,
        "access-control-request-method": "POST",
      },
    });
    const rejected = await app.inject({
      method: "OPTIONS",
      url: "/api/executions",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "POST",
      },
    });
    await app.close();

    expect(accepted.headers["access-control-allow-origin"]).toBe(CORS_ORIGIN);
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
