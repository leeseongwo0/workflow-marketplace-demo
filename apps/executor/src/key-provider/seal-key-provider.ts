import type { KeyProvider } from "../contracts.js";
import { ExecutorError } from "../errors.js";

const DEK_LENGTH = 32;

/**
 * Builds the BCS bytes of a PTB that dry-runs a `seal_approve` Move call for
 * the given release/license/runner. Seal key servers evaluate this PTB
 * on-chain and only return key shares if it does not abort.
 *
 * `workflow_marketplace::execution::seal_approve(id, pass, release, clock)`
 * checks `id == bcs::to_bytes(&object::id(release))` — the Seal identity is
 * the release's own object ID (BCS-encoded), NOT `key_id`. See
 * MarketplaceSealApprovalTransactionBuilder for the real implementation.
 */
export interface SealApprovalTransactionBuilder {
  build(input: {
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<Uint8Array>;
}

/**
 * Returns the Seal-encrypted DEK ciphertext for a release's keyId. This is a
 * small blob (Seal wraps only the 32-byte DEK, not the workflow bundle),
 * distinct from the AES-GCM-encrypted bundle stored in Walrus.
 *
 * TODO(seal): `WorkflowRelease` currently has no field for this blob.
 * Agreed with the team to add a new `sealed_dek: vector<u8>` field (not
 * merged yet) rather than a separate Walrus blob, since the ciphertext is
 * small and this avoids a second network round trip. `keyId` here is this
 * project's own lookup key (e.g. into the local demo keyring) — it is NOT
 * the Seal identity, which is the release's object ID (see
 * SealApprovalTransactionBuilder).
 */
export interface SealEncryptedDekSource {
  get(input: { keyId: string; releaseId: string }): Promise<Uint8Array>;
}

/**
 * Fetches key shares from Seal key servers using the approval PTB, combines
 * them per the configured threshold, and decrypts the Seal-encrypted DEK
 * blob into the raw DEK. Backed by `@mysten/seal`'s SealClient in
 * production; the executor's own EXECUTOR_PRIVATE_KEY keypair can act as the
 * SessionKey signer, so this never needs a browser wallet.
 */
export interface SealDecryptor {
  decrypt(input: {
    encryptedDek: Uint8Array;
    approvalTxBytes: Uint8Array;
  }): Promise<Uint8Array>;
}

function keyNotFound(): ExecutorError {
  return new ExecutorError("KEY_NOT_FOUND", "Seal key request could not be completed");
}

/**
 * Real Seal-backed KeyProvider. Authorization is proven on-chain to Seal's
 * key servers via the seal_approve dry-run (see
 * SealApprovalTransactionBuilder) rather than trusted from this process, so
 * it stays correct even though ExecutionService also verifies the license
 * upstream before calling getDek.
 *
 * This class is deliberately Seal-SDK-agnostic: it depends on the three
 * narrow interfaces above instead of importing `@mysten/seal` directly, so
 * it can be unit tested against fakes today and wired to a real SealClient
 * once the two TODO(seal) items above are resolved with the team.
 */
export class SealKeyProvider implements KeyProvider {
  readonly #approvalTransactions: SealApprovalTransactionBuilder;
  readonly #encryptedDeks: SealEncryptedDekSource;
  readonly #decryptor: SealDecryptor;

  constructor(input: {
    approvalTransactions: SealApprovalTransactionBuilder;
    encryptedDeks: SealEncryptedDekSource;
    decryptor: SealDecryptor;
  }) {
    this.#approvalTransactions = input.approvalTransactions;
    this.#encryptedDeks = input.encryptedDeks;
    this.#decryptor = input.decryptor;
  }

  async getDek(input: {
    keyId: string;
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<Uint8Array> {
    let encryptedDek: Uint8Array;
    let approvalTxBytes: Uint8Array;
    try {
      [encryptedDek, approvalTxBytes] = await Promise.all([
        this.#encryptedDeks.get({
          keyId: input.keyId,
          releaseId: input.releaseId,
        }),
        this.#approvalTransactions.build({
          releaseId: input.releaseId,
          licenseId: input.licenseId,
          runnerAddress: input.runnerAddress,
        }),
      ]);
    } catch {
      // Do not attach Seal transport, PTB, or path details to this error.
      throw keyNotFound();
    }

    let dek: Uint8Array;
    try {
      dek = await this.#decryptor.decrypt({ encryptedDek, approvalTxBytes });
    } catch {
      throw keyNotFound();
    }

    if (dek.length !== DEK_LENGTH) {
      throw keyNotFound();
    }
    return dek;
  }
}
