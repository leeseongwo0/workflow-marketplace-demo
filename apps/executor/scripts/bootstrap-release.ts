import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, type TransactionResult } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

import {
  WalrusPublisher,
  WalrusBlobStore,
  prepareAndUploadEncryptedWorkflow,
  parsePhase3Env,
  storeLocalExecutionBindings,
} from "../src/index.js";

const CLOCK_OBJECT_ID = "0x6";
const INTER_TX_DELAY_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const VERSION = "1.0.0";
const PRICE_LICENSE_MIST = 50_000_000n;
const PRICE_FORK_MIST = 100_000_000n;
const ROYALTY_BPS = 2_000n;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

interface TxEffectsResult {
  $kind: string;
  Transaction?: {
    digest?: string;
    effects?: { changedObjects?: Array<{ objectId: string; idOperation: string }> };
    objectTypes?: Record<string, string>;
  };
  FailedTransaction?: unknown;
}

function findCreatedObjectId(result: TxEffectsResult, typeSuffix: string): string {
  if (result.$kind !== "Transaction") {
    throw new Error(`Transaction failed: ${JSON.stringify(result.FailedTransaction)}`);
  }
  const tx = result.Transaction;
  const objectTypes = tx?.objectTypes ?? {};
  for (const obj of tx?.effects?.changedObjects ?? []) {
    if (
      obj.idOperation === "Created" &&
      (objectTypes[obj.objectId] ?? "").includes(typeSuffix)
    ) {
      return obj.objectId;
    }
  }
  throw new Error(`Could not find a created object matching "${typeSuffix}"`);
}

async function main(): Promise<void> {
  const packageId = requireEnv("SUI_PACKAGE_ID");
  const keypair = Ed25519Keypair.fromSecretKey(requireEnv("SUI_DEPLOYER_PRIVATE_KEY"));
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: process.env["SUI_GRPC_URL"] ?? "https://fullnode.testnet.sui.io:443",
  });

  console.log(`Sender:  ${sender}`);
  console.log(`Package: ${packageId}\n`);

  // ── Step 1: AgentProfile (owned by sender; not buyer-facing) ──
  const tx1 = new Transaction();
  const [profile] = tx1.moveCall({
    target: `${packageId}::agent::create_agent_profile`,
    arguments: [tx1.pure.string("BlockBlockDemoAgent"), tx1.object(CLOCK_OBJECT_ID)],
  });
  tx1.transferObjects([profile as TransactionResult], sender);
  const res1 = (await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx1,
    include: { effects: true, objectTypes: true },
  })) as unknown as TxEffectsResult;
  const agentProfileId = findCreatedObjectId(res1, "::agent::AgentProfile");
  console.log(`AgentProfile created: ${agentProfileId}`);
  await sleep(INTER_TX_DELAY_MS);

  // ── Step 2: WorkflowRoot (owned by sender; not buyer-facing) ──
  const tx2 = new Transaction();
  const [root] = tx2.moveCall({
    target: `${packageId}::agent::create_workflow_root`,
    arguments: [
      tx2.object(agentProfileId),
      tx2.pure.string("Google News RSS"),
      tx2.pure.string(
        "Fetches and summarizes recent Google News RSS results for a query",
      ),
      tx2.object(CLOCK_OBJECT_ID),
    ],
  });
  tx2.transferObjects([root as TransactionResult], sender);
  const res2 = (await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx2,
    include: { effects: true, objectTypes: true },
  })) as unknown as TxEffectsResult;
  const workflowRootId = findCreatedObjectId(res2, "::agent::WorkflowRoot");
  console.log(`WorkflowRoot created: ${workflowRootId}`);
  await sleep(INTER_TX_DELAY_MS);

  // ── Step 3: WorkflowRelease (must be SHARED — buyers need to reference
  // it, and Sui only allows referencing an owned object from its owner's
  // own transactions) + RoyaltyVault (create_royalty_vault already shares
  // it internally). current create_workflow_release takes 9 args, not the
  // 7-arg shape older demo scripts in this repo still use.
  const tx3 = new Transaction();
  const parentReleaseIdArg = tx3.pure(bcs.option(bcs.Address).serialize(null).toBytes());
  const maxRunsArg = tx3.pure(bcs.option(bcs.u64()).serialize(null).toBytes());
  const maxDurationMsArg = tx3.pure(bcs.option(bcs.u64()).serialize(null).toBytes());
  const [release] = tx3.moveCall({
    target: `${packageId}::agent::create_workflow_release`,
    arguments: [
      tx3.object(workflowRootId),
      parentReleaseIdArg,
      tx3.pure.string(VERSION),
      tx3.pure.string(""), // placeholder blob_id, set for real below
      tx3.pure.u64(PRICE_LICENSE_MIST),
      tx3.pure.u64(PRICE_FORK_MIST),
      tx3.pure.u64(ROYALTY_BPS),
      maxRunsArg,
      maxDurationMsArg,
      tx3.object(CLOCK_OBJECT_ID),
    ],
  });
  tx3.moveCall({
    target: `${packageId}::marketplace::create_royalty_vault`,
    arguments: [release as TransactionResult],
  });
  tx3.moveCall({
    target: "0x2::transfer::public_share_object",
    typeArguments: [`${packageId}::agent::WorkflowRelease`],
    arguments: [release as TransactionResult],
  });
  const res3 = (await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx3,
    include: { effects: true, objectTypes: true },
  })) as unknown as TxEffectsResult;
  const releaseId = findCreatedObjectId(res3, "::agent::WorkflowRelease");
  const vaultId = findCreatedObjectId(res3, "::marketplace::RoyaltyVault");
  console.log(`WorkflowRelease created (shared): ${releaseId}`);
  console.log(`RoyaltyVault created (shared):    ${vaultId}`);
  await sleep(INTER_TX_DELAY_MS);

  // ── Step 4: encrypt + upload the workflow bundle using the local-demo
  // scheme (matches LocalDemoKeyProvider, currently wired in start.ts —
  // NOT real Seal encryption, since M1/Seal wiring isn't live yet).
  const phase3 = parsePhase3Env(process.env);
  const publicManifest = {
    schemaVersion: "public-manifest/v1",
    title: "Google News RSS",
    summary: "Fetches and summarizes recent Google News RSS results for a query",
    workflowType: "google_news_rss/v1",
    version: VERSION,
    inputSchema: { query: { type: "string", minLength: 2, maxLength: 200 } },
    outputSchema: {
      maxItems: 10,
      fields: ["title", "source", "publishedAt", "url"],
    },
  };
  const privateBundle = {
    schemaVersion: "google_news_rss/v1",
    feedBaseUrl: "https://news.google.com/rss/search",
    locale: { hl: "ko", gl: "KR", ceid: "KR:ko" },
    windowHours: 24,
    maxResults: 10,
    requestTimeoutMs: 8_000,
    dedupeStrategy: "normalized_title_and_source",
  };

  const prepared = await prepareAndUploadEncryptedWorkflow({
    rootId: workflowRootId,
    version: VERSION,
    publicManifest,
    privateBundle,
    keyringPath: phase3.LOCAL_KEYRING_PATH,
    publisher: new WalrusPublisher({
      baseUrl: phase3.WALRUS_PUBLISHER_URL,
      storageEpochs: phase3.WALRUS_STORAGE_EPOCHS,
      timeoutMs: phase3.WALRUS_READ_TIMEOUT_MS,
      maxResponseBytes: phase3.WALRUS_MAX_BLOB_BYTES,
    }),
    blobStore: new WalrusBlobStore({
      baseUrl: phase3.WALRUS_AGGREGATOR_URL,
      timeoutMs: phase3.WALRUS_READ_TIMEOUT_MS,
      maxResponseBytes: phase3.WALRUS_MAX_BLOB_BYTES,
    }),
    retry: {
      maxAttempts: 5,
      baseDelayMs: 250,
      maxDelayMs: 4_000,
      sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    },
  });
  console.log(`\nWalrus blobId: ${prepared.walrus.blobId}`);
  console.log(`keyId:                ${prepared.keyId}`);
  console.log(`encryptedBundleHash:  ${prepared.encryptedBundleHash}`);
  console.log(`publicManifestHash:   ${prepared.publicManifestHash}`);

  // ── Step 5: point the release at the real blob ──
  const tx4 = new Transaction();
  tx4.moveCall({
    target: `${packageId}::agent::set_blob_id`,
    arguments: [tx4.object(releaseId), tx4.pure.string(prepared.walrus.blobId)],
  });
  await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx4,
    include: { effects: true },
  });
  console.log("\nblob_id set on release.");

  // ── Step 6: record executionBindings locally — the chain has nowhere to
  // store encryptedBundleHash/publicManifestHash/keyId today, so
  // LocalBindingsReleaseProvider reads them from this trusted local file
  // instead (see execution-bindings-writer.ts). Written under the SAME
  // path start.ts's LOCAL_EXECUTION_BINDINGS_PATH default points at.
  await storeLocalExecutionBindings({
    bindingsPath:
      process.env["LOCAL_EXECUTION_BINDINGS_PATH"] ??
      "./data/local-execution-bindings.json",
    releaseId,
    bindings: {
      workflowType: "google_news_rss/v1",
      encryptedBundleHash: prepared.encryptedBundleHash,
      publicManifestHash: prepared.publicManifestHash,
      keyId: prepared.keyId,
    },
  });
  console.log("execution bindings recorded locally.");

  console.log("\n=== paste into .env ===");
  console.log(`WORKFLOW_ROOT_ID=${workflowRootId}`);
  console.log(`WORKFLOW_RELEASE_ID=${releaseId}`);
  console.log(`VITE_WORKFLOW_RELEASE_ID=${releaseId}`);
  console.log("\n(RoyaltyVault, AgentProfile, keyId, hashes above are not .env values —");
  console.log(" the executor derives them by reading the release object on-chain");
  console.log(" plus data/local-execution-bindings.json.)");
}

main().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exitCode = 1;
});
