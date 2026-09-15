export interface WorkflowBlobStore {
  get(blobId: string): Promise<Uint8Array>;
}

export interface KeyProvider {
  getDek(input: {
    keyId: string;
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
    /**
     * Opaque per-request auth handle only Seal-backed providers understand
     * (a completed @mysten/seal SessionKey signed by runnerAddress).
     * LocalDemoKeyProvider ignores this.
     */
    sealSession?: unknown;
    /**
     * The buyer-created `ExecutionRequest` object ID that seal_approve now
     * checks instead of a LicensePass reference directly (see
     * SealApprovalTransactionBuilder). LocalDemoKeyProvider ignores this.
     */
    requestId?: string | undefined;
  }): Promise<Uint8Array>;
}

export interface Clock {
  now(): Date;
}

export interface LicenseVerifier {
  verify(input: {
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<void>;
}

export interface WorkflowReleaseMetadata {
  releaseId: string;
  rootId: string;
  parentReleaseId: string | null;
  version: string;
  blobId: string;
  priceLicense: bigint;
  priceFork: bigint;
  royaltyBps: bigint;
  isListed: boolean;
  createdAt: bigint;
  /**
   * Optional until the Move release object commits these values. Execution
   * must fail closed when they are absent; they must never be synthesized
   * from untrusted bundle contents.
   */
  executionBindings?: {
    workflowType: "google_news_rss/v1";
    encryptedBundleHash: string;
    publicManifestHash: string;
    keyId: string;
  };
}

export interface ReleaseProvider {
  getRelease(releaseId: string): Promise<WorkflowReleaseMetadata>;
}

export interface WalletSignatureVerifier {
  verify(input: {
    message: Uint8Array;
    signature: string;
    expectedAddress: string;
  }): Promise<void>;
}

export interface ReceiptSigner {
  publicKey(): Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type Sleep = (delayMs: number) => Promise<void>;
