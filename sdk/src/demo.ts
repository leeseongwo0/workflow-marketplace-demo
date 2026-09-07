import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import * as fs from "node:fs";
import { uploadBytesToWalrus, downloadFromWalrus } from "./walrus.js";
import { sealEncrypt, parseSealEncryptedObject, fetchKeyServersViaGrpc } from "./seal.js";

// ─── Config ───
const PACKAGE_ID =
  "0xb04ed6f84ab44d03f8a1e310a1b2fdaf676f6e39e3df9994a1d9da1c22a541c7";
const MARKETPLACE_CONFIG_ID =
  "0x3b30748051378b20a2d8c9a2483cd987f1e4ee24c067c3c2f45b572e8430ba65";
const CLOCK = "0x6";

// ─── Helpers ───
function loadKeypair(): Ed25519Keypair {
  const keystore: string[] = JSON.parse(
    fs.readFileSync(`${process.env.HOME}/.sui/sui_config/sui.keystore`, "utf8"),
  );
  const raw = Buffer.from(keystore[0], "base64");
  const secret = raw.slice(1, 33);
  return Ed25519Keypair.fromSecretKey(secret);
}

function findCreatedObject(
  result: any,
  typeSuffix: string,
): string | undefined {
  const tx =
    result.$kind === "Transaction"
      ? result.Transaction
      : result.FailedTransaction;
  if (!tx) return undefined;
  const effects = tx.effects;
  const objectTypes: Record<string, string> = tx.objectTypes ?? {};
  if (!effects?.changedObjects) return undefined;

  for (const obj of effects.changedObjects) {
    if (obj.idOperation === "Created") {
      const objType = objectTypes[obj.objectId] ?? "";
      if (objType.includes(typeSuffix)) {
        return obj.objectId;
      }
    }
  }
  return undefined;
}

function getDigest(result: any): string {
  const tx =
    result.$kind === "Transaction"
      ? result.Transaction
      : result.FailedTransaction;
  return tx?.digest ?? "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Demo ───
async function main() {
  const client = new SuiGrpcClient({
    baseUrl: "https://fullnode.testnet.sui.io:443",
    network: "testnet",
  });
  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   AI Agent Workflow Marketplace — Demo (Seal Integrated)║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  Network:  Sui Testnet`);
  console.log(`  Package:  ${PACKAGE_ID}`);
  console.log(`  Wallet:   ${sender}\n`);

  // ── Step 1: Create AgentProfile ──
  console.log("─── Step 1: Create AgentProfile ───");
  const tx1 = new Transaction();
  const [profile] = tx1.moveCall({
    target: `${PACKAGE_ID}::agent::create_agent_profile`,
    arguments: [tx1.pure.string("DemoAgent"), tx1.object(CLOCK)],
  });
  tx1.transferObjects([profile], sender);

  const res1 = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx1,
    include: { effects: true, objectTypes: true },
  });
  const agentProfileId = findCreatedObject(res1, "::agent::AgentProfile");
  console.log(`  ✓ AgentProfile created: ${agentProfileId}`);
  console.log(`    tx: ${getDigest(res1)}\n`);
  await sleep(2000);

  // ── Step 2: Create WorkflowRoot ──
  console.log("─── Step 2: Create WorkflowRoot ───");
  const tx2 = new Transaction();
  const [root] = tx2.moveCall({
    target: `${PACKAGE_ID}::agent::create_workflow_root`,
    arguments: [
      tx2.object(agentProfileId!),
      tx2.pure.string("GPT-Summarizer"),
      tx2.pure.string("An AI workflow that summarizes documents"),
      tx2.object(CLOCK),
    ],
  });
  tx2.transferObjects([root], sender);

  const res2 = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx2,
    include: { effects: true, objectTypes: true },
  });
  const workflowRootId = findCreatedObject(res2, "::agent::WorkflowRoot");
  console.log(`  ✓ WorkflowRoot created: ${workflowRootId}`);
  console.log(`    tx: ${getDigest(res2)}\n`);
  await sleep(2000);

  // ── Step 3: Create WorkflowRelease + RoyaltyVault (placeholder blob_id) ──
  console.log("─── Step 3: Create WorkflowRelease + RoyaltyVault (placeholder) ───");

  const PRICE_LICENSE = 50_000_000n;
  const PRICE_FORK = 100_000_000n;
  const ROYALTY_BPS = 2000n;

  const tx3 = new Transaction();
  const parentOpt = tx3.pure(
    bcs.option(bcs.Address).serialize(null).toBytes(),
  );

  const [release] = tx3.moveCall({
    target: `${PACKAGE_ID}::agent::create_workflow_release`,
    arguments: [
      tx3.object(workflowRootId!),
      parentOpt,
      tx3.pure.string("1.0.0"),
      tx3.pure.string(""),
      tx3.pure.u64(PRICE_LICENSE),
      tx3.pure.u64(PRICE_FORK),
      tx3.pure.u64(ROYALTY_BPS),
      tx3.object(CLOCK),
    ],
  });

  tx3.moveCall({
    target: `${PACKAGE_ID}::marketplace::create_royalty_vault`,
    arguments: [release],
  });

  tx3.transferObjects([release], sender);

  const res3 = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx3,
    include: { effects: true, objectTypes: true },
  });
  const releaseId = findCreatedObject(res3, "::agent::WorkflowRelease");
  const vaultId = findCreatedObject(res3, "::marketplace::RoyaltyVault");
  console.log(`  ✓ WorkflowRelease created: ${releaseId}`);
  console.log(`    Price (License): ${PRICE_LICENSE} MIST (${Number(PRICE_LICENSE) / 1e9} SUI)`);
  console.log(`    Price (Fork):    ${PRICE_FORK} MIST (${Number(PRICE_FORK) / 1e9} SUI)`);
  console.log(`    Royalty:         ${Number(ROYALTY_BPS) / 100}%`);
  console.log(`  ✓ RoyaltyVault created: ${vaultId}`);
  console.log(`    tx: ${getDigest(res3)}\n`);
  await sleep(2000);

  // ── Step 4: Seal Encrypt with releaseId + Upload to Walrus ──
  console.log("─── Step 4: Seal Encrypt (releaseId identity) + Upload to Walrus ───");

  const workflowData = {
    name: "GPT-Summarizer",
    version: "1.0.0",
    steps: [
      { action: "fetch_document", source: "user_input" },
      { action: "call_llm", model: "gpt-4", prompt: "Summarize: {doc}" },
      { action: "return_result" },
    ],
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(workflowData, null, 2));

  console.log("  Fetching Seal key servers from Sui Testnet...");
  const idBytes = new Uint8Array(
    Buffer.from(releaseId!.replace(/^0x/, ""), "hex"),
  );

  console.log("  Encrypting with Seal (IBE + AES-256-GCM)...");
  console.log(`    Package ID:  ${PACKAGE_ID.slice(0, 20)}...`);
  console.log(`    Identity ID: ${releaseId} (bound to release)`);

  const { encryptedBytes, key } = await sealEncrypt(
    client,
    PACKAGE_ID,
    idBytes,
    plaintext,
  );

  console.log(`  ✓ Seal encryption complete`);
  console.log(`    Encrypted size: ${encryptedBytes.length} bytes`);
  console.log(`    Symmetric key:  ${Buffer.from(key).toString("hex").slice(0, 16)}... (Seal-managed)`);

  const parsed = parseSealEncryptedObject(encryptedBytes);
  console.log(`    Seal version:   ${parsed.version}`);
  console.log(`    Key servers:    ${parsed.services.length}`);
  console.log(`    Threshold:      ${parsed.threshold}/${parsed.services.length}`);

  console.log("\n  Uploading encrypted blob to Walrus...");
  const blobId = await uploadBytesToWalrus(encryptedBytes);
  console.log(`  ✓ Uploaded to Walrus`);
  console.log(`    Blob ID: ${blobId}`);

  console.log("\n  Verifying download from Walrus...");
  const downloaded = await downloadFromWalrus(blobId);
  console.log(`  ✓ Downloaded ${downloaded.length} bytes`);

  const reParsed = parseSealEncryptedObject(new Uint8Array(downloaded));
  console.log(`  ✓ Downloaded blob is valid Seal EncryptedObject (threshold=${reParsed.threshold})\n`);
  await sleep(1000);

  // ── Step 5: Update blob_id on-chain ──
  console.log("─── Step 5: Update blob_id on-chain ───");

  const txUpdate = new Transaction();
  txUpdate.moveCall({
    target: `${PACKAGE_ID}::agent::set_blob_id`,
    arguments: [txUpdate.object(releaseId!), txUpdate.pure.string(blobId)],
  });

  const resUpdate = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: txUpdate,
    include: { effects: true },
  });
  console.log(`  ✓ blob_id updated on release`);
  console.log(`    Blob ID: ${blobId}`);
  console.log(`    tx: ${getDigest(resUpdate)}\n`);
  await sleep(2000);

  // ── Step 6: Buy LicensePass ──
  console.log("─── Step 6: Buy LicensePass ───");

  const tx4 = new Transaction();
  const [coin] = tx4.splitCoins(tx4.gas, [PRICE_LICENSE]);
  tx4.moveCall({
    target: `${PACKAGE_ID}::marketplace::buy_license`,
    arguments: [
      tx4.object(MARKETPLACE_CONFIG_ID),
      tx4.object(releaseId!),
      tx4.object(vaultId!),
      coin,
      tx4.pure(bcs.option(bcs.u64()).serialize(10n).toBytes()),
      tx4.pure(bcs.option(bcs.u64()).serialize(null).toBytes()),
      tx4.object(CLOCK),
    ],
  });

  const res4 = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx4,
    include: { effects: true, objectTypes: true },
  });
  const licenseId = findCreatedObject(res4, "::license::LicensePass");
  console.log(`  ✓ LicensePass purchased: ${licenseId}`);
  console.log(`    Runs remaining: 10`);
  console.log(`    Paid: ${Number(PRICE_LICENSE) / 1e9} SUI`);
  console.log(`    tx: ${getDigest(res4)}\n`);
  await sleep(2000);

  // ── Step 7: Execute Workflow (Decrypt + Record) ──
  console.log("─── Step 7: Execute Workflow (Decrypt + Record on-chain) ───");

  console.log("  Downloading encrypted blob from Walrus...");
  const execBlob = await downloadFromWalrus(blobId);
  const execBytes = new Uint8Array(execBlob);
  console.log(`  ✓ Downloaded ${execBytes.length} bytes`);

  console.log("  Decrypting with Seal key servers (AES-256-GCM)...");
  const execEncObj = parseSealEncryptedObject(execBytes);
  const execFullId = new Uint8Array(execEncObj.id);
  const pkgIdBytes = new Uint8Array(
    Buffer.from(PACKAGE_ID.replace(/^0x/, ""), "hex"),
  );

  const sealTx = new Transaction();
  sealTx.moveCall({
    target: `${PACKAGE_ID}::execution::seal_approve`,
    arguments: [
      sealTx.pure.vector("u8", Array.from(execFullId)),
      sealTx.object(licenseId!),
      sealTx.object(releaseId!),
      sealTx.object(CLOCK),
    ],
  });
  const sealTxBytes = await sealTx.build({ client });

  const { SessionKey: SealSessionKey, KeyStore } = await import("@mysten/seal");
  const sessionKey = new SealSessionKey(pkgIdBytes, 10);
  const personalMsg = sessionKey.getPersonalMessage();
  const { signature: personalSig } = await keypair.signPersonalMessage(personalMsg);
  sessionKey.setPersonalMessageSignature(personalSig);

  const decKeyServers = await fetchKeyServersViaGrpc(client);
  const keyStore = new KeyStore();
  await keyStore.fetchKeys({
    keyServers: decKeyServers,
    threshold: execEncObj.threshold,
    packageId: pkgIdBytes,
    ids: [execFullId],
    txBytes: sealTxBytes,
    sessionKey,
  });
  const decrypted = await keyStore.decrypt(execEncObj);
  const decryptedJson = new TextDecoder().decode(decrypted);
  console.log(`  ✓ Decrypted ${decrypted.length} bytes`);
  console.log(`    Content preview: ${decryptedJson.slice(0, 80)}...`);

  console.log("  Recording execution on-chain...");
  const tx6 = new Transaction();
  const [receipt] = tx6.moveCall({
    target: `${PACKAGE_ID}::execution::record_execution`,
    arguments: [
      tx6.object(licenseId!),
      tx6.object(releaseId!),
      tx6.object(CLOCK),
    ],
  });
  tx6.transferObjects([receipt], sender);

  const res6 = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx6,
    include: { effects: true, objectTypes: true },
  });
  const receiptId = findCreatedObject(res6, "::execution::ExecutionReceipt");
  console.log(`  ✓ ExecutionReceipt minted: ${receiptId}`);
  console.log(`    LicensePass runs consumed: 1 (remaining: 9)`);
  console.log(`    tx: ${getDigest(res6)}\n`);
  await sleep(2000);

  // ── Step 8: Partial Withdrawal from Vault ──
  console.log("─── Step 8: Partial Withdrawal from Vault ───");

  const partialAmount = 25_000_000n;
  const txPartial = new Transaction();
  const [partialCoin] = txPartial.moveCall({
    target: `${PACKAGE_ID}::marketplace::withdraw_vault_partial`,
    arguments: [
      txPartial.object(vaultId!),
      txPartial.pure.u64(partialAmount),
    ],
  });
  txPartial.transferObjects([partialCoin], sender);

  const resPartial = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: txPartial,
    include: { effects: true },
  });
  console.log(`  ✓ Partial withdrawal: ${partialAmount} MIST (${Number(partialAmount) / 1e9} SUI)`);
  console.log(`    tx: ${getDigest(resPartial)}\n`);
  await sleep(2000);

  // ── Step 9: Full Withdrawal from Vault ──
  console.log("─── Step 9: Full Withdrawal (remaining balance) ───");

  const tx5 = new Transaction();
  const [withdrawn] = tx5.moveCall({
    target: `${PACKAGE_ID}::marketplace::withdraw_vault`,
    arguments: [tx5.object(vaultId!)],
  });
  tx5.transferObjects([withdrawn], sender);

  const res5 = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx5,
    include: { effects: true, balanceChanges: true },
  });
  const tx5Data =
    res5.$kind === "Transaction"
      ? res5.Transaction
      : res5.FailedTransaction;
  const balChanges = tx5Data?.balanceChanges ?? [];
  const earned = balChanges.find(
    (b: any) => b.coinType?.includes("sui::SUI") && BigInt(b.amount) > 0,
  );
  console.log(`  ✓ Withdrawn remaining balance`);
  if (earned) {
    console.log(`    Amount: ${earned.amount} MIST`);
  }
  console.log(`    tx: ${getDigest(res5)}\n`);

  // ── Summary ──
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Demo Complete — Full Pipeline                             ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║                                                             ║");
  console.log("║  Encryption:  Seal IBE (BonehFranklin BLS12-381)            ║");
  console.log(`║  Key Servers: ${parsed.services.length} Testnet servers (threshold ${parsed.threshold}/${parsed.services.length})              ║`);
  console.log("║  Storage:     Walrus Testnet (encrypted blob)               ║");
  console.log("║  Settlement:  Sui Move (auto fee split + royalty)           ║");
  console.log("║                                                             ║");
  console.log("║  Flow:                                                      ║");
  console.log("║    On-chain Register → Seal Encrypt (releaseId identity)    ║");
  console.log("║    → Walrus Upload → Update blob_id → Buy License          ║");
  console.log("║    → Seal Decrypt → Execute → Receipt                      ║");
  console.log("║    → Partial Withdraw → Full Withdraw                      ║");
  console.log("║                                                             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
