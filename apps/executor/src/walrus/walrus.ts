import { timingSafeEqual } from "node:crypto";

import type { FetchLike, WorkflowBlobStore } from "../contracts.js";
import { ExecutorError } from "../errors.js";
import {
  walrusBlobIdPattern,
  walrusUploadResponseSchema,
} from "./response-schema.js";
import type {
  WalrusHttpOptions,
  WalrusPublisherOptions,
  WalrusReadRetryOptions,
  WalrusUploadResult,
  WorkflowBlobPublisher,
} from "./types.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function walrusFetchFailed(): ExecutorError {
  return new ExecutorError("WALRUS_FETCH_FAILED", "Walrus request failed");
}

function parseBaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      value.includes("?") ||
      value.includes("#")
    ) {
      throw walrusFetchFailed();
    }
    return url;
  } catch (cause) {
    if (cause instanceof ExecutorError) {
      throw cause;
    }
    throw walrusFetchFailed();
  }
}

function assertPositiveFiniteInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw walrusFetchFailed();
  }
}

function validateHttpOptions(options: WalrusHttpOptions): {
  baseUrl: URL;
  timeoutMs: number;
  maxResponseBytes: number;
  fetch: FetchLike;
} {
  if (typeof options.baseUrl !== "string") {
    throw walrusFetchFailed();
  }
  assertPositiveFiniteInteger(options.timeoutMs);
  assertPositiveFiniteInteger(options.maxResponseBytes);

  const selectedFetch = options.fetch ?? globalThis.fetch;
  if (typeof selectedFetch !== "function") {
    throw walrusFetchFailed();
  }

  return {
    baseUrl: parseBaseUrl(options.baseUrl),
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
    fetch: (input, init) => selectedFetch(input, init),
  };
}

function endpointUrl(baseUrl: URL, blobId?: string): URL {
  const base = new URL(baseUrl.toString());
  const basePath = base.pathname.replace(/\/+$/u, "");
  const path = `${basePath}/v1/blobs${blobId === undefined ? "" : `/${encodeURIComponent(blobId)}`}`;
  base.pathname = path || "/v1/blobs";
  base.search = "";
  base.hash = "";
  return base;
}

function assertBlobId(blobId: string): void {
  if (!walrusBlobIdPattern.test(blobId)) {
    throw walrusFetchFailed();
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
      Number.isFinite(parsedLength) &&
      parsedLength >= 0 &&
      parsedLength > maxResponseBytes
    ) {
      throw walrusFetchFailed();
    }
  }

  if (response.body !== null && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        const chunk = new Uint8Array(next.value);
        totalBytes += chunk.byteLength;
        if (totalBytes > maxResponseBytes) {
          throw walrusFetchFailed();
        }
        chunks.push(chunk);
      }
    } catch (cause) {
      try {
        await reader.cancel();
      } catch {
        // The original bounded-read failure is the safe error to report.
      }
      if (cause instanceof ExecutorError) {
        throw cause;
      }
      throw walrusFetchFailed();
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

  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxResponseBytes) {
      throw walrusFetchFailed();
    }
    return bytes;
  } catch (cause) {
    if (cause instanceof ExecutorError) {
      throw cause;
    }
    throw walrusFetchFailed();
  }
}

async function requestWithTimeout<T>(
  fetchLike: FetchLike,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchLike(url.toString(), {
      ...init,
      signal: controller.signal,
    });
    return await consume(response);
  } catch {
    throw walrusFetchFailed();
  } finally {
    clearTimeout(timeout);
  }
}

async function readSuccessfulResponse(
  response: Response,
  maxResponseBytes: number,
): Promise<Uint8Array> {
  const bytes = await readResponseBytes(response, maxResponseBytes);
  if (response.status < 200 || response.status >= 300) {
    throw walrusFetchFailed();
  }
  return bytes;
}

export function parseWalrusUploadResponse(value: unknown): WalrusUploadResult {
  const parsed = walrusUploadResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw walrusFetchFailed();
  }

  if (parsed.data.newlyCreated !== undefined) {
    return {
      status: "newly_created",
      blobId: parsed.data.newlyCreated.blobObject.blobId,
      blobObjectId: parsed.data.newlyCreated.blobObject.id,
    };
  }

  // The schema refinement guarantees this branch is present when the first
  // documented response shape is absent.
  if (parsed.data.alreadyCertified !== undefined) {
    return {
      status: "already_certified",
      blobId: parsed.data.alreadyCertified.blobId,
      txDigest: parsed.data.alreadyCertified.event.txDigest,
    };
  }

  throw walrusFetchFailed();
}

export class WalrusBlobStore implements WorkflowBlobStore {
  private readonly baseUrl: URL;

  private readonly timeoutMs: number;

  private readonly maxResponseBytes: number;

  private readonly fetch: FetchLike;

  constructor(options: WalrusHttpOptions) {
    const validated = validateHttpOptions(options);
    this.baseUrl = validated.baseUrl;
    this.timeoutMs = validated.timeoutMs;
    this.maxResponseBytes = validated.maxResponseBytes;
    this.fetch = validated.fetch;
  }

  async get(blobId: string): Promise<Uint8Array> {
    assertBlobId(blobId);
    return requestWithTimeout(
      this.fetch,
      endpointUrl(this.baseUrl, blobId),
      { method: "GET" },
      this.timeoutMs,
      (response) => readSuccessfulResponse(response, this.maxResponseBytes),
    );
  }
}

export class WalrusPublisher implements WorkflowBlobPublisher {
  private readonly baseUrl: URL;

  private readonly timeoutMs: number;

  private readonly maxResponseBytes: number;

  private readonly fetch: FetchLike;

  private readonly storageEpochs: number;

  constructor(options: WalrusPublisherOptions) {
    const validated = validateHttpOptions(options);
    if (
      !Number.isSafeInteger(options.storageEpochs) ||
      options.storageEpochs < 1 ||
      options.storageEpochs > 53
    ) {
      throw walrusFetchFailed();
    }
    this.baseUrl = validated.baseUrl;
    this.timeoutMs = validated.timeoutMs;
    this.maxResponseBytes = validated.maxResponseBytes;
    this.fetch = validated.fetch;
    this.storageEpochs = options.storageEpochs;
  }

  async put(bytes: Uint8Array): Promise<WalrusUploadResult> {
    const endpoint = endpointUrl(this.baseUrl);
    endpoint.searchParams.set("epochs", this.storageEpochs.toString());
    return requestWithTimeout(
      this.fetch,
      endpoint,
      {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: bytes as unknown as BodyInit,
      },
      this.timeoutMs,
      async (response) => {
        const responseBytes = await readSuccessfulResponse(
          response,
          this.maxResponseBytes,
        );
        let json: unknown;
        try {
          json = JSON.parse(UTF8_DECODER.decode(responseBytes)) as unknown;
        } catch {
          throw walrusFetchFailed();
        }
        return parseWalrusUploadResponse(json);
      },
    );
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function validateRetryOptions(options: WalrusReadRetryOptions): void {
  if (
    !Number.isSafeInteger(options.maxAttempts) ||
    options.maxAttempts <= 0 ||
    !Number.isFinite(options.baseDelayMs) ||
    options.baseDelayMs < 0 ||
    !Number.isFinite(options.maxDelayMs) ||
    options.maxDelayMs < 0
  ) {
    throw walrusFetchFailed();
  }
}

export async function readWalrusWithRetry(
  options: WalrusReadRetryOptions,
): Promise<Uint8Array> {
  validateRetryOptions(options);

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const bytes = await options.store.get(options.blobId);
      if (!bytesEqual(bytes, options.expectedBytes)) {
        throw new ExecutorError(
          "BUNDLE_HASH_MISMATCH",
          "Retrieved Walrus bytes do not match expected bytes",
        );
      }
      return new Uint8Array(bytes);
    } catch (cause) {
      if (
        !(cause instanceof ExecutorError) ||
        cause.code !== "WALRUS_FETCH_FAILED" ||
        attempt >= options.maxAttempts
      ) {
        throw cause;
      }
      const delay = Math.min(
        options.baseDelayMs * 2 ** (attempt - 1),
        options.maxDelayMs,
      );
      await options.sleep(delay);
    }
  }

  // maxAttempts is validated as positive, so the loop always returns or throws.
  throw walrusFetchFailed();
}
