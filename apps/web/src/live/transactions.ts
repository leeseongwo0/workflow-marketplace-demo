import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const CLOCK_OBJECT_ID = "0x6";
const MAX_U64 = (1n << 64n) - 1n;

/**
 * Buys a LicensePass for a non-fork release.
 *
 * `remaining_runs` and `expires_at` are left as None: the contract only caps a
 * licence when the buyer asks for one, and the demo sells uncapped licences.
 *
 * The vault is required even for a plain purchase — proceeds are routed through
 * the seller vault after the platform fee is split off.
 */
export function buildPurchaseLicenseTransaction(input: {
  packageId: string;
  marketplaceConfigId: string;
  releaseId: string;
  vaultId: string;
  priceMist: bigint;
}): Transaction {
  if (input.priceMist <= 0n || input.priceMist > MAX_U64) {
    throw new Error("License price must fit a positive u64");
  }
  const transaction = new Transaction();
  const [payment] = transaction.splitCoins(transaction.gas, [
    transaction.pure.u64(input.priceMist),
  ]);
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::marketplace::buy_license`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.marketplaceConfigId)),
      transaction.object(normalizeSuiAddress(input.releaseId)),
      transaction.object(normalizeSuiAddress(input.vaultId)),
      payment,
      transaction.pure.option("u64", null),
      transaction.pure.option("u64", null),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });
  return transaction;
}

/**
 * Opens an ExecutionRequest, the object `record_execution` consumes.
 *
 * It has to be its own transaction: the Move call returns nothing and the
 * request is handed out by the module itself, so its id only becomes available
 * from the transaction effects — a PTB cannot chain it into the record call.
 */
export function buildCreateExecutionRequestTransaction(input: {
  packageId: string;
  licenseId: string;
  releaseId: string;
}): Transaction {
  const transaction = new Transaction();
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::execution::create_execution_request`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.licenseId)),
      transaction.object(normalizeSuiAddress(input.releaseId)),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });
  return transaction;
}

/**
 * Records an execution on chain against an open request.
 *
 * The receipt is returned by the Move call rather than transferred internally,
 * so the caller has to take ownership of it or the transaction fails to build.
 */
export function buildRecordReceiptTransaction(input: {
  packageId: string;
  licenseId: string;
  releaseId: string;
  requestId: string;
  recipient: string;
}): Transaction {
  const transaction = new Transaction();
  const receipt = transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::execution::record_execution`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.licenseId)),
      transaction.object(normalizeSuiAddress(input.releaseId)),
      transaction.object(normalizeSuiAddress(input.requestId)),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });
  transaction.transferObjects([receipt], normalizeSuiAddress(input.recipient));
  return transaction;
}
