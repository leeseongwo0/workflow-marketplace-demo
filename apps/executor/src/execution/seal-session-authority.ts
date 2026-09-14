import { SessionKey } from "@mysten/seal";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

import { ExecutorError } from "../errors.js";

const DEFAULT_SESSION_TTL_MIN = 10;

export interface SealSessionAuthority {
  /** Starts an unsigned Seal session for the runner and returns the personal
   * message bytes their wallet must sign. */
  begin(input: { challengeId: string; runnerAddress: string }): Promise<Uint8Array>;
  /** Verifies the runner's wallet signature over that message and returns
   * the completed session (a real @mysten/seal SessionKey). */
  complete(input: { challengeId: string; signature: string }): Promise<unknown>;
}

interface PendingSession {
  sessionKey: SessionKey;
  personalMessage: Uint8Array;
}

/**
 * Bridges the executor's challenge lifecycle to Seal's SessionKey. The
 * session's signer must be the licensed runner, not the executor: Seal's
 * seal_approve dry-run resolves `ctx.sender()` from whoever signed the
 * session (see docs.sui.io/sui-stack/seal — "TxContext::sender() returns the
 * account that signed with the session key"), and only the runner owns the
 * LicensePass being checked. An executor-signed session can never pass that
 * check for someone else's license.
 *
 * begin() creates an unsigned session tied to the runner's address and
 * returns its personal message for the runner's wallet to sign; complete()
 * verifies that signature and finishes the session. The SessionKey instance
 * itself never leaves this process — only the personal message (outbound)
 * and the wallet signature (inbound) cross the network.
 */
export class SuiSealSessionAuthority implements SealSessionAuthority {
  readonly #suiClient: SuiGrpcClient;
  readonly #packageId: string;
  readonly #ttlMin: number;
  readonly #pending = new Map<string, PendingSession>();

  constructor(input: {
    suiClient: SuiGrpcClient;
    packageId: string;
    ttlMin?: number;
  }) {
    this.#suiClient = input.suiClient;
    this.#packageId = input.packageId;
    this.#ttlMin = input.ttlMin ?? DEFAULT_SESSION_TTL_MIN;
  }

  async begin(input: {
    challengeId: string;
    runnerAddress: string;
  }): Promise<Uint8Array> {
    const address = normalizeSuiAddress(input.runnerAddress);
    let sessionKey: SessionKey;
    try {
      sessionKey = await SessionKey.create({
        address,
        packageId: this.#packageId,
        ttlMin: this.#ttlMin,
        suiClient: this.#suiClient as never,
      });
    } catch (cause) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Seal session could not be created",
        cause,
      );
    }
    const personalMessage = sessionKey.getPersonalMessage();
    this.#pending.set(input.challengeId, { sessionKey, personalMessage });
    return personalMessage;
  }

  async complete(input: {
    challengeId: string;
    signature: string;
  }): Promise<SessionKey> {
    const pending = this.#pending.get(input.challengeId);
    if (pending === undefined) {
      throw new ExecutorError(
        "CHALLENGE_NOT_FOUND",
        "Seal session was not started for this challenge",
      );
    }
    // Single use: whether this succeeds or fails below, the same challenge
    // cannot be used to complete a session twice.
    this.#pending.delete(input.challengeId);

    try {
      await verifyPersonalMessageSignature(
        pending.personalMessage,
        input.signature,
        { address: pending.sessionKey.getAddress() },
      );
    } catch (cause) {
      throw new ExecutorError(
        "INVALID_WALLET_SIGNATURE",
        "Seal session signature is invalid",
        cause,
      );
    }

    try {
      await pending.sessionKey.setPersonalMessageSignature(input.signature);
    } catch (cause) {
      throw new ExecutorError(
        "INVALID_WALLET_SIGNATURE",
        "Seal session signature could not be applied",
        cause,
      );
    }
    return pending.sessionKey;
  }
}
