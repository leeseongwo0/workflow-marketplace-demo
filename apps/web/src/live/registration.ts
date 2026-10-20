import { bcs } from "@mysten/sui/bcs";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const CLOCK_OBJECT_ID = "0x6";

// Registration through the browser publishes metadata only: the encrypted
// bundle upload deliberately lives outside the web app, so this stands in for
// the Walrus blob reference. It is named so anyone reading the object on chain
// can see that there is nothing to download behind it.
const PLACEHOLDER_BLOB_ID = "demo-metadata-only";

const RELEASE_VERSION = "1.0.0";
const ROYALTY_BPS = 500n;

const idBcs = bcs.struct("RegID", { bytes: bcs.Address });
const uidBcs = bcs.struct("RegUID", { id: idBcs });

// Mirrors agent::AgentProfile and agent::WorkflowRoot at package 0x388adbc4…
// BCS is positional, so these follow the declared field order exactly.
const profileBcs = bcs.struct("RegAgentProfile", {
  id: uidBcs,
  owner: bcs.Address,
  name: bcs.string(),
  created_at: bcs.u64(),
});

const rootBcs = bcs.struct("RegWorkflowRoot", {
  id: uidBcs,
  agent_id: idBcs,
  name: bcs.string(),
  description: bcs.string(),
  created_at: bcs.u64(),
});

export interface OwnedWorkflowRoot {
  id: string;
  name: string;
  description: string;
}

type ObjectClient = Pick<SuiGrpcClient, "listOwnedObjects">;

function typeOf(packageId: string, moduleName: string, structName: string): string {
  return `${normalizeSuiAddress(packageId)}::${moduleName}::${structName}`;
}

/** The AgentProfile this address already owns, if any. */
export async function findOwnedAgentProfile(input: {
  client: ObjectClient;
  packageId: string;
  owner: string;
}): Promise<string | undefined> {
  const type = typeOf(input.packageId, "agent", "AgentProfile");
  const response = await input.client.listOwnedObjects({
    owner: normalizeSuiAddress(input.owner),
    type,
    limit: 50,
    include: { content: true },
  });
  for (const object of response.objects) {
    if (object.type !== type || !(object.content instanceof Uint8Array)) continue;
    const parsed = profileBcs.parse(object.content);
    if (parsed.id.id.bytes === normalizeSuiAddress(object.objectId)) {
      return normalizeSuiAddress(object.objectId);
    }
  }
  return undefined;
}

/** Roots owned by this address, newest last. Titles and blurbs live here. */
export async function findOwnedRoots(input: {
  client: ObjectClient;
  packageId: string;
  owner: string;
}): Promise<OwnedWorkflowRoot[]> {
  const type = typeOf(input.packageId, "agent", "WorkflowRoot");
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
    if (parsed.id.id.bytes !== normalizeSuiAddress(object.objectId)) continue;
    roots.push({
      id: normalizeSuiAddress(object.objectId),
      name: parsed.name,
      description: parsed.description,
    });
  }
  return roots;
}

/**
 * Registers a listing in a single signature.
 *
 * Every step returns its object instead of transferring it, so profile, root
 * and release can be chained inside one programmable transaction. The release
 * is shared because buyers need `&WorkflowRelease`, and the vault is created
 * while the release is still a local value — after sharing it, the value is
 * gone and `create_royalty_vault` could no longer take a reference to it.
 */
export function buildRegisterWorkflowTransaction(input: {
  packageId: string;
  sender: string;
  agentProfileId: string | undefined;
  creatorName: string;
  title: string;
  description: string;
  priceMist: bigint;
}): Transaction {
  const packageId = normalizeSuiAddress(input.packageId);
  const transaction = new Transaction();

  const reusedProfile = input.agentProfileId !== undefined;
  const profile = reusedProfile
    ? transaction.object(normalizeSuiAddress(input.agentProfileId as string))
    : transaction.moveCall({
        target: `${packageId}::agent::create_agent_profile`,
        arguments: [
          transaction.pure.string(input.creatorName),
          transaction.object(CLOCK_OBJECT_ID),
        ],
      });

  const root = transaction.moveCall({
    target: `${packageId}::agent::create_workflow_root`,
    arguments: [
      profile,
      transaction.pure.string(input.title),
      transaction.pure.string(input.description),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });

  const release = transaction.moveCall({
    target: `${packageId}::agent::create_workflow_release`,
    arguments: [
      root,
      transaction.pure.option("address", null),
      transaction.pure.string(RELEASE_VERSION),
      transaction.pure.string(PLACEHOLDER_BLOB_ID),
      transaction.pure.u64(input.priceMist),
      transaction.pure.u64(input.priceMist),
      transaction.pure.u64(ROYALTY_BPS),
      transaction.pure.option("u64", null),
      transaction.pure.option("u64", null),
      transaction.object(CLOCK_OBJECT_ID),
    ],
  });

  transaction.moveCall({
    target: `${packageId}::marketplace::create_royalty_vault`,
    arguments: [release],
  });
  transaction.moveCall({
    target: "0x2::transfer::public_share_object",
    typeArguments: [`${packageId}::agent::WorkflowRelease`],
    arguments: [release],
  });

  const sender = normalizeSuiAddress(input.sender);
  transaction.transferObjects(reusedProfile ? [root] : [profile, root], sender);
  transaction.setSender(sender);
  return transaction;
}

export const REGISTERED_RELEASE_TYPE = (packageId: string): string =>
  typeOf(packageId, "agent", "WorkflowRelease");
