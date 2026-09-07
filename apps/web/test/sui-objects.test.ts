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
const RECEIPT_ID = `0x${"1".repeat(64)}`;
const OTHER_RECEIPT_ID = `0x${"2".repeat(64)}`;
const OWNER = `0x${"3".repeat(64)}`;
const CREATOR = `0x${"4".repeat(64)}`;
const OTHER_OWNER = `0x${"5".repeat(64)}`;

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
  parent_release_id: bcs.option(idBcs),
  version: bcs.string(),
  blob_id: bcs.string(),
  price_license: bcs.u64(),
  price_fork: bcs.u64(),
  royalty_bps: bcs.u64(),
  is_listed: bcs.bool(),
  created_at: bcs.u64(),
});
const licenseBcs = bcs.struct("WebTestLicensePass", {
  id: uidBcs,
  release_id: idBcs,
  owner: bcs.Address,
  remaining_runs: bcs.option(bcs.u64()),
  expires_at: bcs.option(bcs.u64()),
});
const receiptBcs = bcs.struct("WebTestExecutionReceipt", {
  id: uidBcs,
  release_id: idBcs,
  executor: bcs.Address,
  executed_at: bcs.u64(),
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
  isListed?: boolean;
} = {}): Uint8Array {
  return releaseBcs.serialize({
    id: { id: { bytes: input.id ?? RELEASE_ID } },
    root_id: { bytes: input.rootId ?? ROOT_ID },
    parent_release_id: null,
    version: "1.2.3",
    blob_id: "blob-test",
    price_license: 100n,
    price_fork: 200n,
    royalty_bps: 500n,
    is_listed: input.isListed ?? true,
    created_at: 1_723_900_000_000n,
  }).toBytes();
}

function licenseContent(input: {
  id?: string;
  releaseId?: string;
} = {}): Uint8Array {
  return licenseBcs.serialize({
    id: { id: { bytes: input.id ?? LICENSE_ID } },
    release_id: { bytes: input.releaseId ?? RELEASE_ID },
    owner: OWNER,
    remaining_runs: 10n,
    expires_at: null,
  }).toBytes();
}

function receiptContent(input: {
  id?: string;
  releaseId?: string;
  executor?: string;
} = {}): Uint8Array {
  return receiptBcs.serialize({
    id: { id: { bytes: input.id ?? RECEIPT_ID } },
    release_id: { bytes: input.releaseId ?? RELEASE_ID },
    executor: input.executor ?? OWNER,
    executed_at: 1_723_900_000_000n,
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
    type: `${PACKAGE_ID}::agent::WorkflowRelease`,
    owner: addressOwner(CREATOR),
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
      parentReleaseId: null,
      version: "1.2.3",
      blobId: "blob-test",
      priceLicense: 100n,
      priceFork: 200n,
      royaltyBps: 500n,
      isListed: true,
      createdAt: 1_723_900_000_000n,
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

  it("rejects WorkflowRelease type, identity, and BCS mismatches", async () => {
    const invalidObjects: ObjectFixture[] = [
      releaseObject({ type: `${OTHER_PACKAGE_ID}::agent::WorkflowRelease` }),
      releaseObject({ objectId: OTHER_RELEASE_ID }),
      releaseObject({ content: releaseContent({ id: OTHER_RELEASE_ID }) }),
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
          type: `${PACKAGE_ID}::license::LicensePass`,
          owner: addressOwner(OWNER),
          content: licenseContent({ releaseId: OTHER_RELEASE_ID }),
        }],
        hasNextPage: true,
        cursor: "license-page-2",
      })
      .mockResolvedValueOnce({
        objects: [{
          objectId: secondLicenseId,
          type: `${PACKAGE_ID}::license::LicensePass`,
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
      owner: OWNER,
      remainingRuns: 10n,
      expiresAt: null,
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(1, {
      owner: OWNER,
      type: `${PACKAGE_ID}::license::LicensePass`,
      cursor: null,
      limit: 50,
      include: { content: true },
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(2, {
      owner: OWNER,
      type: `${PACKAGE_ID}::license::LicensePass`,
      cursor: "license-page-2",
      limit: 50,
      include: { content: true },
    });
  });

  it("returns no license for another release and rejects a forged owner", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [{
        objectId: LICENSE_ID,
        type: `${PACKAGE_ID}::license::LicensePass`,
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

  it("paginates receipts and returns only an exact release/executor match", async () => {
    const listOwnedObjects = vi.fn()
      .mockResolvedValueOnce({
        objects: [{
          objectId: OTHER_RECEIPT_ID,
          type: `${PACKAGE_ID}::execution::ExecutionReceipt`,
          owner: addressOwner(OWNER),
          content: receiptContent({ releaseId: OTHER_RELEASE_ID }),
        }],
        hasNextPage: true,
        cursor: "receipt-page-2",
      })
      .mockResolvedValueOnce({
        objects: [{
          objectId: RECEIPT_ID,
          type: `${PACKAGE_ID}::execution::ExecutionReceipt`,
          owner: addressOwner(OWNER),
          content: receiptContent(),
        }],
        hasNextPage: false,
        cursor: null,
      });
    const client = { listOwnedObjects } as unknown as ObjectsClient;

    await expect(findRecordedReceipt({
      client,
      packageId: PACKAGE_ID,
      owner: OWNER,
      releaseId: RELEASE_ID,
    })).resolves.toEqual({
      id: RECEIPT_ID,
      releaseId: RELEASE_ID,
      executor: OWNER,
      executedAt: 1_723_900_000_000n,
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(1, {
      owner: OWNER,
      type: `${PACKAGE_ID}::execution::ExecutionReceipt`,
      cursor: null,
      limit: 50,
      include: { content: true },
    });
  });

  it("does not treat malformed receipt BCS as a match", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [{
        objectId: RECEIPT_ID,
        type: `${PACKAGE_ID}::execution::ExecutionReceipt`,
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
      owner: OWNER,
      releaseId: RELEASE_ID,
    })).rejects.toThrow();
  });
});
