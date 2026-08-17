import { describe, expect, it, vi } from "vitest";

import {
  GoogleNewsWorkflowError,
  executeGoogleNewsWorkflow,
  fetchRssFeed,
} from "../src/index.js";

import { BUNDLE, NOW, fixture } from "./helpers.js";

const FEED_URL = new URL(
  "https://news.google.com/rss/search?q=offline+fixture",
);

async function captureWorkflowError(
  action: () => Promise<unknown>,
): Promise<GoogleNewsWorkflowError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(GoogleNewsWorkflowError);
    if (error instanceof GoogleNewsWorkflowError) {
      return error;
    }
  }

  throw new Error("Expected GoogleNewsWorkflowError");
}

describe("Google News RSS transport and execution adapter", () => {
  it("returns the response body for a successful HTTP response", async () => {
    const body = fixture("empty.xml");
    const fetchImpl = async (): Promise<Response> =>
      new Response(body, { status: 200 });

    await expect(
      fetchRssFeed({ url: FEED_URL, timeoutMs: 1_000, fetchImpl }),
    ).resolves.toBe(body);
  });

  it("maps non-2xx responses to RSS_UPSTREAM_ERROR without exposing the body", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response("PRIVATE_UPSTREAM_RESPONSE_BODY", {
        status: 503,
        statusText: "Service Unavailable",
      });

    const error = await captureWorkflowError(() =>
      fetchRssFeed({ url: FEED_URL, timeoutMs: 1_000, fetchImpl }),
    );

    expect(error.code).toBe("RSS_UPSTREAM_ERROR");
    expect(error.message).not.toContain("PRIVATE_UPSTREAM_RESPONSE_BODY");
  });

  it("maps an aborted request to RSS_TIMEOUT", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    const error = await captureWorkflowError(() =>
      fetchRssFeed({ url: FEED_URL, timeoutMs: 1_000, fetchImpl }),
    );

    expect(error.code).toBe("RSS_TIMEOUT");
  });

  it("aborts a hanging request when the real timeout timer fires", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn(
      (_input: string | URL, init?: RequestInit): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal === undefined || signal === null) {
            reject(new Error("fetch fake did not receive an AbortSignal"));
            return;
          }

          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    );

    try {
      const request = fetchRssFeed({
        url: FEED_URL,
        timeoutMs: 1_000,
        fetchImpl,
      });
      const requestError = expect(request).rejects.toMatchObject({
        code: "RSS_TIMEOUT",
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const firstCall = fetchImpl.mock.calls[0];
      expect(firstCall?.[1]?.signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await requestError;
      expect(firstCall?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps other transport rejections to RSS_UPSTREAM_ERROR", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error("offline DNS failure");
    };

    const error = await captureWorkflowError(() =>
      fetchRssFeed({ url: FEED_URL, timeoutMs: 1_000, fetchImpl }),
    );

    expect(error.code).toBe("RSS_UPSTREAM_ERROR");
    expect(error.message).not.toContain("offline DNS failure");
  });

  it("executes through the injected loader exactly once and never uses live fetch", async () => {
    const liveFetch = vi.fn(async (): Promise<Response> => {
      throw new Error("live network is forbidden in this test");
    });
    vi.stubGlobal("fetch", liveFetch);

    const loadFeed = vi.fn(
      async (_request: unknown): Promise<string> => fixture("max-results.xml"),
    );

    try {
      const result = await executeGoogleNewsWorkflow({
        bundle: { ...BUNDLE, maxResults: 2 },
        query: "offline fixture",
        clock: { now: () => NOW },
        loadFeed,
      });

      expect(loadFeed).toHaveBeenCalledTimes(1);
      expect(liveFetch).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.title)).toEqual([
        "Newest result",
        "Second result",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
