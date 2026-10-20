import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { fromBase64, normalizeSuiAddress } from "@mysten/sui/utils";

type ExecuteClient = Pick<SuiGrpcClient, "executeTransaction">;

export interface ExecutedTransaction {
  digest: string;
  /** Objects the transaction created, grouped by their full Move type. */
  created: Map<string, string[]>;
}

/**
 * Submits a wallet-signed transaction and reads back only what we need.
 *
 * dApp Kit's own `signAndExecuteTransaction` cannot be used here. After the
 * wallet returns, it re-parses the wallet's transaction bytes to build its
 * result object, and that parse throws against the wallet we demo with
 * ("Unknown value 3 for enum TransactionExpiration"). It is not wrapped, so the
 * whole call rejects even though the transaction already executed on chain —
 * the user sees a failure for a purchase that actually went through. Signing
 * and submitting separately keeps the wallet round trip and drops the parse.
 */
export async function executeSignedTransaction(input: {
  client: ExecuteClient;
  signed: { bytes: string; signature: string };
}): Promise<ExecutedTransaction> {
  const result = await input.client.executeTransaction({
    transaction: fromBase64(input.signed.bytes),
    signatures: [input.signed.signature],
    include: { effects: true, objectTypes: true },
  });

  const transaction = result.Transaction;
  if (transaction === undefined || !transaction.status.success) {
    throw new Error("거래가 체인에서 실패했습니다.");
  }

  const types = transaction.objectTypes;
  const created = new Map<string, string[]>();
  for (const object of transaction.effects.changedObjects) {
    if (object.idOperation !== "Created") continue;
    const type = types[object.objectId];
    if (type === undefined) continue;
    const ids = created.get(type) ?? [];
    ids.push(normalizeSuiAddress(object.objectId));
    created.set(type, ids);
  }
  return { digest: transaction.digest, created };
}

export function requireCreated(
  executed: ExecutedTransaction,
  type: string,
): string {
  const id = executed.created.get(type)?.[0];
  if (id === undefined) {
    throw new Error("거래가 만든 객체를 찾지 못했습니다.");
  }
  return id;
}
