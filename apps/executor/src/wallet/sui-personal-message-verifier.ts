import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

import type { WalletSignatureVerifier } from "../contracts.js";
import { ExecutorError } from "../errors.js";

export class SuiPersonalMessageVerifier implements WalletSignatureVerifier {
  async verify(input: {
    message: Uint8Array;
    signature: string;
    expectedAddress: string;
  }): Promise<void> {
    try {
      await verifyPersonalMessageSignature(input.message, input.signature, {
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
