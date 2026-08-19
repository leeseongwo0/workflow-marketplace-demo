import { encodeReceiptMessageBcs } from "@aiwf/shared";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { ExecutionReceiptDto } from "./executor-client";

const CLOCK_OBJECT_ID = "0x6";
const MAX_U64 = (1n << 64n) - 1n;
const verifiedReceiptBrand: unique symbol = Symbol("verifiedReceipt");

export interface VerifiedReceipt {
  readonly [verifiedReceiptBrand]: true;
  readonly payload: ExecutionReceiptDto["payload"];
  readonly signature: Uint8Array;
  readonly bcsBytes: Uint8Array;
  readonly executorPublicKey: Uint8Array;
  readonly executorKeyFingerprint: string;
}

function hexBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error("Receipt hash is invalid");
  return Uint8Array.from(
    value.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function decodeBase64(
  value: string,
  length: number | undefined,
  label: string,
): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error(`${label} is not base64`);
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if ((length !== undefined && bytes.length !== length) || btoa(binary) !== value) {
    throw new Error(`${label} has an invalid length or encoding`);
  }
  return bytes;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function bytesHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildPurchaseLicenseTransaction(input: {
  packageId: string;
  marketplaceId: string;
  releaseId: string;
  priceMist: bigint;
}): Transaction {
  if (input.priceMist <= 0n || input.priceMist > MAX_U64) {
    throw new Error("License price must fit a positive u64");
  }
  const transaction = new Transaction();
  const [payment] = transaction.splitCoins(transaction.gas, [
    transaction.pure.u64(input.priceMist),
  ]);
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::marketplace::purchase_license`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.marketplaceId)),
      transaction.object(normalizeSuiAddress(input.releaseId)),
      payment,
      transaction.object(normalizeSuiAddress(CLOCK_OBJECT_ID)),
    ],
  });
  return transaction;
}

export async function verifyExecutionReceipt(input: {
  receipt: ExecutionReceiptDto;
  expectedReleaseId: string;
  expectedLicenseId: string;
  expectedRunner: string;
  expectedExecutorPublicKey: Uint8Array;
}): Promise<VerifiedReceipt> {
  const payload = input.receipt.payload;
  if (
    payload.releaseId !== normalizeSuiAddress(input.expectedReleaseId) ||
    payload.licenseId !== normalizeSuiAddress(input.expectedLicenseId) ||
    payload.runner !== normalizeSuiAddress(input.expectedRunner)
  ) {
    throw new Error("Receipt identity does not match this execution");
  }
  const bcsBytes = decodeBase64(input.receipt.bcsBase64, undefined, "Receipt BCS");
  const signature = decodeBase64(input.receipt.signatureBase64, 64, "Receipt signature");
  const executorPublicKey = decodeBase64(
    input.receipt.executorPublicKeyBase64,
    32,
    "Executor public key",
  );
  if (!equalBytes(executorPublicKey, input.expectedExecutorPublicKey)) {
    throw new Error("Executor public key does not match Marketplace");
  }
  const expectedBcs = encodeReceiptMessageBcs({
    releaseId: payload.releaseId,
    licenseId: payload.licenseId,
    runner: payload.runner,
    inputHash: hexBytes(payload.inputHash),
    outputHash: hexBytes(payload.outputHash),
    executedAtMs: BigInt(payload.executedAtMs),
    nonceHash: hexBytes(payload.nonceHash),
  });
  if (!equalBytes(bcsBytes, expectedBcs)) {
    throw new Error("Receipt BCS does not match the signed payload");
  }
  const publicKey = new Ed25519PublicKey(executorPublicKey);
  if (!(await publicKey.verify(bcsBytes, signature))) {
    throw new Error("Receipt signature is invalid");
  }
  const fingerprintBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", executorPublicKey.slice().buffer),
  );
  return {
    [verifiedReceiptBrand]: true,
    payload,
    signature,
    bcsBytes,
    executorPublicKey,
    executorKeyFingerprint: bytesHex(fingerprintBytes).slice(0, 16),
  };
}

export function buildRecordReceiptTransaction(input: {
  packageId: string;
  marketplaceId: string;
  licenseId: string;
  receipt: VerifiedReceipt;
}): Transaction {
  const payload = input.receipt.payload;
  if (payload.licenseId !== normalizeSuiAddress(input.licenseId)) {
    throw new Error("Receipt LicensePass does not match the transaction input");
  }
  const transaction = new Transaction();
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::marketplace::record_execution`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.marketplaceId)),
      transaction.object(normalizeSuiAddress(input.licenseId)),
      transaction.pure.address(payload.releaseId),
      transaction.pure.address(payload.runner),
      transaction.pure.vector("u8", hexBytes(payload.inputHash)),
      transaction.pure.vector("u8", hexBytes(payload.outputHash)),
      transaction.pure.u64(payload.executedAtMs),
      transaction.pure.vector("u8", hexBytes(payload.nonceHash)),
      transaction.pure.vector("u8", input.receipt.signature),
    ],
  });
  return transaction;
}
