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

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type Sleep = (delayMs: number) => Promise<void>;
