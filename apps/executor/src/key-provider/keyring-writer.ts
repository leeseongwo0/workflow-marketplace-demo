import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { bundleKeyIdSchema, canonicalJson } from "@aiwf/shared";

import { ExecutorError } from "../errors.js";
import { localKeyringSchema, type LocalKeyring } from "./schema.js";

const DEK_LENGTH = 32;

function decodeDek(value: string): Uint8Array {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== DEK_LENGTH || decoded.toString("base64") !== value) {
    throw new ExecutorError("KEY_NOT_FOUND", "Local demo keyring contains an invalid key");
  }
  return new Uint8Array(decoded);
}

async function readExistingKeyring(path: string): Promise<LocalKeyring | null> {
  try {
    return localKeyringSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      cause.code === "ENOENT"
    ) {
      return null;
    }
    throw new ExecutorError(
      "KEY_NOT_FOUND",
      "Local demo keyring could not be read safely",
      cause,
    );
  }
}

async function writeKeyringAtomically(path: string, keyring: LocalKeyring): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(temporaryPath, `${canonicalJson(keyring)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } catch (cause) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new ExecutorError(
      "KEY_NOT_FOUND",
      "Local demo keyring could not be written safely",
      cause,
    );
  }
}

export async function storeLocalDemoDek(input: {
  keyringPath: string;
  keyId: string;
  dek: Uint8Array;
}): Promise<"created" | "existing"> {
  if (!bundleKeyIdSchema.safeParse(input.keyId).success) {
    throw new ExecutorError("INVALID_REQUEST", "Local demo key ID is invalid");
  }
  if (input.dek.length !== DEK_LENGTH) {
    throw new ExecutorError("INVALID_REQUEST", "DEK must contain exactly 32 bytes");
  }
  const current = await readExistingKeyring(input.keyringPath);
  const existing = current?.keys[input.keyId];
  if (existing !== undefined) {
    const existingDek = decodeDek(existing);
    if (!timingSafeEqual(existingDek, input.dek)) {
      throw new ExecutorError(
        "INVALID_REQUEST",
        "Refusing to replace an existing local demo key",
      );
    }
    return "existing";
  }

  const next = localKeyringSchema.parse({
    schemaVersion: "local-keyring/v1",
    keys: {
      ...(current?.keys ?? {}),
      [input.keyId]: Buffer.from(input.dek).toString("base64"),
    },
  });
  await writeKeyringAtomically(input.keyringPath, next);
  return "created";
}
