import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalJson } from "@aiwf/shared";

import { prepareAndUploadEncryptedWorkflow } from "../src/bootstrap/prepare-and-upload.js";
import { ExecutorError } from "../src/errors.js";
import { sha256Hex } from "../src/crypto/hash.js";

const ROOT_ID = `0x${"a".repeat(64)}`;
const VERSION = "1.0.0";
const BLOB_ID = "blob-bootstrap-verification";
const DEK = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const NONCE = Uint8Array.from(
  { length: 12 },
  (_value, index) => 0xf0 - index,
);
const DEK_BASE64 = Buffer.from(DEK).toString("base64");

const PUBLIC_MANIFEST = {
  schemaVersion: "public-manifest/v1",
  title: "Google News RSS Monitor",
  summary: "Searches Google News RSS for current results.",
  workflowType: "google_news_rss/v1",
  version: VERSION,
  inputSchema: {
    query: {
      type: "string",
      minLength: 2,
      maxLength: 200,
    },
  },
  outputSchema: {
    maxItems: 10,
    fields: ["title", "source", "publishedAt", "url"],
  },
} as const;

const PRIVATE_BUNDLE = {
  schemaVersion: "google_news_rss/v1",
  feedBaseUrl: "https://news.google.com/rss/search",
  locale: {
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
  },
  windowHours: 24,
  maxResults: 10,
  requestTimeoutMs: 8_000,
  dedupeStrategy: "normalized_title_and_source",
} as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function temporaryKeyringPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aiwf-bootstrap-upload-"));
  temporaryDirectories.push(directory);
  return join(directory, "local-keyring.json");
}

type Publisher = {
  put(bytes: Uint8Array): Promise<{
    status: "newly_created";
    blobId: string;
    blobObjectId: string;
  }>;
};

type BlobStore = {
  get(blobId: string): Promise<Uint8Array>;
};

function uploadInput(
  keyringPath: string,
  publisher: Publisher,
  blobStore: BlobStore,
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    sleep: (delayMs: number) => Promise<void>;
  },
) {
  return {
    rootId: ROOT_ID,
    version: VERSION,
    publicManifest: PUBLIC_MANIFEST,
    privateBundle: PRIVATE_BUNDLE,
    keyringPath,
    publisher,
    blobStore,
    retry,
    randomDek: () => DEK,
    randomNonce: () => NONCE,
  };
}

function defaultRetry(sleep: (delayMs: number) => Promise<void>) {
  return {
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 100,
    sleep,
  };
}

describe("prepareAndUploadEncryptedWorkflow", () => {
  it("uploads canonical encrypted bytes, verifies the returned Blob ID, and returns only public metadata", async () => {
    const keyringPath = await temporaryKeyringPath();
    const uploaded: Uint8Array[] = [];
    const verifiedBlobIds: string[] = [];
    const globalFetch = vi.fn(() => {
      throw new Error("live network is forbidden");
    });
    vi.stubGlobal("fetch", globalFetch);

    const publisher: Publisher = {
      put: async (bytes) => {
        uploaded.push(new Uint8Array(bytes));
        return {
          status: "newly_created",
          blobId: BLOB_ID,
          blobObjectId: "0xblob-object",
        };
      },
    };
    const blobStore: BlobStore = {
      get: async (blobId) => {
        verifiedBlobIds.push(blobId);
        const bytes = uploaded[0];
        if (bytes === undefined) throw new Error("publisher did not run");
        return new Uint8Array(bytes);
      },
    };

    const result = await prepareAndUploadEncryptedWorkflow(
      uploadInput(keyringPath, publisher, blobStore, defaultRetry(async () => undefined)),
    );

    expect(uploaded).toHaveLength(1);
    const serializedEnvelope = uploaded[0];
    if (serializedEnvelope === undefined) throw new Error("missing upload");
    const envelopeText = new TextDecoder().decode(serializedEnvelope);
    const envelope = JSON.parse(envelopeText) as Record<string, unknown>;
    expect(canonicalJson(envelope)).toBe(envelopeText);
    expect(verifiedBlobIds).toEqual([BLOB_ID]);
    expect(result.walrus).toEqual({
      status: "newly_created",
      blobId: BLOB_ID,
      blobObjectId: "0xblob-object",
    });
    expect(result.encryptedBundleHash).toBe(sha256Hex(serializedEnvelope));
    expect(result.encryptedBundleHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.publicManifestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.keys(result)).toEqual([
      "publicManifestHash",
      "encryptedBundleHash",
      "keyId",
      "walrus",
    ]);
    expect(JSON.stringify(result)).not.toContain(DEK_BASE64);
    expect(JSON.stringify(result)).not.toMatch(
      /"(?:envelope|plaintext|dek|privateKey)"/iu,
    );
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("retries transient Walrus reads with the exact injected delay schedule and finite attempts", async () => {
    const keyringPath = await temporaryKeyringPath();
    const delays: number[] = [];
    const verifiedBlobIds: string[] = [];
    let uploaded: Uint8Array | undefined;
    let readAttempts = 0;
    const publisher: Publisher = {
      put: async (bytes) => {
        uploaded = new Uint8Array(bytes);
        return {
          status: "newly_created",
          blobId: BLOB_ID,
          blobObjectId: "0xblob-object",
        };
      },
    };
    const blobStore: BlobStore = {
      get: async (blobId) => {
        verifiedBlobIds.push(blobId);
        readAttempts += 1;
        if (readAttempts < 4) {
          throw new ExecutorError("WALRUS_FETCH_FAILED", "temporary read failure");
        }
        if (uploaded === undefined) throw new Error("publisher did not run");
        return new Uint8Array(uploaded);
      },
    };

    await expect(
      prepareAndUploadEncryptedWorkflow(
        uploadInput(keyringPath, publisher, blobStore, {
          maxAttempts: 4,
          baseDelayMs: 25,
          maxDelayMs: 40,
          sleep: async (delay) => {
            delays.push(delay);
          },
        }),
      ),
    ).resolves.toMatchObject({ walrus: { blobId: BLOB_ID } });
    expect(readAttempts).toBe(4);
    expect(verifiedBlobIds).toEqual([BLOB_ID, BLOB_ID, BLOB_ID, BLOB_ID]);
    expect(delays).toEqual([25, 40, 40]);
  });

  it("fails immediately on mismatched retrieved bytes without retrying", async () => {
    const keyringPath = await temporaryKeyringPath();
    let readAttempts = 0;
    const delays: number[] = [];
    const publisher: Publisher = {
      put: async () => ({
        status: "newly_created",
        blobId: BLOB_ID,
        blobObjectId: "0xblob-object",
      }),
    };
    const blobStore: BlobStore = {
      get: async () => {
        readAttempts += 1;
        return Uint8Array.from([9, 9, 9]);
      },
    };

    await expect(
      prepareAndUploadEncryptedWorkflow(
        uploadInput(keyringPath, publisher, blobStore, {
          maxAttempts: 5,
          baseDelayMs: 10,
          maxDelayMs: 100,
          sleep: async (delay) => {
            delays.push(delay);
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "BUNDLE_HASH_MISMATCH" });
    expect(readAttempts).toBe(1);
    expect(delays).toEqual([]);
  });

  it("does not invoke the Blob store when publishing fails", async () => {
    const keyringPath = await temporaryKeyringPath();
    let blobStoreCalls = 0;
    const publisher: Publisher = {
      put: async () => {
        throw new ExecutorError("WALRUS_FETCH_FAILED", "publisher unavailable");
      },
    };
    const blobStore: BlobStore = {
      get: async () => {
        blobStoreCalls += 1;
        return Uint8Array.from([1]);
      },
    };

    await expect(
      prepareAndUploadEncryptedWorkflow(
        uploadInput(keyringPath, publisher, blobStore, defaultRetry(async () => undefined)),
      ),
    ).rejects.toMatchObject({ code: "WALRUS_FETCH_FAILED" });
    expect(blobStoreCalls).toBe(0);
  });

  it("keeps retry sleeps injected and never performs a real wait", async () => {
    const keyringPath = await temporaryKeyringPath();
    const sleep = vi.fn(async (_delay: number) => undefined);
    const publisher: Publisher = {
      put: async () => ({
        status: "newly_created",
        blobId: BLOB_ID,
        blobObjectId: "0xblob-object",
      }),
    };
    const blobStore: BlobStore = {
      get: async () => {
        throw new ExecutorError("WALRUS_FETCH_FAILED", "temporary");
      },
    };

    await expect(
      prepareAndUploadEncryptedWorkflow(
        uploadInput(keyringPath, publisher, blobStore, {
          maxAttempts: 2,
          baseDelayMs: 7,
          maxDelayMs: 7,
          sleep,
        }),
      ),
    ).rejects.toMatchObject({ code: "WALRUS_FETCH_FAILED" });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(7);
  });
});
