import { describe, expect, it } from "vitest";

import { encodeReceiptMessageBcs } from "@aiwf/shared";
import { bcs } from "@mysten/sui/bcs";
import {
  Ed25519Keypair,
  Ed25519PublicKey,
} from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import type { ExecutionReceiptDto } from "../src/live/executor-client";
import {
  buildPurchaseLicenseTransaction,
  buildRecordReceiptTransaction,
  verifyExecutionReceipt,
} from "../src/live/transactions";

const PACKAGE_ID = `0x${"9".repeat(64)}`;
const MARKETPLACE_ID = `0x${"a".repeat(64)}`;
const RELEASE_ID = `0x${"b".repeat(64)}`;
const LICENSE_ID = `0x${"c".repeat(64)}`;
const RUNNER = `0x${"d".repeat(64)}`;
const INPUT_HASH = "11".repeat(32);
const OUTPUT_HASH = "22".repeat(32);
const NONCE_HASH = "33".repeat(32);
const EXECUTED_AT_MS = 1_723_900_000_000;
const PRICE_MIST = 0x0102030405060708n;
const EXECUTOR_KEYPAIR = Ed25519Keypair.fromSecretKey(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
);

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function addressBytes(address: string): Uint8Array {
  const hex = address.slice(2).padStart(64, "0");
  return Uint8Array.from(hex.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function receiptPayload(): ExecutionReceiptDto["payload"] {
  return {
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    runner: RUNNER,
    inputHash: INPUT_HASH,
    outputHash: OUTPUT_HASH,
    executedAtMs: EXECUTED_AT_MS,
    nonceHash: NONCE_HASH,
  };
}

async function signedReceipt(): Promise<{
  receipt: ExecutionReceiptDto;
  bcsBytes: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
}> {
  const payload = receiptPayload();
  const bcsBytes = encodeReceiptMessageBcs({
    releaseId: payload.releaseId,
    licenseId: payload.licenseId,
    runner: payload.runner,
    inputHash: Uint8Array.from(
      payload.inputHash.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    ),
    outputHash: Uint8Array.from(
      payload.outputHash.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    ),
    executedAtMs: BigInt(payload.executedAtMs),
    nonceHash: Uint8Array.from(
      payload.nonceHash.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    ),
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

type TransactionData = {
  inputs: Array<{
    Pure?: { bytes: string };
    UnresolvedObject?: { objectId: string };
  }>;
  commands: Array<{
    SplitCoins?: unknown;
    MoveCall?: {
      package: string;
      module: string;
      function: string;
      arguments: unknown[];
    };
  }>;
};

function dataOf(transaction: Transaction): TransactionData {
  return transaction.getData() as TransactionData;
}

function inputBytes(data: TransactionData, index: number): Uint8Array {
  const input = data.inputs[index];
  if (input?.Pure === undefined) throw new Error(`missing pure input ${index}`);
  return decodeBase64(input.Pure.bytes);
}

describe("web transaction and receipt adapters", () => {
  it("builds purchase_license with the exact package, object, clock, and little-endian u64 split", () => {
    const transaction = buildPurchaseLicenseTransaction({
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      releaseId: RELEASE_ID,
      priceMist: PRICE_MIST,
    });
    const data = dataOf(transaction);

    expect(data.inputs).toHaveLength(4);
    expect(data.inputs[1]?.UnresolvedObject?.objectId).toBe(MARKETPLACE_ID);
    expect(data.inputs[2]?.UnresolvedObject?.objectId).toBe(RELEASE_ID);
    expect(data.inputs[3]?.UnresolvedObject?.objectId).toBe(
      `0x${"0".repeat(63)}6`,
    );
    expect(inputBytes(data, 0)).toEqual(bcs.u64().serialize(PRICE_MIST).toBytes());

    const split = data.commands[0];
    const move = data.commands[1]?.MoveCall;
    expect(split).toMatchObject({
      SplitCoins: {
        coin: { GasCoin: true, $kind: "GasCoin" },
        amounts: [{ Input: 0, type: "pure", $kind: "Input" }],
      },
    });
    expect(move).toMatchObject({
      package: PACKAGE_ID,
      module: "marketplace",
      function: "purchase_license",
      typeArguments: [],
      arguments: [
        { Input: 1, type: "object", $kind: "Input" },
        { Input: 2, type: "object", $kind: "Input" },
        { NestedResult: [0, 0], $kind: "NestedResult" },
        { Input: 3, type: "object", $kind: "Input" },
      ],
    });
  });

  it("rejects non-positive and overflowing license prices", () => {
    expect(() => buildPurchaseLicenseTransaction({
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      releaseId: RELEASE_ID,
      priceMist: 0n,
    })).toThrow("positive u64");
    expect(() => buildPurchaseLicenseTransaction({
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      releaseId: RELEASE_ID,
      priceMist: 1n << 64n,
    })).toThrow("positive u64");
  });

  it("verifies exact receipt identity, local BCS re-encoding, raw Ed25519 signature, key, and fingerprint", async () => {
    const signed = await signedReceipt();
    const verified = await verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    });

    expect(verified.payload).toEqual(signed.receipt.payload);
    expect(verified.bcsBytes).toEqual(signed.bcsBytes);
    expect(verified.signature).toEqual(signed.signature);
    expect(verified.executorPublicKey).toEqual(signed.publicKey);
    expect(verified.executorKeyFingerprint).toMatch(/^[0-9a-f]{16}$/u);
    await expect(
      new Ed25519PublicKey(signed.publicKey).verify(
        signed.bcsBytes,
        signed.signature,
      ),
    ).resolves.toBe(true);

    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", signed.publicKey.slice().buffer),
    );
    const fingerprint = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("").slice(0, 16);
    expect(verified.executorKeyFingerprint).toBe(fingerprint);
  });

  it.each([
    ["release", { expectedReleaseId: MARKETPLACE_ID }],
    ["license", { expectedLicenseId: MARKETPLACE_ID }],
    ["runner", { expectedRunner: MARKETPLACE_ID }],
  ] as const)("rejects a receipt with the wrong expected %s identity", async (_label, override) => {
    const signed = await signedReceipt();
    await expect(verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId:
        "expectedReleaseId" in override ? override.expectedReleaseId : RELEASE_ID,
      expectedLicenseId:
        "expectedLicenseId" in override ? override.expectedLicenseId : LICENSE_ID,
      expectedRunner: "expectedRunner" in override ? override.expectedRunner : RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    })).rejects.toThrow("identity");
  });

  it("rejects a receipt with the wrong Marketplace key, signature, BCS, or payload", async () => {
    const signed = await signedReceipt();
    const wrongKey = signed.publicKey.slice();
    wrongKey[0] = (wrongKey[0] ?? 0) ^ 1;
    await expect(verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: wrongKey,
    })).rejects.toThrow("public key");

    const badSignature = signed.signature.slice();
    badSignature[0] = (badSignature[0] ?? 0) ^ 1;
    await expect(verifyExecutionReceipt({
      receipt: { ...signed.receipt, signatureBase64: encodeBase64(badSignature) },
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    })).rejects.toThrow("signature");

    const badBcs = signed.bcsBytes.slice();
    badBcs[badBcs.length - 1] = (badBcs[badBcs.length - 1] ?? 0) ^ 1;
    await expect(verifyExecutionReceipt({
      receipt: { ...signed.receipt, bcsBase64: encodeBase64(badBcs) },
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    })).rejects.toThrow("BCS");

    await expect(verifyExecutionReceipt({
      receipt: {
        ...signed.receipt,
        payload: { ...signed.receipt.payload, outputHash: INPUT_HASH },
      },
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    })).rejects.toThrow("BCS");
  });

  it.each([
    [
      "non-canonical BCS base64",
      (receipt: ExecutionReceiptDto) => ({
        ...receipt,
        bcsBase64: `${receipt.bcsBase64} `,
      }),
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
      expectedExecutorPublicKey: signed.publicKey,
    })).rejects.toThrow(message);
  });

  it("builds record_execution with frozen argument order and exact pure bytes", async () => {
    const signed = await signedReceipt();
    const verified = await verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    });
    const data = dataOf(buildRecordReceiptTransaction({
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      licenseId: LICENSE_ID,
      receipt: verified,
    }));
    const move = data.commands[0]?.MoveCall;

    expect(data.inputs[0]?.UnresolvedObject?.objectId).toBe(MARKETPLACE_ID);
    expect(data.inputs[1]?.UnresolvedObject?.objectId).toBe(LICENSE_ID);
    expect(inputBytes(data, 2)).toEqual(addressBytes(RELEASE_ID));
    expect(inputBytes(data, 3)).toEqual(addressBytes(RUNNER));
    expect(inputBytes(data, 4)).toEqual(Uint8Array.from([32, ...new Uint8Array(32).fill(0x11)]));
    expect(inputBytes(data, 5)).toEqual(Uint8Array.from([32, ...new Uint8Array(32).fill(0x22)]));
    expect(inputBytes(data, 6)).toEqual(bcs.u64().serialize(BigInt(EXECUTED_AT_MS)).toBytes());
    expect(inputBytes(data, 7)).toEqual(Uint8Array.from([32, ...new Uint8Array(32).fill(0x33)]));
    expect(inputBytes(data, 8)).toEqual(Uint8Array.from([64, ...signed.signature]));
    expect(move).toMatchObject({
      package: PACKAGE_ID,
      module: "marketplace",
      function: "record_execution",
      arguments: [
        { Input: 0, type: "object", $kind: "Input" },
        { Input: 1, type: "object", $kind: "Input" },
        { Input: 2, type: "pure", $kind: "Input" },
        { Input: 3, type: "pure", $kind: "Input" },
        { Input: 4, type: "pure", $kind: "Input" },
        { Input: 5, type: "pure", $kind: "Input" },
        { Input: 6, type: "pure", $kind: "Input" },
        { Input: 7, type: "pure", $kind: "Input" },
        { Input: 8, type: "pure", $kind: "Input" },
      ],
    });
  });

  it("rejects recording with a supplied license ID different from the verified payload", async () => {
    const signed = await signedReceipt();
    const verified = await verifyExecutionReceipt({
      receipt: signed.receipt,
      expectedReleaseId: RELEASE_ID,
      expectedLicenseId: LICENSE_ID,
      expectedRunner: RUNNER,
      expectedExecutorPublicKey: signed.publicKey,
    });

    expect(() => buildRecordReceiptTransaction({
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      licenseId: `0x${"e".repeat(64)}`,
      receipt: verified,
    })).toThrow("Receipt LicensePass does not match the transaction input");
  });
});
