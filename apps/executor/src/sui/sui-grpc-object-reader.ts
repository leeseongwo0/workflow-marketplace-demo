import type { SuiGrpcClient } from "@mysten/sui/grpc";

import type { SuiObjectReader, SuiReadableObject } from "./sui-license-verifier.js";

type SuiObjectClient = Pick<SuiGrpcClient, "getObject">;

/**
 * Adapts the current Sui gRPC client response to the narrow reader consumed by
 * SuiLicenseVerifier. It requests BCS content and does not parse or expose
 * Move fields outside that frozen boundary.
 */
export class SuiGrpcObjectReader implements SuiObjectReader {
  readonly #client: SuiObjectClient;

  constructor(client: SuiObjectClient) {
    this.#client = client;
  }

  async getObject(input: {
    objectId: string;
    include: { content: true };
  }): Promise<{ object: SuiReadableObject }> {
    const response = await this.#client.getObject({
      objectId: input.objectId,
      include: { content: true },
    });
    const object = response.object;
    if (!(object.content instanceof Uint8Array)) {
      throw new Error("Sui object content was not returned");
    }

    return {
      object: {
        objectId: object.objectId,
        type: object.type,
        owner: object.owner,
        content: new Uint8Array(object.content),
      },
    };
  }
}
