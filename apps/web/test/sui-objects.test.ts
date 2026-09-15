import { describe, expect, it, vi } from "vitest";

import { bcs } from "@mysten/sui/bcs";

import {
  findOwnedLicense,
  findRecordedReceipt,
  loadMarketplace,
  loadRelease,
} from "../src/live/sui-objects";

const PACKAGE_ID = `0x${"9".repeat(64)}`;
const OTHER_PACKAGE_ID = `0x${"8".repeat(64)}`;
const MARKETPLACE_ID = `0x${"a".repeat(64)}`;
const RELEASE_ID = `0x${"b".repeat(64)}`;
const OTHER_RELEASE_ID = `0x${"c".repeat(64)}`;
const ROOT_ID = `0x${"d".repeat(64)}`;
const LICENSE_ID = `0x${"e".repeat(64)}`;
const OTHER_LICENSE_ID = `0x${"f".repeat(64)}`;
const RECEIPT_ID = `0x${"1".repeat(64)}`;
const OTHER_RECEIPT_ID = `0x${"2".repeat(64)}`;
const OWNER = `0x${"3".repeat(64)}`;
const CREATOR = `0x${"4".repeat(64)}`;
const OTHER_OWNER = `0x${"5".repeat(64)}`;
const EXECUTOR_ID = MARKETPLACE_ID;

const idBcs = bcs.struct("WebTestID", { bytes: bcs.Address });
const uidBcs = bcs.struct("WebTestUID", { id: idBcs });
const tableBcs = bcs.struct("WebTestTable", {
  id: uidBcs,
  size: bcs.u64(),
});
const marketplaceBcs = bcs.struct("WebTestMarketplace", {
  id: uidBcs,
  admin: bcs.Address,
  executor_public_key: bcs.vector(bcs.u8()),
  used_receipt_nonces: tableBcs,
  license_registry: tableBcs,
});
const releaseBcs = bcs.struct("WebTestWorkflowRelease", {
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
const licenseBcs = bcs.struct("WebTestLicensePass", {
  id: uidBcs,
  release_id: idBcs,
  issued_at_ms: bcs.u64(),
});
const receiptBcs = bcs.struct("WebTestExecutionReceipt", {
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

function addressOwner(address: string): unknown {
  return { $kind: "AddressOwner", AddressOwner: address };
}

function sharedOwner(): unknown {
  return { $kind: "Shared", initialSharedVersion: "1" };
}

function marketplaceContent(input: {
  id?: string;
  executorPublicKey?: Uint8Array;
} = {}): Uint8Array {
  const table = {
    id: { id: { bytes: MARKETPLACE_ID } },
    size: 0n,
  };
  return marketplaceBcs.serialize({
    id: { id: { bytes: input.id ?? MARKETPLACE_ID } },
    admin: CREATOR,
    executor_public_key:
      input.executorPublicKey ?? Uint8Array.from({ length: 32 }, (_, index) => index),
    used_receipt_nonces: table,
    license_registry: table,
  }).toBytes();
}

function releaseContent(input: {
  id?: string;
  rootId?: string;
  workflowType?: string;
  encryptedBundleHash?: Uint8Array;
  publicManifestHash?: Uint8Array;
  active?: boolean;
} = {}): Uint8Array {
  return releaseBcs.serialize({
    id: { id: { bytes: input.id ?? RELEASE_ID } },
    root_id: { bytes: input.rootId ?? ROOT_ID },
    creator: CREATOR,
    version_major: 1n,
    version_minor: 2n,
    version_patch: 3n,
    title: "Google News RSS Monitor",
    description: "Deterministic fixture release",
    workflow_type: input.workflowType ?? "google_news_rss/v1",
    walrus_blob_id: "blob-phase5",
    encrypted_bundle_hash:
      input.encryptedBundleHash ?? new Uint8Array(32).fill(0x11),
    public_manifest_hash:
      input.publicManifestHash ?? new Uint8Array(32).fill(0x22),
    key_id: "root:phase5:release:1.2.3",
    price_mist: 123n,
    parent_release_id: null,
    active: input.active ?? true,
    created_at_ms: 1_723_900_000_000n,
  }).toBytes();
}

function licenseContent(input: {
  id?: string;
  releaseId?: string;
} = {}): Uint8Array {
  return licenseBcs.serialize({
    id: { id: { bytes: input.id ?? LICENSE_ID } },
    release_id: { bytes: input.releaseId ?? RELEASE_ID },
    issued_at_ms: 1_723_900_000_000n,
  }).toBytes();
}

function receiptContent(input: {
  id?: string;
  releaseId?: string;
  licenseId?: string;
  runner?: string;
  executorId?: string;
  nonceHash?: Uint8Array;
} = {}): Uint8Array {
  return receiptBcs.serialize({
    id: { id: { bytes: input.id ?? RECEIPT_ID } },
    release_id: { bytes: input.releaseId ?? RELEASE_ID },
    license_id: { bytes: input.licenseId ?? LICENSE_ID },
    runner: input.runner ?? OWNER,
    input_hash: new Uint8Array(32).fill(0x44),
    output_hash: new Uint8Array(32).fill(0x55),
    executor_id: { bytes: input.executorId ?? EXECUTOR_ID },
    executed_at_ms: 1_723_900_000_000n,
    nonce_hash: input.nonceHash ?? new Uint8Array(32).fill(0x66),
  }).toBytes();
}

type ObjectFixture = {
  objectId: string;
  type: string;
  owner: unknown;
  content: Uint8Array | undefined;
};

function marketplaceObject(input: Partial<ObjectFixture> = {}): ObjectFixture {
  return {
    objectId: MARKETPLACE_ID,
    type: `${PACKAGE_ID}::marketplace::Marketplace`,
    owner: sharedOwner(),
    content: marketplaceContent(),
    ...input,
  };
}

function releaseObject(input: Partial<ObjectFixture> = {}): ObjectFixture {
  return {
    objectId: RELEASE_ID,
    type: `${PACKAGE_ID}::marketplace::WorkflowRelease`,
    owner: sharedOwner(),
    content: releaseContent(),
    ...input,
  };
}

type ObjectsClient = Parameters<typeof loadMarketplace>[0]["client"];

function objectClient(object: ObjectFixture): {
  client: ObjectsClient;
  getObject: ReturnType<typeof vi.fn>;
} {
  const getObject = vi.fn(async () => ({ object }));
  return {
    client: { getObject } as unknown as ObjectsClient,
    getObject,
  };
}

describe("web Sui object BCS adapters", () => {
  it("decodes the exact configured Marketplace type, shared owner, identity, and executor key", async () => {
    const { client, getObject } = objectClient(marketplaceObject());
    const marketplace = await loadMarketplace({
      client,
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
    });

    expect(marketplace).toEqual({
      id: MARKETPLACE_ID,
      executorPublicKey: Uint8Array.from({ length: 32 }, (_, index) => index),
    });
    expect(getObject).toHaveBeenCalledWith({
      objectId: MARKETPLACE_ID,
      include: { content: true },
    });
  });

  it("decodes the exact configured WorkflowRelease BCS fixture", async () => {
    const { client } = objectClient(releaseObject());
    await expect(loadRelease({
      client,
      packageId: PACKAGE_ID,
      releaseId: RELEASE_ID,
    })).resolves.toEqual({
      id: RELEASE_ID,
      rootId: ROOT_ID,
      creator: CREATOR,
      version: "1.2.3",
      title: "Google News RSS Monitor",
      description: "Deterministic fixture release",
      workflowType: "google_news_rss/v1",
      walrusBlobId: "blob-phase5",
      encryptedBundleHash: "11".repeat(32),
      publicManifestHash: "22".repeat(32),
      keyId: "root:phase5:release:1.2.3",
      priceMist: 123n,
      active: true,
    });
  });

  it.each([
    ["wrong type", { type: `${OTHER_PACKAGE_ID}::marketplace::Marketplace` }],
    ["wrong object ID", { objectId: OTHER_PACKAGE_ID }],
    ["non-shared owner", { owner: addressOwner(OWNER) }],
    ["missing content", { content: undefined }],
    ["malformed BCS", { content: new Uint8Array([0xff]) }],
  ] as const)("rejects a Marketplace with %s", async (_label, overrides) => {
    const object = marketplaceObject(overrides);
    const { client } = objectClient(object);
    await expect(loadMarketplace({
      client,
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
    })).rejects.toThrow();
  });

  it("rejects a Marketplace whose BCS identity or executor key length is inconsistent", async () => {
    const { client: mismatchedIdClient } = objectClient({
      ...marketplaceObject(),
      content: marketplaceContent({ id: OTHER_PACKAGE_ID }),
    });
    await expect(loadMarketplace({
      client: mismatchedIdClient,
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
    })).rejects.toThrow("identity");

    const { client: shortKeyClient } = objectClient({
      ...marketplaceObject(),
      content: marketplaceContent({ executorPublicKey: new Uint8Array(31) }),
    });
    await expect(loadMarketplace({
      client: shortKeyClient,
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
    })).rejects.toThrow("executor public key");
  });

  it("rejects WorkflowRelease type, shared-owner, identity, workflow, and BCS mismatches", async () => {
    const invalidObjects: ObjectFixture[] = [
      releaseObject({ type: `${OTHER_PACKAGE_ID}::marketplace::WorkflowRelease` }),
      releaseObject({ owner: addressOwner(OWNER) }),
      releaseObject({ objectId: OTHER_RELEASE_ID }),
      releaseObject({ content: releaseContent({ id: OTHER_RELEASE_ID }) }),
      releaseObject({ content: releaseContent({ workflowType: "other/v1" }) }),
      releaseObject({ content: new Uint8Array([0xff]) }),
    ];

    for (const object of invalidObjects) {
      const { client } = objectClient(object);
      await expect(loadRelease({
        client,
        packageId: PACKAGE_ID,
        releaseId: RELEASE_ID,
      })).rejects.toThrow();
    }
  });

  it("paginates owned LicensePass objects and returns only an exact release match", async () => {
    const secondLicenseId = `0x${"6".repeat(64)}`;
    const listOwnedObjects = vi.fn()
      .mockResolvedValueOnce({
        objects: [{
          objectId: LICENSE_ID,
          type: `${PACKAGE_ID}::marketplace::LicensePass`,
          owner: addressOwner(OWNER),
          content: licenseContent({ releaseId: OTHER_RELEASE_ID }),
        }],
        hasNextPage: true,
        cursor: "license-page-2",
      })
      .mockResolvedValueOnce({
        objects: [{
          objectId: secondLicenseId,
          type: `${PACKAGE_ID}::marketplace::LicensePass`,
          owner: addressOwner(OWNER),
          content: licenseContent({ id: secondLicenseId }),
        }],
        hasNextPage: false,
        cursor: null,
      });
    const client = { listOwnedObjects } as unknown as ObjectsClient;

    await expect(findOwnedLicense({
      client,
      packageId: PACKAGE_ID,
      owner: OWNER,
      releaseId: RELEASE_ID,
    })).resolves.toEqual({
      id: secondLicenseId,
      releaseId: RELEASE_ID,
      issuedAtMs: 1_723_900_000_000n,
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(1, {
      owner: OWNER,
      type: `${PACKAGE_ID}::marketplace::LicensePass`,
      cursor: null,
      limit: 50,
      include: { content: true },
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(2, {
      owner: OWNER,
      type: `${PACKAGE_ID}::marketplace::LicensePass`,
      cursor: "license-page-2",
      limit: 50,
      include: { content: true },
    });
  });

  it("returns no license for another release and rejects a forged owner", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [{
        objectId: LICENSE_ID,
        type: `${PACKAGE_ID}::marketplace::LicensePass`,
        owner: addressOwner(OTHER_OWNER),
        content: licenseContent({ releaseId: OTHER_RELEASE_ID }),
      }],
      hasNextPage: false,
      cursor: null,
    }));
    const client = { listOwnedObjects } as unknown as ObjectsClient;

    await expect(findOwnedLicense({
      client,
      packageId: PACKAGE_ID,
      owner: OWNER,
      releaseId: RELEASE_ID,
    })).rejects.toThrow("owner");
  });

  it("paginates receipts and returns only an exact release/license/runner/marketplace/nonce match", async () => {
    const nonceHash = new Uint8Array(32).fill(0x66);
    const listOwnedObjects = vi.fn()
      .mockResolvedValueOnce({
        objects: [{
          objectId: OTHER_RECEIPT_ID,
          type: `${PACKAGE_ID}::marketplace::ExecutionReceipt`,
          owner: addressOwner(OWNER),
          content: receiptContent({ nonceHash: new Uint8Array(32).fill(0x77) }),
        }],
        hasNextPage: true,
        cursor: "receipt-page-2",
      })
      .mockResolvedValueOnce({
        objects: [{
          objectId: RECEIPT_ID,
          type: `${PACKAGE_ID}::marketplace::ExecutionReceipt`,
          owner: addressOwner(OWNER),
          content: receiptContent({ nonceHash }),
        }],
        hasNextPage: false,
        cursor: null,
      });
    const client = { listOwnedObjects } as unknown as ObjectsClient;

    await expect(findRecordedReceipt({
      client,
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      owner: OWNER,
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      nonceHash: "66".repeat(32),
    })).resolves.toEqual({
      id: RECEIPT_ID,
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      runner: OWNER,
      nonceHash: "66".repeat(32),
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(1, {
      owner: OWNER,
      type: `${PACKAGE_ID}::marketplace::ExecutionReceipt`,
      cursor: null,
      limit: 50,
      include: { content: true },
    });
  });

  it("does not treat malformed receipt BCS as a match", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [{
        objectId: RECEIPT_ID,
        type: `${PACKAGE_ID}::marketplace::ExecutionReceipt`,
        owner: addressOwner(OWNER),
        content: new Uint8Array([0xff]),
      }],
      hasNextPage: false,
      cursor: null,
    }));
    const client = { listOwnedObjects } as unknown as ObjectsClient;

    await expect(findRecordedReceipt({
      client,
      packageId: PACKAGE_ID,
      marketplaceId: MARKETPLACE_ID,
      owner: OWNER,
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      nonceHash: "66".repeat(32),
    })).rejects.toThrow();
  });
});
