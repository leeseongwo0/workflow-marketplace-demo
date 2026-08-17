export const GOOGLE_NEWS_ERROR_CODES = [
  "INVALID_QUERY",
  "INVALID_QUERY_OPERATOR",
  "RSS_TIMEOUT",
  "RSS_UPSTREAM_ERROR",
  "RSS_PARSE_ERROR",
] as const;

export type GoogleNewsErrorCode = (typeof GOOGLE_NEWS_ERROR_CODES)[number];

export class GoogleNewsWorkflowError extends Error {
  readonly code: GoogleNewsErrorCode;

  constructor(code: GoogleNewsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GoogleNewsWorkflowError";
    this.code = code;
  }
}
