import { randomBytes } from "node:crypto";

import {
  canonicalJsonBytes,
  createBundleAad,
  createBundleKeyId,
  googleNewsWorkflowBundleSchema,
  publicWorkflowManifestSchema,
  type EncryptedEnvelope,
} from "@aiwf/shared";

import { encryptBundle } from "../crypto/envelope.js";
import { sha256Hex } from "../crypto/hash.js";
import { storeLocalDemoDek } from "../key-provider/keyring-writer.js";

export interface PreparedEncryptedWorkflow {
  publicManifestHash: string;
  encryptedBundleHash: string;
  keyId: string;
  envelope: EncryptedEnvelope;
  serializedEnvelope: Uint8Array;
}

export async function prepareEncryptedWorkflow(input: {
  rootId: string;
  version: string;
  publicManifest: unknown;
  privateBundle: unknown;
  keyringPath: string;
  randomDek?: () => Uint8Array;
  randomNonce?: () => Uint8Array;
}): Promise<PreparedEncryptedWorkflow> {
  const publicManifest = publicWorkflowManifestSchema.parse(input.publicManifest);
  const privateBundle = googleNewsWorkflowBundleSchema.parse(input.privateBundle);
  if (publicManifest.version !== input.version) {
    throw new TypeError("Public manifest version does not match bootstrap version");
  }

  const publicManifestHash = sha256Hex(canonicalJsonBytes(publicManifest));
  const aad = createBundleAad({
    rootId: input.rootId,
    version: input.version,
    publicManifestHash,
  });
  const keyId = createBundleKeyId(aad);
  const dek = input.randomDek?.() ?? new Uint8Array(randomBytes(32));
  const nonce = input.randomNonce?.() ?? new Uint8Array(randomBytes(12));

  const encrypted = encryptBundle({
    plaintext: canonicalJsonBytes(privateBundle),
    dek,
    aad,
    nonce,
  });
  await storeLocalDemoDek({ keyringPath: input.keyringPath, keyId, dek });

  return {
    publicManifestHash,
    encryptedBundleHash: encrypted.encryptedBundleHash,
    keyId,
    envelope: encrypted.envelope,
    serializedEnvelope: encrypted.serializedEnvelope,
  };
}
