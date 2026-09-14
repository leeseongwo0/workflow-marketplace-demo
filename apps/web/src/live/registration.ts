import { bcs } from "@mysten/sui/bcs";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const CLOCK_OBJECT_ID = "0x6";

// The contract only accepts this workflow type, whatever the listing is called.
const WORKFLOW_TYPE = "google_news_rss/v1";

// Registration through the browser publishes metadata only: the encrypted
// bundle upload deliberately lives outside the web app, so these stand in for
// the bundle references. They are shaped to pass the contract's length checks
// and named so anyone reading the object on chain can see what they are.
const PLACEHOLDER_BLOB_ID = "demo-metadata-only";
const PLACEHOLDER_KEY_ID = "demo:metadata-only";

const idBcs = bcs.struct("RegID", { bytes: bcs.Address });
const uidBcs = bcs.struct("RegUID", { id: idBcs });

const rootBcs = bcs.struct("RegWorkflowRoot", {
  id: uidBcs,
  creator: bcs.Address,
  name: bcs.string(),
  slug_hash: bcs.vector(bcs.u8()),
  latest_release_id: bcs.option(idBcs),
  created_at_ms: bcs.u64(),
});

export interface OwnedWorkflowRoot {
  id: string;
  name: string;
  latestReleaseId: string | undefined;
}

type ObjectClient = Pick<SuiGrpcClient, "listOwnedObjects">;

function rootType(packageId: string): string {
  return `${normalizeSuiAddress(packageId)}::marketplace::WorkflowRoot`;
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoded.slice().buffer));
}

/**
 * Roots owned by this address, newest last. A release is only discoverable
 * through the root that published it — releases are shared objects and the
 * deployed contract emits no event to index them by.
 */
export async function findOwnedRoots(input: {
  client: ObjectClient;
  packageId: string;
  owner: string;
}): Promise<OwnedWorkflowRoot[]> {
  const type = rootType(input.packageId);
  const response = await input.client.listOwnedObjects({
    owner: normalizeSuiAddress(input.owner),
    type,
    limit: 50,
    include: { content: true },
  });

  const roots: OwnedWorkflowRoot[] = [];
  for (const object of response.objects) {
    if (object.type !== type || !(object.content instanceof Uint8Array)) continue;
    const parsed = rootBcs.parse(object.content);
    roots.push({
      id: normalizeSuiAddress(object.objectId),
      name: parsed.name,
      latestReleaseId:
        parsed.latest_release_id === null
          ? undefined
          : normalizeSuiAddress(parsed.latest_release_id.bytes),
    });
  }
  return roots;
}

export async function buildCreateWorkflowRootTransaction(input: {
  packageId: string;
  name: string;
}): Promise<Transaction> {
  const transaction = new Transaction();
  const slugHash = await sha256Bytes(`${input.name}:${Date.now()}`);
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::marketplace::create_workflow_root`,
    arguments: [
      transaction.pure.vector("u8", new TextEncoder().encode(input.name)),
      transaction.pure.vector("u8", slugHash),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });
  return transaction;
}

export async function buildPublishReleaseTransaction(input: {
  packageId: string;
  rootId: string;
  title: string;
  description: string;
  priceMist: bigint;
  version: { major: number; minor: number; patch: number };
}): Promise<Transaction> {
  const encoder = new TextEncoder();
  const bundleHash = await sha256Bytes(`bundle:${input.title}:${input.rootId}`);
  const manifestHash = await sha256Bytes(`manifest:${input.title}:${input.rootId}`);

  const transaction = new Transaction();
  transaction.moveCall({
    target: `${normalizeSuiAddress(input.packageId)}::marketplace::publish_release`,
    arguments: [
      transaction.object(normalizeSuiAddress(input.rootId)),
      transaction.pure.u64(input.version.major),
      transaction.pure.u64(input.version.minor),
      transaction.pure.u64(input.version.patch),
      transaction.pure.vector("u8", encoder.encode(input.title)),
      transaction.pure.vector("u8", encoder.encode(input.description)),
      transaction.pure.vector("u8", encoder.encode(WORKFLOW_TYPE)),
      transaction.pure.vector("u8", encoder.encode(PLACEHOLDER_BLOB_ID)),
      transaction.pure.vector("u8", bundleHash),
      transaction.pure.vector("u8", manifestHash),
      transaction.pure.vector("u8", encoder.encode(PLACEHOLDER_KEY_ID)),
      transaction.pure.u64(input.priceMist),
      transaction.pure.bool(true),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });
  return transaction;
}
