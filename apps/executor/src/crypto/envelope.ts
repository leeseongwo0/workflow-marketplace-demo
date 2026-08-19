import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  canonicalJsonBytes,
  createBundleKeyId,
  encryptedEnvelopeSchema,
  googleNewsWorkflowBundleSchema,
  type BundleAad,
  type EncryptedEnvelope,
  type GoogleNewsWorkflowBundle,
} from "@aiwf/shared";

import { ExecutorError } from "../errors.js";
import { sha256Hex } from "./hash.js";

const DEK_LENGTH = 32;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function requireLength(value: Uint8Array, length: number, label: string): void {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new ExecutorError(
      "INVALID_REQUEST",
      `${label} must contain exactly ${length} bytes`,
    );
  }
}

function encodeBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function decodeBase64(value: string): Uint8Array {
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new TypeError("Base64 value is not canonical");
  }
  return new Uint8Array(decoded);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface EncryptedBundleArtifact {
  envelope: EncryptedEnvelope;
  serializedEnvelope: Uint8Array;
  encryptedBundleHash: string;
}

export function encryptBundle(input: {
  plaintext: Uint8Array;
  dek: Uint8Array;
  aad: BundleAad;
  nonce?: Uint8Array;
}): EncryptedBundleArtifact {
  requireLength(input.dek, DEK_LENGTH, "DEK");
  const nonce = input.nonce ?? new Uint8Array(randomBytes(NONCE_LENGTH));
  requireLength(nonce, NONCE_LENGTH, "AES-GCM nonce");

  const aadBytes = canonicalJsonBytes(input.aad);
  const cipher = createCipheriv("aes-256-gcm", input.dek, nonce, {
    authTagLength: TAG_LENGTH,
  });
  cipher.setAAD(aadBytes, { plaintextLength: input.plaintext.length });
  const ciphertext = Buffer.concat([
    cipher.update(input.plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope = encryptedEnvelopeSchema.parse({
    envelopeVersion: 1,
    cipher: "AES-256-GCM",
    keyId: createBundleKeyId(input.aad),
    nonceBase64: encodeBase64(nonce),
    tagBase64: encodeBase64(tag),
    ciphertextBase64: encodeBase64(ciphertext),
    aadBase64: encodeBase64(aadBytes),
  });
  const serializedEnvelope = canonicalJsonBytes(envelope);
  return {
    envelope,
    serializedEnvelope,
    encryptedBundleHash: sha256Hex(serializedEnvelope),
  };
}

export function decryptBundle(input: {
  serializedEnvelope: Uint8Array;
  dek: Uint8Array;
  expectedAad: BundleAad;
}): Uint8Array {
  requireLength(input.dek, DEK_LENGTH, "DEK");

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      input.serializedEnvelope,
    );
    const envelope = encryptedEnvelopeSchema.parse(JSON.parse(text) as unknown);
    const canonicalEnvelope = canonicalJsonBytes(envelope);
    if (!equalBytes(canonicalEnvelope, input.serializedEnvelope)) {
      throw new TypeError("Encrypted envelope is not canonical JSON");
    }
    if (envelope.keyId !== createBundleKeyId(input.expectedAad)) {
      throw new TypeError("Encrypted envelope key ID does not match expected AAD");
    }

    const expectedAadBytes = canonicalJsonBytes(input.expectedAad);
    const storedAadBytes = decodeBase64(envelope.aadBase64);
    if (!equalBytes(storedAadBytes, expectedAadBytes)) {
      throw new TypeError("Encrypted envelope AAD does not match expected AAD");
    }

    const nonce = decodeBase64(envelope.nonceBase64);
    const tag = decodeBase64(envelope.tagBase64);
    const ciphertext = decodeBase64(envelope.ciphertextBase64);
    requireLength(nonce, NONCE_LENGTH, "AES-GCM nonce");
    requireLength(tag, TAG_LENGTH, "AES-GCM authentication tag");

    const decipher = createDecipheriv("aes-256-gcm", input.dek, nonce, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAAD(expectedAadBytes, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(tag);
    return new Uint8Array(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]),
    );
  } catch (cause) {
    throw new ExecutorError(
      "BUNDLE_DECRYPT_FAILED",
      "Encrypted workflow bundle could not be authenticated and decrypted",
      cause,
    );
  }
}

export function parseDecryptedWorkflowBundle(
  plaintext: Uint8Array,
): GoogleNewsWorkflowBundle {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    return googleNewsWorkflowBundleSchema.parse(JSON.parse(text) as unknown);
  } catch (cause) {
    throw new ExecutorError(
      "BUNDLE_SCHEMA_INVALID",
      "Decrypted workflow bundle does not match google_news_rss/v1",
      cause,
    );
  }
}
