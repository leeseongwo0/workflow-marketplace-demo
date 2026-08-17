import type { GoogleNewsWorkflowBundle } from "./schema.js";
import { GoogleNewsWorkflowError } from "./errors.js";

const RESERVED_TIME_OPERATOR_PATTERN =
  /(?:^|[^\p{L}\p{N}_\p{M}])(?:when|before|after)\s*:/iu;

function collapseUnicodeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * Normalize and validate the user-controlled search query.
 *
 * The length check deliberately uses code points rather than UTF-16 code
 * units so that astral characters count as one user-visible character.
 */
export function normalizeQuery(query: string): string {
  if (typeof query !== "string") {
    throw new GoogleNewsWorkflowError(
      "INVALID_QUERY",
      "Query must be a string",
    );
  }

  const normalized = collapseUnicodeWhitespace(query.normalize("NFC"));
  const codePointLength = Array.from(normalized).length;

  if (codePointLength < 2 || codePointLength > 200) {
    throw new GoogleNewsWorkflowError(
      "INVALID_QUERY",
      "Query must contain between 2 and 200 Unicode code points",
    );
  }

  if (RESERVED_TIME_OPERATOR_PATTERN.test(normalized)) {
    throw new GoogleNewsWorkflowError(
      "INVALID_QUERY_OPERATOR",
      "Query cannot contain a Google News time operator",
    );
  }

  return normalized;
}

export function buildGoogleNewsFeedUrl(input: Readonly<{
  query: string;
  bundle: GoogleNewsWorkflowBundle;
}>): URL {
  const query = normalizeQuery(input.query);
  const feedUrl = new URL(input.bundle.feedBaseUrl);
  const params = new URLSearchParams({
    q: `${query} when:1d`,
    hl: input.bundle.locale.hl,
    gl: input.bundle.locale.gl,
    ceid: input.bundle.locale.ceid,
  });

  feedUrl.search = params.toString();
  return feedUrl;
}
