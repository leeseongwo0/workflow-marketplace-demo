import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, type TransactionResult } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

const CLOCK_OBJECT_ID = "0x6";
const PACKAGE_ID = "0x388adbc484420b439a4837baff32a56b663cfb40f98c3ffddf488e868d803bee";
const MARKETPLACE_CONFIG_ID = "0x6a38e5483dbd5e5cfe2db198be944d5df0d7882db7659c954e9d20845b9cb8a8";
const RELEASE_ID = "0x6ef6e0ef9774c412dabcd2cabf3d71913f00b4afda1fb2c2bfea94e46da5d3af";
const VAULT_ID = "0x96e70cae2a9136a09ba9f0ca889c1e22e8ad100976f791027e02874037953b8b";
const PRICE_LICENSE_MIST = 50_000_000n;
const EXECUTOR_BASE_URL = "http://127.0.0.1:3001";

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
  const keypair = Ed25519Keypair.fromSecretKey(requireEnv("SUI_DEPLOYER_PRIVATE_KEY"));
  const runnerAddress = keypair.getPublicKey().toSuiAddress();
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
  });

  console.log(`Runner: ${runnerAddress}\n`);

  // ── Step 1: buy_license ──
  const tx1 = new Transaction();
  const [coin] = tx1.splitCoins(tx1.gas, [PRICE_LICENSE_MIST]);
  tx1.moveCall({
    target: `${PACKAGE_ID}::marketplace::buy_license`,
    arguments: [
      tx1.object(MARKETPLACE_CONFIG_ID),
      tx1.object(RELEASE_ID),
      tx1.object(VAULT_ID),
      coin as TransactionResult,
      tx1.pure(bcs.option(bcs.u64()).serialize(10n).toBytes()),
      tx1.pure(bcs.option(bcs.u64()).serialize(null).toBytes()),
      tx1.object(CLOCK_OBJECT_ID),
    ],
  });
  const res1 = (await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx1,
    include: { effects: true, objectTypes: true },
  })) as unknown as TxEffectsResult;
  const licenseId = findCreatedObjectId(res1, "::license::LicensePass");
  console.log(`LicensePass bought: ${licenseId}`);

  // ── Step 2: request an execution challenge from the executor ──
  const challengeRes = await fetch(`${EXECUTOR_BASE_URL}/api/execution/challenges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runnerAddress,
      releaseId: RELEASE_ID,
      licenseId,
      query: "Sui blockchain",
    }),
  });
  const challengeBody = (await challengeRes.json()) as {
    challengeId: string;
    personalMessage: { bytesBase64: string; preview: string };
  };
  if (!challengeRes.ok) {
    throw new Error(`Challenge request failed: ${JSON.stringify(challengeBody)}`);
  }
  console.log(`\nChallenge issued: ${challengeBody.challengeId}`);
  console.log(`Message preview: ${challengeBody.personalMessage.preview}`);

  // ── Step 3: sign the challenge message (personal message) with the buyer's key ──
  const messageBytes = new Uint8Array(
    Buffer.from(challengeBody.personalMessage.bytesBase64, "base64"),
  );
  const { signature } = await keypair.signPersonalMessage(messageBytes);

  // ── Step 4: submit the execution ──
  const executeRes = await fetch(`${EXECUTOR_BASE_URL}/api/executions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: challengeBody.challengeId,
      walletSignature: signature,
    }),
  });
  const executeBody = await executeRes.json();
  console.log(`\nExecution response (${executeRes.status}):`);
  console.log(JSON.stringify(executeBody, null, 2));

  if (!executeRes.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Test flow failed:", error);
  process.exitCode = 1;
});
