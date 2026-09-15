import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { SealApprovalTransactionBuilder } from "./seal-key-provider.js";
import { ExecutorError } from "../errors.js";

/**
 * Anything that can produce a raw Ed25519 signature over arbitrary bytes
 * using the enclave's own identity key (the same key registered on-chain
 * as `Enclave<T>.pk` — see loadEnclaveIdentityKey / Ed25519ReceiptSigner).
 * Structurally compatible with ReceiptSigner, so the same instance used to
 * sign receipts can be passed here without adaptation.
 */
export interface EnclaveMessageSigner {
  sign(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Builds the dry-run-only PTB Seal's key servers evaluate before releasing
 * key shares, matching the real
 * `workflow_marketplace::execution::seal_approve(id, request, release,
 * enclave, signature, clock)` on `hweechan/move-sdk` (commit dae0c05):
 *
 *   assert_request_valid(request, clock);
 *   assert!(request.release_id == object::id(release), ERequestReleaseMismatch);
 *   assert!(id == bcs::to_bytes(&object::id(release)), ESealIdentityMismatch);
 *   let mut message = bcs::to_bytes(&object::id(request));
 *   message.append(bcs::to_bytes(&object::id(release)));
 *   enclave::verify_signature(enclave, &signature, &message);
 *
 * The Seal identity (`id`) is still the release's own object ID
 * (BCS-encoded) — encryption on the seller side must use the same encoding
 * or decryption will fail with an identity mismatch. The enclave
 * `signature` is a *separate* value: a raw Ed25519 signature, produced by
 * this executor's own attested identity key, over
 * `bcs(request_id) || bcs(release_id)`. Binding the release id into that
 * message is what stops seal_approve's LicensePass-era owned-object check
 * (buyer signs their own session) from mattering any more — authorization
 * now rests entirely on "does a live, unclaimed ExecutionRequest exist for
 * this release, and did the attested enclave vouch for it", not on who
 * signs the Seal session. Binding the *request* id (not just the release
 * id) is what stops that enclave signature from being replayed across
 * different requests for the same release.
 *
 * Per Seal's requirements, the transaction must call only seal_approve*
 * functions, all in the same package, and is never actually executed
 * on-chain — only dry-run by key servers, so it needs no gas payment setup
 * or sender (every object seal_approve now touches is shared, not owned).
 */
export class MarketplaceSealApprovalTransactionBuilder
  implements SealApprovalTransactionBuilder
{
  readonly #suiClient: SuiGrpcClient;
  readonly #packageId: string;
  readonly #module: string;
  readonly #enclaveId: string;
  readonly #signer: EnclaveMessageSigner;

  constructor(input: {
    suiClient: SuiGrpcClient;
    packageId: string;
    enclaveId: string;
    signer: EnclaveMessageSigner;
    module?: string;
  }) {
    this.#suiClient = input.suiClient;
    this.#packageId = input.packageId;
    this.#enclaveId = input.enclaveId;
    this.#signer = input.signer;
    this.#module = input.module ?? "execution";
  }

  async build(input: {
    releaseId: string;
    requestId: string;
  }): Promise<Uint8Array> {
    const releaseId = normalizeSuiAddress(input.releaseId);
    const requestId = normalizeSuiAddress(input.requestId);
    const releaseIdBytes = bcs.Address.serialize(releaseId).toBytes();
    const requestIdBytes = bcs.Address.serialize(requestId).toBytes();

    let signature: Uint8Array;
    try {
      const message = new Uint8Array(
        requestIdBytes.length + releaseIdBytes.length,
      );
      message.set(requestIdBytes, 0);
      message.set(releaseIdBytes, requestIdBytes.length);
      signature = await this.#signer.sign(message);
    } catch (cause) {
      throw new ExecutorError(
        "KEY_NOT_FOUND",
        "Enclave could not sign the Seal approval message",
        cause,
      );
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${normalizeSuiAddress(this.#packageId)}::${this.#module}::seal_approve`,
      arguments: [
        tx.pure.vector("u8", Array.from(releaseIdBytes)),
        tx.object(requestId),
        tx.object(releaseId),
        tx.object(normalizeSuiAddress(this.#enclaveId)),
        tx.pure.vector("u8", Array.from(signature)),
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
