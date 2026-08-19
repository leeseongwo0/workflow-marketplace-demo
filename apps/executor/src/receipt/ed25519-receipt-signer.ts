import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import type { ReceiptSigner } from "../contracts.js";
import { ExecutorError } from "../errors.js";

export class Ed25519ReceiptSigner implements ReceiptSigner {
  readonly #keypair: Ed25519Keypair;

  constructor(secretKey: string | Uint8Array) {
    try {
      this.#keypair = Ed25519Keypair.fromSecretKey(secretKey);
    } catch (cause) {
      throw new ExecutorError(
        "RECEIPT_SIGN_FAILED",
        "Executor signing key is invalid",
        cause,
      );
    }
  }

  publicKey(): Uint8Array {
    return this.#keypair.getPublicKey().toRawBytes().slice();
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    try {
      return new Uint8Array(await this.#keypair.sign(message));
    } catch (cause) {
      throw new ExecutorError(
        "RECEIPT_SIGN_FAILED",
        "Executor could not sign the receipt",
        cause,
      );
    }
  }
}
