import { SealClient, SessionKey } from "@mysten/seal";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { SealDecryptor } from "./seal-key-provider.js";
import { ExecutorError } from "../errors.js";

export interface SealServerConfig {
  objectId: string;
  weight: number;
}

/**
 * Real SealDecryptor backed by @mysten/seal's SealClient.
 *
 * This class does not create or hold its own session. It must be given a
 * SessionKey already completed for the licensed runner's own address (see
 * SuiSealSessionAuthority) — Seal's seal_approve dry-run resolves
 * `ctx.sender()` from whoever signed the session, and only the runner owns
 * the LicensePass being checked, so a session signed by anyone else
 * (including the executor's own key) can never pass that check.
 */
export class SealClientDecryptor implements SealDecryptor {
  readonly #client: SealClient;

  constructor(input: {
    suiClient: SuiGrpcClient;
    serverConfigs: SealServerConfig[];
  }) {
    this.#client = new SealClient({
      // The seal SealCompatibleClient shape is structurally satisfied by
      // SuiGrpcClient; cast at this single boundary rather than threading a
      // second client type through the rest of the executor.
      suiClient: input.suiClient as unknown as ConstructorParameters<
        typeof SealClient
      >[0]["suiClient"],
      serverConfigs: input.serverConfigs,
      verifyKeyServers: true,
    });
  }

  async decrypt(input: {
    encryptedDek: Uint8Array;
    approvalTxBytes: Uint8Array;
    runnerAddress: string;
    sealSession: unknown;
  }): Promise<Uint8Array> {
    if (!(input.sealSession instanceof SessionKey)) {
      throw new ExecutorError(
        "KEY_NOT_FOUND",
        "Seal session was not provided",
      );
    }
    if (input.sealSession.isExpired()) {
      throw new ExecutorError("KEY_NOT_FOUND", "Seal session has expired");
    }
    if (
      normalizeSuiAddress(input.sealSession.getAddress()) !==
      normalizeSuiAddress(input.runnerAddress)
    ) {
      throw new ExecutorError(
        "KEY_NOT_FOUND",
        "Seal session does not match the licensed runner",
      );
    }

    try {
      return await this.#client.decrypt({
        data: input.encryptedDek,
        sessionKey: input.sealSession,
        txBytes: input.approvalTxBytes,
      });
    } catch {
      // Do not attach Seal transport details to this error.
      throw new ExecutorError("KEY_NOT_FOUND", "Seal decrypt failed");
    }
  }
}
