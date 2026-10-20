import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { z } from "zod";

import {
  ExecutorApiError,
  ExecutorClient,
  verifyExecutionContent,
  verifyExecutionReceipt,
} from "../../web/src/live/executor-client.js";
import {
  findOwnedLicense,
  findRecordedReceipt,
  loadMarketplace,
  loadRelease,
  loadRoot,
} from "../../web/src/live/sui-objects.js";
import {
  buildCreateExecutionRequestTransaction,
  buildPurchaseLicenseTransaction,
  buildRecordReceiptTransaction,
} from "../../web/src/live/transactions.js";

/*
 * Rewritten for package 0x388adbc4… Three checks this script used to make are
 * gone because the contract behind them is gone, not because they stopped
 * mattering:
 *
 * - duplicate purchase (abort 4): the new package keeps no buyer registry, so
 *   a second purchase from the same address succeeds and mints a second pass.
 *   Confirmed by simulating buy_license from an address that already holds one.
 * - tampered receipt signature (abort 7): record_execution no longer takes a
 *   signature. The chain records that an execution happened; it does not check
 *   who signed the result.
 * - receipt nonce replay (abort 8): there is no nonce table to replay against.
 *
 * What the chain still enforces, and this script still exercises end to end:
 * a licence must exist to execute, and recording consumes an ExecutionRequest
 * opened by the licence holder.
 */

// Sui gRPC returns the base58-encoded 32-byte genesis checkpoint digest.
// Its four-byte CLI/Published.toml short identifier is 4c78adac.
const SUI_TESTNET_CHAIN_IDENTIFIER =
  "69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD";

const httpsBaseUrl = z.string().trim().min(1).refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}, "must be an HTTPS URL without credentials, query, or hash");

const localExecutorUrl = z.string().trim().min(1).refine((value) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}, "must be an exact loopback HTTP(S) URL");

const objectId = z.string().regex(/^0x[0-9a-f]{64}$/u);

const envSchema = z.strictObject({
  SUI_NETWORK: z.literal("testnet"),
  SUI_GRPC_URL: httpsBaseUrl,
  SUI_PACKAGE_ID: objectId,
  MARKETPLACE_ID: objectId,
  WORKFLOW_ROOT_ID: objectId,
  WORKFLOW_RELEASE_ID: objectId,
  ROYALTY_VAULT_ID: objectId,
  SUI_DEPLOYER_PRIVATE_KEY: z.string().min(1),
  VITE_EXECUTOR_BASE_URL: localExecutorUrl,
});

function parseEnvironment(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    SUI_NETWORK: process.env["SUI_NETWORK"],
    SUI_GRPC_URL: process.env["SUI_GRPC_URL"],
    SUI_PACKAGE_ID: process.env["SUI_PACKAGE_ID"],
    MARKETPLACE_ID: process.env["MARKETPLACE_ID"],
    WORKFLOW_ROOT_ID: process.env["WORKFLOW_ROOT_ID"],
    WORKFLOW_RELEASE_ID: process.env["WORKFLOW_RELEASE_ID"],
    ROYALTY_VAULT_ID: process.env["ROYALTY_VAULT_ID"],
    SUI_DEPLOYER_PRIVATE_KEY: process.env["SUI_DEPLOYER_PRIVATE_KEY"],
    VITE_EXECUTOR_BASE_URL: process.env["VITE_EXECUTOR_BASE_URL"],
  });
  if (!result.success) throw new Error("Invalid Testnet E2E environment configuration");
  return result.data;
}

function decodeCanonicalBase64(value: string): Uint8Array {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw new Error("Noncanonical base64");
  return new Uint8Array(bytes);
}

type ExecutedTransaction = {
  $kind: string;
  Transaction?: {
    digest: string;
    status: { success: boolean };
    effects: { changedObjects: Array<{ objectId: string; idOperation: string }> };
    objectTypes: Record<string, string>;
  };
};

function requireSuccess(result: ExecutedTransaction, label: string): NonNullable<
  ExecutedTransaction["Transaction"]
> {
  const transaction = result.Transaction;
  if (result.$kind !== "Transaction" || transaction === undefined || !transaction.status.success) {
    throw new Error(label);
  }
  return transaction;
}

/** The one object of `type` this transaction created. */
function createdObject(
  transaction: NonNullable<ExecutedTransaction["Transaction"]>,
  type: string,
): string {
  const created = transaction.effects.changedObjects.filter(
    (object) =>
      object.idOperation === "Created" && transaction.objectTypes[object.objectId] === type,
  );
  const first = created[0];
  if (first === undefined) throw new Error(`Transaction created no ${type}`);
  return first.objectId;
}

async function retryExact<T>(lookup: () => Promise<T | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = await lookup();
    if (value !== undefined) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Expected Testnet object was not indexed in time");
}

async function main(): Promise<void> {
  const env = parseEnvironment();
  const decoded = decodeSuiPrivateKey(env.SUI_DEPLOYER_PRIVATE_KEY);
  if (decoded.scheme !== "ED25519") throw new Error("Testnet deployer must be Ed25519");
  const signer = Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const owner = signer.toSuiAddress();
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: env.SUI_GRPC_URL });
  const { chainIdentifier } = await client.getChainIdentifier();
  if (chainIdentifier !== SUI_TESTNET_CHAIN_IDENTIFIER) {
    throw new Error("Configured Sui RPC is not Sui Testnet");
  }
  const executor = new ExecutorClient({ baseUrl: env.VITE_EXECUTOR_BASE_URL });

  const marketplace = await loadMarketplace({
    client,
    packageId: env.SUI_PACKAGE_ID,
    marketplaceId: env.MARKETPLACE_ID,
  });
  const release = await loadRelease({
    client,
    packageId: env.SUI_PACKAGE_ID,
    releaseId: env.WORKFLOW_RELEASE_ID,
  });
  // Title and blurb live on the root now, so the root is what proves the
  // configured release belongs to the workflow this script claims to test.
  const root = await loadRoot({
    client,
    packageId: env.SUI_PACKAGE_ID,
    rootId: env.WORKFLOW_ROOT_ID,
  });
  if (!release.isListed) throw new Error("WorkflowRelease is not listed");
  if (release.rootId !== root.id) throw new Error("WorkflowRelease belongs to another root");

  const fakeLicenseId = `0x${"f".repeat(64)}`;
  const unlicensedChallenge = await executor.createChallenge({
    runnerAddress: owner,
    releaseId: release.id,
    licenseId: fakeLicenseId,
    query: "Sui 블록체인",
  });
  const unlicensedSignature = await signer.signPersonalMessage(
    decodeCanonicalBase64(unlicensedChallenge.personalMessage.bytesBase64),
  );
  let unlicensedCode: string | undefined;
  try {
    await executor.execute({
      challengeId: unlicensedChallenge.challengeId,
      walletSignature: unlicensedSignature.signature,
    });
  } catch (cause) {
    if (cause instanceof ExecutorApiError) unlicensedCode = cause.code;
  }
  if (unlicensedCode !== "LICENSE_NOT_FOUND") {
    throw new Error("Unlicensed execution did not fail with LICENSE_NOT_FOUND");
  }

  let license = await findOwnedLicense({
    client,
    packageId: env.SUI_PACKAGE_ID,
    owner,
    releaseId: release.id,
  });
  let purchaseDigest: string | undefined;
  if (license === undefined) {
    const purchase = await client.signAndExecuteTransaction({
      signer,
      transaction: buildPurchaseLicenseTransaction({
        packageId: env.SUI_PACKAGE_ID,
        marketplaceConfigId: marketplace.id,
        releaseId: release.id,
        vaultId: env.ROYALTY_VAULT_ID,
        priceMist: release.priceLicense,
      }),
      include: { effects: true, objectTypes: true },
    });
    purchaseDigest = requireSuccess(
      purchase as ExecutedTransaction,
      "License purchase failed",
    ).digest;
    license = await retryExact(() => findOwnedLicense({
      client,
      packageId: env.SUI_PACKAGE_ID,
      owner,
      releaseId: release.id,
    }));
  }

  const submittedQuery = "Sui 블록체인";
  const challenge = await executor.createChallenge({
    runnerAddress: owner,
    releaseId: release.id,
    licenseId: license.id,
    query: submittedQuery,
  });
  const walletSignature = await signer.signPersonalMessage(
    decodeCanonicalBase64(challenge.personalMessage.bytesBase64),
  );
  const execution = await executor.execute({
    challengeId: challenge.challengeId,
    walletSignature: walletSignature.signature,
  });
  await verifyExecutionContent({ response: execution, submittedQuery });
  if (
    execution.workflow.releaseId !== release.id ||
    execution.workflow.version !== release.version
  ) {
    throw new Error("Execution result does not belong to this release");
  }
  // Self-consistency only: the package no longer publishes an executor key to
  // check this signature against.
  const verifiedReceipt = await verifyExecutionReceipt({
    receipt: execution.receipt,
    expectedReleaseId: release.id,
    expectedLicenseId: license.id,
    expectedRunner: owner,
  });

  let replayCode: string | undefined;
  try {
    await executor.execute({
      challengeId: challenge.challengeId,
      walletSignature: walletSignature.signature,
    });
  } catch (cause) {
    if (cause instanceof ExecutorApiError) replayCode = cause.code;
  }
  if (replayCode !== "CHALLENGE_ALREADY_USED") {
    throw new Error("Challenge replay was not rejected");
  }

  // findRecordedReceipt only matches on release, so a rerun against an already
  // recorded release skips straight to reporting the existing receipt.
  let receipt = await findRecordedReceipt({
    client,
    packageId: env.SUI_PACKAGE_ID,
    owner,
    releaseId: release.id,
  });
  let requestId: string | undefined;
  let receiptDigest: string | undefined;
  if (receipt === undefined) {
    // record_execution consumes an ExecutionRequest, and the call that opens
    // one hands it out itself rather than returning it, so it cannot be
    // chained into the same programmable transaction.
    const opened = await client.signAndExecuteTransaction({
      signer,
      transaction: buildCreateExecutionRequestTransaction({
        packageId: env.SUI_PACKAGE_ID,
        licenseId: license.id,
        releaseId: release.id,
      }),
      include: { effects: true, objectTypes: true },
    });
    requestId = createdObject(
      requireSuccess(opened as ExecutedTransaction, "Opening the execution request failed"),
      `${env.SUI_PACKAGE_ID}::execution::ExecutionRequest`,
    );

    const recorded = await client.signAndExecuteTransaction({
      signer,
      transaction: buildRecordReceiptTransaction({
        packageId: env.SUI_PACKAGE_ID,
        licenseId: license.id,
        releaseId: release.id,
        requestId,
        recipient: owner,
      }),
      include: { effects: true, objectTypes: true },
    });
    receiptDigest = requireSuccess(
      recorded as ExecutedTransaction,
      "Recording the execution failed",
    ).digest;
    receipt = await retryExact(() => findRecordedReceipt({
      client,
      packageId: env.SUI_PACKAGE_ID,
      owner,
      releaseId: release.id,
    }));
  }

  process.stdout.write(`${JSON.stringify({
    network: "testnet",
    owner,
    packageId: env.SUI_PACKAGE_ID,
    marketplaceConfigId: marketplace.id,
    rootId: root.id,
    rootName: root.name,
    releaseId: release.id,
    licenseId: license.id,
    purchaseDigest: purchaseDigest ?? "already-owned",
    unlicensedCode,
    challengeReplayCode: replayCode,
    resultCount: execution.result.items.length,
    inputHash: execution.input.inputHash,
    outputHash: execution.result.outputHash,
    executionRequestId: requestId ?? "already-recorded",
    receiptId: receipt.id,
    receiptDigest: receiptDigest ?? "already-recorded",
    executorKeyFingerprint: verifiedReceipt.executorKeyFingerprint,
    onChainReceiptVerifiesSignature: false,
    trace: execution.trace,
  }, null, 2)}\n`);
}

main().catch((cause: unknown) => {
  const safeMessages = new Set([
    "Configured Sui RPC is not Sui Testnet",
    "Invalid Testnet E2E environment configuration",
    "Testnet deployer must be Ed25519",
  ]);
  const message = cause instanceof Error && safeMessages.has(cause.message)
    ? cause.message
    : "Testnet E2E failed safely; inspect local service and Testnet state";
  process.stderr.write(`Testnet E2E failed: ${message}\n`);
  process.exitCode = 1;
});
