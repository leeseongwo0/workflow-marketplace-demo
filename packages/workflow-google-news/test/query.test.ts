import { describe, expect, it } from "vitest";

import {
  GoogleNewsWorkflowError,
  buildGoogleNewsFeedUrl,
  googleNewsWorkflowBundleSchema,
  normalizeQuery,
} from "../src/index.js";

import { BUNDLE } from "./helpers.js";

function expectWorkflowError(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(GoogleNewsWorkflowError);
  if (caught instanceof GoogleNewsWorkflowError) {
    expect(caught.code).toBe(code);
  }
}

describe("Google News query policy", () => {
  it("normalizes outer and repeated whitespace and applies NFC", () => {
    expect(normalizeQuery("  cafe\u0301   Sui\t\nnews  ")).toBe(
      "café Sui news",
    );
  });

  it("counts Unicode code points for the two-to-200 character limit", () => {
    expect(normalizeQuery("😀😀")).toBe("😀😀");
    expect(() => normalizeQuery("😀")).toThrowError();
    expect(normalizeQuery("😀".repeat(200))).toHaveLength(400);
    expectWorkflowError(() => normalizeQuery("😀".repeat(201)), "INVALID_QUERY");
  });

  it.each([
    "Sui WHEN:1d",
    "Sui when :1d",
    "Sui BeFoRe :2026-08-17",
    "Sui after :2026-08-16",
    "(when:1d)",
    "-before:2026-08-17",
    "Sui (after:2026-08-16)",
  ])("rejects reserved time operator %s", (query) => {
    expectWorkflowError(() => normalizeQuery(query), "INVALID_QUERY_OPERATOR");
  });

  it("builds a pinned, encoded feed URL with exactly one server-side when:1d", () => {
    const url = buildGoogleNewsFeedUrl({
      query: "  Sui   &   AI  ",
      bundle: BUNDLE,
    });

    expect(url.origin).toBe("https://news.google.com");
    expect(url.pathname).toBe("/rss/search");
    expect(url.searchParams.get("q")).toBe("Sui & AI when:1d");
    expect(url.searchParams.get("q")?.match(/when:1d/gu)).toHaveLength(1);
    expect(url.search).toContain("q=Sui+%26+AI+when%3A1d");
    expect(url.searchParams.get("hl")).toBe("ko");
    expect(url.searchParams.get("gl")).toBe("KR");
    expect(url.searchParams.get("ceid")).toBe("KR:ko");
  });

  it("strictly rejects unknown bundle keys and a changed feed host", () => {
    const unknownKey = googleNewsWorkflowBundleSchema.safeParse({
      ...BUNDLE,
      unexpected: true,
    });
    const changedHost = googleNewsWorkflowBundleSchema.safeParse({
      ...BUNDLE,
      feedBaseUrl: "https://evil.example/rss/search",
    });

    expect(unknownKey.success).toBe(false);
    expect(changedHost.success).toBe(false);
  });
});
