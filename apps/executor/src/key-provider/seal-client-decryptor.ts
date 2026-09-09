import { SealClient, SessionKey } from "@mysten/seal";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { SealDecryptor } from "./seal-key-provider.js";
import { ExecutorError } from "../errors.js";

const SESSION_KEY_TTL_MIN = 10;

export interface SealServerConfig {
  objectId: string;
  weight: number;
}

/**
 * Real SealDecryptor backed by @mysten/seal's SealClient. The supplied signer
 * must own the LicensePass and match runnerAddress. Until the API transports a
 * runner-authorized Seal session, an executor-only signer fails closed here.
 *
 * The SessionKey is created once and reused across requests until it
 * expires (SESSION_KEY_TTL_MIN), matching Seal's own performance guidance
 * to reuse both the SealClient and the SessionKey instance.
 */
export class SealClientDecryptor implements SealDecryptor {
  readonly #client: SealClient;
  readonly #signer: Ed25519Keypair;
  readonly #suiClient: SuiGrpcClient;
  readonly #packageId: string;
  #sessionKey: SessionKey | undefined;

  constructor(input: {
    suiClient: SuiGrpcClient;
    serverConfigs: SealServerConfig[];
    signer: Ed25519Keypair;
    packageId: string;
  }) {
    this.#suiClient = input.suiClient;
    this.#signer = input.signer;
    this.#packageId = input.packageId;
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

  async #getSessionKey(): Promise<SessionKey> {
    if (this.#sessionKey !== undefined && !this.#sessionKey.isExpired()) {
      return this.#sessionKey;
    }
    this.#sessionKey = await SessionKey.create({
      address: this.#signer.getPublicKey().toSuiAddress(),
      packageId: this.#packageId,
      ttlMin: SESSION_KEY_TTL_MIN,
      signer: this.#signer,
      suiClient: this.#suiClient as unknown as Parameters<
        typeof SessionKey.create
      >[0]["suiClient"],
    });
    return this.#sessionKey;
  }

  async decrypt(input: {
    encryptedDek: Uint8Array;
    approvalTxBytes: Uint8Array;
    runnerAddress: string;
  }): Promise<Uint8Array> {
    const runnerAddress = normalizeSuiAddress(input.runnerAddress);
    if (
      normalizeSuiAddress(this.#signer.getPublicKey().toSuiAddress()) !==
      runnerAddress
    ) {
      throw new ExecutorError(
        "KEY_NOT_FOUND",
        "Seal session signer does not match the licensed runner",
      );
    }

    let sessionKey: SessionKey;
    try {
      sessionKey = await this.#getSessionKey();
    } catch {
      throw new ExecutorError(
        "KEY_NOT_FOUND",
        "Seal session key could not be created",
      );
    }

    try {
      return await this.#client.decrypt({
        data: input.encryptedDek,
        sessionKey,
        txBytes: input.approvalTxBytes,
      });
    } catch {
      // Do not attach Seal server/transport details to this error.
      throw new ExecutorError("KEY_NOT_FOUND", "Seal decrypt failed");
    }
  }
}
