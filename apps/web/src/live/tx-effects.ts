import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";

type WaitClient = Pick<SuiGrpcClient, "waitForTransaction">;

/**
 * Reads back the objects a transaction created, grouped by type.
 *
 * Several of the new package's entry points hand the object out themselves
 * instead of returning it, so the id is only knowable from the effects. The
 * type map is what disambiguates when one transaction creates several objects
 * — picking "the first created object" would be a coin flip.
 */
export async function findCreatedObjects(input: {
  client: WaitClient;
  digest: string;
}): Promise<Map<string, string[]>> {
  const result = await input.client.waitForTransaction({
    digest: input.digest,
    include: { effects: true, objectTypes: true },
  });
  const transaction = result.Transaction;
  if (transaction === undefined || !transaction.status.success) {
    throw new Error("거래가 체인에서 실패했습니다.");
  }
  const types = transaction.objectTypes;
  const byType = new Map<string, string[]>();
  for (const object of transaction.effects.changedObjects) {
    if (object.idOperation !== "Created") continue;
    const type = types[object.objectId];
    if (type === undefined) continue;
    const ids = byType.get(type) ?? [];
    ids.push(normalizeSuiAddress(object.objectId));
    byType.set(type, ids);
  }
  return byType;
}

export function requireCreated(created: Map<string, string[]>, type: string): string {
  const id = created.get(type)?.[0];
  if (id === undefined) {
    throw new Error("거래가 만든 객체를 찾지 못했습니다.");
  }
  return id;
}

export async function findCreatedObject(input: {
  client: WaitClient;
  digest: string;
  type: string;
}): Promise<string> {
  return requireCreated(await findCreatedObjects(input), input.type);
}
