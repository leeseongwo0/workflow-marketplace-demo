import { describe, expect, it } from "vitest";

import { encodeReceiptMessageBcs } from "@aiwf/shared";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";

import type { ExecutionReceiptDto } from "../src/live/executor-client";
import { verifyExecutionReceipt } from "../src/live/executor-client";

const RELEASE_ID = `0x${"b".repeat(64)}`;
const LICENSE_ID = `0x${"c".repeat(64)}`;
const RUNNER = `0x${"d".repeat(64)}`;
const OTHER_ID = `0x${"a".repeat(64)}`;
const INPUT_HASH = "11".repeat(32);
const OUTPUT_HASH = "22".repeat(32);
const NONCE_HASH = "33".repeat(32);
const EXECUTED_AT_MS = 1_723_900_000_000;
const EXECUTOR_KEYPAIR = Ed25519Keypair.fromSecretKey(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
);

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function hexBytes(value: string): Uint8Array {
  return Uint8Array.from(
    value.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

async function signedReceipt(): Promise<{
  receipt: ExecutionReceiptDto;
  bcsBytes: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
}> {
  const payload: ExecutionReceiptDto["payload"] = {
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    runner: RUNNER,
    inputHash: INPUT_HASH,
    outputHash: OUTPUT_HASH,
    executedAtMs: EXECUTED_AT_MS,
    nonceHash: NONCE_HASH,
  };
  const bcsBytes = encodeReceiptMessageBcs({
    releaseId: payload.releaseId,
    licenseId: payload.licenseId,
    runner: payload.runner,
    inputHash: hexBytes(payload.inputHash),
    outputHash: hexBytes(payload.outputHash),
    executedAtMs: BigInt(payload.executedAtMs),
    nonceHash: hexBytes(payload.nonceHash),
  });
  const signature = new Uint8Array(await EXECUTOR_KEYPAIR.sign(bcsBytes));
  const publicKey = EXECUTOR_KEYPAIR.getPublicKey().toRawBytes();
  return {
    receipt: {
      payload,
      bcsBase64: encodeBase64(bcsBytes),
      signatureBase64: encodeBase64(signature),
      executorPublicKeyBase64: encodeBase64(publicKey),
    },
    bcsBytes,
    signature,
    publicKey,
  };
}

describe("execution receipt verification", () => {
  it("accepts a receipt whose payload, BCS re-encoding, and signature all agree", async () => {
    const signed = await signedReceipt();
    const verified = await verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
    });

    expect(verified.payload).toEqual(signed.receipt.payload);
    expect(verified.bcsBytes).toEqual(signed.bcsBytes);
    expect(verified.signature).toEqual(signed.signature);
    expect(verified.executorPublicKey).toEqual(signed.publicKey);
    await expect(
      new Ed25519PublicKey(signed.publicKey).verify(signed.bcsBytes, signed.signature),
    ).resolves.toBe(true);

    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", signed.publicKey.slice().buffer),
    );
    const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
    expect(verified.executorKeyFingerprint).toBe(fingerprint);
  });

  it.each([
    ["release", { expectedReleaseId: OTHER_ID }],
    ["license", { expectedLicenseId: OTHER_ID }],
    ["runner", { expectedRunner: OTHER_ID }],
  ] as const)("rejects a receipt with the wrong expected %s identity", async (_label, override) => {
    const signed = await signedReceipt();
    await expect(verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId:
        "expectedReleaseId" in override ? override.expectedReleaseId : RELEASE_ID,
      expectedLicenseId:
        "expectedLicenseId" in override ? override.expectedLicenseId : LICENSE_ID,
      expectedRunner: "expectedRunner" in override ? override.expectedRunner : RUNNER,
    })).rejects.toThrow("identity");
  });

  it("rejects a tampered signature, BCS body, or payload", async () => {
    const signed = await signedReceipt();
    const expected = {
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
    };

    const badSignature = signed.signature.slice();
    badSignature[0] = (badSignature[0] ?? 0) ^ 1;
    await expect(verifyExecutionReceipt({
      receipt: { ...signed.receipt, signatureBase64: encodeBase64(badSignature) },
      ...expected,
    })).rejects.toThrow("signature");

    const badBcs = signed.bcsBytes.slice();
    badBcs[badBcs.length - 1] = (badBcs[badBcs.length - 1] ?? 0) ^ 1;
    await expect(verifyExecutionReceipt({
      receipt: { ...signed.receipt, bcsBase64: encodeBase64(badBcs) },
      ...expected,
    })).rejects.toThrow("BCS");

    // The payload is what the UI shows, so a payload that disagrees with the
    // signed bytes has to fail even though the signature itself is intact.
    await expect(verifyExecutionReceipt({
      receipt: {
        ...signed.receipt,
        payload: { ...signed.receipt.payload, outputHash: INPUT_HASH },
      },
      ...expected,
    })).rejects.toThrow("BCS");
  });

  it.each([
    [
      "non-canonical BCS base64",
      (receipt: ExecutionReceiptDto) => ({ ...receipt, bcsBase64: `${receipt.bcsBase64} ` }),
      "Receipt BCS has an invalid length or encoding",
    ],
    [
      "short signature base64",
      (receipt: ExecutionReceiptDto) => ({
        ...receipt,
        signatureBase64: encodeBase64(new Uint8Array(63)),
      }),
      "Receipt signature has an invalid length or encoding",
    ],
    [
      "short executor key base64",
      (receipt: ExecutionReceiptDto) => ({
        ...receipt,
        executorPublicKeyBase64: encodeBase64(new Uint8Array(31)),
      }),
      "Executor public key has an invalid length or encoding",
    ],
  ] as const)("rejects %s", async (_label, mutate, message) => {
    const signed = await signedReceipt();
    await expect(verifyExecutionReceipt({
      receipt: mutate(signed.receipt),
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
    })).rejects.toThrow(message);
  });
});
