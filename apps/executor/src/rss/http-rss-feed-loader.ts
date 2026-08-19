import type { FetchLike } from "../contracts.js";
import { GoogleNewsWorkflowError } from "@aiwf/workflow-google-news";

const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
const MAX_TIMEOUT_MS = 30_000;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function rssTimeout(): GoogleNewsWorkflowError {
  return new GoogleNewsWorkflowError(
    "RSS_TIMEOUT",
    "RSS upstream request timed out",
  );
}

function rssUpstreamFailure(): GoogleNewsWorkflowError {
  return new GoogleNewsWorkflowError(
    "RSS_UPSTREAM_ERROR",
    "RSS upstream request failed",
  );
}

function rssParseFailure(): GoogleNewsWorkflowError {
  return new GoogleNewsWorkflowError(
    "RSS_PARSE_ERROR",
    "RSS response could not be decoded",
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function assertFeedUrl(value: URL): URL {
  try {
    const url = new URL(value.toString());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw rssUpstreamFailure();
    }
    return url;
  } catch (cause) {
    if (cause instanceof GoogleNewsWorkflowError) throw cause;
    throw rssUpstreamFailure();
  }
}

function assertTimeout(timeoutMs: number): void {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw rssUpstreamFailure();
  }
}

async function readResponseBytes(
  response: Response,
  maxResponseBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maxResponseBytes
    ) {
      throw rssUpstreamFailure();
    }
  }

  if (response.body !== null && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = new Uint8Array(next.value);
        totalBytes += chunk.byteLength;
        if (totalBytes > maxResponseBytes) {
          throw rssUpstreamFailure();
        }
        chunks.push(chunk);
      }
    } catch (cause) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original read/abort error.
      }
      if (cause instanceof GoogleNewsWorkflowError) throw cause;
      throw cause;
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxResponseBytes) {
    throw rssUpstreamFailure();
  }
  return bytes;
}

export interface HttpRssFeedLoaderOptions {
  fetch?: FetchLike;
  maxResponseBytes?: number;
}

/**
 * Loads RSS bytes only. It never follows item links or performs article-page
 * requests; parsing and item filtering remain in the workflow package.
 */
export class HttpRssFeedLoader {
  readonly #fetch: FetchLike;
  readonly #maxResponseBytes: number;

  constructor(options: HttpRssFeedLoaderOptions = {}) {
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
      throw rssUpstreamFailure();
    }
    const maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes <= 0 ||
      maxResponseBytes > DEFAULT_MAX_RESPONSE_BYTES
    ) {
      throw rssUpstreamFailure();
    }
    this.#fetch = fetcher;
    this.#maxResponseBytes = maxResponseBytes;
  }

  async load(input: Readonly<{ url: URL; timeoutMs: number }>): Promise<string> {
    const url = assertFeedUrl(input.url);
    assertTimeout(input.timeoutMs);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, input.timeoutMs);

    try {
      const response = await this.#fetch(url, {
        signal: controller.signal,
      });
      if (response.status < 200 || response.status >= 300) {
        throw rssUpstreamFailure();
      }
      const bytes = await readResponseBytes(response, this.#maxResponseBytes);
      try {
        return UTF8_DECODER.decode(bytes);
      } catch {
        throw rssParseFailure();
      }
    } catch (cause) {
      if (timedOut || controller.signal.aborted || isAbortError(cause)) {
        throw rssTimeout();
      }
      if (cause instanceof GoogleNewsWorkflowError) throw cause;
      throw rssUpstreamFailure();
    } finally {
      clearTimeout(timer);
    }
  }
}
