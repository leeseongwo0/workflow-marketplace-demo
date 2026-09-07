import { SuiGrpcClient } from "@mysten/sui/grpc";
import { bcs } from "@mysten/sui/bcs";
import { fromHex } from "@mysten/bcs";
import {
  encrypt,
  getAllowlistedKeyServers,
  AesGcm256,
  EncryptedObject,
} from "@mysten/seal";
import type { KeyServer } from "@mysten/seal";

const KeyServerMove = bcs.struct("KeyServer", {
  id: bcs.Address,
  name: bcs.string(),
  url: bcs.string(),
  key_type: bcs.u8(),
  pk: bcs.vector(bcs.u8()),
});

async function fetchKeyServersViaGrpc(
  client: SuiGrpcClient,
): Promise<KeyServer[]> {
  const objectIds = getAllowlistedKeyServers("testnet");
  return Promise.all(
    objectIds.map(async (objectId) => {
      const hexId =
        "0x" +
        Array.from(objectId)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const res = await client.getObject({
        objectId: hexId,
        include: { content: true },
      });
      const content = res.object?.content;
      if (!content) throw new Error(`KeyServer ${hexId} not found`);
      const parsed = KeyServerMove.parse(new Uint8Array(content));
      return {
        objectId,
        name: parsed.name,
        url: parsed.url,
        keyType: 0 as const,
        pk: new Uint8Array(parsed.pk),
      };
    }),
  );
}

export async function sealEncrypt(
  client: SuiGrpcClient,
  packageId: string,
  releaseId: Uint8Array,
  plaintext: Uint8Array,
): Promise<{ encryptedBytes: Uint8Array; key: Uint8Array }> {
  const keyServers = await fetchKeyServersViaGrpc(client);

  const packageIdBytes = fromHex(packageId.replace(/^0x/, ""));

  const { encryptedObject, key } = await encrypt({
    keyServers,
    threshold: 2,
    packageId: new Uint8Array(packageIdBytes),
    id: releaseId,
    encryptionInput: new AesGcm256(plaintext, new Uint8Array()),
  });

  return { encryptedBytes: encryptedObject, key };
}

export function parseSealEncryptedObject(
  bytes: Uint8Array,
): typeof EncryptedObject.$inferType {
  return EncryptedObject.parse(bytes);
}

export { EncryptedObject, fetchKeyServersViaGrpc };
