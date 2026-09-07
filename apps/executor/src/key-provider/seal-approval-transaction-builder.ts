import { Transaction } from "@mysten/sui/transactions";
import type { SuiGrpcClient } from "@mysten/sui/grpc";

import type { SealApprovalTransactionBuilder } from "./seal-key-provider.js";
import { ExecutorError } from "../errors.js";

/**
 * Builds the dry-run-only PTB Seal's key servers evaluate before releasing
 * key shares. Matches the seal_approve(id, license, release) signature
 * requested from the Move side (see PR discussion) — NOT yet confirmed
 * against a merged implementation, so the module name and argument order
 * here may need to change once that lands.
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
    this.#module = input.module ?? "marketplace";
  }

  async build(input: {
    keyId: string;
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<Uint8Array> {
    void input.runnerAddress; // sender is implied by the session key, not passed explicitly

    // The `id` argument must be the exact same bytes used at encryption time
    // (WorkflowRelease.key_id, UTF-8 encoded) — a mismatch here is the
    // "encryption identity mismatch" failure mode, not a hex-decoded
    // releaseId.
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.#packageId}::${this.#module}::seal_approve`,
      arguments: [
        tx.pure.vector("u8", Array.from(new TextEncoder().encode(input.keyId))),
        tx.object(input.licenseId),
        tx.object(input.releaseId),
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
