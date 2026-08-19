export interface WorkflowBlobStore {
  get(blobId: string): Promise<Uint8Array>;
}

export interface KeyProvider {
  getDek(input: {
    keyId: string;
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
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
  version: string;
  workflowType: "google_news_rss/v1";
  walrusBlobId: string;
  encryptedBundleHash: string;
  publicManifestHash: string;
  keyId: string;
  active: true;
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
