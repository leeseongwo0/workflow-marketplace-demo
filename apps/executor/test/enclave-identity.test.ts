import { describe, expect, it } from "vitest";

import type { EnclaveIdentitySource } from "../src/identity/enclave-identity.js";
import { loadEnclaveIdentityKey } from "../src/identity/enclave-identity.js";

const VALID_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index);

function fakeSource(overrides: Partial<EnclaveIdentitySource> = {}): EnclaveIdentitySource {
  return {
    readFile: overrides.readFile ?? (async () => VALID_KEY),
    sleep: overrides.sleep ?? (async () => {}),
  };
}

describe("loadEnclaveIdentityKey", () => {
  it("returns the 32-byte key immediately when the file is already present", async () => {
    const key = await loadEnclaveIdentityKey({
      path: "/tmp/enclave-identity.key",
      source: fakeSource(),
    });
    expect(key).toEqual(VALID_KEY);
  });

  it("polls until the file appears, then returns the key", async () => {
    let attempts = 0;
    let sleeps = 0;
    const key = await loadEnclaveIdentityKey({
      path: "/tmp/enclave-identity.key",
      source: fakeSource({
        readFile: async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error("ENOENT");
          }
          return VALID_KEY;
        },
        sleep: async () => {
          sleeps += 1;
        },
      }),
    });
    expect(key).toEqual(VALID_KEY);
    expect(attempts).toBe(3);
    expect(sleeps).toBe(2);
  });

  it("rejects a key file with the wrong length without retrying", async () => {
    let attempts = 0;
    await expect(
      loadEnclaveIdentityKey({
        path: "/tmp/enclave-identity.key",
        source: fakeSource({
          readFile: async () => {
            attempts += 1;
            return Uint8Array.from([1, 2, 3]);
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(attempts).toBe(1);
  });

  it("gives up after the timeout if the file never appears", async () => {
    let now = 0;
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      await expect(
        loadEnclaveIdentityKey({
          path: "/tmp/enclave-identity.key",
          timeoutMs: 1_000,
          source: fakeSource({
            readFile: async () => {
              throw new Error("ENOENT");
            },
            sleep: async () => {
              now += 500;
            },
          }),
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    } finally {
      Date.now = originalNow;
    }
  });
});
