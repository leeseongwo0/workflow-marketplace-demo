import { bcs } from "@mysten/sui/bcs";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const idBcs = bcs.struct("WebID", { bytes: bcs.Address });
const uidBcs = bcs.struct("WebUID", { id: idBcs });
const tableBcs = bcs.struct("WebTable", { id: uidBcs, size: bcs.u64() });

const marketplaceBcs = bcs.struct("WebMarketplace", {
  id: uidBcs,
  admin: bcs.Address,
  executor_public_key: bcs.vector(bcs.u8()),
  used_receipt_nonces: tableBcs,
  license_registry: tableBcs,
});

const releaseBcs = bcs.struct("WebWorkflowRelease", {
  id: uidBcs,
  root_id: idBcs,
  parent_release_id: bcs.option(idBcs),
  version: bcs.string(),
  blob_id: bcs.string(),
  price_license: bcs.u64(),
  price_fork: bcs.u64(),
  royalty_bps: bcs.u64(),
  is_listed: bcs.bool(),
  created_at: bcs.u64(),
});

const licenseBcs = bcs.struct("WebLicensePass", {
  id: uidBcs,
  release_id: idBcs,
  owner: bcs.Address,
  remaining_runs: bcs.option(bcs.u64()),
  expires_at: bcs.option(bcs.u64()),
});

const receiptBcs = bcs.struct("WebExecutionReceipt", {
  id: uidBcs,
  release_id: idBcs,
  executor: bcs.Address,
  executed_at: bcs.u64(),
});

type ObjectClient = Pick<SuiGrpcClient, "getObject" | "listOwnedObjects">;

interface OwnedObjectPage {
  objects: Array<{
    objectId: string;
    type: string;
    owner: unknown;
    content: Uint8Array | undefined;
  }>;
  hasNextPage: boolean;
  cursor: string | null;
}

export interface LiveMarketplace {
  id: string;
  executorPublicKey: Uint8Array;
}

export interface LiveRelease {
  id: string;
  rootId: string;
  parentReleaseId: string | null;
  version: string;
  blobId: string;
  priceLicense: bigint;
  priceFork: bigint;
  royaltyBps: bigint;
  isListed: boolean;
  createdAt: bigint;
}

export interface OwnedLicense {
  id: string;
  releaseId: string;
  owner: string;
  remainingRuns: bigint | null;
  expiresAt: bigint | null;
}

export interface OwnedReceipt {
  id: string;
  releaseId: string;
  executor: string;
  executedAt: bigint;
}

function moduleType(packageId: string, module: string, structName: string): string {
  return `${normalizeSuiAddress(packageId)}::${module}::${structName}`;
}

function requireAddressOwner(owner: unknown, expected: string): void {
  if (
    typeof owner !== "object" ||
    owner === null ||
    !("$kind" in owner) ||
    owner.$kind !== "AddressOwner" ||
    !("AddressOwner" in owner) ||
    typeof owner.AddressOwner !== "string" ||
    normalizeSuiAddress(owner.AddressOwner) !== normalizeSuiAddress(expected)
  ) {
    throw new Error("Object owner does not match the connected wallet");
  }
}

function requireSharedOwner(owner: unknown): void {
  if (
    typeof owner !== "object" ||
    owner === null ||
    !("$kind" in owner) ||
    owner.$kind !== "Shared"
  ) {
    throw new Error("Configured object is not shared");
  }
}

export async function loadMarketplace(input: {
  client: ObjectClient;
  packageId: string;
  marketplaceId: string;
}): Promise<LiveMarketplace> {
  const marketplaceId = normalizeSuiAddress(input.marketplaceId);
  const { object } = await input.client.getObject({
    objectId: marketplaceId,
    include: { content: true },
  });
  if (
    object.objectId !== marketplaceId ||
    object.type !== moduleType(input.packageId, "marketplace", "Marketplace") ||
    !(object.content instanceof Uint8Array)
  ) {
    throw new Error("Configured Marketplace is invalid");
  }
  requireSharedOwner(object.owner);
  const parsed = marketplaceBcs.parse(object.content);
  if (parsed.id.id.bytes !== marketplaceId) {
    throw new Error("Marketplace object identity is inconsistent");
  }
  const executorPublicKey = Uint8Array.from(parsed.executor_public_key);
  if (executorPublicKey.length !== 32) {
    throw new Error("Marketplace executor public key is invalid");
  }
  return { id: marketplaceId, executorPublicKey };
}

export async function loadRelease(input: {
  client: ObjectClient;
  packageId: string;
  releaseId: string;
}): Promise<LiveRelease> {
  const releaseId = normalizeSuiAddress(input.releaseId);
  const { object } = await input.client.getObject({
    objectId: releaseId,
    include: { content: true },
  });
  if (
    object.objectId !== releaseId ||
    object.type !== moduleType(input.packageId, "agent", "WorkflowRelease") ||
    !(object.content instanceof Uint8Array)
  ) {
    throw new Error("Configured WorkflowRelease is invalid");
  }
  const parsed = releaseBcs.parse(object.content);
  if (parsed.id.id.bytes !== releaseId) {
    throw new Error("WorkflowRelease object identity is inconsistent");
  }
  return {
    id: releaseId,
    rootId: parsed.root_id.bytes,
    parentReleaseId: parsed.parent_release_id?.bytes ?? null,
    version: parsed.version,
    blobId: parsed.blob_id,
    priceLicense: BigInt(parsed.price_license),
    priceFork: BigInt(parsed.price_fork),
    royaltyBps: BigInt(parsed.royalty_bps),
    isListed: parsed.is_listed,
    createdAt: BigInt(parsed.created_at),
  };
}

export async function findOwnedLicense(input: {
  client: ObjectClient;
  packageId: string;
  owner: string;
  releaseId: string;
}): Promise<OwnedLicense | undefined> {
  const owner = normalizeSuiAddress(input.owner);
  const releaseId = normalizeSuiAddress(input.releaseId);
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const response: OwnedObjectPage = await input.client.listOwnedObjects({
      owner,
      type: moduleType(input.packageId, "license", "LicensePass"),
      cursor,
      limit: 50,
      include: { content: true },
    });
    for (const object of response.objects) {
      if (
        object.type !== moduleType(input.packageId, "license", "LicensePass") ||
        !(object.content instanceof Uint8Array)
      ) continue;
      requireAddressOwner(object.owner, owner);
      const parsed = licenseBcs.parse(object.content);
      if (parsed.id.id.bytes !== normalizeSuiAddress(object.objectId)) continue;
      if (parsed.release_id.bytes === releaseId) {
        return {
          id: normalizeSuiAddress(object.objectId),
          releaseId,
          owner: parsed.owner,
          remainingRuns: parsed.remaining_runs !== null ? BigInt(parsed.remaining_runs) : null,
          expiresAt: parsed.expires_at !== null ? BigInt(parsed.expires_at) : null,
        };
      }
    }
    if (!response.hasNextPage || response.cursor === null) return undefined;
    cursor = response.cursor;
  }
  throw new Error("License lookup exceeded the page limit");
}

export async function findRecordedReceipt(input: {
  client: ObjectClient;
  packageId: string;
  owner: string;
  releaseId: string;
}): Promise<OwnedReceipt | undefined> {
  const owner = normalizeSuiAddress(input.owner);
  const releaseId = normalizeSuiAddress(input.releaseId);
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const response: OwnedObjectPage = await input.client.listOwnedObjects({
      owner,
      type: moduleType(input.packageId, "execution", "ExecutionReceipt"),
      cursor,
      limit: 50,
      include: { content: true },
    });
    for (const object of response.objects) {
      if (
        object.type !== moduleType(input.packageId, "execution", "ExecutionReceipt") ||
        !(object.content instanceof Uint8Array)
      ) continue;
      requireAddressOwner(object.owner, owner);
      const parsed = receiptBcs.parse(object.content);
      if (
        parsed.id.id.bytes === normalizeSuiAddress(object.objectId) &&
        parsed.release_id.bytes === releaseId &&
        parsed.executor === owner
      ) {
        return {
          id: normalizeSuiAddress(object.objectId),
          releaseId,
          executor: parsed.executor,
          executedAt: BigInt(parsed.executed_at),
        };
      }
    }
    if (!response.hasNextPage || response.cursor === null) return undefined;
    cursor = response.cursor;
  }
  throw new Error("Receipt lookup exceeded the page limit");
}
