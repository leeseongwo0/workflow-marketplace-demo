import { createHash, timingSafeEqual } from "node:crypto";

import { normalizeSha256Hex } from "@aiwf/shared";

import { ExecutorError } from "../errors.js";

export function sha256Bytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(value).digest());
}

export function sha256Hex(value: Uint8Array): string {
  return Buffer.from(sha256Bytes(value)).toString("hex");
}

export function assertSha256(value: Uint8Array, expectedHex: string): void {
  let expected: Uint8Array;
  try {
    expected = new Uint8Array(Buffer.from(normalizeSha256Hex(expectedHex), "hex"));
  } catch (cause) {
    throw new ExecutorError(
      "BUNDLE_HASH_MISMATCH",
      "Configured encrypted bundle hash is invalid",
      cause,
    );
  }
  const actual = sha256Bytes(value);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ExecutorError(
      "BUNDLE_HASH_MISMATCH",
      "Encrypted bundle bytes do not match the release hash",
    );
  }
}
