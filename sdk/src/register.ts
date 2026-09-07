import * as fs from "node:fs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { uploadBytesToWalrus } from "./walrus.js";
import { sealEncrypt } from "./seal.js";

export interface RegisterWorkflowParams {
  suiClient: SuiGrpcClient;
  keypair: Ed25519Keypair;
  agentProfileId: string;
  workflowRootId: string;
  filePath: string;
  version: string;
  priceLicense: bigint;
  priceFork: bigint;
  royaltyBps: bigint;
  parentReleaseId?: string;
  packageId: string;
  marketplaceConfigId: string;
}

const CLOCK_OBJECT_ID = "0x6";

export async function registerWorkflow(
  params: RegisterWorkflowParams,
): Promise<{ releaseId: string; blobId: string; sealKey: Uint8Array }> {
  const { suiClient, keypair, packageId } = params;
  const sender = keypair.getPublicKey().toSuiAddress();

  // ── Phase 1: Create WorkflowRelease on-chain with placeholder blob_id ──
  const tx1 = new Transaction();

  const parentReleaseIdArg = params.parentReleaseId
    ? tx1.pure(
        bcs.option(bcs.Address).serialize(params.parentReleaseId).toBytes(),
      )
    : tx1.pure(bcs.option(bcs.Address).serialize(null).toBytes());

  const [release] = tx1.moveCall({
    target: `${packageId}::agent::create_workflow_release`,
    arguments: [
      tx1.object(params.workflowRootId),
      parentReleaseIdArg,
      tx1.pure.string(params.version),
      tx1.pure.string(""),
      tx1.pure.u64(params.priceLicense),
      tx1.pure.u64(params.priceFork),
      tx1.pure.u64(params.royaltyBps),
      tx1.object(CLOCK_OBJECT_ID),
    ],
  });

  tx1.moveCall({
    target: `${packageId}::marketplace::create_royalty_vault`,
    arguments: [release],
  });

  tx1.transferObjects([release], sender);

  const result1 = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx1,
    include: { effects: true, objectTypes: true },
  });

  const txData1 =
    result1.$kind === "Transaction"
      ? result1.Transaction
      : result1.FailedTransaction;
  const objectTypes1: Record<string, string> = txData1?.objectTypes ?? {};

  let releaseId: string | undefined;
  if (txData1?.effects?.changedObjects) {
    for (const obj of txData1.effects.changedObjects) {
      if (obj.idOperation === "Created") {
        const objType = objectTypes1[obj.objectId] ?? "";
        if (objType.includes("::agent::WorkflowRelease")) {
          releaseId = obj.objectId;
        }
      }
    }
  }

  if (!releaseId) {
    throw new Error("Failed to create WorkflowRelease on-chain");
  }

  // ── Phase 2: Seal encrypt with releaseId as identity ──
  const plaintext = fs.readFileSync(params.filePath);
  const idBytes = new Uint8Array(
    Buffer.from(releaseId.replace(/^0x/, ""), "hex"),
  );
  const { encryptedBytes, key } = await sealEncrypt(
    suiClient,
    packageId,
    idBytes,
    new Uint8Array(plaintext),
  );

  // ── Phase 3: Upload encrypted blob to Walrus ──
  const blobId = await uploadBytesToWalrus(encryptedBytes);

  // ── Phase 4: Update blob_id on-chain ──
  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${packageId}::agent::set_blob_id`,
    arguments: [tx2.object(releaseId), tx2.pure.string(blobId)],
  });

  await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx2,
    include: { effects: true },
  });

  return { releaseId, blobId, sealKey: key };
}
