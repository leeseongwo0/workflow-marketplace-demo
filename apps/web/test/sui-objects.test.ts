import { describe, expect, it, vi } from "vitest";

import { bcs } from "@mysten/sui/bcs";

import {
  findOwnedLicense,
  findRecordedReceipt,
  loadMarketplace,
  loadRelease,
  loadRoot,
} from "../src/live/sui-objects";

const PACKAGE_ID = `0x${"9".repeat(64)}`;
const OTHER_PACKAGE_ID = `0x${"8".repeat(64)}`;
const CONFIG_ID = `0x${"a".repeat(64)}`;
const RELEASE_ID = `0x${"b".repeat(64)}`;
const OTHER_RELEASE_ID = `0x${"c".repeat(64)}`;
const ROOT_ID = `0x${"d".repeat(64)}`;
const AGENT_ID = `0x${"7".repeat(64)}`;
const LICENSE_ID = `0x${"e".repeat(64)}`;
const RECEIPT_ID = `0x${"1".repeat(64)}`;
const OTHER_RECEIPT_ID = `0x${"2".repeat(64)}`;
const OWNER = `0x${"3".repeat(64)}`;
const ADMIN = `0x${"4".repeat(64)}`;
const OTHER_OWNER = `0x${"5".repeat(64)}`;
const EXECUTED_AT = 1_723_900_000_000n;

const CONFIG_TYPE = `${PACKAGE_ID}::marketplace::MarketplaceConfig`;
const ROOT_TYPE = `${PACKAGE_ID}::agent::WorkflowRoot`;
const RELEASE_TYPE = `${PACKAGE_ID}::agent::WorkflowRelease`;
const LICENSE_TYPE = `${PACKAGE_ID}::license::LicensePass`;
const RECEIPT_TYPE = `${PACKAGE_ID}::execution::ExecutionReceipt`;

/*
 * Serialisers written independently of the ones under test, in the field order
 * the deployed package declares. BCS is positional and silently decodes a
 * wrong order into nonsense, so the fixtures have to be built from the struct
 * definition rather than from the parser.
 */
const idBcs = bcs.struct("WebTestID", { bytes: bcs.Address });
const uidBcs = bcs.struct("WebTestUID", { id: idBcs });

const configBcs = bcs.struct("WebTestMarketplaceConfig", {
  id: uidBcs,
  admin: bcs.Address,
  fee_bps: bcs.u64(),
  fee_recipient: bcs.Address,
});

const rootBcs = bcs.struct("WebTestWorkflowRoot", {
  id: uidBcs,
  agent_id: idBcs,
  name: bcs.string(),
  description: bcs.string(),
  created_at: bcs.u64(),
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
  max_runs: bcs.option(bcs.u64()),
  max_duration_ms: bcs.option(bcs.u64()),
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

function configContent(input: { id?: string } = {}): Uint8Array {
  return configBcs.serialize({
    id: { id: { bytes: input.id ?? CONFIG_ID } },
    admin: ADMIN,
    fee_bps: 200n,
    fee_recipient: ADMIN,
  }).toBytes();
}

function rootContent(input: { id?: string; name?: string } = {}): Uint8Array {
  return rootBcs.serialize({
    id: { id: { bytes: input.id ?? ROOT_ID } },
    agent_id: { bytes: AGENT_ID },
    name: input.name ?? "Google News RSS",
    description: "Deterministic fixture root",
    created_at: EXECUTED_AT,
  }).toBytes();
}

function releaseContent(input: {
  id?: string;
  rootId?: string;
  maxRuns?: bigint;
  maxDurationMs?: bigint;
} = {}): Uint8Array {
  return releaseBcs.serialize({
    id: { id: { bytes: input.id ?? RELEASE_ID } },
    root_id: { bytes: input.rootId ?? ROOT_ID },
    parent_release_id: null,
    version: "1.0.0",
    blob_id: "blob-phase5",
    price_license: 123n,
    price_fork: 456n,
    royalty_bps: 500n,
    max_runs: input.maxRuns ?? null,
    max_duration_ms: input.maxDurationMs ?? null,
    is_listed: true,
    created_at: EXECUTED_AT,
  }).toBytes();
}

function licenseContent(input: { id?: string; releaseId?: string } = {}): Uint8Array {
  return licenseBcs.serialize({
    id: { id: { bytes: input.id ?? LICENSE_ID } },
    release_id: { bytes: input.releaseId ?? RELEASE_ID },
    owner: OWNER,
    remaining_runs: null,
    expires_at: null,
  }).toBytes();
}

function receiptContent(input: { id?: string; releaseId?: string } = {}): Uint8Array {
  return receiptBcs.serialize({
    id: { id: { bytes: input.id ?? RECEIPT_ID } },
    release_id: { bytes: input.releaseId ?? RELEASE_ID },
    executor: OWNER,
    executed_at: EXECUTED_AT,
  }).toBytes();
}

type ObjectFixture = {
  objectId: string;
  type: string;
  owner: unknown;
  content: Uint8Array | undefined;
};

function configObject(input: Partial<ObjectFixture> = {}): ObjectFixture {
  return {
    objectId: CONFIG_ID,
    type: CONFIG_TYPE,
    owner: sharedOwner(),
    content: configContent(),
    ...input,
  };
}

function rootObject(input: Partial<ObjectFixture> = {}): ObjectFixture {
  return {
    objectId: ROOT_ID,
    type: ROOT_TYPE,
    owner: addressOwner(OWNER),
    content: rootContent(),
    ...input,
  };
}

function releaseObject(input: Partial<ObjectFixture> = {}): ObjectFixture {
  return {
    objectId: RELEASE_ID,
    type: RELEASE_TYPE,
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
  return { client: { getObject } as unknown as ObjectsClient, getObject };
}

describe("web Sui object BCS adapters", () => {
  it("decodes the configured MarketplaceConfig type, shared owner, and identity", async () => {
    const { client, getObject } = objectClient(configObject());
    await expect(loadMarketplace({
      client,
      packageId: PACKAGE_ID,
      marketplaceId: CONFIG_ID,
    })).resolves.toEqual({ id: CONFIG_ID, admin: ADMIN, feeBps: 200n });

    expect(getObject).toHaveBeenCalledWith({
      objectId: CONFIG_ID,
      include: { content: true },
    });
  });

  it.each([
    ["wrong type", { type: `${OTHER_PACKAGE_ID}::marketplace::MarketplaceConfig` }],
    ["wrong object ID", { objectId: OTHER_PACKAGE_ID }],
    ["non-shared owner", { owner: addressOwner(OWNER) }],
    ["missing content", { content: undefined }],
    ["malformed BCS", { content: new Uint8Array([0xff]) }],
    ["inconsistent BCS identity", { content: configContent({ id: OTHER_PACKAGE_ID }) }],
  ] as const)("rejects a MarketplaceConfig with %s", async (_label, overrides) => {
    const { client } = objectClient(configObject(overrides));
    await expect(loadMarketplace({
      client,
      packageId: PACKAGE_ID,
      marketplaceId: CONFIG_ID,
    })).rejects.toThrow();
  });

  it("decodes the WorkflowRoot that carries the title and blurb", async () => {
    const { client } = objectClient(rootObject());
    await expect(loadRoot({
      client,
      packageId: PACKAGE_ID,
      rootId: ROOT_ID,
    })).resolves.toEqual({
      id: ROOT_ID,
      name: "Google News RSS",
      description: "Deterministic fixture root",
    });
  });

  it.each([
    ["wrong type", { type: `${OTHER_PACKAGE_ID}::agent::WorkflowRoot` }],
    ["wrong object ID", { objectId: OTHER_PACKAGE_ID }],
    ["missing content", { content: undefined }],
    ["malformed BCS", { content: new Uint8Array([0xff]) }],
    ["inconsistent BCS identity", { content: rootContent({ id: OTHER_RELEASE_ID }) }],
  ] as const)("rejects a WorkflowRoot with %s", async (_label, overrides) => {
    const { client } = objectClient(rootObject(overrides));
    await expect(loadRoot({
      client,
      packageId: PACKAGE_ID,
      rootId: ROOT_ID,
    })).rejects.toThrow();
  });

  it("decodes the WorkflowRelease fixture field for field", async () => {
    const { client } = objectClient(releaseObject());
    await expect(loadRelease({
      client,
      packageId: PACKAGE_ID,
      releaseId: RELEASE_ID,
    })).resolves.toEqual({
      id: RELEASE_ID,
      rootId: ROOT_ID,
      parentReleaseId: undefined,
      version: "1.0.0",
      blobId: "blob-phase5",
      priceLicense: 123n,
      priceFork: 456n,
      royaltyBps: 500n,
      maxRuns: undefined,
      maxDurationMs: undefined,
      isListed: true,
    });
  });

  it("reads the run and duration caps a seller set", async () => {
    const { client } = objectClient(
      releaseObject({ content: releaseContent({ maxRuns: 10n, maxDurationMs: 60_000n }) }),
    );
    await expect(loadRelease({
      client,
      packageId: PACKAGE_ID,
      releaseId: RELEASE_ID,
    })).resolves.toMatchObject({ maxRuns: 10n, maxDurationMs: 60_000n });
  });

  it.each([
    ["wrong type", { type: `${OTHER_PACKAGE_ID}::agent::WorkflowRelease` }],
    ["non-shared owner", { owner: addressOwner(OWNER) }],
    ["wrong object ID", { objectId: OTHER_RELEASE_ID }],
    ["inconsistent BCS identity", { content: releaseContent({ id: OTHER_RELEASE_ID }) }],
    ["malformed BCS", { content: new Uint8Array([0xff]) }],
  ] as const)("rejects a WorkflowRelease with %s", async (_label, overrides) => {
    const { client } = objectClient(releaseObject(overrides));
    await expect(loadRelease({
      client,
      packageId: PACKAGE_ID,
      releaseId: RELEASE_ID,
    })).rejects.toThrow();
  });

  it("paginates owned LicensePass objects and returns only an exact release match", async () => {
    const secondLicenseId = `0x${"6".repeat(64)}`;
    const listOwnedObjects = vi.fn()
      .mockResolvedValueOnce({
        objects: [{
          objectId: LICENSE_ID,
          type: LICENSE_TYPE,
          owner: addressOwner(OWNER),
          content: licenseContent({ releaseId: OTHER_RELEASE_ID }),
        }],
        hasNextPage: true,
        cursor: "license-page-2",
      })
      .mockResolvedValueOnce({
        objects: [{
          objectId: secondLicenseId,
          type: LICENSE_TYPE,
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
      remainingRuns: undefined,
      expiresAt: undefined,
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(1, {
      owner: OWNER,
      type: LICENSE_TYPE,
      cursor: null,
      limit: 50,
      include: { content: true },
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(2, {
      owner: OWNER,
      type: LICENSE_TYPE,
      cursor: "license-page-2",
      limit: 50,
      include: { content: true },
    });
  });

  it("rejects a LicensePass the node reports as owned by someone else", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [{
        objectId: LICENSE_ID,
        type: LICENSE_TYPE,
        owner: addressOwner(OTHER_OWNER),
        content: licenseContent(),
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

  it("paginates receipts and returns only one recorded against this release", async () => {
    const listOwnedObjects = vi.fn()
      .mockResolvedValueOnce({
        objects: [{
          objectId: OTHER_RECEIPT_ID,
          type: RECEIPT_TYPE,
          owner: addressOwner(OWNER),
          content: receiptContent({
            id: OTHER_RECEIPT_ID,
            releaseId: OTHER_RELEASE_ID,
          }),
        }],
        hasNextPage: true,
        cursor: "receipt-page-2",
      })
      .mockResolvedValueOnce({
        objects: [{
          objectId: RECEIPT_ID,
          type: RECEIPT_TYPE,
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
      executedAt: EXECUTED_AT,
    });
    expect(listOwnedObjects).toHaveBeenNthCalledWith(1, {
      owner: OWNER,
      type: RECEIPT_TYPE,
      cursor: null,
      limit: 50,
      include: { content: true },
    });
  });

  it("does not treat malformed receipt BCS as a match", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [{
        objectId: RECEIPT_ID,
        type: RECEIPT_TYPE,
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
