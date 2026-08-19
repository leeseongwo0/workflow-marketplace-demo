import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalDemoKeyProvider } from "../src/key-provider/local-demo-key-provider.js";

const KEY_ID = `root:0x${"1".repeat(64)}:release:1.0.0`;
const RELEASE_ID = `0x${"2".repeat(64)}`;
const LICENSE_ID = `0x${"3".repeat(64)}`;
const RUNNER_ADDRESS = `0x${"4".repeat(64)}`;
const DEK = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const DEK_BASE64 = Buffer.from(DEK).toString("base64");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function temporaryKeyring(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aiwf-key-provider-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "keyring.json");
  await writeFile(path, contents, "utf8");
  return path;
}

function request(keyId = KEY_ID) {
  return {
    keyId,
    releaseId: RELEASE_ID,
    licenseId: LICENSE_ID,
    runnerAddress: RUNNER_ADDRESS,
  };
}

async function expectKeyNotFound(
  provider: LocalDemoKeyProvider,
  keyId = KEY_ID,
): Promise<void> {
  let caught: unknown;
  try {
    await provider.getDek(request(keyId));
  } catch (error) {
    caught = error;
  }

  expect(caught).toMatchObject({ code: "KEY_NOT_FOUND" });
  const message = caught instanceof Error ? caught.message : String(caught);
  expect(message).not.toContain(DEK_BASE64);
  expect(message).not.toContain(Buffer.from(DEK).toString("hex"));
  expect(message).not.toContain(KEY_ID);
}

describe("LocalDemoKeyProvider", () => {
  it("loads exactly a 32-byte DEK from a temporary keyring file", async () => {
    const path = await temporaryKeyring(
      JSON.stringify({
        schemaVersion: "local-keyring/v1",
        keys: { [KEY_ID]: DEK_BASE64 },
      }),
    );
    const provider = new LocalDemoKeyProvider({ keyringPath: path });

    await expect(provider.getDek(request())).resolves.toEqual(DEK);
    await expect(readFile(path, "utf8")).resolves.toContain(DEK_BASE64);
  });

  it("maps a missing key entry and a missing file to KEY_NOT_FOUND", async () => {
    const path = await temporaryKeyring(
      JSON.stringify({ schemaVersion: "local-keyring/v1", keys: {} }),
    );
    await expectKeyNotFound(
      new LocalDemoKeyProvider({ keyringPath: path }),
    );

    const missingPath = join(path, "does-not-exist.json");
    await expectKeyNotFound(
      new LocalDemoKeyProvider({ keyringPath: missingPath }),
    );
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "unknown top-level key",
      JSON.stringify({
        schemaVersion: "local-keyring/v1",
        keys: { [KEY_ID]: DEK_BASE64 },
        unexpected: "do not accept",
      }),
    ],
    [
      "malformed base64",
      JSON.stringify({
        schemaVersion: "local-keyring/v1",
        keys: { [KEY_ID]: `${DEK_BASE64.slice(0, -1)}?` },
      }),
    ],
    [
      "wrong-length base64",
      JSON.stringify({
        schemaVersion: "local-keyring/v1",
        keys: { [KEY_ID]: Buffer.from(new Uint8Array(31)).toString("base64") },
      }),
    ],
  ])("maps %s to KEY_NOT_FOUND without secret details", async (_label, contents) => {
    const path = await temporaryKeyring(contents);
    await expectKeyNotFound(new LocalDemoKeyProvider({ keyringPath: path }));
  });

  it("maps filesystem read errors to KEY_NOT_FOUND", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiwf-key-provider-"));
    temporaryDirectories.push(directory);

    await expectKeyNotFound(new LocalDemoKeyProvider({ keyringPath: directory }));
  });
});
