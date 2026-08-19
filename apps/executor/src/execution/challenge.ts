import { randomBytes, randomUUID } from "node:crypto";

import {
  canonicalJsonBytes,
  normalizeSuiAddress,
} from "@aiwf/shared";
import { normalizeQuery } from "@aiwf/workflow-google-news";
import { z } from "zod";

import type { Clock } from "../contracts.js";
import { ExecutorError } from "../errors.js";
import { sha256Hex } from "../crypto/hash.js";

export const EXECUTION_CHALLENGE_DOMAIN =
  "AIWF_EXECUTION_REQUEST_V1" as const;
const MAX_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_NONCE_BYTES = 32;

const normalizedAddressSchema = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/u);

export const executionChallengePayloadSchema = z.strictObject({
  domain: z.literal(EXECUTION_CHALLENGE_DOMAIN),
  challengeId: z.uuid(),
  runnerAddress: normalizedAddressSchema,
  releaseId: normalizedAddressSchema,
  licenseId: normalizedAddressSchema,
  inputHash: z.string().regex(/^[0-9a-f]{64}$/u),
  issuedAtMs: z.number().int().nonnegative().safe(),
  expiresAtMs: z.number().int().nonnegative().safe(),
  nonce: z.string().refine((value) => {
    const bytes = Buffer.from(value, "base64");
    return (
      bytes.length === CHALLENGE_NONCE_BYTES &&
      bytes.toString("base64") === value
    );
  }, "nonce must be 32 canonical base64 bytes"),
});

export type ExecutionChallengePayload = z.infer<
  typeof executionChallengePayloadSchema
>;

export interface ExecutionChallenge {
  payload: ExecutionChallengePayload;
  message: Uint8Array;
  normalizedQuery: string;
}

interface StoredChallenge extends ExecutionChallenge {
  consumed: boolean;
}

export interface ChallengeRandomSource {
  uuid(): string;
  bytes(length: number): Uint8Array;
}

const systemRandomSource: ChallengeRandomSource = {
  uuid: randomUUID,
  bytes: (length) => new Uint8Array(randomBytes(length)),
};

function requireTimestamp(date: Date): number {
  const timestamp = date.getTime();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new ExecutorError("INTERNAL_ERROR", "Clock returned an invalid time");
  }
  return timestamp;
}

function cloneChallenge(challenge: StoredChallenge): ExecutionChallenge {
  return {
    payload: { ...challenge.payload },
    message: challenge.message.slice(),
    normalizedQuery: challenge.normalizedQuery,
  };
}

export class InMemoryChallengeStore {
  readonly #challenges = new Map<string, StoredChallenge>();
  readonly #clock: Clock;
  readonly #ttlMs: number;
  readonly #random: ChallengeRandomSource;

  constructor(input: {
    clock: Clock;
    ttlMs?: number;
    random?: ChallengeRandomSource;
  }) {
    const ttlMs = input.ttlMs ?? MAX_CHALLENGE_TTL_MS;
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_CHALLENGE_TTL_MS) {
      throw new TypeError("Challenge TTL must be between 1 and 300000 ms");
    }
    this.#clock = input.clock;
    this.#ttlMs = ttlMs;
    this.#random = input.random ?? systemRandomSource;
  }

  issue(input: {
    runnerAddress: string;
    releaseId: string;
    licenseId: string;
    query: string;
  }): ExecutionChallenge {
    let runnerAddress: string;
    let releaseId: string;
    let licenseId: string;
    let normalizedQuery: string;
    try {
      runnerAddress = normalizeSuiAddress(input.runnerAddress);
      releaseId = normalizeSuiAddress(input.releaseId);
      licenseId = normalizeSuiAddress(input.licenseId);
      normalizedQuery = normalizeQuery(input.query);
    } catch (cause) {
      if (
        cause instanceof Error &&
        "code" in cause &&
        (cause.code === "INVALID_QUERY" ||
          cause.code === "INVALID_QUERY_OPERATOR")
      ) {
        throw new ExecutorError(cause.code, cause.message, cause);
      }
      throw new ExecutorError(
        "INVALID_REQUEST",
        "Challenge request fields are invalid",
        cause,
      );
    }

    const issuedAtMs = requireTimestamp(this.#clock.now());
    const payload = executionChallengePayloadSchema.parse({
      domain: EXECUTION_CHALLENGE_DOMAIN,
      challengeId: this.#random.uuid(),
      runnerAddress,
      releaseId,
      licenseId,
      inputHash: sha256Hex(canonicalJsonBytes({ query: normalizedQuery })),
      issuedAtMs,
      expiresAtMs: issuedAtMs + this.#ttlMs,
      nonce: Buffer.from(this.#random.bytes(CHALLENGE_NONCE_BYTES)).toString(
        "base64",
      ),
    });
    const message = canonicalJsonBytes(payload);
    const challenge: StoredChallenge = {
      payload,
      message,
      normalizedQuery,
      consumed: false,
    };
    this.#challenges.set(payload.challengeId, challenge);
    return cloneChallenge(challenge);
  }

  load(challengeId: string): ExecutionChallenge {
    const challenge = this.#challenges.get(challengeId);
    if (challenge === undefined) {
      throw new ExecutorError("CHALLENGE_NOT_FOUND", "Challenge was not found");
    }
    this.#assertUsable(challenge);
    return cloneChallenge(challenge);
  }

  consumeAfterVerification(challengeId: string): ExecutionChallenge {
    const challenge = this.#challenges.get(challengeId);
    if (challenge === undefined) {
      throw new ExecutorError("CHALLENGE_NOT_FOUND", "Challenge was not found");
    }
    this.#assertUsable(challenge);
    challenge.consumed = true;
    return cloneChallenge(challenge);
  }

  #assertUsable(challenge: StoredChallenge): void {
    if (challenge.consumed) {
      throw new ExecutorError(
        "CHALLENGE_ALREADY_USED",
        "Challenge was already consumed",
      );
    }
    if (requireTimestamp(this.#clock.now()) >= challenge.payload.expiresAtMs) {
      throw new ExecutorError("CHALLENGE_EXPIRED", "Challenge has expired");
    }
  }
}
