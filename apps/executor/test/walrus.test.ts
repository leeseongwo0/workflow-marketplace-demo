import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { ExecutorError } from "../src/errors.js";
import {
  WalrusBlobStore,
  WalrusPublisher,
  parseWalrusUploadResponse,
  readWalrusWithRetry,
} from "../src/walrus/walrus.js";

const BASE_URL = "https://walrus.example.test/endpoint";
const BLOB_ID = "blob-01ABC_xyz";
const BODY = Uint8Array.from([1, 2, 3, 4]);

type FetchCall = { input: string | URL; init?: RequestInit };

function responseWithBytes(
  bytes: Uint8Array,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, { status, headers });
}

function responseWithStream(
  chunks: readonly Uint8Array[],
  status = 200,
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(body, { status });
}

function responseWithArrayBuffer(
  bytes: Uint8Array,
  status = 200,
): Response {
  return {
    status,
    headers: new Headers(),
    body: null,
    arrayBuffer: async () =>
      bytes.slice().buffer as ArrayBuffer,
  } as unknown as Response;
}

function fakeFetch(
  response: Response | (() => Response | Promise<Response>),
): { fetch: typeof globalThis.fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const implementation = async (
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push(init === undefined ? { input } : { input, init });
    return typeof response === "function" ? response() : response;
  };
  return { fetch: implementation as typeof globalThis.fetch, calls };
}

function storeOptions(fetch: typeof globalThis.fetch, maxResponseBytes = 1_024) {
  return {
    baseUrl: BASE_URL,
    timeoutMs: 1_000,
    maxResponseBytes,
    fetch,
  };
}

function publisherOptions(fetch: typeof globalThis.fetch, storageEpochs = 53) {
  return {
    ...storeOptions(fetch),
    storageEpochs,
  };
}

describe("Walrus HTTP adapters", () => {
  it("uses an injected fetch and performs a GET at the aggregator blob URL", async () => {
    const fake = fakeFetch(responseWithBytes(BODY));
    const store = new WalrusBlobStore(storeOptions(fake.fetch));

    await expect(store.get(BLOB_ID)).resolves.toEqual(BODY);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.input).toBe(
      "https://walrus.example.test/endpoint/v1/blobs/blob-01ABC_xyz",
    );
    expect(fake.calls[0]?.init?.method).toBe("GET");
  });

  it("uses PUT and sends the exact bytes to the publisher URL", async () => {
    const fake = fakeFetch(
      new Response(
        JSON.stringify({
          newlyCreated: {
            blobObject: { id: "0xblob", blobId: BLOB_ID },
          },
        }),
        { status: 200 },
      ),
    );
    const publisher = new WalrusPublisher(publisherOptions(fake.fetch));

    await expect(publisher.put(BODY)).resolves.toEqual({
      status: "newly_created",
      blobId: BLOB_ID,
      blobObjectId: "0xblob",
    });
    expect(fake.calls[0]?.input).toBe(
      "https://walrus.example.test/endpoint/v1/blobs?epochs=53",
    );
    expect(fake.calls[0]?.init?.method).toBe("PUT");
    expect(fake.calls[0]?.init?.body).toBe(BODY);
  });

  it.each([0, 54, 1.5])("rejects an invalid storage epoch count: %s", (storageEpochs) => {
    const fake = fakeFetch(responseWithBytes(BODY));
    expect(
      () => new WalrusPublisher(publisherOptions(fake.fetch, storageEpochs)),
    ).toThrowError(expect.objectContaining({ code: "WALRUS_FETCH_FAILED" }));
    expect(fake.calls).toHaveLength(0);
  });

  it("maps non-2xx responses and never exposes the response body", async () => {
    const secret = "PRIVATE_WALRUS_RESPONSE_BODY";
    const fake = fakeFetch(
      responseWithBytes(new TextEncoder().encode(secret), 503),
    );
    const store = new WalrusBlobStore(storeOptions(fake.fetch));

    await expect(store.get(BLOB_ID)).rejects.toMatchObject({
      code: "WALRUS_FETCH_FAILED",
    });
    try {
      await store.get(BLOB_ID);
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutorError);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("maps AbortError timeout failures to WALRUS_FETCH_FAILED", async () => {
    const fake = fakeFetch(() => {
      throw new DOMException("timeout secret", "AbortError");
    });
    const store = new WalrusBlobStore(storeOptions(fake.fetch));

    await expect(store.get(BLOB_ID)).rejects.toMatchObject({
      code: "WALRUS_FETCH_FAILED",
    });
  });

  it("enforces the maximum on streamed responses", async () => {
    const fake = fakeFetch(
      responseWithStream([Uint8Array.from([1, 2]), Uint8Array.from([3, 4])]),
    );
    const store = new WalrusBlobStore(storeOptions(fake.fetch, 3));

    await expect(store.get(BLOB_ID)).rejects.toMatchObject({
      code: "WALRUS_FETCH_FAILED",
    });
  });

  it("enforces the maximum on arrayBuffer fallback responses", async () => {
    const fake = fakeFetch(responseWithArrayBuffer(BODY));
    const store = new WalrusBlobStore(storeOptions(fake.fetch, 3));

    await expect(store.get(BLOB_ID)).rejects.toMatchObject({
      code: "WALRUS_FETCH_FAILED",
    });
  });

  it("rejects unsafe blob IDs before making a request", async () => {
    const fake = fakeFetch(responseWithBytes(BODY));
    const store = new WalrusBlobStore(storeOptions(fake.fetch));

    for (const blobId of ["../secret", "blob/id", "blob id", ""]) {
      await expect(store.get(blobId)).rejects.toMatchObject({
        code: "WALRUS_FETCH_FAILED",
      });
    }
    expect(fake.calls).toHaveLength(0);
  });

  it("does not use global fetch when the adapter receives an injected fake", async () => {
    const globalFetch = vi.fn(() => {
      throw new Error("live network is forbidden");
    });
    vi.stubGlobal("fetch", globalFetch);
    try {
      const fake = fakeFetch(responseWithBytes(BODY));
      await expect(
        new WalrusBlobStore(storeOptions(fake.fetch)).get(BLOB_ID),
      ).resolves.toEqual(BODY);
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Walrus upload parsing", () => {
  it("maps both official response forms to the frozen result interface", async () => {
    const newlyCreated = JSON.parse(
      await readFile(new URL("./fixtures/walrus-newly-created.json", import.meta.url), "utf8"),
    ) as unknown;
    const alreadyCertified = JSON.parse(
      await readFile(new URL("./fixtures/walrus-already-certified.json", import.meta.url), "utf8"),
    ) as unknown;

    expect(parseWalrusUploadResponse(newlyCreated)).toEqual({
      status: "newly_created",
      blobId: BLOB_ID,
      blobObjectId: "0x7c9f5e",
    });
    expect(parseWalrusUploadResponse(alreadyCertified)).toEqual({
      status: "already_certified",
      blobId: BLOB_ID,
      txDigest: "9Zb8wQx7",
    });
  });

  it.each([
    {},
    {
      newlyCreated: { blobObject: { id: "0x1", blobId: BLOB_ID } },
      alreadyCertified: { blobId: BLOB_ID, event: { txDigest: "tx" } },
    },
    { newlyCreated: { blobObject: { id: "0x1", blobId: "../secret" } } },
  ])("rejects ambiguous or malformed upload payloads", (value) => {
    expect(() => parseWalrusUploadResponse(value)).toThrowError(
      expect.objectContaining({ code: "WALRUS_FETCH_FAILED" }),
    );
  });
});

describe("bounded Walrus read verification retries", () => {
  it("uses the exact injected exponential delay schedule and succeeds after transient failures", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const store = {
      get: async () => {
        attempts += 1;
        if (attempts < 4) {
          throw new ExecutorError("WALRUS_FETCH_FAILED", "temporary read failure");
        }
        return BODY;
      },
    };

    await expect(
      readWalrusWithRetry({
        store,
        blobId: BLOB_ID,
        expectedBytes: BODY,
        maxAttempts: 4,
        baseDelayMs: 25,
        maxDelayMs: 40,
        sleep: async (delay) => {
          delays.push(delay);
        },
      }),
    ).resolves.toEqual(BODY);
    expect(attempts).toBe(4);
    expect(delays).toEqual([25, 40, 40]);
  });

  it("bounds retries and propagates the final transient failure", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const failure = new ExecutorError("WALRUS_FETCH_FAILED", "temporary");
    const store = {
      get: async () => {
        attempts += 1;
        throw failure;
      },
    };

    await expect(
      readWalrusWithRetry({
        store,
        blobId: BLOB_ID,
        expectedBytes: BODY,
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        sleep: async (delay) => {
          delays.push(delay);
        },
      }),
    ).rejects.toBe(failure);
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it("does not retry a byte mismatch", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const store = {
      get: async () => {
        attempts += 1;
        return Uint8Array.from([9, 9, 9]);
      },
    };

    await expect(
      readWalrusWithRetry({
        store,
        blobId: BLOB_ID,
        expectedBytes: BODY,
        maxAttempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 100,
        sleep: async (delay) => {
          delays.push(delay);
        },
      }),
    ).rejects.toMatchObject({ code: "BUNDLE_HASH_MISMATCH" });
    expect(attempts).toBe(1);
    expect(delays).toEqual([]);
  });
});
