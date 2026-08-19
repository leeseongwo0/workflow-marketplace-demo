export type ExecutorErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_QUERY"
  | "INVALID_QUERY_OPERATOR"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_ALREADY_USED"
  | "INVALID_WALLET_SIGNATURE"
  | "LICENSE_NOT_FOUND"
  | "LICENSE_OWNER_MISMATCH"
  | "LICENSE_RELEASE_MISMATCH"
  | "RELEASE_INACTIVE"
  | "WALRUS_FETCH_FAILED"
  | "BUNDLE_HASH_MISMATCH"
  | "KEY_NOT_FOUND"
  | "BUNDLE_DECRYPT_FAILED"
  | "BUNDLE_SCHEMA_INVALID"
  | "RSS_TIMEOUT"
  | "RSS_UPSTREAM_ERROR"
  | "RSS_PARSE_ERROR"
  | "RECEIPT_SIGN_FAILED"
  | "INTERNAL_ERROR";

export class ExecutorError extends Error {
  readonly code: ExecutorErrorCode;

  constructor(code: ExecutorErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExecutorError";
    this.code = code;
  }
}
