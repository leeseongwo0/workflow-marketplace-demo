import { randomBytes, randomUUID } from "node:crypto";

import {
  canonicalJsonBytes,
  createBundleAad,
  encodeReceiptMessageBcs,
} from "@aiwf/shared";
import {
  executeGoogleNewsWorkflow,
  GoogleNewsWorkflowError,
  type RssFeedLoader,
} from "@aiwf/workflow-google-news";

import type {
  Clock,
  KeyProvider,
  LicenseVerifier,
  ReceiptSigner,
  ReleaseProvider,
  WalletSignatureVerifier,
  WorkflowBlobStore,
} from "../contracts.js";
import { assertSha256, sha256Hex } from "../crypto/hash.js";
import {
  decryptBundle,
  parseDecryptedWorkflowBundle,
} from "../crypto/envelope.js";
import { ExecutorError } from "../errors.js";
import type { InMemoryChallengeStore } from "./challenge.js";

const RECEIPT_NONCE_BYTES = 32;
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

function hashHexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new ExecutorError("INTERNAL_ERROR", "Receipt hash is invalid");
  }
  return new Uint8Array(Buffer.from(value, "hex"));
}

export interface ExecutionRandomSource {
  uuid(): string;
  bytes(length: number): Uint8Array;
}

const systemRandomSource: ExecutionRandomSource = {
  uuid: randomUUID,
  bytes: (length) => new Uint8Array(randomBytes(length)),
};

export interface ExecutionResponse {
  executionId: string;
  workflow: {
    releaseId: string;
    version: string;
    workflowType: "google_news_rss/v1";
  };
  input: { query: string; inputHash: string };
  result: {
    items: Array<{
      title: string;
      source: string | null;
      publishedAt: string;
      url: string;
    }>;
    outputHash: string;
  };
  trace: Array<
    | "WALLET_SIGNATURE_VERIFIED"
    | "LICENSE_VERIFIED"
    | "WALRUS_BLOB_VERIFIED"
    | "BUNDLE_DECRYPTED_LOCAL_SERVER"
    | "RSS_FETCHED"
    | "RESULT_SIGNED"
  >;
  receipt: {
    payload: {
      releaseId: string;
      licenseId: string;
      runner: string;
      inputHash: string;
      outputHash: string;
      executedAtMs: number;
      nonceHash: string;
    };
    bcsBase64: string;
    signatureBase64: string;
    executorPublicKeyBase64: string;
  };
  security: {
    executionMode: "local_server";
    nautilus: false;
    teeAttestation: false;
    keyProvider: "local_demo";
  };
}

export class ExecutionService {
  readonly #challenges: InMemoryChallengeStore;
  readonly #walletVerifier: WalletSignatureVerifier;
  readonly #licenseVerifier: LicenseVerifier;
  readonly #releaseProvider: ReleaseProvider;
  readonly #blobStore: WorkflowBlobStore;
  readonly #keyProvider: KeyProvider;
  readonly #loadFeed: RssFeedLoader;
  readonly #clock: Clock;
  readonly #receiptSigner: ReceiptSigner;
  readonly #random: ExecutionRandomSource;

  constructor(input: {
    challenges: InMemoryChallengeStore;
    walletVerifier: WalletSignatureVerifier;
    licenseVerifier: LicenseVerifier;
    releaseProvider: ReleaseProvider;
    blobStore: WorkflowBlobStore;
    keyProvider: KeyProvider;
    loadFeed: RssFeedLoader;
    clock: Clock;
    receiptSigner: ReceiptSigner;
    random?: ExecutionRandomSource;
  }) {
    this.#challenges = input.challenges;
    this.#walletVerifier = input.walletVerifier;
    this.#licenseVerifier = input.licenseVerifier;
    this.#releaseProvider = input.releaseProvider;
    this.#blobStore = input.blobStore;
    this.#keyProvider = input.keyProvider;
    this.#loadFeed = input.loadFeed;
    this.#clock = input.clock;
    this.#receiptSigner = input.receiptSigner;
    this.#random = input.random ?? systemRandomSource;
  }

  async execute(input: {
    challengeId: string;
    walletSignature: string;
  }): Promise<ExecutionResponse> {
    const challenge = this.#challenges.load(input.challengeId);

    await this.#walletVerifier.verify({
      message: challenge.message,
      signature: input.walletSignature,
      expectedAddress: challenge.payload.runnerAddress,
    });

    // This synchronous compare-and-set happens only after signature verification.
    // A valid signature burns the challenge even if any later adapter fails.
    const consumed = this.#challenges.consumeAfterVerification(input.challengeId);
    const trace: ExecutionResponse["trace"] = ["WALLET_SIGNATURE_VERIFIED"];

    await this.#licenseVerifier.verify({
      releaseId: consumed.payload.releaseId,
      licenseId: consumed.payload.licenseId,
      runnerAddress: consumed.payload.runnerAddress,
    });
    const release = await this.#releaseProvider.getRelease(
      consumed.payload.releaseId,
    );
    if (release.releaseId !== consumed.payload.releaseId) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Release provider returned mismatched metadata",
      );
    }
    trace.push("LICENSE_VERIFIED");

    const encryptedBundle = await this.#blobStore.get(release.walrusBlobId);
    assertSha256(encryptedBundle, release.encryptedBundleHash);
    trace.push("WALRUS_BLOB_VERIFIED");

    const dek = await this.#keyProvider.getDek({
      keyId: release.keyId,
      releaseId: release.releaseId,
      licenseId: consumed.payload.licenseId,
      runnerAddress: consumed.payload.runnerAddress,
    });
    const plaintext = decryptBundle({
      serializedEnvelope: encryptedBundle,
      dek,
      expectedAad: createBundleAad({
        rootId: release.rootId,
        version: release.version,
        publicManifestHash: release.publicManifestHash,
      }),
    });
    const bundle = parseDecryptedWorkflowBundle(plaintext);
    trace.push("BUNDLE_DECRYPTED_LOCAL_SERVER");

    let output: Awaited<ReturnType<typeof executeGoogleNewsWorkflow>>;
    try {
      output = await executeGoogleNewsWorkflow({
        bundle,
        query: consumed.normalizedQuery,
        clock: this.#clock,
        loadFeed: this.#loadFeed,
      });
    } catch (cause) {
      if (cause instanceof GoogleNewsWorkflowError) {
        throw new ExecutorError(cause.code, cause.message, cause);
      }
      throw cause;
    }
    trace.push("RSS_FETCHED");

    const outputHash = sha256Hex(canonicalJsonBytes(output));
    const nonce = this.#random.bytes(RECEIPT_NONCE_BYTES);
    if (nonce.length !== RECEIPT_NONCE_BYTES) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Receipt random source returned an invalid nonce",
      );
    }
    const nonceHash = sha256Hex(nonce);
    const executedAtMs = this.#clock.now().getTime();
    if (!Number.isSafeInteger(executedAtMs) || executedAtMs < 0) {
      throw new ExecutorError("INTERNAL_ERROR", "Clock returned an invalid time");
    }

    const receiptPayload: ExecutionResponse["receipt"]["payload"] = {
      releaseId: release.releaseId,
      licenseId: consumed.payload.licenseId,
      runner: consumed.payload.runnerAddress,
      inputHash: consumed.payload.inputHash,
      outputHash,
      executedAtMs,
      nonceHash,
    };
    const bcsBytes = encodeReceiptMessageBcs({
      releaseId: receiptPayload.releaseId,
      licenseId: receiptPayload.licenseId,
      runner: receiptPayload.runner,
      inputHash: hashHexToBytes(receiptPayload.inputHash),
      outputHash: hashHexToBytes(receiptPayload.outputHash),
      executedAtMs: BigInt(executedAtMs),
      nonceHash: hashHexToBytes(receiptPayload.nonceHash),
    });
    const signature = await this.#receiptSigner.sign(bcsBytes);
    const publicKey = this.#receiptSigner.publicKey();
    if (
      signature.length !== ED25519_SIGNATURE_BYTES ||
      publicKey.length !== ED25519_PUBLIC_KEY_BYTES
    ) {
      throw new ExecutorError(
        "RECEIPT_SIGN_FAILED",
        "Executor signer returned invalid Ed25519 material",
      );
    }
    trace.push("RESULT_SIGNED");

    return {
      executionId: this.#random.uuid(),
      workflow: {
        releaseId: release.releaseId,
        version: release.version,
        workflowType: release.workflowType,
      },
      input: {
        query: consumed.normalizedQuery,
        inputHash: consumed.payload.inputHash,
      },
      result: { items: output.items, outputHash },
      trace,
      receipt: {
        payload: receiptPayload,
        bcsBase64: Buffer.from(bcsBytes).toString("base64"),
        signatureBase64: Buffer.from(signature).toString("base64"),
        executorPublicKeyBase64: Buffer.from(publicKey).toString("base64"),
      },
      security: {
        executionMode: "local_server",
        nautilus: false,
        teeAttestation: false,
        keyProvider: "local_demo",
      },
    };
  }
}
