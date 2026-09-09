import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiGrpcClient } from "@mysten/sui/grpc";

import type { SealApprovalTransactionBuilder } from "./seal-key-provider.js";
import { ExecutorError } from "../errors.js";

/**
 * Builds the dry-run-only PTB Seal's key servers evaluate before releasing
 * key shares, matching the real
 * `workflow_marketplace::execution::seal_approve(id, pass, release, clock)`
 * on `integration/team-merge`:
 *
 *   assert!(id == bcs::to_bytes(&object::id(release)), ESealIdentityMismatch);
 *   assert!(license::license_release_id(pass) == object::id(release), EReleaseMismatch);
 *   license::assert_license_valid(pass, clock);
 *
 * The Seal identity is the release's own object ID (BCS-encoded), not
 * `key_id` — encryption on the seller side must use the same encoding or
 * decryption will fail with an identity mismatch.
 *
 * Per Seal's requirements, the transaction must call only seal_approve*
 * functions, all in the same package, and is never actually executed
 * on-chain — only dry-run by key servers, so it needs no gas payment setup.
 */
export class MarketplaceSealApprovalTransactionBuilder
  implements SealApprovalTransactionBuilder
{
  readonly #suiClient: SuiGrpcClient;
  readonly #packageId: string;
  readonly #module: string;

  constructor(input: {
    suiClient: SuiGrpcClient;
    packageId: string;
    module?: string;
  }) {
    this.#suiClient = input.suiClient;
    this.#packageId = input.packageId;
    this.#module = input.module ?? "execution";
  }

  async build(input: {
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<Uint8Array> {
    void input.runnerAddress; // sender is implied by the session key, not passed explicitly

    const identity = bcs.Address.serialize(input.releaseId).toBytes();

    const tx = new Transaction();
    tx.moveCall({
      target: `${this.#packageId}::${this.#module}::seal_approve`,
      arguments: [
        tx.pure.vector("u8", Array.from(identity)),
        tx.object(input.licenseId),
        tx.object(input.releaseId),
        tx.object.clock(),
      ],
    });

    try {
      return await tx.build({
        client: this.#suiClient,
        onlyTransactionKind: true,
      });
    } catch (cause) {
      throw new ExecutorError(
        "KEY_NOT_FOUND",
        "Seal approval transaction could not be built",
        cause,
      );
    }
  }
}
