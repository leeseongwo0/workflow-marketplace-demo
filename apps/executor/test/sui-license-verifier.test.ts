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

const idBcs = bcs.struct("TestID", { bytes: bcs.Address });
const uidBcs = bcs.struct("TestUID", { id: idBcs });
const licensePassBcs = bcs.struct("TestLicensePass", {
  id: uidBcs,
  release_id: idBcs,
  owner: bcs.Address,
  remaining_runs: bcs.option(bcs.u64()),
  expires_at: bcs.option(bcs.u64()),
});
const workflowReleaseBcs = bcs.struct("TestWorkflowRelease", {
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

function addressOwner(address: string): unknown {
  return { $kind: "AddressOwner", AddressOwner: address };
}

function licenseContent(
  overrides: {
    id?: string;
    releaseId?: string;
    owner?: string;
    remainingRuns?: bigint | null;
    expiresAt?: bigint | null;
  } = {},
): Uint8Array {
  return licensePassBcs
    .serialize({
      id: { id: { bytes: overrides.id ?? LICENSE_ID } },
      release_id: { bytes: overrides.releaseId ?? RELEASE_ID },
      owner: overrides.owner ?? RUNNER,
      remaining_runs: overrides.remainingRuns === undefined ? 10n : overrides.remainingRuns,
      expires_at: overrides.expiresAt === undefined ? null : overrides.expiresAt,
    })
    .toBytes();
}

function releaseContent(
  overrides: {
    id?: string;
    rootId?: string;
    isListed?: boolean;
  } = {},
): Uint8Array {
  return workflowReleaseBcs
    .serialize({
      id: { id: { bytes: overrides.id ?? RELEASE_ID } },
      root_id: { bytes: overrides.rootId ?? ROOT_ID },
      parent_release_id: null,
      version: "1.2.3",
      blob_id: "blob-id-test",
      price_license: 100n,
      price_fork: 200n,
      royalty_bps: 500n,
      is_listed: overrides.isListed ?? true,
      created_at: 1723900000000n,
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
    type: `${PACKAGE_ID}::license::LicensePass`,
    owner: addressOwner(RUNNER),
    content: licenseContent(),
    ...overrides,
  };
}

function releaseObject(overrides: Partial<SuiReadableObject> = {}): SuiReadableObject {
  return {
    objectId: RELEASE_ID,
    type: `${PACKAGE_ID}::agent::WorkflowRelease`,
    owner: addressOwner(RUNNER),
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
    ["forged BCS owner", { owner: OTHER_RUNNER }],
    ["zero remaining runs", { remainingRuns: 0n }],
    ["expired timestamp", { expiresAt: 999n }],
  ] as const)("rejects %s", async (_label, contentOverrides) => {
    const { reader } = readerFor(
      licenseObject({ content: licenseContent(contentOverrides) }),
    );
    const verifier = new SuiLicenseVerifier({
      reader,
      packageId: PACKAGE_ID,
      nowMs: () => 1_000,
    });

    await expect(verifier.verify({
      releaseId: RELEASE_ID,
      licenseId: LICENSE_ID,
      runnerAddress: RUNNER,
    })).rejects.toBeInstanceOf(ExecutorError);
  });

  it.each([
    ["wrong package type", { type: `${OTHER_PACKAGE_ID}::license::LicensePass` }],
    ["wrong struct type", { type: `${PACKAGE_ID}::agent::WorkflowRelease` }],
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
      parentReleaseId: null,
      version: "1.2.3",
      blobId: "blob-id-test",
      priceLicense: 100n,
      priceFork: 200n,
      royaltyBps: 500n,
      isListed: true,
      createdAt: 1723900000000n,
    });
    expect(calls).toEqual([{ objectId: RELEASE_ID }]);
  });

  it.each([
    ["wrong package type", { type: `${OTHER_PACKAGE_ID}::agent::WorkflowRelease` }, "INTERNAL_ERROR"],
    ["wrong object identity", { objectId: OTHER_RELEASE_ID }, "INTERNAL_ERROR"],
    ["malformed BCS", { content: Uint8Array.from([9, 9]) }, "INTERNAL_ERROR"],
    ["not listed", { content: releaseContent({ isListed: false }) }, "RELEASE_INACTIVE"],
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
