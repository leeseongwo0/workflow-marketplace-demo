import { readFile } from "node:fs/promises";

import {
  ExecutorError,
  WalrusBlobStore,
  WalrusPublisher,
  parsePhase3Env,
  prepareAndUploadEncryptedWorkflow,
} from "../apps/executor/src/index.js";

const MAX_INPUT_FILE_BYTES = 1_048_576;

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  if (value === undefined || value.slice(prefix.length).length === 0) {
    throw new ExecutorError("INVALID_REQUEST", `Missing --${name} argument`);
  }
  return value.slice(prefix.length);
}

async function readJsonInput(path: string): Promise<unknown> {
  try {
    const contents = await readFile(path);
    if (contents.byteLength > MAX_INPUT_FILE_BYTES) {
      throw new Error("input too large");
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(contents)) as unknown;
  } catch (cause) {
    throw new ExecutorError(
      "INVALID_REQUEST",
      "Bootstrap JSON input could not be read safely",
      cause,
    );
  }
}

async function main(): Promise<void> {
  const config = parsePhase3Env(process.env);
  const publicManifest = await readJsonInput(argument("public-manifest"));
  const privateBundle = await readJsonInput(argument("private-bundle"));
  const httpOptions = {
    timeoutMs: config.WALRUS_READ_TIMEOUT_MS,
    maxResponseBytes: config.WALRUS_MAX_BLOB_BYTES,
  };
  const result = await prepareAndUploadEncryptedWorkflow({
    rootId: argument("root-id"),
    version: argument("version"),
    publicManifest,
    privateBundle,
    keyringPath: config.LOCAL_KEYRING_PATH,
    publisher: new WalrusPublisher({
      ...httpOptions,
      baseUrl: config.WALRUS_PUBLISHER_URL,
    }),
    blobStore: new WalrusBlobStore({
      ...httpOptions,
      baseUrl: config.WALRUS_AGGREGATOR_URL,
    }),
    retry: {
      maxAttempts: 5,
      baseDelayMs: 250,
      maxDelayMs: 4_000,
      sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    },
  });

  // This output contains only public IDs and hashes; keys and plaintext stay local.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  const code = error instanceof ExecutorError ? error.code : "INTERNAL_ERROR";
  process.stderr.write(`Walrus bootstrap upload failed: ${code}\n`);
  process.exitCode = 1;
}
