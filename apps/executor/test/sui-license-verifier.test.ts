import { describe, expect, it } from "vitest";

import { bcs } from "@mysten/sui/bcs";

import { ExecutorError } from "../src/errors.js";
import {
  SuiLicenseVerifier,
  type SuiObjectReader,
  type SuiReadableObject,
} from "../src/sui/sui-license-verifier.js";

const PACKAGE_ID = `0x${"9".repeat(64)}`;
const OTHER_PACKAGE_ID = `0x${"8".repeat(64)}`;
const LICENSE_ID = `0x${"b".repeat(64)}`;
const RELEASE_ID = `0x${"c".repeat(64)}`;
const OTHER_RELEASE_ID = `0x${"d".repeat(64)}`;
const ROOT_ID = `0x${"a".repeat(64)}`;
const RUNNER = `0x${"1".repeat(64)}`;
const OTHER_RUNNER = `0x${"2".repeat(64)}`;

const idBcs = bcs.struct("Phase4ID", { bytes: bcs.Address });
const uidBcs = bcs.struct("Phase4UID", { id: idBcs });
const licensePassBcs = bcs.struct("Phase4LicensePass", {
  id: uidBcs,
  release_id: idBcs,
  issued_at_ms: bcs.u64(),
});
const workflowReleaseBcs = bcs.struct("Phase4WorkflowRelease", {
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

function addressOwner(address: string): unknown {
  return { $kind: "AddressOwner", AddressOwner: address };
}

function sharedOwner(): unknown {
  return { $kind: "Shared", initialSharedVersion: "1" };
}

function licenseContent(
  overrides: { id?: string; releaseId?: string } = {},
): Uint8Array {
  return licensePassBcs
    .serialize({
      id: { id: { bytes: overrides.id ?? LICENSE_ID } },
      release_id: { bytes: overrides.releaseId ?? RELEASE_ID },
      issued_at_ms: 1723900000000n,
    })
    .toBytes();
}

function releaseContent(
  overrides: {
    id?: string;
    rootId?: string;
    active?: boolean;
    workflowType?: string;
    encryptedBundleHash?: Uint8Array;
    publicManifestHash?: Uint8Array;
  } = {},
): Uint8Array {
  return workflowReleaseBcs
    .serialize({
      id: { id: { bytes: overrides.id ?? RELEASE_ID } },
      root_id: { bytes: overrides.rootId ?? ROOT_ID },
      creator: RUNNER,
      version_major: 1n,
      version_minor: 2n,
      version_patch: 3n,
      title: "Google News RSS Monitor",
      description: "Fixture release",
      workflow_type: overrides.workflowType ?? "google_news_rss/v1",
      walrus_blob_id: "blob-phase4",
      encrypted_bundle_hash:
        overrides.encryptedBundleHash ?? new Uint8Array(32).fill(0x11),
      public_manifest_hash:
        overrides.publicManifestHash ?? new Uint8Array(32).fill(0x22),
      key_id: "root:phase4:release:1.2.3",
      price_mist: 100n,
      parent_release_id: null,
      active: overrides.active ?? true,
      created_at_ms: 1723900000000n,
    })
    .toBytes();
}

function readerFor(
  object: SuiReadableObject | (() => SuiReadableObject) | Error,
): { reader: SuiObjectReader; calls: Array<{ objectId: string }> } {
  const calls: Array<{ objectId: string }> = [];
  return {
    reader: {
      getObject: async (input) => {
        calls.push({ objectId: input.objectId });
        if (object instanceof Error) throw object;
        return { object: typeof object === "function" ? object() : object };
      },
    },
    calls,
  };
}

function licenseObject(overrides: Partial<SuiReadableObject> = {}): SuiReadableObject {
  return {
    objectId: LICENSE_ID,
    type: `${PACKAGE_ID}::marketplace::LicensePass`,
    owner: addressOwner(RUNNER),
    content: licenseContent(),
    ...overrides,
  };
}

function releaseObject(overrides: Partial<SuiReadableObject> = {}): SuiReadableObject {
  return {
    objectId: RELEASE_ID,
    type: `${PACKAGE_ID}::marketplace::WorkflowRelease`,
    owner: sharedOwner(),
    content: releaseContent(),
    ...overrides,
  };
}

function expectCode(action: () => Promise<unknown>, code: string) {
  return expect(action()).rejects.toMatchObject({ code });
}

describe("Sui LicensePass verification", () => {
  it("requires the exact configured Move package type and matching owner/release BCS", async () => {
    const { reader, calls } = readerFor(licenseObject());
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expect(verifier.verify({
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      runnerAddress: RUNNER,
    })).resolves.toBeUndefined();
    expect(calls).toEqual([{ objectId: LICENSE_ID }]);
  });

  it("rejects a license owned by a different runner", async () => {
    const { reader } = readerFor(
      licenseObject({ owner: addressOwner(OTHER_RUNNER) }),
    );
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expectCode(
      () => verifier.verify({ releaseId: RELEASE_ID, licenseId: LICENSE_ID, runnerAddress: RUNNER }),
      "LICENSE_OWNER_MISMATCH",
    );
  });

  it("rejects a LicensePass bound to another release", async () => {
    const { reader } = readerFor(
      licenseObject({ content: licenseContent({ releaseId: OTHER_RELEASE_ID }) }),
    );
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expectCode(
      () => verifier.verify({ releaseId: RELEASE_ID, licenseId: LICENSE_ID, runnerAddress: RUNNER }),
      "LICENSE_RELEASE_MISMATCH",
    );
  });

  it.each([
    ["wrong package type", { type: `${OTHER_PACKAGE_ID}::marketplace::LicensePass` }],
    ["wrong struct type", { type: `${PACKAGE_ID}::marketplace::WorkflowRelease` }],
    ["wrong object identity", { objectId: OTHER_RELEASE_ID }],
    ["malformed BCS", { content: Uint8Array.from([1, 2, 3]) }],
  ] as const)("rejects %s", async (_label, overrides) => {
    const { reader } = readerFor(licenseObject(overrides));
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expectCode(
      () => verifier.verify({ releaseId: RELEASE_ID, licenseId: LICENSE_ID, runnerAddress: RUNNER }),
      "LICENSE_NOT_FOUND",
    );
  });

  it("maps reader failures to LICENSE_NOT_FOUND", async () => {
    const { reader } = readerFor(new Error("offline Sui testnet is forbidden"));
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expectCode(
      () => verifier.verify({ releaseId: RELEASE_ID, licenseId: LICENSE_ID, runnerAddress: RUNNER }),
      "LICENSE_NOT_FOUND",
    );
  });
});

describe("Sui WorkflowRelease BCS verification", () => {
  it("decodes the exact configured package type and release metadata", async () => {
    const { reader, calls } = readerFor(releaseObject());
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expect(verifier.getRelease(RELEASE_ID)).resolves.toEqual({
      releaseId: RELEASE_ID,
      rootId: ROOT_ID,
      version: "1.2.3",
      workflowType: "google_news_rss/v1",
      walrusBlobId: "blob-phase4",
      encryptedBundleHash: "11".repeat(32),
      publicManifestHash: "22".repeat(32),
      keyId: "root:phase4:release:1.2.3",
      active: true,
    });
    expect(calls).toEqual([{ objectId: RELEASE_ID }]);
  });

  it.each([
    ["wrong package type", { type: `${OTHER_PACKAGE_ID}::marketplace::WorkflowRelease` }, "INTERNAL_ERROR"],
    ["not shared", { owner: addressOwner(RUNNER) }, "INTERNAL_ERROR"],
    ["wrong object identity", { objectId: OTHER_RELEASE_ID }, "INTERNAL_ERROR"],
    ["malformed BCS", { content: Uint8Array.from([9, 9]) }, "INTERNAL_ERROR"],
    ["inactive", { content: releaseContent({ active: false }) }, "RELEASE_INACTIVE"],
    ["unsupported workflow", { content: releaseContent({ workflowType: "other/v1" }) }, "INTERNAL_ERROR"],
    ["short encrypted hash", { content: releaseContent({ encryptedBundleHash: new Uint8Array(31) }) }, "INTERNAL_ERROR"],
  ] as const)("rejects %s", async (_label, overrides, code) => {
    const { reader } = readerFor(releaseObject(overrides));
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    await expectCode(() => verifier.getRelease(RELEASE_ID), code);
  });

  it("does not expose BCS parsing or remote reader details in errors", async () => {
    const secret = "PRIVATE_SUI_READER_BODY";
    const { reader } = readerFor(new Error(secret));
    const verifier = new SuiLicenseVerifier({ reader, packageId: PACKAGE_ID });

    let caught: unknown;
    try {
      await verifier.getRelease(RELEASE_ID);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ExecutorError);
    expect((caught as Error).message).not.toContain(secret);
  });
});
