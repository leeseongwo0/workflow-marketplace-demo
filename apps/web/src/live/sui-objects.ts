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
  creator: bcs.Address,
  version_major: bcs.u64(),
  version_minor: bcs.u64(),
  version_patch: bcs.u64(),
  title: bcs.string(),
  description: bcs.string(),
  workflow_type: bcs.string(),
  walrus_blob_id: bcs.string(),
  encrypted_bundle_hash: bcs.vector(bcs.u8()),
  public_manifest_hash: bcs.vector(bcs.u8()),
  key_id: bcs.string(),
  price_mist: bcs.u64(),
  parent_release_id: bcs.option(idBcs),
  active: bcs.bool(),
  created_at_ms: bcs.u64(),
});

const licenseBcs = bcs.struct("WebLicensePass", {
  id: uidBcs,
  release_id: idBcs,
  issued_at_ms: bcs.u64(),
});

const receiptBcs = bcs.struct("WebExecutionReceipt", {
  id: uidBcs,
  release_id: idBcs,
  license_id: idBcs,
  runner: bcs.Address,
  input_hash: bcs.vector(bcs.u8()),
  output_hash: bcs.vector(bcs.u8()),
  executor_id: idBcs,
  executed_at_ms: bcs.u64(),
  nonce_hash: bcs.vector(bcs.u8()),
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
  creator: string;
  version: string;
  title: string;
  description: string;
  workflowType: "google_news_rss/v1";
  walrusBlobId: string;
  encryptedBundleHash: string;
  publicManifestHash: string;
  keyId: string;
  priceMist: bigint;
  active: boolean;
}

export interface OwnedLicense {
  id: string;
  releaseId: string;
  issuedAtMs: bigint;
}

export interface OwnedReceipt {
  id: string;
  releaseId: string;
  licenseId: string;
  runner: string;
  nonceHash: string;
}

function exactType(packageId: string, structName: string): string {
  return `${normalizeSuiAddress(packageId)}::marketplace::${structName}`;
}

function bytesHex(bytes: readonly number[], length: number, label: string): string {
  const value = Uint8Array.from(bytes);
  if (value.length !== length) throw new Error(`${label} has an invalid length`);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    object.type !== exactType(input.packageId, "Marketplace") ||
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
    object.type !== exactType(input.packageId, "WorkflowRelease") ||
    !(object.content instanceof Uint8Array)
  ) {
    throw new Error("Configured WorkflowRelease is invalid");
  }
  requireSharedOwner(object.owner);
  const parsed = releaseBcs.parse(object.content);
  if (parsed.id.id.bytes !== releaseId) {
    throw new Error("WorkflowRelease object identity is inconsistent");
  }
  if (parsed.workflow_type !== "google_news_rss/v1") {
    throw new Error("WorkflowRelease type is unsupported");
  }
  return {
    id: releaseId,
    rootId: parsed.root_id.bytes,
    creator: parsed.creator,
    version: `${parsed.version_major}.${parsed.version_minor}.${parsed.version_patch}`,
    title: parsed.title,
    description: parsed.description,
    workflowType: "google_news_rss/v1",
    walrusBlobId: parsed.walrus_blob_id,
    encryptedBundleHash: bytesHex(parsed.encrypted_bundle_hash, 32, "Encrypted bundle hash"),
    publicManifestHash: bytesHex(parsed.public_manifest_hash, 32, "Public manifest hash"),
    keyId: parsed.key_id,
    priceMist: BigInt(parsed.price_mist),
    active: parsed.active,
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
      type: exactType(input.packageId, "LicensePass"),
      cursor,
      limit: 50,
      include: { content: true },
    });
    for (const object of response.objects) {
      if (
        object.type !== exactType(input.packageId, "LicensePass") ||
        !(object.content instanceof Uint8Array)
      ) continue;
      requireAddressOwner(object.owner, owner);
      const parsed = licenseBcs.parse(object.content);
      if (parsed.id.id.bytes !== normalizeSuiAddress(object.objectId)) continue;
      if (parsed.release_id.bytes === releaseId) {
        return {
          id: normalizeSuiAddress(object.objectId),
          releaseId,
          issuedAtMs: BigInt(parsed.issued_at_ms),
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
  marketplaceId: string;
  owner: string;
  releaseId: string;
  licenseId: string;
  nonceHash: string;
}): Promise<OwnedReceipt | undefined> {
  const owner = normalizeSuiAddress(input.owner);
  const releaseId = normalizeSuiAddress(input.releaseId);
  const licenseId = normalizeSuiAddress(input.licenseId);
  const marketplaceId = normalizeSuiAddress(input.marketplaceId);
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const response: OwnedObjectPage = await input.client.listOwnedObjects({
      owner,
      type: exactType(input.packageId, "ExecutionReceipt"),
      cursor,
      limit: 50,
      include: { content: true },
    });
    for (const object of response.objects) {
      if (
        object.type !== exactType(input.packageId, "ExecutionReceipt") ||
        !(object.content instanceof Uint8Array)
      ) continue;
      requireAddressOwner(object.owner, owner);
      const parsed = receiptBcs.parse(object.content);
      const nonceHash = bytesHex(parsed.nonce_hash, 32, "Receipt nonce hash");
      if (
        parsed.id.id.bytes === normalizeSuiAddress(object.objectId) &&
        parsed.release_id.bytes === releaseId &&
        parsed.license_id.bytes === licenseId &&
        parsed.runner === owner &&
        parsed.executor_id.bytes === marketplaceId &&
        nonceHash === input.nonceHash
      ) {
        return {
          id: normalizeSuiAddress(object.objectId),
          releaseId,
          licenseId,
          runner: owner,
          nonceHash,
        };
      }
    }
    if (!response.hasNextPage || response.cursor === null) return undefined;
    cursor = response.cursor;
  }
  throw new Error("Receipt lookup exceeded the page limit");
}
