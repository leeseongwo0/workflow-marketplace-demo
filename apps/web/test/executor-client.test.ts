import { describe, expect, it, vi } from "vitest";

import { canonicalJsonBytes } from "@aiwf/shared";

import {
  ExecutorApiError,
  ExecutorClient,
  verifyExecutionContent,
} from "../src/live/executor-client";
import type { ExecutionResponse } from "../src/live/executor-client";
import { normalizeQuery } from "@aiwf/workflow-google-news";

const BASE_URL = "http://127.0.0.1:3001";
const CHALLENGE_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
const RELEASE_ID = `0x${"0".repeat(63)}2`;
const LICENSE_ID = `0x${"0".repeat(63)}3`;
const RUNNER = `0x${"0".repeat(63)}1`;
const OTHER_CHALLENGE_ID = "33333333-3333-4333-8333-333333333333";
const CHALLENGE_NOW_MS = Date.parse("2026-08-19T00:00:00.000Z");
const REQUEST_QUERY = "  Sui   blockchain  ";
const NORMALIZED_QUERY = normalizeQuery(REQUEST_QUERY);

const CHALLENGE_REQUEST = {
  runnerAddress: "0x1",
  releaseId: "0x2",
  licenseId: "0x3",
  query: REQUEST_QUERY,
};

type ChallengeFixtureOptions = {
  payload?: Partial<{
    domain: string;
    challengeId: string;
    runnerAddress: string;
    releaseId: string;
    licenseId: string;
    inputHash: string;
    issuedAtMs: number;
    expiresAtMs: number;
    nonce: string;
  }>;
  responseChallengeId?: string;
  messageBytes?: Uint8Array;
};

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function canonicalHash(value: unknown): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", canonicalJsonBytes(value).slice().buffer),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function validChallengeResponse(input: ChallengeFixtureOptions = {}) {
  const payload = {
    domain: "AIWF_EXECUTION_REQUEST_V1",
    challengeId: CHALLENGE_ID,
    runnerAddress: RUNNER,
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    inputHash: await canonicalHash({ query: NORMALIZED_QUERY }),
    issuedAtMs: CHALLENGE_NOW_MS - 1_000,
    expiresAtMs: CHALLENGE_NOW_MS + 299_000,
    nonce: encodeBase64(Uint8Array.from({ length: 32 }, (_, index) => index + 1)),
    ...input.payload,
  };
  const message =
    input.messageBytes ?? canonicalJsonBytes(payload);
  return {
    challengeId: input.responseChallengeId ?? payload.challengeId,
    expiresAtMs: payload.expiresAtMs,
    personalMessage: {
      bytesBase64: encodeBase64(message),
      preview: new TextDecoder().decode(message),
    },
  };
}

async function expectInvalidChallenge(
  response: Awaited<ReturnType<typeof validChallengeResponse>>,
  message: string,
): Promise<void> {
  const fetch = vi.fn(async () => jsonResponse(response));
  const client = new ExecutorClient({
    baseUrl: BASE_URL,
    fetch,
    now: () => CHALLENGE_NOW_MS,
  });

  await expect(client.createChallenge(CHALLENGE_REQUEST)).rejects.toSatisfy(
    (error: unknown) => {
      expectApiError(error, "INVALID_RESPONSE", message);
      return true;
    },
  );
  expect(fetch).toHaveBeenCalledTimes(1);
}

async function validExecutionContentResponse() {
  const response = validExecutionResponse();
  const inputHash = await canonicalHash({ query: NORMALIZED_QUERY });
  const outputHash = await canonicalHash({ items: response.result.items });
  response.input.query = NORMALIZED_QUERY;
  response.input.inputHash = inputHash;
  response.result.outputHash = outputHash;
  response.receipt.payload.inputHash = inputHash;
  response.receipt.payload.outputHash = outputHash;
  return response;
}

function validExecutionResponse(): ExecutionResponse {
  return {
    executionId: EXECUTION_ID,
    workflow: {
      releaseId: RELEASE_ID,
      version: "1.2.3",
      workflowType: "google_news_rss/v1" as const,
    },
    input: {
      query: "Sui blockchain",
      inputHash: "1".repeat(64),
    },
    result: {
      items: [
        {
          title: "Sui ships an update",
          source: "Example News",
          publishedAt: "2026-08-19T00:00:00.000Z",
          url: "https://news.example.test/sui",
        },
      ],
      outputHash: "2".repeat(64),
    },
    trace: [
      "WALLET_SIGNATURE_VERIFIED",
      "LICENSE_VERIFIED",
      "WALRUS_BLOB_VERIFIED",
      "BUNDLE_DECRYPTED_LOCAL_SERVER",
      "RSS_FETCHED",
      "RESULT_SIGNED",
    ],
    receipt: {
      payload: {
        releaseId: RELEASE_ID,
        licenseId: LICENSE_ID,
        runner: RUNNER,
        inputHash: "1".repeat(64),
        outputHash: "2".repeat(64),
        executedAtMs: 1_800_000_000_000,
        nonceHash: "3".repeat(64),
      },
      bcsBase64: encodeBase64(new Uint8Array([1, 2, 3])),
      signatureBase64: encodeBase64(new Uint8Array([4, 5, 6])),
      executorPublicKeyBase64: encodeBase64(new Uint8Array([7, 8, 9])),
    },
    security: {
      executionMode: "local_server" as const,
      nautilus: false as const,
      teeAttestation: false as const,
      keyProvider: "local_demo" as const,
    },
  };
}

function expectApiError(error: unknown, code: string, message: string): void {
  expect(error).toBeInstanceOf(ExecutorApiError);
  expect(error).toMatchObject({ code, message });
}

describe("ExecutorClient", () => {
  it("rejects a non-loopback executor base URL before making a request", async () => {
    const fetch = vi.fn(async () => jsonResponse({}));
    const client = new ExecutorClient({
      baseUrl: "https://executor.example.test",
      fetch,
    });

    await expect(client.createChallenge({
      runnerAddress: "0x1",
      releaseId: "0x2",
      licenseId: "0x3",
      query: "Sui blockchain",
    })).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "INVALID_CONFIG", "Executor URL must be local");
      return true;
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts a valid challenge and preserves the exact server preview bytes without using global fetch", async () => {
    const globalFetch = vi.fn(() => {
      throw new Error("global network is forbidden in this test");
    });
    vi.stubGlobal("fetch", globalFetch);
    const response = await validChallengeResponse();
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${BASE_URL}/api/execution/challenges`);
      expect(init?.method).toBe("POST");
      return jsonResponse(response);
    });
    const client = new ExecutorClient({
      baseUrl: BASE_URL,
      fetch,
      now: () => CHALLENGE_NOW_MS,
    });

    try {
      const result = await client.createChallenge(CHALLENGE_REQUEST);

      expect(result).toEqual(response);
      const decoded = Uint8Array.from(
        atob(result.personalMessage.bytesBase64),
        (character) => character.charCodeAt(0),
      );
      expect(new TextDecoder().decode(decoded)).toBe(
        result.personalMessage.preview,
      );
      const decodedPayload = JSON.parse(result.personalMessage.preview) as {
        domain: string;
        challengeId: string;
        runnerAddress: string;
        releaseId: string;
        licenseId: string;
        inputHash: string;
        issuedAtMs: number;
        expiresAtMs: number;
        nonce: string;
      };
      expect(decodedPayload).toMatchObject({
        domain: "AIWF_EXECUTION_REQUEST_V1",
        challengeId: CHALLENGE_ID,
        runnerAddress: RUNNER,
        releaseId: RELEASE_ID,
        licenseId: LICENSE_ID,
        inputHash: await canonicalHash({ query: NORMALIZED_QUERY }),
        issuedAtMs: CHALLENGE_NOW_MS - 1_000,
        expiresAtMs: CHALLENGE_NOW_MS + 299_000,
      });
      expect(new TextDecoder().decode(canonicalJsonBytes(decodedPayload))).toBe(
        result.personalMessage.preview,
      );
      expect(Uint8Array.from(atob(decodedPayload.nonce), (character) => character.charCodeAt(0))).toHaveLength(32);
      expect(decodedPayload.expiresAtMs - decodedPayload.issuedAtMs).toBeLessThanOrEqual(5 * 60 * 1000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a challenge whose preview does not match its canonical bytes", async () => {
    const response = await validChallengeResponse();
    response.personalMessage.preview = "tampered preview";
    const fetch = vi.fn(async () => jsonResponse(response));
    const client = new ExecutorClient({
      baseUrl: BASE_URL,
      fetch,
      now: () => CHALLENGE_NOW_MS,
    });

    await expect(client.createChallenge(CHALLENGE_REQUEST)).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "INVALID_RESPONSE", "Challenge preview does not match bytes");
      return true;
    });
  });

  it("rejects noncanonical challenge bytes before a wallet can sign them", async () => {
    const response = await validChallengeResponse();
    const canonicalBytes = Uint8Array.from(
      atob(response.personalMessage.bytesBase64),
      (character) => character.charCodeAt(0),
    );
    const noncanonicalBytes = new TextEncoder().encode(
      ` ${new TextDecoder().decode(canonicalBytes)}`,
    );
    await expectInvalidChallenge(
      {
        ...response,
        personalMessage: {
          ...response.personalMessage,
          bytesBase64: encodeBase64(noncanonicalBytes),
          preview: new TextDecoder().decode(noncanonicalBytes),
        },
      },
      "Challenge message is not canonical JSON",
    );
  });

  it.each([
    ["wrong domain", { payload: { domain: "WRONG_DOMAIN" } }, "Challenge payload is invalid"],
    ["wrong challenge ID", { responseChallengeId: OTHER_CHALLENGE_ID }, "Challenge payload does not match the request"],
    ["wrong runner", { payload: { runnerAddress: `0x${"4".repeat(64)}` } }, "Challenge payload does not match the request"],
    ["wrong release", { payload: { releaseId: `0x${"5".repeat(64)}` } }, "Challenge payload does not match the request"],
    ["wrong license", { payload: { licenseId: `0x${"6".repeat(64)}` } }, "Challenge payload does not match the request"],
    ["wrong input hash", { payload: { inputHash: "0".repeat(64) } }, "Challenge payload does not match the request"],
    ["expired at the injected clock", { payload: { expiresAtMs: CHALLENGE_NOW_MS } }, "Challenge payload does not match the request"],
    ["short nonce", { payload: { nonce: encodeBase64(new Uint8Array(31).fill(0x44)) } }, "Challenge payload does not match the request"],
  ] as const)("rejects %s challenge payloads before signing", async (_label, options, message) => {
    await expectInvalidChallenge(await validChallengeResponse(options), message);
  });

  it("accepts a strict execution response and returns it unchanged", async () => {
    const response = validExecutionResponse();
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${BASE_URL}/api/executions`);
      expect(init?.method).toBe("POST");
      return jsonResponse(response);
    });
    const client = new ExecutorClient({ baseUrl: BASE_URL, fetch });
    const request = {
      challengeId: CHALLENGE_ID,
      walletSignature: "sui-signature",
    };

    await expect(client.execute(request)).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts normalized submitted query and canonical hashes of displayed items", async () => {
    const response = await validExecutionContentResponse();
    await expect(verifyExecutionContent({
      response,
      submittedQuery: REQUEST_QUERY,
    })).resolves.toBeUndefined();
  });

  it("rejects tampered displayed query, items, and copied hashes", async () => {
    const response = await validExecutionContentResponse();
    const firstItem = response.result.items[0];
    if (firstItem === undefined) throw new Error("missing deterministic item");
    const tamperedResponses = [
      {
        ...response,
        input: { ...response.input, query: "A different query" },
      },
      {
        ...response,
        result: {
          ...response.result,
          items: [{ ...firstItem, title: "Tampered displayed title" }],
        },
      },
      {
        ...response,
        input: { ...response.input, inputHash: response.result.outputHash },
      },
      {
        ...response,
        receipt: {
          ...response.receipt,
          payload: {
            ...response.receipt.payload,
            outputHash: response.receipt.payload.inputHash,
          },
        },
      },
    ];

    for (const tampered of tamperedResponses) {
      await expect(verifyExecutionContent({
        response: tampered,
        submittedQuery: REQUEST_QUERY,
      })).rejects.toSatisfy((error: unknown) => {
        expectApiError(
          error,
          "INVALID_RESPONSE",
          "Execution content does not match the signed receipt",
        );
        return true;
      });
    }
  });

  it("rejects execution responses with unknown fields", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ ...validExecutionResponse(), unexpected: true }),
    );
    const client = new ExecutorClient({ baseUrl: BASE_URL, fetch });

    await expect(client.execute({
      challengeId: CHALLENGE_ID,
      walletSignature: "sui-signature",
    })).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "INVALID_RESPONSE", "Execution response is invalid");
      return true;
    });
  });

  it("surfaces a stable typed server error without replacing its public code or message", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        { error: { code: "LICENSE_NOT_FOUND", message: "License could not be verified" } },
        403,
      ),
    );
    const client = new ExecutorClient({ baseUrl: BASE_URL, fetch });

    await expect(client.execute({
      challengeId: CHALLENGE_ID,
      walletSignature: "sui-signature",
    })).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "LICENSE_NOT_FOUND", "License could not be verified");
      return true;
    });
  });

  it("rejects malformed and oversized response bodies before exposing them", async () => {
    const malformedFetch = vi.fn(async () => new Response("not-json", { status: 200 }));
    const malformedClient = new ExecutorClient({
      baseUrl: BASE_URL,
      fetch: malformedFetch,
    });
    await expect(malformedClient.execute({
      challengeId: CHALLENGE_ID,
      walletSignature: "sui-signature",
    })).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "INVALID_RESPONSE", "Executor returned invalid JSON");
      return true;
    });

    const oversizedFetch = vi.fn(async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(2 * 1024 * 1024 + 1) },
      }),
    );
    const oversizedClient = new ExecutorClient({
      baseUrl: BASE_URL,
      fetch: oversizedFetch,
    });
    await expect(oversizedClient.execute({
      challengeId: CHALLENGE_ID,
      walletSignature: "sui-signature",
    })).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "INVALID_RESPONSE", "Executor response is too large");
      return true;
    });
  });

  it("rejects a streamed response over 2 MiB even without a content-length header", async () => {
    const fetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    const client = new ExecutorClient({ baseUrl: BASE_URL, fetch });

    await expect(client.execute({
      challengeId: CHALLENGE_ID,
      walletSignature: "sui-signature",
    })).rejects.toSatisfy((error: unknown) => {
      expectApiError(error, "INVALID_RESPONSE", "Executor response is too large");
      return true;
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps an aborted request to EXECUTOR_TIMEOUT using fake time only", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_input: string | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("request aborted", "AbortError")),
          { once: true },
        );
      }),
    );
    const client = new ExecutorClient({ baseUrl: BASE_URL, fetch });

    try {
      const pending = client.createChallenge({
        runnerAddress: "0x1",
        releaseId: "0x2",
        licenseId: "0x3",
        query: "Sui blockchain",
      });
      const result = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(15_000);
      expectApiError(
        await result,
        "EXECUTOR_TIMEOUT",
        "Executor request timed out",
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
