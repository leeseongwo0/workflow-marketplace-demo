import { describe, expect, it } from "vitest";

import {
  canonicalJsonBytes,
  createBundleAad,
  type BundleAad,
} from "@aiwf/shared";

import {
  decryptBundle,
  encryptBundle,
  parseDecryptedWorkflowBundle,
} from "../src/crypto/envelope.js";
import { ExecutorError } from "../src/errors.js";

const AAD = createBundleAad({
  rootId: `0x${"1".repeat(64)}`,
  version: "1.0.0",
  publicManifestHash: "2".repeat(64),
});
const DEK = Uint8Array.from({ length: 32 }, (_value, index) => index);
const NONCE = Uint8Array.from({ length: 12 }, (_value, index) => 0xa0 + index);
const BUNDLE = {
  schemaVersion: "google_news_rss/v1",
  feedBaseUrl: "https://news.google.com/rss/search",
  locale: { hl: "ko", gl: "KR", ceid: "KR:ko" },
  windowHours: 24,
  maxResults: 10,
  requestTimeoutMs: 8_000,
  dedupeStrategy: "normalized_title_and_source",
} as const;

function envelopeObject(serializedEnvelope: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(serializedEnvelope)) as Record<
    string,
    unknown
  >;
}

function serializeEnvelope(envelope: Record<string, unknown>): Uint8Array {
  return canonicalJsonBytes(envelope);
}

function withBase64ByteChanged(
  serializedEnvelope: Uint8Array,
  field: "nonceBase64" | "tagBase64" | "ciphertextBase64",
): Uint8Array {
  const envelope = envelopeObject(serializedEnvelope);
  const encoded = envelope[field];
  if (typeof encoded !== "string") throw new Error(`Missing ${field}`);
  const value = Buffer.from(encoded, "base64");
  const first = value[0];
  if (first === undefined) throw new Error(`Empty ${field}`);
  value[0] = first ^ 0x01;
  envelope[field] = value.toString("base64");
  return serializeEnvelope(envelope);
}

function expectDecryptFailure(serializedEnvelope: Uint8Array, expectedAad = AAD): void {
  let caught: unknown;
  try {
    decryptBundle({ serializedEnvelope, dek: DEK, expectedAad });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(ExecutorError);
  expect(caught).toMatchObject({ code: "BUNDLE_DECRYPT_FAILED" });
}

function artifactFor(plaintext = canonicalJsonBytes(BUNDLE), aad: BundleAad = AAD) {
  return encryptBundle({ plaintext, dek: DEK, aad, nonce: NONCE });
}

describe("AES-256-GCM encrypted workflow envelopes", () => {
  it("round-trips with a deterministic nonce and reproduces the encrypted hash", () => {
    const first = artifactFor();
    const second = artifactFor();

    expect(first.serializedEnvelope).toEqual(second.serializedEnvelope);
    expect(first.encryptedBundleHash).toBe(second.encryptedBundleHash);
    expect(
      decryptBundle({
        serializedEnvelope: first.serializedEnvelope,
        dek: DEK,
        expectedAad: AAD,
      }),
    ).toEqual(canonicalJsonBytes(BUNDLE));
  });

  it("rejects a wrong DEK as an authenticated-decryption failure", () => {
    const artifact = artifactFor();
    expect(() =>
      decryptBundle({
        serializedEnvelope: artifact.serializedEnvelope,
        dek: Uint8Array.from({ length: 32 }, () => 0xff),
        expectedAad: AAD,
      }),
    ).toThrowError(expect.objectContaining({ code: "BUNDLE_DECRYPT_FAILED" }));
  });

  it.each(["ciphertext", "tag", "nonce"] as const)(
    "rejects tampered %s",
    (field) => {
      const artifact = artifactFor();
      expectDecryptFailure(
        withBase64ByteChanged(
          artifact.serializedEnvelope,
          `${field}Base64` as "nonceBase64" | "tagBase64" | "ciphertextBase64",
        ),
      );
    },
  );

  it("rejects tampered stored AAD", () => {
    const artifact = artifactFor();
    const envelope = envelopeObject(artifact.serializedEnvelope);
  envelope["aadBase64"] = Buffer.from(
      canonicalJsonBytes({ ...AAD, version: "9.9.9" }),
    ).toString("base64");

    expectDecryptFailure(serializeEnvelope(envelope));
  });

  it("rejects independently supplied expected AAD that differs from the envelope", () => {
    const artifact = artifactFor();
    const differentAad = createBundleAad({
      rootId: AAD.rootId,
      version: AAD.version,
      publicManifestHash: "3".repeat(64),
    });

    expectDecryptFailure(artifact.serializedEnvelope, differentAad);
  });

  it("rejects malformed DEKs and nonces at the encryption boundary", () => {
    expect(() =>
      encryptBundle({
        plaintext: canonicalJsonBytes(BUNDLE),
        dek: new Uint8Array(31),
        aad: AAD,
        nonce: NONCE,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() =>
      encryptBundle({
        plaintext: canonicalJsonBytes(BUNDLE),
        dek: DEK,
        aad: AAD,
        nonce: new Uint8Array(11),
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });

  it("rejects malformed DEKs and nonce lengths at the decryption boundary", () => {
    const artifact = artifactFor();
    expect(() =>
      decryptBundle({
        serializedEnvelope: artifact.serializedEnvelope,
        dek: new Uint8Array(31),
        expectedAad: AAD,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));

    const malformedNonce = envelopeObject(artifact.serializedEnvelope);
    malformedNonce["nonceBase64"] = Buffer.from(new Uint8Array(11)).toString(
      "base64",
    );
    expectDecryptFailure(serializeEnvelope(malformedNonce));
  });

  it("rejects a noncanonical serialized envelope", () => {
    const artifact = artifactFor();
    const parsed = envelopeObject(artifact.serializedEnvelope);
    const reordered = JSON.stringify({
      aadBase64: parsed["aadBase64"],
      ciphertextBase64: parsed["ciphertextBase64"],
      tagBase64: parsed["tagBase64"],
      nonceBase64: parsed["nonceBase64"],
      keyId: parsed["keyId"],
      cipher: parsed["cipher"],
      envelopeVersion: parsed["envelopeVersion"],
    });

    expectDecryptFailure(new TextEncoder().encode(reordered));
  });

  it("maps strict decrypted-bundle unknown keys to BUNDLE_SCHEMA_INVALID", () => {
    const plaintext = canonicalJsonBytes({ ...BUNDLE, unexpected: true });
    let caught: unknown;
    try {
      parseDecryptedWorkflowBundle(plaintext);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "BUNDLE_SCHEMA_INVALID",
      message: expect.not.stringContaining("unexpected"),
    });
  });
});
