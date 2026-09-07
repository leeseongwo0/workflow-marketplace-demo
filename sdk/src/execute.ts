import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { downloadFromWalrus } from "./walrus.js";
import { fetchKeyServersViaGrpc } from "./seal.js";
import { KeyStore, SessionKey, EncryptedObject } from "@mysten/seal";
import {
  WorkflowRunner,
  type WorkflowDefinition,
  type StepHandler,
} from "./runner.js";

const CLOCK_OBJECT_ID = "0x6";

export interface ExecuteWorkflowParams {
  suiClient: SuiGrpcClient;
  keypair: Ed25519Keypair;
  packageId: string;
  releaseId: string;
  licensePassId: string;
  blobId: string;
  inputs?: Record<string, unknown>;
  customHandlers?: Record<string, StepHandler>;
}

export interface ExecuteWorkflowResult {
  decryptedData: Uint8Array;
  receiptId: string;
  workflow: WorkflowDefinition;
  output: unknown;
}

export async function executeWorkflow(
  params: ExecuteWorkflowParams,
): Promise<ExecuteWorkflowResult> {
  const {
    suiClient,
    keypair,
    packageId,
    releaseId,
    licensePassId,
    blobId,
    inputs = {},
    customHandlers = {},
  } = params;
  const sender = keypair.getPublicKey().toSuiAddress();

  // ── 1. Download encrypted bundle from Walrus ──
  const encryptedBlob = await downloadFromWalrus(blobId);
  const encryptedBytes = new Uint8Array(encryptedBlob);

  // ── 2. Decrypt via Seal ──
  const encryptedObject = EncryptedObject.parse(encryptedBytes);
  const fullId = new Uint8Array(encryptedObject.id);
  const packageIdBytes = new Uint8Array(
    Buffer.from(packageId.replace(/^0x/, ""), "hex"),
  );

  // Build seal_approve PTB for key-server verification
  const sealTx = new Transaction();
  sealTx.moveCall({
    target: `${packageId}::execution::seal_approve`,
    arguments: [
      sealTx.pure.vector("u8", Array.from(fullId)),
      sealTx.object(licensePassId),
      sealTx.object(releaseId),
      sealTx.object(CLOCK_OBJECT_ID),
    ],
  });
  const txBytes = await sealTx.build({ client: suiClient });

  // Create session key and sign personal message
  const sessionKey = new SessionKey(packageIdBytes, 10);
  const personalMessage = sessionKey.getPersonalMessage();
  const { signature } = await keypair.signPersonalMessage(personalMessage);
  sessionKey.setPersonalMessageSignature(signature);

  // Fetch decryption shares from key servers
  const keyServers = await fetchKeyServersViaGrpc(suiClient);
  const keyStore = new KeyStore();
  await keyStore.fetchKeys({
    keyServers,
    threshold: encryptedObject.threshold,
    packageId: packageIdBytes,
    ids: [fullId],
    txBytes,
    sessionKey,
  });

  // Decrypt (AES-256-GCM)
  const decryptedData = await keyStore.decrypt(encryptedObject);

  // ── 3. Record execution on-chain ──
  const execTx = new Transaction();
  const [receipt] = execTx.moveCall({
    target: `${packageId}::execution::record_execution`,
    arguments: [
      execTx.object(licensePassId),
      execTx.object(releaseId),
      execTx.object(CLOCK_OBJECT_ID),
    ],
  });
  execTx.transferObjects([receipt], sender);

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: execTx,
    include: { effects: true, objectTypes: true },
  });

  const txData =
    result.$kind === "Transaction"
      ? result.Transaction
      : result.FailedTransaction;
  const objectTypes: Record<string, string> = txData?.objectTypes ?? {};

  let receiptId: string | undefined;
  if (txData?.effects?.changedObjects) {
    for (const obj of txData.effects.changedObjects) {
      if (obj.idOperation === "Created") {
        const objType = objectTypes[obj.objectId] ?? "";
        if (objType.includes("::execution::ExecutionReceipt")) {
          receiptId = obj.objectId;
        }
      }
    }
  }

  if (!receiptId) {
    throw new Error("Failed to create ExecutionReceipt on-chain");
  }

  // ── 4. Parse and execute workflow ──
  const workflow = WorkflowRunner.parse(decryptedData);
  const runner = new WorkflowRunner();
  for (const [action, handler] of Object.entries(customHandlers)) {
    runner.register(action, handler);
  }
  const output = await runner.run(workflow, inputs);

  return { decryptedData, receiptId, workflow, output };
}
