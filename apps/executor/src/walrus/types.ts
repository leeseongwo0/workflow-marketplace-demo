import type { FetchLike, Sleep, WorkflowBlobStore } from "../contracts.js";

export type WalrusUploadResult =
  | {
      status: "newly_created";
      blobId: string;
      blobObjectId: string;
    }
  | {
      status: "already_certified";
      blobId: string;
      txDigest: string;
    };

export interface WorkflowBlobPublisher {
  put(bytes: Uint8Array): Promise<WalrusUploadResult>;
}

export interface WalrusHttpOptions {
  baseUrl: string;
  timeoutMs: number;
  maxResponseBytes: number;
  fetch?: FetchLike;
}

export interface WalrusPublisherOptions extends WalrusHttpOptions {
  storageEpochs: number;
}

export interface WalrusReadRetryOptions {
  store: WorkflowBlobStore;
  blobId: string;
  expectedBytes: Uint8Array;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: Sleep;
}
