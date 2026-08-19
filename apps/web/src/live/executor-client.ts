import { canonicalJsonBytes } from "@aiwf/shared";
import { normalizeQuery } from "@aiwf/workflow-google-news";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const newsItemSchema = z.strictObject({
  title: z.string().min(1),
  source: z.string().min(1).nullable(),
  publishedAt: z.iso.datetime({ offset: true }),
  url: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }),
});

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const addressSchema = z.string().regex(/^0x[0-9a-f]{64}$/u);
const base64Schema = z.string().regex(
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
);

const challengePayloadSchema = z.strictObject({
  domain: z.literal("AIWF_EXECUTION_REQUEST_V1"),
  challengeId: z.uuid(),
  runnerAddress: addressSchema,
  releaseId: addressSchema,
  licenseId: addressSchema,
  inputHash: hashSchema,
  issuedAtMs: z.number().int().nonnegative().safe(),
  expiresAtMs: z.number().int().nonnegative().safe(),
  nonce: base64Schema,
});

export const challengeResponseSchema = z.strictObject({
  challengeId: z.uuid(),
  expiresAtMs: z.number().int().nonnegative().safe(),
  personalMessage: z.strictObject({
    bytesBase64: base64Schema,
    preview: z.string().min(1),
  }),
});

export const executionResponseSchema = z.strictObject({
  executionId: z.uuid(),
  workflow: z.strictObject({
    releaseId: addressSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    workflowType: z.literal("google_news_rss/v1"),
  }),
  input: z.strictObject({ query: z.string(), inputHash: hashSchema }),
  result: z.strictObject({
    items: z.array(newsItemSchema).max(10),
    outputHash: hashSchema,
  }),
  trace: z.array(
    z.enum([
      "WALLET_SIGNATURE_VERIFIED",
      "LICENSE_VERIFIED",
      "WALRUS_BLOB_VERIFIED",
      "BUNDLE_DECRYPTED_LOCAL_SERVER",
      "RSS_FETCHED",
      "RESULT_SIGNED",
    ]),
  ),
  receipt: z.strictObject({
    payload: z.strictObject({
      releaseId: addressSchema,
      licenseId: addressSchema,
      runner: addressSchema,
      inputHash: hashSchema,
      outputHash: hashSchema,
      executedAtMs: z.number().int().nonnegative().safe(),
      nonceHash: hashSchema,
    }),
    bcsBase64: base64Schema,
    signatureBase64: base64Schema,
    executorPublicKeyBase64: base64Schema,
  }),
  security: z.strictObject({
    executionMode: z.literal("local_server"),
    nautilus: z.literal(false),
    teeAttestation: z.literal(false),
    keyProvider: z.literal("local_demo"),
  }),
});

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;
export type ExecutionResponse = z.infer<typeof executionResponseSchema>;
export type ExecutionReceiptDto = ExecutionResponse["receipt"];

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ExecutorApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExecutorApiError";
    this.code = code;
  }
}

function decodeCanonicalBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    if (btoa(binary) !== value) throw new Error("not canonical");
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new ExecutorApiError("INVALID_RESPONSE", "Executor returned invalid base64");
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function canonicalJsonHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalJsonBytes(value));
}

async function validateChallengeMessage(input: {
  response: ChallengeResponse;
  messageBytes: Uint8Array;
  expectedRunner: string;
  expectedReleaseId: string;
  expectedLicenseId: string;
  expectedQuery: string;
  nowMs: number;
}): Promise<void> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.messageBytes)) as unknown;
  } catch {
    throw new ExecutorApiError("INVALID_RESPONSE", "Challenge message is not canonical JSON");
  }
  const parsed = challengePayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ExecutorApiError("INVALID_RESPONSE", "Challenge payload is invalid");
  }
  const payload = parsed.data;
  const canonicalBytes = canonicalJsonBytes(payload);
  if (!equalBytes(canonicalBytes, input.messageBytes)) {
    throw new ExecutorApiError("INVALID_RESPONSE", "Challenge message is not canonical JSON");
  }
  const nonceBytes = decodeCanonicalBase64(payload.nonce);
  const normalizedQuery = normalizeQuery(input.expectedQuery);
  const expectedInputHash = await canonicalJsonHash({ query: normalizedQuery });
  if (
    nonceBytes.length !== 32 ||
    payload.challengeId !== input.response.challengeId ||
    payload.expiresAtMs !== input.response.expiresAtMs ||
    payload.runnerAddress !== normalizeSuiAddress(input.expectedRunner) ||
    payload.releaseId !== normalizeSuiAddress(input.expectedReleaseId) ||
    payload.licenseId !== normalizeSuiAddress(input.expectedLicenseId) ||
    payload.inputHash !== expectedInputHash ||
    payload.expiresAtMs <= payload.issuedAtMs ||
    payload.expiresAtMs - payload.issuedAtMs > MAX_CHALLENGE_TTL_MS ||
    payload.issuedAtMs > input.nowMs + MAX_CLOCK_SKEW_MS ||
    payload.expiresAtMs <= input.nowMs
  ) {
    throw new ExecutorApiError("INVALID_RESPONSE", "Challenge payload does not match the request");
  }
}

export async function verifyExecutionContent(input: {
  response: ExecutionResponse;
  submittedQuery: string;
}): Promise<void> {
  const normalizedQuery = normalizeQuery(input.submittedQuery);
  const inputHash = await canonicalJsonHash({ query: normalizedQuery });
  const outputHash = await canonicalJsonHash({ items: input.response.result.items });
  if (
    input.response.input.query !== normalizedQuery ||
    input.response.input.inputHash !== inputHash ||
    input.response.result.outputHash !== outputHash ||
    input.response.receipt.payload.inputHash !== inputHash ||
    input.response.receipt.payload.outputHash !== outputHash
  ) {
    throw new ExecutorApiError(
      "INVALID_RESPONSE",
      "Execution content does not match the signed receipt",
    );
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_RESPONSE_BYTES) {
      throw new ExecutorApiError("INVALID_RESPONSE", "Executor response is too large");
    }
  }
  let bytes: Uint8Array;
  if (response.body !== null) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = new Uint8Array(next.value);
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new ExecutorApiError("INVALID_RESPONSE", "Executor response is too large");
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) {
      throw new ExecutorApiError("INVALID_RESPONSE", "Executor response is too large");
    }
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ExecutorApiError("INVALID_RESPONSE", "Executor returned invalid JSON");
  }
}

async function postJson(input: {
  fetch: FetchLike;
  url: URL;
  body: unknown;
  timeoutMs: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetch(input.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    const json = await readBoundedJson(response);
    if (!response.ok) {
      const parsedError = errorResponseSchema.safeParse(json);
      if (parsedError.success) {
        throw new ExecutorApiError(
          parsedError.data.error.code,
          parsedError.data.error.message,
        );
      }
      throw new ExecutorApiError("EXECUTOR_ERROR", "Executor request failed");
    }
    return json;
  } catch (cause) {
    if (cause instanceof ExecutorApiError) throw cause;
    if (controller.signal.aborted) {
      throw new ExecutorApiError("EXECUTOR_TIMEOUT", "Executor request timed out");
    }
    throw new ExecutorApiError("EXECUTOR_UNREACHABLE", "Executor is unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function endpoint(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  if (
    (base.protocol !== "http:" && base.protocol !== "https:") ||
    (base.hostname !== "127.0.0.1" && base.hostname !== "localhost")
  ) {
    throw new ExecutorApiError("INVALID_CONFIG", "Executor URL must be local");
  }
  return new URL(path, `${base.origin}/`);
}

export class ExecutorClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #now: () => number;

  constructor(input: { baseUrl: string; fetch?: FetchLike; now?: () => number }) {
    this.#baseUrl = input.baseUrl;
    this.#fetch = input.fetch ?? globalThis.fetch;
    this.#now = input.now ?? Date.now;
  }

  async createChallenge(input: {
    runnerAddress: string;
    releaseId: string;
    licenseId: string;
    query: string;
  }): Promise<ChallengeResponse> {
    const response = await postJson({
      fetch: this.#fetch,
      url: endpoint(this.#baseUrl, "/api/execution/challenges"),
      body: input,
      timeoutMs: 15_000,
    });
    const parsed = challengeResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ExecutorApiError("INVALID_RESPONSE", "Challenge response is invalid");
    }
    const messageBytes = decodeCanonicalBase64(
      parsed.data.personalMessage.bytesBase64,
    );
    let preview: string;
    try {
      preview = new TextDecoder("utf-8", { fatal: true }).decode(messageBytes);
    } catch {
      throw new ExecutorApiError("INVALID_RESPONSE", "Challenge bytes are not UTF-8");
    }
    if (preview !== parsed.data.personalMessage.preview) {
      throw new ExecutorApiError("INVALID_RESPONSE", "Challenge preview does not match bytes");
    }
    await validateChallengeMessage({
      response: parsed.data,
      messageBytes,
      expectedRunner: input.runnerAddress,
      expectedReleaseId: input.releaseId,
      expectedLicenseId: input.licenseId,
      expectedQuery: input.query,
      nowMs: this.#now(),
    });
    return parsed.data;
  }

  async execute(input: {
    challengeId: string;
    walletSignature: string;
  }): Promise<ExecutionResponse> {
    const response = await postJson({
      fetch: this.#fetch,
      url: endpoint(this.#baseUrl, "/api/executions"),
      body: input,
      timeoutMs: 60_000,
    });
    const parsed = executionResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ExecutorApiError("INVALID_RESPONSE", "Execution response is invalid");
    }
    return parsed.data;
  }
}
