import { bcs } from "@mysten/sui/bcs";

import {
  GOOGLE_NEWS_WORKFLOW_TYPE,
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
  issued_at_ms: bcs.u64(),
});

const workflowReleaseBcs = bcs.struct("WorkflowRelease", {
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

function isSharedOwner(owner: unknown): boolean {
  return (
    typeof owner === "object" &&
    owner !== null &&
    "$kind" in owner &&
    owner.$kind === "Shared"
  );
}

function bytesToHex(value: readonly number[], field: string): string {
  const bytes = Uint8Array.from(value);
  if (bytes.length !== 32) {
    throw new ExecutorError(
      "INTERNAL_ERROR",
      `On-chain ${field} is not a SHA-256 value`,
    );
  }
  return Buffer.from(bytes).toString("hex");
}

function exactType(packageId: string, structName: string): string {
  return `${normalizeSuiAddress(packageId)}::marketplace::${structName}`;
}

export class SuiLicenseVerifier implements LicenseVerifier, ReleaseProvider {
  readonly #reader: SuiObjectReader;
  readonly #licenseType: string;
  readonly #releaseType: string;

  constructor(input: { reader: SuiObjectReader; packageId: string }) {
    this.#reader = input.reader;
    this.#licenseType = exactType(input.packageId, "LicensePass");
    this.#releaseType = exactType(input.packageId, "WorkflowRelease");
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
      normalizeSuiAddress(object.objectId) !== releaseId ||
      !isSharedOwner(object.owner)
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
    if (!release.active) {
      throw new ExecutorError("RELEASE_INACTIVE", "Workflow release is inactive");
    }
    if (release.workflow_type !== GOOGLE_NEWS_WORKFLOW_TYPE) {
      throw new ExecutorError(
        "INTERNAL_ERROR",
        "Workflow release has an unsupported workflow type",
      );
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
      version: `${release.version_major}.${release.version_minor}.${release.version_patch}`,
      workflowType: GOOGLE_NEWS_WORKFLOW_TYPE,
      walrusBlobId: release.walrus_blob_id,
      encryptedBundleHash: bytesToHex(
        release.encrypted_bundle_hash,
        "encrypted bundle hash",
      ),
      publicManifestHash: bytesToHex(
        release.public_manifest_hash,
        "public manifest hash",
      ),
      keyId: release.key_id,
      active: true,
    };
  }
}
