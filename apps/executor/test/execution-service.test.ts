import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import {
  canonicalJsonBytes,
  createBundleAad,
} from "@aiwf/shared";
import {
  GoogleNewsWorkflowError,
  type RssFeedLoader,
} from "@aiwf/workflow-google-news";

import type {
  KeyProvider,
  LicenseVerifier,
  ReceiptSigner,
  ReleaseProvider,
  WalletSignatureVerifier,
  WorkflowBlobStore,
  WorkflowReleaseMetadata,
} from "../src/contracts.js";
import { encryptBundle } from "../src/crypto/envelope.js";
import { sha256Hex } from "../src/crypto/hash.js";
import { InMemoryChallengeStore } from "../src/execution/challenge.js";
import { ExecutionService } from "../src/execution/execution-service.js";
import { ExecutorError } from "../src/errors.js";
import { Ed25519ReceiptSigner } from "../src/receipt/ed25519-receipt-signer.js";
import { HttpRssFeedLoader } from "../src/rss/http-rss-feed-loader.js";
import { SuiPersonalMessageVerifier } from "../src/wallet/sui-personal-message-verifier.js";

const FIXED_NOW_MS = Date.parse("2026-08-17T09:00:00.000Z");
const RELEASE_ID = `0x${"b".repeat(64)}`;
const LICENSE_ID = `0x${"c".repeat(64)}`;
const ROOT_ID = `0x${"a".repeat(64)}`;
const VERSION = "1.0.0";
const PUBLIC_MANIFEST_HASH = "11".repeat(32);
const WALLET_SEED = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0x10 + index,
);
const EXECUTOR_SEED = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0x40 + index,
);
const DEK = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const RECEIPT_NONCE = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0xa0 + index,
);
const CHALLENGE_NONCE = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0x60 + index,
);
const CHALLENGE_ID = "33333333-3333-4333-8333-333333333333";
const EXECUTION_ID = "44444444-4444-4444-8444-444444444444";
const BUNDLE = {
  schemaVersion: "google_news_rss/v1",
  feedBaseUrl: "https://news.google.com/rss/search",
  locale: { hl: "ko", gl: "KR", ceid: "KR:ko" },
  windowHours: 24,
  maxResults: 10,
  requestTimeoutMs: 8_000,
  dedupeStrategy: "normalized_title_and_source",
} as const;
const RSS_XML = readFileSync(
  new URL("../../../fixtures/google-news/mixed-age.xml", import.meta.url),
  "utf8",
);

const receiptBcs = bcs.struct("Phase4ReceiptMessage", {
  domain: bcs.vector(bcs.u8()),
  releaseId: bcs.Address,
  licenseId: bcs.Address,
  runner: bcs.Address,
  inputHash: bcs.vector(bcs.u8()),
  outputHash: bcs.vector(bcs.u8()),
  executedAtMs: bcs.u64(),
  nonceHash: bcs.vector(bcs.u8()),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fixedClock() {
  return { now: () => new Date(FIXED_NOW_MS) };
}

function defaultRandom() {
  return {
    uuid: () => EXECUTION_ID,
    bytes: (length: number) => {
      if (length !== RECEIPT_NONCE.length) {
        throw new Error(`unexpected random length ${length}`);
      }
      return RECEIPT_NONCE.slice();
    },
  };
}

function challengeRandom() {
  return {
    uuid: () => CHALLENGE_ID,
    bytes: (length: number) => {
      if (length !== CHALLENGE_NONCE.length) {
        throw new Error(`unexpected challenge random length ${length}`);
      }
      return CHALLENGE_NONCE.slice();
    },
  };
}

function encryptedFixture() {
  const aad = createBundleAad({
    rootId: ROOT_ID,
    version: VERSION,
    publicManifestHash: PUBLIC_MANIFEST_HASH,
  });
  return encryptBundle({
    plaintext: canonicalJsonBytes(BUNDLE),
    dek: DEK,
    aad,
    nonce: Uint8Array.from({ length: 12 }, (_value, index) => 0xd0 + index),
  });
}

type HarnessOverrides = {
  walletVerifier?: WalletSignatureVerifier;
  licenseVerifier?: LicenseVerifier;
  releaseProvider?: ReleaseProvider;
  blobStore?: WorkflowBlobStore;
  keyProvider?: KeyProvider;
  loadFeed?: RssFeedLoader;
  receiptSigner?: ReceiptSigner;
  release?: WorkflowReleaseMetadata;
};

async function makeHarness(overrides: HarnessOverrides = {}) {
  const wallet = Ed25519Keypair.fromSecretKey(WALLET_SEED);
  const clock = fixedClock();
  const challengeStore = new InMemoryChallengeStore({
    clock,
    random: challengeRandom(),
  });
  const challenge = challengeStore.issue({
    runnerAddress: wallet.toSuiAddress(),
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    query: "  Sui   blockchain  ",
  });
  const walletSignature = (await wallet.signPersonalMessage(challenge.message)).signature;
  const artifact = encryptedFixture();
  const calls = {
    license: 0,
    release: 0,
    blob: 0,
    key: 0,
    feed: 0,
    signed: 0,
    blobIds: [] as string[],
    feedUrls: [] as URL[],
  };
  const release: WorkflowReleaseMetadata = overrides.release ?? {
    releaseId: RELEASE_ID,
    rootId: ROOT_ID,
    version: VERSION,
    workflowType: "google_news_rss/v1",
    walrusBlobId: "blob-phase4-execution",
    encryptedBundleHash: artifact.encryptedBundleHash,
    publicManifestHash: PUBLIC_MANIFEST_HASH,
    keyId: artifact.envelope.keyId,
    active: true,
  };
  const defaultLicenseVerifier: LicenseVerifier = {
    verify: async () => {
      calls.license += 1;
    },
  };
  const defaultReleaseProvider: ReleaseProvider = {
    getRelease: async () => {
      calls.release += 1;
      return release;
    },
  };
  const defaultBlobStore: WorkflowBlobStore = {
    get: async (blobId) => {
      calls.blob += 1;
      calls.blobIds.push(blobId);
      return artifact.serializedEnvelope.slice();
    },
  };
  const defaultKeyProvider: KeyProvider = {
    getDek: async () => {
      calls.key += 1;
      return DEK.slice();
    },
  };
  const defaultLoadFeed: RssFeedLoader = async ({ url }) => {
    calls.feed += 1;
    calls.feedUrls.push(url);
    return RSS_XML;
  };
  const defaultSigner = new Ed25519ReceiptSigner(EXECUTOR_SEED);
  const defaultReceiptSigner: ReceiptSigner = {
    publicKey: () => defaultSigner.publicKey(),
    sign: async (message) => {
      calls.signed += 1;
      return defaultSigner.sign(message);
    },
  };
  const service = new ExecutionService({
    challenges: challengeStore,
    walletVerifier: overrides.walletVerifier ?? new SuiPersonalMessageVerifier(),
    licenseVerifier: overrides.licenseVerifier ?? defaultLicenseVerifier,
    releaseProvider: overrides.releaseProvider ?? defaultReleaseProvider,
    blobStore: overrides.blobStore ?? defaultBlobStore,
    keyProvider: overrides.keyProvider ?? defaultKeyProvider,
    loadFeed: overrides.loadFeed ?? defaultLoadFeed,
    clock,
    receiptSigner: overrides.receiptSigner ?? defaultReceiptSigner,
    random: defaultRandom(),
  });

  return {
    service,
    challengeStore,
    challenge,
    walletSignature,
    wallet,
    artifact,
    release,
    calls,
  };
}

describe("ExecutionService happy path and receipt response", () => {
  it("executes an authenticated encrypted bundle with offline RSS, hashes results, and returns a verifiable receipt", async () => {
    const globalFetch = vi.fn(() => {
      throw new Error("live fetch is forbidden in execution tests");
    });
    vi.stubGlobal("fetch", globalFetch);
    const harness = await makeHarness();

    const response = await harness.service.execute({
      challengeId: harness.challenge.payload.challengeId,
      walletSignature: harness.walletSignature,
    });

    expect(response.executionId).toBe(EXECUTION_ID);
    expect(response.workflow).toEqual({
      releaseId: RELEASE_ID,
      version: VERSION,
      workflowType: "google_news_rss/v1",
    });
    expect(response.input.query).toBe("Sui blockchain");
    expect(response.input.inputHash).toBe(
      sha256Hex(canonicalJsonBytes({ query: "Sui blockchain" })),
    );
    expect(response.result.items.length).toBeGreaterThan(0);
    expect(response.result.items[0]?.title).toBe("Exact future allowance");
    expect(response.result.outputHash).toBe(
      sha256Hex(canonicalJsonBytes({ items: response.result.items })),
    );
    expect(response.trace).toEqual([
      "WALLET_SIGNATURE_VERIFIED",
      "LICENSE_VERIFIED",
      "WALRUS_BLOB_VERIFIED",
      "BUNDLE_DECRYPTED_LOCAL_SERVER",
      "RSS_FETCHED",
      "RESULT_SIGNED",
    ]);
    expect(harness.calls.feedUrls[0]?.searchParams.get("q")).toBe(
      "Sui blockchain when:1d",
    );
    expect(harness.calls.blobIds).toEqual(["blob-phase4-execution"]);
    expect(harness.calls.key).toBe(1);
    expect(harness.calls.signed).toBe(1);
    expect(response.security).toEqual({
      executionMode: "local_server",
      nautilus: false,
      teeAttestation: false,
      keyProvider: "local_demo",
    });

    const bcsBytes = new Uint8Array(Buffer.from(response.receipt.bcsBase64, "base64"));
    const decoded = receiptBcs.parse(bcsBytes);
    expect(new Uint8Array(decoded.domain)).toEqual(
      new TextEncoder().encode("AIWF_RECEIPT_V1"),
    );
    expect(decoded.releaseId).toBe(RELEASE_ID);
    expect(decoded.licenseId).toBe(LICENSE_ID);
    expect(decoded.runner).toBe(harness.wallet.toSuiAddress());
    expect(Buffer.from(decoded.inputHash).toString("hex")).toBe(
      response.receipt.payload.inputHash,
    );
    expect(Buffer.from(decoded.outputHash).toString("hex")).toBe(
      response.receipt.payload.outputHash,
    );
    expect(decoded.executedAtMs).toBe(String(FIXED_NOW_MS));
    expect(Buffer.from(decoded.nonceHash).toString("hex")).toBe(
      response.receipt.payload.nonceHash,
    );

    const publicKey = new Ed25519PublicKey(
      new Uint8Array(Buffer.from(response.receipt.executorPublicKeyBase64, "base64")),
    );
    await expect(
      publicKey.verify(
        bcsBytes,
        new Uint8Array(Buffer.from(response.receipt.signatureBase64, "base64")),
      ),
    ).resolves.toBe(true);

    const responseText = JSON.stringify(response);
    expect(responseText).not.toContain(Buffer.from(DEK).toString("base64"));
    expect(responseText).not.toContain("feedBaseUrl");
    expect(responseText).not.toContain("AES-256-GCM");
    expect(globalFetch).not.toHaveBeenCalled();
  });
});

describe("ExecutionService challenge sequencing and failures", () => {
  it("leaves the challenge usable when wallet signature verification fails", async () => {
    const walletVerifier: WalletSignatureVerifier = {
      verify: async () => {
        throw new ExecutorError("INVALID_WALLET_SIGNATURE", "invalid wallet signature");
      },
    };
    const harness = await makeHarness({ walletVerifier });

    await expect(
      harness.service.execute({
        challengeId: harness.challenge.payload.challengeId,
        walletSignature: "invalid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_SIGNATURE" });
    expect(harness.challengeStore.load(harness.challenge.payload.challengeId).payload.challengeId).toBe(
      harness.challenge.payload.challengeId,
    );
  });

  it("burns a validly signed challenge when an unlicensed execution is denied", async () => {
    const licenseVerifier: LicenseVerifier = {
      verify: async () => {
        throw new ExecutorError("LICENSE_NOT_FOUND", "license not found");
      },
    };
    const harness = await makeHarness({ licenseVerifier });

    await expect(
      harness.service.execute({
        challengeId: harness.challenge.payload.challengeId,
        walletSignature: harness.walletSignature,
      }),
    ).rejects.toMatchObject({ code: "LICENSE_NOT_FOUND" });
    expect(() => harness.challengeStore.load(harness.challenge.payload.challengeId)).toThrowError(
      expect.objectContaining({ code: "CHALLENGE_ALREADY_USED" }),
    );
    expect(harness.calls.release).toBe(0);
    expect(harness.calls.blob).toBe(0);
  });

  it("burns the challenge on a downstream bundle-hash failure before key retrieval or RSS", async () => {
    const harness = await makeHarness({
      release: {
        ...makeReleaseForHashMismatch(),
      },
    });

    await expect(
      harness.service.execute({
        challengeId: harness.challenge.payload.challengeId,
        walletSignature: harness.walletSignature,
      }),
    ).rejects.toMatchObject({ code: "BUNDLE_HASH_MISMATCH" });
    expect(harness.calls.blob).toBe(1);
    expect(harness.calls.key).toBe(0);
    expect(harness.calls.feed).toBe(0);
    expect(() => harness.challengeStore.load(harness.challenge.payload.challengeId)).toThrowError(
      expect.objectContaining({ code: "CHALLENGE_ALREADY_USED" }),
    );
  });

  it("burns the challenge for RSS/downstream failures after license verification", async () => {
    const loadFeed: RssFeedLoader = async () => {
      throw new GoogleNewsWorkflowError("RSS_TIMEOUT", "offline timeout fixture");
    };
    const harness = await makeHarness({ loadFeed });

    await expect(
      harness.service.execute({
        challengeId: harness.challenge.payload.challengeId,
        walletSignature: harness.walletSignature,
      }),
    ).rejects.toMatchObject({ code: "RSS_TIMEOUT" });
    expect(harness.calls.license).toBe(1);
    expect(() => harness.challengeStore.load(harness.challenge.payload.challengeId)).toThrowError(
      expect.objectContaining({ code: "CHALLENGE_ALREADY_USED" }),
    );
  });

  it("preserves RSS_TIMEOUT through the real HTTP loader composition", async () => {
    vi.useFakeTimers();
    const loader = new HttpRssFeedLoader({
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    const harness = await makeHarness({ loadFeed: loader.load.bind(loader) });
    const pending = harness.service.execute({
      challengeId: harness.challenge.payload.challengeId,
      walletSignature: harness.walletSignature,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "RSS_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(BUNDLE.requestTimeoutMs);
    await rejection;
  });

  it.each([
    ["invalid UTF-8", new Response(Uint8Array.from([0xff])), "RSS_PARSE_ERROR"],
    ["non-2xx response", new Response("unavailable", { status: 503 }), "RSS_UPSTREAM_ERROR"],
  ])("preserves %s through the real HTTP loader composition", async (_label, response, code) => {
    const loader = new HttpRssFeedLoader({ fetch: async () => response });
    const harness = await makeHarness({ loadFeed: loader.load.bind(loader) });

    await expect(
      harness.service.execute({
        challengeId: harness.challenge.payload.challengeId,
        walletSignature: harness.walletSignature,
      }),
    ).rejects.toMatchObject({ code });
  });

  it("allows only one of two concurrent valid executions past challenge consumption", async () => {
    const harness = await makeHarness();
    const requests = {
      challengeId: harness.challenge.payload.challengeId,
      walletSignature: harness.walletSignature,
    };
    const results = await Promise.allSettled([
      harness.service.execute(requests),
      harness.service.execute(requests),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : undefined).toMatchObject({
      code: "CHALLENGE_ALREADY_USED",
    });
  });
});

function makeReleaseForHashMismatch(): WorkflowReleaseMetadata {
  return {
    releaseId: RELEASE_ID,
    rootId: ROOT_ID,
    version: VERSION,
    workflowType: "google_news_rss/v1",
    walrusBlobId: "blob-phase4-execution",
    encryptedBundleHash: "ff".repeat(32),
    publicManifestHash: PUBLIC_MANIFEST_HASH,
    keyId: "root:phase4:release:1.0.0",
    active: true,
  };
}
