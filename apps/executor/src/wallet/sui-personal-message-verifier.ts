import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import type { ClientWithCoreApi } from "@mysten/sui/client";

import type { WalletSignatureVerifier } from "../contracts.js";
import { ExecutorError } from "../errors.js";

export class SuiPersonalMessageVerifier implements WalletSignatureVerifier {
  readonly #client: ClientWithCoreApi;

  /**
   * `client` is required to verify zkLogin signatures (they need a JWK/
   * epoch lookup) — without one, verifyPersonalMessageSignature throws for
   * any zkLogin signer even when the signature is genuinely valid, which
   * silently locks out every social-login wallet.
   */
  constructor(client: ClientWithCoreApi) {
    this.#client = client;
  }

  async verify(input: {
    message: Uint8Array;
    signature: string;
    expectedAddress: string;
  }): Promise<void> {
    try {
      await verifyPersonalMessageSignature(input.message, input.signature, {
        client: this.#client,
        address: input.expectedAddress,
      });
    } catch (cause) {
      throw new ExecutorError(
        "INVALID_WALLET_SIGNATURE",
        "Wallet signature is invalid for this challenge",
        cause,
      );
    }
  }
}
