import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

const CLOCK_OBJECT_ID = "0x6";

export interface BuyLicenseParams {
  suiClient: SuiGrpcClient;
  keypair: Ed25519Keypair;
  packageId: string;
  marketplaceConfigId: string;
  releaseId: string;
  vaultId: string;
  price: bigint;
  remainingRuns?: bigint;
  expiresAt?: bigint;
}

export async function buyLicense(
  params: BuyLicenseParams,
): Promise<string> {
  const {
    suiClient,
    keypair,
    packageId,
    marketplaceConfigId,
    releaseId,
    vaultId,
    price,
    remainingRuns,
    expiresAt,
  } = params;

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [price]);

  tx.moveCall({
    target: `${packageId}::marketplace::buy_license`,
    arguments: [
      tx.object(marketplaceConfigId),
      tx.object(releaseId),
      tx.object(vaultId),
      coin,
      tx.pure(
        bcs
          .option(bcs.u64())
          .serialize(remainingRuns ?? null)
          .toBytes(),
      ),
      tx.pure(
        bcs
          .option(bcs.u64())
          .serialize(expiresAt ?? null)
          .toBytes(),
      ),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    include: { effects: true, objectTypes: true },
  });

  const txData =
    result.$kind === "Transaction"
      ? result.Transaction
      : result.FailedTransaction;
  const objectTypes: Record<string, string> = txData?.objectTypes ?? {};

  let licensePassId: string | undefined;
  if (txData?.effects?.changedObjects) {
    for (const obj of txData.effects.changedObjects) {
      if (obj.idOperation === "Created") {
        const objType = objectTypes[obj.objectId] ?? "";
        if (objType.includes("::license::LicensePass")) {
          licensePassId = obj.objectId;
        }
      }
    }
  }

  if (!licensePassId) {
    throw new Error("Failed to purchase LicensePass");
  }

  return licensePassId;
}
