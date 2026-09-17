import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { canonicalJson, normalizeSuiAddress } from "@aiwf/shared";

import { ExecutorError } from "../errors.js";
import {
  executionBindingsEntrySchema,
  localExecutionBindingsSchema,
  type ExecutionBindingsEntry,
  type LocalExecutionBindings,
} from "./execution-bindings-schema.js";

function bindingsUnavailable(cause?: unknown): ExecutorError {
  return new ExecutorError(
    "INTERNAL_ERROR",
    "Local execution bindings could not be loaded",
    cause,
  );
}

function entriesEqual(a: ExecutionBindingsEntry, b: ExecutionBindingsEntry): boolean {
  return (
    a.workflowType === b.workflowType &&
    a.encryptedBundleHash === b.encryptedBundleHash &&
    a.publicManifestHash === b.publicManifestHash &&
    a.keyId === b.keyId
  );
}

export async function readLocalExecutionBindings(
  path: string,
): Promise<LocalExecutionBindings | null> {
  try {
    return localExecutionBindingsSchema.parse(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      cause.code === "ENOENT"
    ) {
      return null;
    }
    throw bindingsUnavailable(cause);
  }
}

/**
 * Looks up the trusted local bindings for a release. Returns undefined
 * (rather than throwing) when the file or entry is simply absent, so
 * callers can fail closed the same way they already do for a missing
 * sealSession — this is a lookup, not a required dependency for every
 * KeyProvider.
 */
export async function getLocalExecutionBindings(input: {
  bindingsPath: string;
  releaseId: string;
}): Promise<ExecutionBindingsEntry | undefined> {
  const bindings = await readLocalExecutionBindings(input.bindingsPath);
  if (bindings === null) {
    return undefined;
  }
  return bindings.releases[normalizeSuiAddress(input.releaseId)];
}

async function writeBindingsAtomically(
  path: string,
  bindings: LocalExecutionBindings,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(temporaryPath, `${canonicalJson(bindings)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (cause) {
    await unlink(temporaryPath).catch(() => undefined);
    throw bindingsUnavailable(cause);
  }
}

/**
 * Records the trusted (rootId/version/publicManifestHash-derived) bindings
 * for a release, keyed by releaseId. Bootstrap tooling (bootstrap-release.ts)
 * calls this right after prepareAndUploadEncryptedWorkflow, using the exact
 * hashes/keyId that produced — never values recomputed from a downloaded
 * blob, which would defeat the point of this file existing.
 */
export async function storeLocalExecutionBindings(input: {
  bindingsPath: string;
  releaseId: string;
  bindings: ExecutionBindingsEntry;
}): Promise<"created" | "existing"> {
  const releaseId = normalizeSuiAddress(input.releaseId);
  const bindings = executionBindingsEntrySchema.parse(input.bindings);
  const current = await readLocalExecutionBindings(input.bindingsPath);
  const existing = current?.releases[releaseId];
  if (existing !== undefined) {
    if (!entriesEqual(existing, bindings)) {
      throw new ExecutorError(
        "INVALID_REQUEST",
        "Refusing to replace existing execution bindings for this release",
      );
    }
    return "existing";
  }

  const next = localExecutionBindingsSchema.parse({
    schemaVersion: "local-execution-bindings/v1",
    releases: { ...(current?.releases ?? {}), [releaseId]: bindings },
  });
  await writeBindingsAtomically(input.bindingsPath, next);
  return "created";
}
