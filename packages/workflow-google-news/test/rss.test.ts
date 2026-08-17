import { describe, expect, it } from "vitest";

import {
  GoogleNewsWorkflowError,
  deduplicateNewsItems,
  filterAndOrderNewsItems,
  normalizeDisplayText,
  parseGoogleNewsRss,
} from "../src/index.js";

import { NOW, fixture, newsItem } from "./helpers.js";

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

describe("Google News RSS parsing and result policy", () => {
  it("normalizes title markup, whitespace, and predefined entities", () => {
    expect(normalizeDisplayText("  <b>Sui</b> &amp; <i>News</i>  ")).toBe(
      "Sui & News",
    );

    const items = parseGoogleNewsRss(fixture("mixed-age.xml"));
    const normalized = items.find(
      (item) => item.url.endsWith("/normalized-title"),
    );
    expect(normalized).toEqual({
      title: "Sui & News",
      source: "Fixture & Source",
      publishedAt: "2026-08-17T08:30:00.000Z",
      url: "https://news.google.com/rss/articles/normalized-title",
    });
  });

  it("drops invalid dates, empty titles, and non-HTTP(S) links", () => {
    const items = parseGoogleNewsRss(fixture("mixed-age.xml"));
    const urls = items.map((item) => item.url);

    expect(urls).toContain("https://news.google.com/rss/articles/exact-cutoff");
    expect(urls).not.toContain("https://news.google.com/rss/articles/invalid-date");
    expect(urls).not.toContain("javascript:alert(1)");
    expect(urls).not.toContain("https://news.google.com/rss/articles/empty-title");
  });

  it("rejects malformed XML with a stable RSS_PARSE_ERROR", () => {
    expectWorkflowError(
      () => parseGoogleNewsRss(fixture("malformed.xml")),
      "RSS_PARSE_ERROR",
    );
  });

  it("rejects DOCTYPE and does not expand a custom entity", () => {
    const customEntityXml = `<?xml version="1.0"?>
<!DOCTYPE rss [<!ENTITY secret "SHOULD_NOT_BE_EXPANDED">]>
<rss version="2.0"><channel><item>
  <title>&secret;</title>
  <link>https://news.google.com/rss/articles/custom-entity</link>
  <pubDate>2026-08-17T08:00:00.000Z</pubDate>
</item></channel></rss>`;

    let caught: unknown;
    try {
      parseGoogleNewsRss(customEntityXml);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(GoogleNewsWorkflowError);
    if (caught instanceof GoogleNewsWorkflowError) {
      expect(caught.code).toBe("RSS_PARSE_ERROR");
      expect(caught.message).not.toContain("SHOULD_NOT_BE_EXPANDED");
    }
  });

  it("returns an empty list for an empty RSS feed", () => {
    expect(parseGoogleNewsRss(fixture("empty.xml"))).toEqual([]);
  });

  it("deduplicates normalized title and source keys while retaining the newest", () => {
    const parsed = parseGoogleNewsRss(fixture("duplicates.xml"));
    const deduplicated = deduplicateNewsItems(parsed);
    const duplicate = deduplicated.find((item) =>
      item.title.toLowerCase().includes("sui"),
    );

    expect(duplicate).toBeDefined();
    expect(duplicate?.url).toBe(
      "https://news.google.com/rss/articles/duplicate-new",
    );
    expect(deduplicated.map((item) => item.url)).not.toContain(
      "https://news.google.com/rss/articles/duplicate-old",
    );
    expect(deduplicated).toHaveLength(3);
  });

  it("includes exact time boundaries, excludes one-millisecond violations, sorts newest first, and caps results", () => {
    const items = [
      newsItem(
        "Exact cutoff",
        "2026-08-16T09:00:00.000Z",
        "https://news.google.com/rss/articles/boundary",
      ),
      newsItem(
        "One millisecond old",
        "2026-08-16T08:59:59.999Z",
        "https://news.google.com/rss/articles/old",
      ),
      newsItem(
        "Exact future allowance",
        "2026-08-17T09:05:00.000Z",
        "https://news.google.com/rss/articles/future",
      ),
      newsItem(
        "One millisecond beyond future allowance",
        "2026-08-17T09:05:00.001Z",
        "https://news.google.com/rss/articles/too-future",
      ),
      newsItem(
        "Current result",
        "2026-08-17T08:00:00.000Z",
        "https://news.google.com/rss/articles/current",
      ),
    ];

    const filtered = filterAndOrderNewsItems({
      items,
      now: NOW,
      windowHours: 24,
      maxResults: 3,
    });

    expect(filtered.map((item) => item.title)).toEqual([
      "Exact future allowance",
      "Current result",
      "Exact cutoff",
    ]);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((item) => item.title)).not.toContain(
      "One millisecond old",
    );
    expect(filtered.map((item) => item.title)).not.toContain(
      "One millisecond beyond future allowance",
    );
  });
});
