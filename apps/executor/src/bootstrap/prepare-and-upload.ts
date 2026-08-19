import type { WorkflowBlobStore } from "../contracts.js";
import type {
  WalrusReadRetryOptions,
  WalrusUploadResult,
  WorkflowBlobPublisher,
} from "../walrus/types.js";
import { readWalrusWithRetry } from "../walrus/walrus.js";
import {
  prepareEncryptedWorkflow,
  type PreparedEncryptedWorkflow,
} from "./prepare-encrypted-workflow.js";

export interface PreparedWalrusWorkflow {
  publicManifestHash: string;
  encryptedBundleHash: string;
  keyId: string;
  walrus: WalrusUploadResult;
}

export async function prepareAndUploadEncryptedWorkflow(input: {
  rootId: string;
  version: string;
  publicManifest: unknown;
  privateBundle: unknown;
  keyringPath: string;
  publisher: WorkflowBlobPublisher;
  blobStore: WorkflowBlobStore;
  retry: Pick<
    WalrusReadRetryOptions,
    "maxAttempts" | "baseDelayMs" | "maxDelayMs" | "sleep"
  >;
  randomDek?: () => Uint8Array;
  randomNonce?: () => Uint8Array;
}): Promise<PreparedWalrusWorkflow> {
  const prepared: PreparedEncryptedWorkflow = await prepareEncryptedWorkflow({
    rootId: input.rootId,
    version: input.version,
    publicManifest: input.publicManifest,
    privateBundle: input.privateBundle,
    keyringPath: input.keyringPath,
    ...(input.randomDek === undefined ? {} : { randomDek: input.randomDek }),
    ...(input.randomNonce === undefined
      ? {}
      : { randomNonce: input.randomNonce }),
  });

  const walrus = await input.publisher.put(prepared.serializedEnvelope);
  await readWalrusWithRetry({
    store: input.blobStore,
    blobId: walrus.blobId,
    expectedBytes: prepared.serializedEnvelope,
    maxAttempts: input.retry.maxAttempts,
    baseDelayMs: input.retry.baseDelayMs,
    maxDelayMs: input.retry.maxDelayMs,
    sleep: input.retry.sleep,
  });

  return {
    publicManifestHash: prepared.publicManifestHash,
    encryptedBundleHash: prepared.encryptedBundleHash,
    keyId: prepared.keyId,
    walrus,
  };
}
