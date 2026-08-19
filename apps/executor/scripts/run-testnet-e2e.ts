import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";

import {
  ExecutorApiError,
  ExecutorClient,
  verifyExecutionContent,
} from "../../web/src/live/executor-client.js";
import {
  findOwnedLicense,
  findRecordedReceipt,
  loadMarketplace,
  loadRelease,
} from "../../web/src/live/sui-objects.js";
import {
  buildPurchaseLicenseTransaction,
  buildRecordReceiptTransaction,
  verifyExecutionReceipt,
  type VerifiedReceipt,
} from "../../web/src/live/transactions.js";

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

const envSchema = z.strictObject({
  SUI_NETWORK: z.literal("testnet"),
  SUI_GRPC_URL: httpsBaseUrl,
  SUI_PACKAGE_ID: z.string().regex(/^0x[0-9a-f]{64}$/u),
  MARKETPLACE_ID: z.string().regex(/^0x[0-9a-f]{64}$/u),
  WORKFLOW_RELEASE_ID: z.string().regex(/^0x[0-9a-f]{64}$/u),
  SUI_DEPLOYER_PRIVATE_KEY: z.string().min(1),
  VITE_EXECUTOR_BASE_URL: localExecutorUrl,
});

function parseEnvironment(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    SUI_NETWORK: process.env["SUI_NETWORK"],
    SUI_GRPC_URL: process.env["SUI_GRPC_URL"],
    SUI_PACKAGE_ID: process.env["SUI_PACKAGE_ID"],
    MARKETPLACE_ID: process.env["MARKETPLACE_ID"],
    WORKFLOW_RELEASE_ID: process.env["WORKFLOW_RELEASE_ID"],
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

function hashBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error("Invalid hash");
  return Uint8Array.from(value.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function rawRecordTransaction(input: {
  packageId: string;
  marketplaceId: string;
  licenseId: string;
  receipt: VerifiedReceipt;
  signature: Uint8Array;
}): Transaction {
  const payload = input.receipt.payload;
  const transaction = new Transaction();
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::marketplace::record_execution`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.marketplaceId)),
      transaction.object(normalizeSuiAddress(input.licenseId)),
      transaction.pure.address(payload.releaseId),
      transaction.pure.address(payload.runner),
      transaction.pure.vector("u8", hashBytes(payload.inputHash)),
      transaction.pure.vector("u8", hashBytes(payload.outputHash)),
      transaction.pure.u64(payload.executedAtMs),
      transaction.pure.vector("u8", hashBytes(payload.nonceHash)),
      transaction.pure.vector("u8", input.signature),
    ],
  });
  return transaction;
}

async function retryExact<T>(lookup: () => Promise<T | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = await lookup();
    if (value !== undefined) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Expected Testnet object was not indexed in time");
}

async function expectMoveAbort(
  action: () => Promise<unknown>,
  abortCode: number,
): Promise<string> {
  const marker = `abort code: ${abortCode}`;
  try {
    const result = await action();
    if (
      typeof result === "object" &&
      result !== null &&
      "$kind" in result &&
      result.$kind === "FailedTransaction" &&
      JSON.stringify(result).includes(marker)
    ) {
      const failed = result as { FailedTransaction?: { digest?: string } };
      return failed.FailedTransaction?.digest ?? "failed-transaction";
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes(marker)) {
      return "resolution-rejected";
    }
    throw cause;
  }
  throw new Error(`Expected Move abort ${abortCode}`);
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
  if (!release.active) throw new Error("WorkflowRelease is inactive");

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
        marketplaceId: marketplace.id,
        releaseId: release.id,
        priceMist: release.priceMist,
      }),
      include: { effects: true },
    });
    if (purchase.$kind !== "Transaction" || !purchase.Transaction.status.success) {
      throw new Error("License purchase failed");
    }
    purchaseDigest = purchase.Transaction.digest;
    license = await retryExact(() => findOwnedLicense({
      client,
      packageId: env.SUI_PACKAGE_ID,
      owner,
      releaseId: release.id,
    }));
  }

  const duplicatePurchaseFailure = await expectMoveAbort(
    () => {
      const transaction = buildPurchaseLicenseTransaction({
        packageId: env.SUI_PACKAGE_ID,
        marketplaceId: marketplace.id,
        releaseId: release.id,
        priceMist: release.priceMist,
      });
      transaction.setGasBudget(20_000_000);
      return client.signAndExecuteTransaction({
        signer,
        transaction,
        include: { effects: true },
      });
    },
    4,
  );

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
  const verifiedReceipt = await verifyExecutionReceipt({
    receipt: execution.receipt,
    expectedReleaseId: release.id,
    expectedLicenseId: license.id,
    expectedRunner: owner,
    expectedExecutorPublicKey: marketplace.executorPublicKey,
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

  const tamperedSignature = verifiedReceipt.signature.slice();
  tamperedSignature[0] = (tamperedSignature[0] ?? 0) ^ 1;
  const tamperedReceiptFailure = await expectMoveAbort(
    () => {
      const transaction = rawRecordTransaction({
        packageId: env.SUI_PACKAGE_ID,
        marketplaceId: marketplace.id,
        licenseId: license.id,
        receipt: verifiedReceipt,
        signature: tamperedSignature,
      });
      transaction.setGasBudget(20_000_000);
      return client.signAndExecuteTransaction({
        signer,
        transaction,
        include: { effects: true },
      });
    },
    7,
  );

  let receipt = await findRecordedReceipt({
    client,
    packageId: env.SUI_PACKAGE_ID,
    marketplaceId: marketplace.id,
    owner,
    releaseId: release.id,
    licenseId: license.id,
    nonceHash: verifiedReceipt.payload.nonceHash,
  });
  let receiptDigest: string | undefined;
  if (receipt === undefined) {
    const recorded = await client.signAndExecuteTransaction({
      signer,
      transaction: buildRecordReceiptTransaction({
        packageId: env.SUI_PACKAGE_ID,
        marketplaceId: marketplace.id,
        licenseId: license.id,
        receipt: verifiedReceipt,
      }),
      include: { effects: true },
    });
    if (recorded.$kind !== "Transaction" || !recorded.Transaction.status.success) {
      throw new Error("Valid receipt recording failed");
    }
    receiptDigest = recorded.Transaction.digest;
    receipt = await retryExact(() => findRecordedReceipt({
      client,
      packageId: env.SUI_PACKAGE_ID,
      marketplaceId: marketplace.id,
      owner,
      releaseId: release.id,
      licenseId: license.id,
      nonceHash: verifiedReceipt.payload.nonceHash,
    }));
  }

  const nonceReplayFailure = await expectMoveAbort(
    () => {
      const transaction = buildRecordReceiptTransaction({
        packageId: env.SUI_PACKAGE_ID,
        marketplaceId: marketplace.id,
        licenseId: license.id,
        receipt: verifiedReceipt,
      });
      transaction.setGasBudget(20_000_000);
      return client.signAndExecuteTransaction({
        signer,
        transaction,
        include: { effects: true },
      });
    },
    8,
  );

  process.stdout.write(`${JSON.stringify({
    network: "testnet",
    owner,
    marketplaceId: marketplace.id,
    releaseId: release.id,
    licenseId: license.id,
    purchaseDigest: purchaseDigest ?? "already-owned",
    duplicatePurchaseRejected: true,
    duplicatePurchaseFailure,
    unlicensedCode,
    challengeReplayCode: replayCode,
    resultCount: execution.result.items.length,
    inputHash: execution.input.inputHash,
    outputHash: execution.result.outputHash,
    receiptId: receipt.id,
    receiptDigest: receiptDigest ?? "already-recorded",
    tamperedReceiptRejected: true,
    tamperedReceiptFailure,
    nonceReplayRejected: true,
    nonceReplayFailure,
    executorKeyFingerprint: verifiedReceipt.executorKeyFingerprint,
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
