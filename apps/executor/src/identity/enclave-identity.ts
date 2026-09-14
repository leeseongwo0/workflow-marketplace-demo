import { readFile } from "node:fs/promises";

import { ExecutorError } from "../errors.js";

const EXPECTED_KEY_BYTES = 32;
const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface EnclaveIdentitySource {
  readFile(path: string): Promise<Uint8Array>;
  sleep(ms: number): Promise<void>;
}

const systemSource: EnclaveIdentitySource = {
  readFile: async (path) => new Uint8Array(await readFile(path)),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Loads the enclave's Ed25519 identity key written by the sibling Rust
 * process (write_enclave_identity_key in enclave/src/nautilus-server/src/
 * main.rs) — the same key whose public half is embedded in the
 * /get_attestation document. Using this key (instead of a separate
 * EXECUTOR_PRIVATE_KEY that has no relationship to attestation) is what
 * lets on-chain verification treat a signature as coming from *this
 * attested enclave*, not just "some process with a private key".
 *
 * Rust may still be starting up when Node does, so this polls until the
 * key file appears or timeoutMs elapses, rather than failing immediately.
 */
export async function loadEnclaveIdentityKey(input: {
  path: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  source?: EnclaveIdentitySource;
}): Promise<Uint8Array> {
  const source = input.source ?? systemSource;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const bytes = await source.readFile(input.path);
      if (bytes.length !== EXPECTED_KEY_BYTES) {
        // Do not include the path or byte length in a secret-adjacent error.
        throw new ExecutorError(
          "INTERNAL_ERROR",
          "Enclave identity key file has an unexpected length",
        );
      }
      return bytes;
    } catch (cause) {
      if (cause instanceof ExecutorError) {
        throw cause;
      }
      if (Date.now() >= deadline) {
        throw new ExecutorError(
          "INTERNAL_ERROR",
          "Enclave identity key was not available before the deadline",
        );
      }
      await source.sleep(pollIntervalMs);
    }
  }
}
