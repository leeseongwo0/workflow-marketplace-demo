import { readFile as readFileFromDisk } from "node:fs/promises";

import type { KeyProvider } from "../contracts.js";
import { ExecutorError } from "../errors.js";
import { localKeyringSchema } from "./schema.js";

const DEK_LENGTH = 32;

type ReadKeyringFile = (path: string) => Promise<string>;

function keyNotFound(): ExecutorError {
  return new ExecutorError(
    "KEY_NOT_FOUND",
    "Local demo key could not be loaded",
  );
}

function decodeDek(value: string): Uint8Array {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== DEK_LENGTH || decoded.toString("base64") !== value) {
    throw keyNotFound();
  }
  return new Uint8Array(decoded);
}

/**
 * Reads the P0 local keyring. Authorization is deliberately outside this
 * adapter; callers must verify the release, license, and runner first.
 */
export class LocalDemoKeyProvider implements KeyProvider {
  private readonly keyringPath: string;

  private readonly readFile: ReadKeyringFile;

  constructor(input: {
    keyringPath: string;
    readFile?: ReadKeyringFile;
  }) {
    this.keyringPath = input.keyringPath;
    this.readFile = input.readFile ?? ((path) => readFileFromDisk(path, "utf8"));
  }

  async getDek(input: {
    keyId: string;
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<Uint8Array> {
    void input.releaseId;
    void input.licenseId;
    void input.runnerAddress;

    try {
      const contents = await this.readFile(this.keyringPath);
      const keyring = localKeyringSchema.parse(JSON.parse(contents) as unknown);
      const hasKey = Object.prototype.hasOwnProperty.call(keyring.keys, input.keyId);
      const encoded = hasKey ? keyring.keys[input.keyId] : undefined;
      if (encoded === undefined) {
        throw keyNotFound();
      }
      return decodeDek(encoded);
    } catch {
      // Do not attach parse, filesystem, or path details to this error.
      throw keyNotFound();
    }
  }
}
