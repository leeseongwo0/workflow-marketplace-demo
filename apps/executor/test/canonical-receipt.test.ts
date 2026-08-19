import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  encodeReceiptMessageBcs,
} from "@aiwf/shared";

const RECEIPT_GOLDEN_HEX =
  "0f414957465f524543454950545f56311611edd9a9d42dbcd9ae773ffa22be0f6017b00590959dd5c767e4efcd34cd0b4b91c69db001e4d18e0c79058e6b83167d016a3ff50d13f17f35d3ef9e32fe5f0000000000000000000000000000000000000000000000000000000000000b0b2004040404040404040404040404040404040404040404040404040404040404042005050505050505050505050505050505050505050505050505050505050505050077726091010000200606060606060606060606060606060606060606060606060606060606060606";

describe("canonical JSON", () => {
  it("sorts nested object keys, preserves arrays and Unicode, and normalizes negative zero", () => {
    const value = {
      z: {
        "β": "😀",
        a: "é",
      },
      a: [
        { z: 1, a: 2 },
        "한국",
        -0,
      ],
    };

    expect(canonicalJson(value)).toBe(
      '{"a":[{"a":2,"z":1},"한국",0],"z":{"a":"é","β":"😀"}}',
    );
  });

  it.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["positive Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
  ])("rejects %s", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it("rejects nested undefined values", () => {
    expect(() => canonicalJson({ nested: undefined })).toThrow(TypeError);
    expect(() => canonicalJson([undefined])).toThrow(TypeError);
  });

  it("rejects cycles", () => {
    const value: Record<string, unknown> = {};
    value["self"] = value;

    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it("rejects class instances instead of treating them as plain objects", () => {
    class Configuration {
      readonly enabled = true;
    }

    expect(() => canonicalJson(new Configuration())).toThrow(TypeError);
    expect(() => canonicalJson(new Date("2026-08-19T00:00:00.000Z"))).toThrow(
      TypeError,
    );
  });
});

describe("receipt BCS", () => {
  const message = {
    releaseId:
      "0x1611edd9a9d42dbcd9ae773ffa22be0f6017b00590959dd5c767e4efcd34cd0b",
    licenseId:
      "0x4b91c69db001e4d18e0c79058e6b83167d016a3ff50d13f17f35d3ef9e32fe5f",
    runner: "0xb0b",
    inputHash: new Uint8Array(32).fill(0x04),
    outputHash: new Uint8Array(32).fill(0x05),
    executedAtMs: 1723900000000n,
    nonceHash: new Uint8Array(32).fill(0x06),
  } as const;

  it("matches the exact Move golden vector", () => {
    expect(Buffer.from(encodeReceiptMessageBcs(message)).toString("hex")).toBe(
      RECEIPT_GOLDEN_HEX,
    );
  });

  it.each([
    "",
    "1611edd9a9d42dbcd9ae773ffa22be0f6017b00590959dd5c767e4efcd34cd0b",
    `0x${"1".repeat(65)}`,
    "0xnot-hex",
  ])("rejects malformed address %s", (releaseId) => {
    expect(() =>
      encodeReceiptMessageBcs({ ...message, releaseId }),
    ).toThrow(TypeError);
  });

  it.each([
    ["inputHash", new Uint8Array(31)],
    ["outputHash", new Uint8Array(33)],
    ["nonceHash", new Uint8Array(0)],
    ["inputHash", [4, 4, 4] as unknown as Uint8Array],
  ] as const)("rejects malformed %s", (field, value) => {
    expect(() =>
      encodeReceiptMessageBcs({ ...message, [field]: value }),
    ).toThrow(TypeError);
  });

  it.each([-1n, 1n << 64n])("rejects out-of-range u64 %s", (executedAtMs) => {
    expect(() =>
      encodeReceiptMessageBcs({ ...message, executedAtMs }),
    ).toThrow(RangeError);
  });

  it("does not accidentally accept non-bigint timestamps", () => {
    expect(() =>
      encodeReceiptMessageBcs({
        ...message,
        executedAtMs: 1723900000000 as unknown as bigint,
      }),
    ).toThrow();
  });
});
