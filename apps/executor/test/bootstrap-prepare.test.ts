import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createBundleAad } from "@aiwf/shared";

import { prepareEncryptedWorkflow } from "../src/bootstrap/prepare-encrypted-workflow.js";
import { decryptBundle, parseDecryptedWorkflowBundle } from "../src/crypto/envelope.js";
import { ExecutorError } from "../src/errors.js";
import { LocalDemoKeyProvider } from "../src/key-provider/local-demo-key-provider.js";
import { storeLocalDemoDek } from "../src/key-provider/keyring-writer.js";

const ROOT_ID = `0x${"a".repeat(64)}`;
const RELEASE_ID = `0x${"b".repeat(64)}`;
const LICENSE_ID = `0x${"c".repeat(64)}`;
const RUNNER_ADDRESS = `0x${"d".repeat(64)}`;
const VERSION = "1.0.0";
const DEK = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const DIFFERENT_DEK = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0xa0 + index,
);
const NONCE = Uint8Array.from(
  { length: 12 },
  (_value, index) => 0xf0 - index,
);
const DEK_BASE64 = Buffer.from(DEK).toString("base64");
const TEST_KEY_ID = `root:0x${"e".repeat(64)}:release:1.0.0`;

const PUBLIC_MANIFEST = {
  schemaVersion: "public-manifest/v1",
  title: "Google News RSS Monitor",
  summary: "Searches Google News RSS for current results.",
  workflowType: "google_news_rss/v1",
  version: VERSION,
  inputSchema: {
    query: {
      type: "string",
      minLength: 2,
      maxLength: 200,
    },
  },
  outputSchema: {
    maxItems: 10,
    fields: ["title", "source", "publishedAt", "url"],
  },
} as const;

const PRIVATE_BUNDLE = {
  schemaVersion: "google_news_rss/v1",
  feedBaseUrl: "https://news.google.com/rss/search",
  locale: {
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
  },
  windowHours: 24,
  maxResults: 10,
  requestTimeoutMs: 8_000,
  dedupeStrategy: "normalized_title_and_source",
} as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function temporaryKeyringPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aiwf-bootstrap-"));
  temporaryDirectories.push(directory);
  return join(directory, "nested", "local-keyring.json");
}

function prepareInput(keyringPath: string, overrides: Record<string, unknown> = {}) {
  return {
    rootId: ROOT_ID,
    version: VERSION,
    publicManifest: PUBLIC_MANIFEST,
    privateBundle: PRIVATE_BUNDLE,
    keyringPath,
    randomDek: () => DEK,
    randomNonce: () => NONCE,
    ...overrides,
  };
}

function keyRequest(keyId: string) {
  return {
    keyId,
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    runnerAddress: RUNNER_ADDRESS,
  };
}

async function expectNoUsableKeyring(keyringPath: string): Promise<void> {
  await expect(readFile(keyringPath, "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
}

describe("prepareEncryptedWorkflow", () => {
  it("creates deterministic lowercase hashes without returning DEKs or private-key properties", async () => {
    const keyringPath = await temporaryKeyringPath();
    const prepared = await prepareEncryptedWorkflow(prepareInput(keyringPath));

    expect(prepared.publicManifestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(prepared.encryptedBundleHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.keys(prepared)).toEqual([
      "publicManifestHash",
      "encryptedBundleHash",
      "keyId",
      "envelope",
      "serializedEnvelope",
    ]);
    expect(JSON.stringify(prepared)).not.toContain(DEK_BASE64);
    expect(JSON.stringify(prepared)).not.toMatch(/"(?:dek|privateKey)"/iu);

    const repeated = await prepareEncryptedWorkflow(prepareInput(keyringPath));
    expect(repeated.serializedEnvelope).toEqual(prepared.serializedEnvelope);
    expect(repeated.publicManifestHash).toBe(prepared.publicManifestHash);
    expect(repeated.encryptedBundleHash).toBe(prepared.encryptedBundleHash);
  });

  it("writes a strict canonical keyring with a 32-byte base64 DEK and POSIX 0600 mode", async () => {
    const keyringPath = await temporaryKeyringPath();
    const prepared = await prepareEncryptedWorkflow(prepareInput(keyringPath));
    const contents = await readFile(keyringPath, "utf8");
    const keyring = JSON.parse(contents) as {
      schemaVersion: string;
      keys: Record<string, string>;
    };

    expect(Object.keys(keyring)).toEqual(["keys", "schemaVersion"]);
    expect(keyring.schemaVersion).toBe("local-keyring/v1");
    expect(Object.keys(keyring.keys)).toEqual([prepared.keyId]);
    expect(keyring.keys[prepared.keyId]).toBe(DEK_BASE64);
    expect(Buffer.from(keyring.keys[prepared.keyId] ?? "", "base64")).toHaveLength(32);
    expect(Buffer.from(keyring.keys[prepared.keyId] ?? "", "base64").toString("base64")).toBe(
      keyring.keys[prepared.keyId],
    );
    expect(contents.endsWith("\n")).toBe(true);

    if (process.platform !== "win32") {
      const permissions = (await stat(keyringPath)).mode & 0o777;
      expect(permissions).toBe(0o600);
    }
  });

  it("loads the stored key and recovers the exact strict workflow bundle", async () => {
    const keyringPath = await temporaryKeyringPath();
    const prepared = await prepareEncryptedWorkflow(prepareInput(keyringPath));
    const provider = new LocalDemoKeyProvider({ keyringPath });
    const loadedDek = await provider.getDek(keyRequest(prepared.keyId));
    const aad = createBundleAad({
      rootId: ROOT_ID,
      version: VERSION,
      publicManifestHash: prepared.publicManifestHash,
    });
    const plaintext = decryptBundle({
      serializedEnvelope: prepared.serializedEnvelope,
      dek: loadedDek,
      expectedAad: aad,
    });

    expect(loadedDek).toEqual(DEK);
    expect(parseDecryptedWorkflowBundle(plaintext)).toEqual(PRIVATE_BUNDLE);
  });

  it("is idempotent for the same keyId and DEK and refuses a different DEK safely", async () => {
    const keyringPath = await temporaryKeyringPath();
    const first = await storeLocalDemoDek({
      keyringPath,
      keyId: TEST_KEY_ID,
      dek: DEK,
    });
    const second = await storeLocalDemoDek({
      keyringPath,
      keyId: TEST_KEY_ID,
      dek: DEK,
    });

    expect(first).toBe("created");
    expect(second).toBe("existing");

    let caught: unknown;
    try {
      await storeLocalDemoDek({
        keyringPath,
        keyId: TEST_KEY_ID,
        dek: DIFFERENT_DEK,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ExecutorError);
    expect(caught).toMatchObject({ code: "INVALID_REQUEST" });
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).not.toContain(DEK_BASE64);
    expect(message).not.toContain(Buffer.from(DIFFERENT_DEK).toString("base64"));
    expect(message).not.toContain(TEST_KEY_ID);
    const persisted = JSON.parse(await readFile(keyringPath, "utf8")) as {
      keys: Record<string, string>;
    };
    expect(persisted.keys[TEST_KEY_ID]).toBe(DEK_BASE64);
    expect(persisted.keys[TEST_KEY_ID]).not.toBe(
      Buffer.from(DIFFERENT_DEK).toString("base64"),
    );
  });

  it.each([
    ["manifest version mismatch", {
      publicManifest: { ...PUBLIC_MANIFEST, version: "2.0.0" },
    }],
    ["unknown private bundle key", {
      privateBundle: { ...PRIVATE_BUNDLE, unexpected: true },
    }],
    ["malformed DEK", { randomDek: () => new Uint8Array(31) }],
  ] as const)("rejects %s before writing a usable keyring", async (_label, overrides) => {
    const keyringPath = await temporaryKeyringPath();
    await expect(
      prepareEncryptedWorkflow(prepareInput(keyringPath, overrides)),
    ).rejects.toThrow();
    await expectNoUsableKeyring(keyringPath);
  });

  it("does not log or perform network access while preparing a bundle", async () => {
    const keyringPath = await temporaryKeyringPath();
    const fetch = vi.fn(() => {
      throw new Error("live network is forbidden");
    });
    vi.stubGlobal("fetch", fetch);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await prepareEncryptedWorkflow(prepareInput(keyringPath));

    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
