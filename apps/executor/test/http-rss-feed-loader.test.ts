import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpRssFeedLoader } from "../src/rss/http-rss-feed-loader.js";

const FEED_URL = new URL("https://news.google.com/rss/search?q=Sui");

afterEach(() => {
  vi.useRealTimers();
});

describe("bounded HTTP RSS loader", () => {
  it("returns UTF-8 XML with exactly one feed request", async () => {
    const fetch = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response("<rss></rss>", { status: 200 }),
    );
    const loader = new HttpRssFeedLoader({ fetch });

    await expect(loader.load({ url: FEED_URL, timeoutMs: 1_000 })).resolves.toBe(
      "<rss></rss>",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(FEED_URL.toString());
  });

  it("rejects non-success responses before reading their body", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const response = {
      status: 503,
      headers: new Headers(),
      body: null,
      arrayBuffer,
    } as unknown as Response;
    const loader = new HttpRssFeedLoader({ fetch: async () => response });

    await expect(
      loader.load({ url: FEED_URL, timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "RSS_UPSTREAM_ERROR" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([
    ["declared length", new Response("x", { headers: { "content-length": "5" } })],
    ["streamed bytes", new Response("12345")],
  ])("enforces the byte cap for %s", async (_label, response) => {
    const loader = new HttpRssFeedLoader({
      fetch: async () => response,
      maxResponseBytes: 4,
    });
    await expect(
      loader.load({ url: FEED_URL, timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "RSS_UPSTREAM_ERROR" });
  });

  it("enforces the byte cap on the arrayBuffer fallback", async () => {
    const response = {
      status: 200,
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => new Uint8Array(5).buffer,
    } as unknown as Response;
    const loader = new HttpRssFeedLoader({
      fetch: async () => response,
      maxResponseBytes: 4,
    });
    await expect(
      loader.load({ url: FEED_URL, timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "RSS_UPSTREAM_ERROR" });
  });

  it("rejects invalid UTF-8 as an RSS parse error", async () => {
    const loader = new HttpRssFeedLoader({
      fetch: async () => new Response(Uint8Array.from([0xff])),
    });
    await expect(
      loader.load({ url: FEED_URL, timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "RSS_PARSE_ERROR" });
  });

  it("maps an abort at the deadline to RSS_TIMEOUT", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      async (_url: string | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const loader = new HttpRssFeedLoader({ fetch });
    const pending = loader.load({ url: FEED_URL, timeoutMs: 50 });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "RSS_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });

  it("rejects unsupported protocols and invalid timeout without fetching", async () => {
    const fetch = vi.fn(async () => new Response("<rss/>"));
    const loader = new HttpRssFeedLoader({ fetch });
    await expect(
      loader.load({ url: new URL("file:///tmp/feed.xml"), timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "RSS_UPSTREAM_ERROR" });
    await expect(
      loader.load({ url: FEED_URL, timeoutMs: 30_001 }),
    ).rejects.toMatchObject({ code: "RSS_UPSTREAM_ERROR" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
