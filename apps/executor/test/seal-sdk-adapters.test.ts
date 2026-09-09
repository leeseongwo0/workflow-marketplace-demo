import { describe, expect, it, vi } from "vitest";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { MarketplaceSealApprovalTransactionBuilder } from
  "../src/key-provider/seal-approval-transaction-builder.js";
import { SealClientDecryptor } from
  "../src/key-provider/seal-client-decryptor.js";

const PACKAGE_ID = `0x${"1".repeat(64)}`;
const RELEASE_ID = `0x${"2".repeat(64)}`;
const LICENSE_ID = `0x${"3".repeat(64)}`;
const RUNNER = `0x${"4".repeat(64)}`;

describe("Seal SDK adapters", () => {
  it("sets the licensed runner as the approval transaction sender", async () => {
    let transactionData: unknown;
    const build = vi.spyOn(Transaction.prototype, "build").mockImplementation(
      async function mockBuild(this: Transaction) {
        transactionData = this.getData();
        return Uint8Array.from([1, 2, 3]);
      },
    );
    const builder = new MarketplaceSealApprovalTransactionBuilder({
      suiClient: {} as never,
      packageId: PACKAGE_ID,
    });

    await expect(builder.build({
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      runnerAddress: RUNNER,
    })).resolves.toEqual(Uint8Array.from([1, 2, 3]));

    expect(transactionData).toMatchObject({ sender: RUNNER });
    expect(JSON.stringify(transactionData)).toContain("seal_approve");
    build.mockRestore();
  });

  it("fails before contacting Seal when the session signer is not the runner", async () => {
    const signer = Ed25519Keypair.generate();
    const decryptor = new SealClientDecryptor({
      suiClient: {} as never,
      serverConfigs: [{ objectId: `0x${"5".repeat(64)}`, weight: 1 }],
      signer,
      packageId: PACKAGE_ID,
    });

    await expect(decryptor.decrypt({
      encryptedDek: Uint8Array.from([1]),
      approvalTxBytes: Uint8Array.from([2]),
      runnerAddress: RUNNER,
    })).rejects.toMatchObject({ code: "KEY_NOT_FOUND" });
  });
});
