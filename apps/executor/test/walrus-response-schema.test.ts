import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  walrusBlobIdPattern,
  walrusUploadResponseSchema,
} from "../src/walrus/response-schema.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
}

describe("Walrus upload response shapes", () => {
  it("accepts the documented newlyCreated response fixture", async () => {
    const parsed = walrusUploadResponseSchema.parse(
      await fixture("walrus-newly-created.json"),
    );

    expect(parsed.newlyCreated?.blobObject.blobId).toBe("blob-01ABC_xyz");
  });

  it("accepts the documented alreadyCertified response fixture", async () => {
    const parsed = walrusUploadResponseSchema.parse(
      await fixture("walrus-already-certified.json"),
    );

    expect(parsed.alreadyCertified?.blobId).toBe("blob-01ABC_xyz");
    expect(parsed.alreadyCertified?.event.txDigest).toBe("9Zb8wQx7");
  });

  it.each([
    ["both result shapes", {
      newlyCreated: { blobObject: { id: "0x1", blobId: "blob-a" } },
      alreadyCertified: { blobId: "blob-a", event: { txDigest: "tx" } },
    }],
    ["no result shape", {}],
    ["missing blob object id", { newlyCreated: { blobObject: { blobId: "blob-a" } } }],
    ["missing certified event", { alreadyCertified: { blobId: "blob-a" } }],
    ["unsafe traversal blob id", {
      newlyCreated: { blobObject: { id: "0x1", blobId: "../secret" } },
    }],
    ["unsafe slash blob id", {
      alreadyCertified: { blobId: "blob/a", event: { txDigest: "tx" } },
    }],
    ["whitespace blob id", {
      alreadyCertified: { blobId: "blob a", event: { txDigest: "tx" } },
    }],
  ] as const)("rejects %s", (_label, value) => {
    expect(walrusUploadResponseSchema.safeParse(value).success).toBe(false);
  });

  it("keeps the blob-id grammar bounded and free of path separators", () => {
    expect(walrusBlobIdPattern.test("a".repeat(200))).toBe(true);
    expect(walrusBlobIdPattern.test("a".repeat(201))).toBe(false);
    expect(walrusBlobIdPattern.test("blob-id_01")).toBe(true);
    expect(walrusBlobIdPattern.test("blob/id")).toBe(false);
    expect(walrusBlobIdPattern.test("../blob")).toBe(false);
  });
});
