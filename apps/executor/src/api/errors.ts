import type { ExecutorErrorCode } from "../errors.js";
import { ExecutorError } from "../errors.js";

export interface ExecutorErrorResponse {
  error: {
    code: ExecutorErrorCode;
    message: string;
  };
}

const PUBLIC_MESSAGES: Record<ExecutorErrorCode, string> = {
  INVALID_REQUEST: "Request is invalid",
  INVALID_QUERY: "Query is invalid",
  INVALID_QUERY_OPERATOR: "Query contains a reserved time operator",
  CHALLENGE_NOT_FOUND: "Challenge was not found",
  CHALLENGE_EXPIRED: "Challenge has expired",
  CHALLENGE_ALREADY_USED: "Challenge was already used",
  INVALID_WALLET_SIGNATURE: "Wallet signature is invalid",
  LICENSE_NOT_FOUND: "License could not be verified",
  LICENSE_OWNER_MISMATCH: "License owner does not match the runner",
  LICENSE_RELEASE_MISMATCH: "License does not match the release",
  RELEASE_INACTIVE: "Workflow release is inactive",
  WALRUS_FETCH_FAILED: "Workflow bundle could not be retrieved",
  BUNDLE_HASH_MISMATCH: "Workflow bundle integrity verification failed",
  KEY_NOT_FOUND: "Workflow key could not be loaded",
  BUNDLE_DECRYPT_FAILED: "Workflow bundle could not be decrypted",
  BUNDLE_SCHEMA_INVALID: "Workflow bundle is invalid",
  RSS_TIMEOUT: "RSS upstream request timed out",
  RSS_UPSTREAM_ERROR: "RSS upstream request failed",
  RSS_PARSE_ERROR: "RSS response could not be parsed",
  RECEIPT_SIGN_FAILED: "Execution receipt could not be signed",
  INTERNAL_ERROR: "Internal executor error",
};

const HTTP_STATUS: Record<ExecutorErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_QUERY: 400,
  INVALID_QUERY_OPERATOR: 400,
  CHALLENGE_NOT_FOUND: 404,
  CHALLENGE_EXPIRED: 410,
  CHALLENGE_ALREADY_USED: 409,
  INVALID_WALLET_SIGNATURE: 401,
  LICENSE_NOT_FOUND: 403,
  LICENSE_OWNER_MISMATCH: 403,
  LICENSE_RELEASE_MISMATCH: 403,
  RELEASE_INACTIVE: 409,
  WALRUS_FETCH_FAILED: 502,
  BUNDLE_HASH_MISMATCH: 502,
  KEY_NOT_FOUND: 500,
  BUNDLE_DECRYPT_FAILED: 500,
  BUNDLE_SCHEMA_INVALID: 500,
  RSS_TIMEOUT: 504,
  RSS_UPSTREAM_ERROR: 502,
  RSS_PARSE_ERROR: 502,
  RECEIPT_SIGN_FAILED: 500,
  INTERNAL_ERROR: 500,
};

function isExecutorErrorCode(value: unknown): value is ExecutorErrorCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PUBLIC_MESSAGES, value)
  );
}

function publicErrorCode(error: unknown): ExecutorErrorCode {
  if (error instanceof ExecutorError && isExecutorErrorCode(error.code)) {
    return error.code;
  }
  return "INTERNAL_ERROR";
}

export function toPublicExecutorError(error: unknown): ExecutorErrorResponse {
  const code = publicErrorCode(error);
  return {
    error: {
      code,
      message: PUBLIC_MESSAGES[code],
    },
  };
}

export function statusForExecutorError(error: unknown): number {
  const code = publicErrorCode(error);
  return HTTP_STATUS[code];
}

export function invalidRequestError(): ExecutorError {
  return new ExecutorError("INVALID_REQUEST", "Request is invalid");
}
