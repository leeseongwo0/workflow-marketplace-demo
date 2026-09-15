import { describe, expect, it, vi } from "vitest";

import { SessionKey } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";

import { MarketplaceSealApprovalTransactionBuilder } from
  "../src/key-provider/seal-approval-transaction-builder.js";
import { SealClientDecryptor } from
  "../src/key-provider/seal-client-decryptor.js";

const PACKAGE_ID = `0x${"1".repeat(64)}`;
const RELEASE_ID = `0x${"2".repeat(64)}`;
const RUNNER = `0x${"4".repeat(64)}`;
const OTHER_ADDRESS = `0x${"6".repeat(64)}`;
const REQUEST_ID = `0x${"7".repeat(64)}`;
const ENCLAVE_ID = `0x${"8".repeat(64)}`;

describe("Seal SDK adapters", () => {
  it("signs request||release with the enclave signer and builds the seal_approve call", async () => {
    let transactionData: unknown;
    const build = vi.spyOn(Transaction.prototype, "build").mockImplementation(
      async function mockBuild(this: Transaction) {
        transactionData = this.getData();
        return Uint8Array.from([1, 2, 3]);
      },
    );
    let signedMessage: Uint8Array | undefined;
    const signature = Uint8Array.from({ length: 64 }, (_v, index) => index);
    const builder = new MarketplaceSealApprovalTransactionBuilder({
      suiClient: {} as never,
      packageId: PACKAGE_ID,
      enclaveId: ENCLAVE_ID,
      signer: {
        sign: async (message) => {
          signedMessage = message;
          return signature;
        },
      },
    });

    await expect(builder.build({
      releaseId: RELEASE_ID,
      requestId: REQUEST_ID,
    })).resolves.toEqual(Uint8Array.from([1, 2, 3]));

    // Signed message must be exactly bcs(request_id) || bcs(release_id):
    // 32 raw address bytes each, no sender needed (everything is shared).
    expect(signedMessage).toHaveLength(64);
    expect(transactionData).not.toMatchObject({ sender: expect.anything() });
    expect(JSON.stringify(transactionData)).toContain("seal_approve");
    build.mockRestore();
  });

  it("fails before contacting Seal when sealSession is not a real SessionKey", async () => {
    const decryptor = new SealClientDecryptor({
      suiClient: {} as never,
      serverConfigs: [{ objectId: `0x${"5".repeat(64)}`, weight: 1 }],
    });

    await expect(decryptor.decrypt({
      encryptedDek: Uint8Array.from([1]),
      approvalTxBytes: Uint8Array.from([2]),
      runnerAddress: RUNNER,
      sealSession: { getAddress: () => RUNNER, isExpired: () => false },
    })).rejects.toMatchObject({ code: "KEY_NOT_FOUND" });
  });

  it("fails before contacting Seal when the session address is not the runner", async () => {
    const decryptor = new SealClientDecryptor({
      suiClient: {} as never,
      serverConfigs: [{ objectId: `0x${"5".repeat(64)}`, weight: 1 }],
    });
    const sessionKey = await SessionKey.create({
      address: OTHER_ADDRESS,
      packageId: PACKAGE_ID,
      ttlMin: 10,
      suiClient: {
        core: {
          getObject: async () => ({ object: { version: "1" } }),
        },
      } as never,
    });

    await expect(decryptor.decrypt({
      encryptedDek: Uint8Array.from([1]),
      approvalTxBytes: Uint8Array.from([2]),
      runnerAddress: RUNNER,
      sealSession: sessionKey,
    })).rejects.toMatchObject({ code: "KEY_NOT_FOUND" });
  });
});
