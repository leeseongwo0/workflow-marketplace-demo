import { describe, expect, it } from "vitest";

import type {
  SealApprovalTransactionBuilder,
  SealDecryptor,
  SealEncryptedDekSource,
} from "../src/key-provider/seal-key-provider.js";
import { SealKeyProvider } from "../src/key-provider/seal-key-provider.js";

const KEY_ID = `root:0x${"1".repeat(64)}:release:1.0.0`;
const RELEASE_ID = `0x${"2".repeat(64)}`;
const LICENSE_ID = `0x${"3".repeat(64)}`;
const RUNNER_ADDRESS = `0x${"4".repeat(64)}`;
const DEK = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const ENCRYPTED_DEK = Uint8Array.from([9, 9, 9]);
const APPROVAL_TX_BYTES = Uint8Array.from([7, 7, 7]);

function request() {
  return {
    keyId: KEY_ID,
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    runnerAddress: RUNNER_ADDRESS,
  };
}

function fakeApprovalTransactions(
  build: SealApprovalTransactionBuilder["build"] = async () => APPROVAL_TX_BYTES,
): SealApprovalTransactionBuilder {
  return { build };
}

function fakeEncryptedDeks(
  get: SealEncryptedDekSource["get"] = async () => ENCRYPTED_DEK,
): SealEncryptedDekSource {
  return { get };
}

function fakeDecryptor(
  decrypt: SealDecryptor["decrypt"] = async () => DEK,
): SealDecryptor {
  return { decrypt };
}

function provider(overrides: {
  approvalTransactions?: SealApprovalTransactionBuilder;
  encryptedDeks?: SealEncryptedDekSource;
  decryptor?: SealDecryptor;
} = {}): SealKeyProvider {
  return new SealKeyProvider({
    approvalTransactions: overrides.approvalTransactions ?? fakeApprovalTransactions(),
    encryptedDeks: overrides.encryptedDeks ?? fakeEncryptedDeks(),
    decryptor: overrides.decryptor ?? fakeDecryptor(),
  });
}

async function expectKeyNotFound(instance: SealKeyProvider): Promise<void> {
  let caught: unknown;
  try {
    await instance.getDek(request());
  } catch (error) {
    caught = error;
  }

  expect(caught).toMatchObject({ code: "KEY_NOT_FOUND" });
  const message = caught instanceof Error ? caught.message : String(caught);
  expect(message).not.toContain(Buffer.from(DEK).toString("base64"));
  expect(message).not.toContain(Buffer.from(DEK).toString("hex"));
  expect(message).not.toContain(KEY_ID);
}

describe("SealKeyProvider", () => {
  it("decrypts the DEK using the approval transaction and encrypted DEK together", async () => {
    let seenApprovalInput: unknown;
    let seenEncryptedDekInput: unknown;
    let seenDecryptInput: unknown;

    const instance = provider({
      approvalTransactions: fakeApprovalTransactions(async (input) => {
        seenApprovalInput = input;
        return APPROVAL_TX_BYTES;
      }),
      encryptedDeks: fakeEncryptedDeks(async (input) => {
        seenEncryptedDekInput = input;
        return ENCRYPTED_DEK;
      }),
      decryptor: fakeDecryptor(async (input) => {
        seenDecryptInput = input;
        return DEK;
      }),
    });

    await expect(instance.getDek(request())).resolves.toEqual(DEK);

    expect(seenApprovalInput).toEqual({
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      runnerAddress: RUNNER_ADDRESS,
    });
    expect(seenEncryptedDekInput).toEqual({
      keyId: KEY_ID,
      releaseId: RELEASE_ID,
    });
    expect(seenDecryptInput).toEqual({
      encryptedDek: ENCRYPTED_DEK,
      approvalTxBytes: APPROVAL_TX_BYTES,
    });
  });

  it("maps a failed approval transaction build to KEY_NOT_FOUND without secret details", async () => {
    await expectKeyNotFound(
      provider({
        approvalTransactions: fakeApprovalTransactions(async () => {
          throw new Error(`denied for ${KEY_ID}`);
        }),
      }),
    );
  });

  it("maps a failed encrypted DEK lookup to KEY_NOT_FOUND without secret details", async () => {
    await expectKeyNotFound(
      provider({
        encryptedDeks: fakeEncryptedDeks(async () => {
          throw new Error(`missing blob for ${KEY_ID}`);
        }),
      }),
    );
  });

  it("maps a failed Seal decrypt to KEY_NOT_FOUND without secret details", async () => {
    await expectKeyNotFound(
      provider({
        decryptor: fakeDecryptor(async () => {
          throw new Error(`bad key share for ${KEY_ID}`);
        }),
      }),
    );
  });

  it("rejects a decrypted key that is not exactly 32 bytes", async () => {
    await expectKeyNotFound(
      provider({
        decryptor: fakeDecryptor(async () => Uint8Array.from([1, 2, 3])),
      }),
    );
  });
});
