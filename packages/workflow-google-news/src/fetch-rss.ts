import { GoogleNewsWorkflowError } from "./errors.js";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export async function fetchRssFeed(input: Readonly<{
  url: URL;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}>): Promise<string> {
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }

  const fetcher = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new GoogleNewsWorkflowError(
      "RSS_UPSTREAM_ERROR",
      "RSS upstream request is unavailable",
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);

  try {
    const response = await fetcher(input.url, { signal: controller.signal });
    if (!response.ok) {
      throw new GoogleNewsWorkflowError(
        "RSS_UPSTREAM_ERROR",
        `RSS upstream returned HTTP ${response.status}`,
      );
    }

    return await response.text();
  } catch (error) {
    if (timedOut || controller.signal.aborted || isAbortError(error)) {
      throw new GoogleNewsWorkflowError(
        "RSS_TIMEOUT",
        "RSS upstream request timed out",
      );
    }

    if (error instanceof GoogleNewsWorkflowError) throw error;

    throw new GoogleNewsWorkflowError(
      "RSS_UPSTREAM_ERROR",
      "RSS upstream request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}
