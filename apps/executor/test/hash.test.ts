import { describe, expect, it } from "vitest";

import { ExecutorError } from "../src/errors.js";
import { assertSha256, sha256Hex } from "../src/crypto/hash.js";

describe("SHA-256 integrity checks", () => {
  const payload = new TextEncoder().encode("offline phase 3 payload");
  const expected = sha256Hex(payload);

  it("accepts bytes whose SHA-256 matches the expected lowercase hex", () => {
    expect(() => assertSha256(payload, expected)).not.toThrow();
    expect(expected).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("raises a typed mismatch without including payload contents", () => {
    let caught: unknown;
    try {
      assertSha256(payload, "f".repeat(64));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ExecutorError);
    expect(caught).toMatchObject({ code: "BUNDLE_HASH_MISMATCH" });
    expect((caught as Error).message).not.toContain("offline phase 3 payload");
  });

  it("maps an invalid configured hash to the same typed integrity error", () => {
    expect(() => assertSha256(payload, "not-a-sha256")).toThrowError(
      expect.objectContaining({ code: "BUNDLE_HASH_MISMATCH" }),
    );
  });
});
