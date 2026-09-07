import { bcs } from "@mysten/sui/bcs";

import {
  normalizeSuiAddress,
} from "@aiwf/shared";

import type {
  LicenseVerifier,
  ReleaseProvider,
  WorkflowReleaseMetadata,
} from "../contracts.js";
import { ExecutorError } from "../errors.js";

const idBcs = bcs.struct("ID", { bytes: bcs.Address });
const uidBcs = bcs.struct("UID", { id: idBcs });

const licensePassBcs = bcs.struct("LicensePass", {
  id: uidBcs,
  release_id: idBcs,
  owner: bcs.Address,
  remaining_runs: bcs.option(bcs.u64()),
  expires_at: bcs.option(bcs.u64()),
});

const workflowReleaseBcs = bcs.struct("WorkflowRelease", {
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

export interface SuiReadableObject {
  objectId: string;
  type: string;
  owner: unknown;
  content: Uint8Array;
}

export interface SuiObjectReader {
  getObject(input: {
    objectId: string;
    include: { content: true };
  }): Promise<{ object: SuiReadableObject }>;
}

function requireAddressOwner(owner: unknown): string | undefined {
  if (
    typeof owner !== "object" ||
    owner === null ||
    !("$kind" in owner) ||
    owner.$kind !== "AddressOwner" ||
    !("AddressOwner" in owner) ||
    typeof owner.AddressOwner !== "string"
  ) {
    return undefined;
  }
  return normalizeSuiAddress(owner.AddressOwner);
}

function moduleType(packageId: string, module: string, structName: string): string {
  return `${normalizeSuiAddress(packageId)}::${module}::${structName}`;
}

export class SuiLicenseVerifier implements LicenseVerifier, ReleaseProvider {
  readonly #reader: SuiObjectReader;
  readonly #licenseType: string;
  readonly #releaseType: string;

  constructor(input: { reader: SuiObjectReader; packageId: string }) {
    this.#reader = input.reader;
    this.#licenseType = moduleType(input.packageId, "license", "LicensePass");
    this.#releaseType = moduleType(input.packageId, "agent", "WorkflowRelease");
  }

  async verify(input: {
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<void> {
    const releaseId = normalizeSuiAddress(input.releaseId);
    const licenseId = normalizeSuiAddress(input.licenseId);
    const runnerAddress = normalizeSuiAddress(input.runnerAddress);
    let object: SuiReadableObject;
    try {
      ({ object } = await this.#reader.getObject({
        objectId: licenseId,
        include: { content: true },
      }));
    } catch (cause) {
      throw new ExecutorError(
        "LICENSE_NOT_FOUND",
        "LicensePass could not be loaded",
        cause,
      );
    }

    if (
      object.type !== this.#licenseType ||
      normalizeSuiAddress(object.objectId) !== licenseId
    ) {
      throw new ExecutorError(
        "LICENSE_NOT_FOUND",
        "Object is not a LicensePass from the configured package",
      );
    }

    const owner = requireAddressOwner(object.owner);
    if (owner !== runnerAddress) {
      throw new ExecutorError(
        "LICENSE_OWNER_MISMATCH",
        "LicensePass is not owned by the challenge runner",
      );
    }

    let license: ReturnType<typeof licensePassBcs.parse>;
    try {
      license = licensePassBcs.parse(object.content);
    } catch (cause) {
      throw new ExecutorError(
        "LICENSE_NOT_FOUND",
        "LicensePass content is invalid",
        cause,
      );
    }
    if (license.id.id.bytes !== licenseId) {
      throw new ExecutorError(
        "LICENSE_NOT_FOUND",
        "LicensePass object identity is inconsistent",
      );
    }
    if (license.release_id.bytes !== releaseId) {
      throw new ExecutorError(
        "LICENSE_RELEASE_MISMATCH",
        "LicensePass does not bind the requested release",
      );
    }
  }

  async getRelease(releaseIdInput: string): Promise<WorkflowReleaseMetadata> {
    const releaseId = normalizeSuiAddress(releaseIdInput);
    let object: SuiReadableObject;
    try {
      ({ object } = await this.#reader.getObject({
        objectId: releaseId,
        include: { content: true },
      }));
    } catch (cause) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Licensed workflow release could not be loaded",
        cause,
      );
    }
    if (
      object.type !== this.#releaseType ||
      normalizeSuiAddress(object.objectId) !== releaseId
    ) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Licensed workflow release object is invalid",
      );
    }

    let release: ReturnType<typeof workflowReleaseBcs.parse>;
    try {
      release = workflowReleaseBcs.parse(object.content);
    } catch (cause) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Licensed workflow release content is invalid",
        cause,
      );
    }
    if (!release.is_listed) {
      throw new ExecutorError("RELEASE_INACTIVE", "Workflow release is not listed");
    }
    if (release.id.id.bytes !== releaseId) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Workflow release object identity is inconsistent",
      );
    }

    return {
      releaseId,
      rootId: release.root_id.bytes,
      parentReleaseId: release.parent_release_id?.bytes ?? null,
      version: release.version,
      blobId: release.blob_id,
      priceLicense: BigInt(release.price_license),
      priceFork: BigInt(release.price_fork),
      royaltyBps: BigInt(release.royalty_bps),
      isListed: true,
      createdAt: BigInt(release.created_at),
    };
  }
}
