import { readFileSync } from "node:fs";

import type { GoogleNewsWorkflowBundle, NewsItem } from "@aiwf/shared";

export const NOW = new Date("2026-08-17T09:00:00.000Z");

export const BUNDLE: GoogleNewsWorkflowBundle = {
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
};

export function fixture(name: string): string {
  return readFileSync(
    new URL(`../../../fixtures/google-news/${name}`, import.meta.url),
    "utf8",
  );
}

export function newsItem(
  title: string,
  publishedAt: string,
  url = "https://news.google.com/rss/articles/test",
  source: string | null = "Fixture Source",
): NewsItem {
  return { title, source, publishedAt, url };
}
