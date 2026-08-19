export const RECEIPT_DOMAIN = "AIWF_RECEIPT_V1" as const;

const MAX_U64 = (1n << 64n) - 1n;

export interface ReceiptMessage {
  releaseId: string;
  licenseId: string;
  runner: string;
  inputHash: Uint8Array;
  outputHash: Uint8Array;
  executedAtMs: bigint;
  nonceHash: Uint8Array;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function encodeUleb128(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("BCS length must be a non-negative safe integer");
  }
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return Uint8Array.from(bytes);
}

function encodeVector(bytes: Uint8Array): Uint8Array {
  return concatBytes([encodeUleb128(bytes.length), bytes]);
}

function encodeAddress(value: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{1,64}$/u.test(value)) {
    throw new TypeError("Sui address must be 0x-prefixed hexadecimal");
  }
  const hex = value.slice(2).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function requireHash(value: Uint8Array, field: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new TypeError(`${field} must contain exactly 32 bytes`);
  }
  return value;
}

function encodeU64(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_U64) {
    throw new RangeError("executedAtMs must fit in an unsigned 64-bit integer");
  }
  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function encodeReceiptMessageBcs(message: ReceiptMessage): Uint8Array {
  return concatBytes([
    encodeVector(new TextEncoder().encode(RECEIPT_DOMAIN)),
    encodeAddress(message.releaseId),
    encodeAddress(message.licenseId),
    encodeAddress(message.runner),
    encodeVector(requireHash(message.inputHash, "inputHash")),
    encodeVector(requireHash(message.outputHash, "outputHash")),
    encodeU64(message.executedAtMs),
    encodeVector(requireHash(message.nonceHash, "nonceHash")),
  ]);
}
