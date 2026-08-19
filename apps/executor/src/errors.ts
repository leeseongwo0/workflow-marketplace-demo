export type ExecutorErrorCode =
  | "INVALID_REQUEST"
  | "WALRUS_FETCH_FAILED"
  | "BUNDLE_HASH_MISMATCH"
  | "KEY_NOT_FOUND"
  | "BUNDLE_DECRYPT_FAILED"
  | "BUNDLE_SCHEMA_INVALID"
  | "INTERNAL_ERROR";

export class ExecutorError extends Error {
  readonly code: ExecutorErrorCode;

  constructor(code: ExecutorErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExecutorError";
    this.code = code;
  }
}
