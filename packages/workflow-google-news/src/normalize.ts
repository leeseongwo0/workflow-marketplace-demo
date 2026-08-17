import type { NewsItem } from "./schema.js";

const FIVE_PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

const ENTITY_REFERENCE_PATTERN =
  /&(?:#(?:x[0-9a-f]+|[0-9]+)|amp|apos|gt|lt|quot);/giu;

const MARKUP_PATTERN =
  /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9:._-]*(?:\s[^<>]*?)?\/?\s*>/gu;

function collapseUnicodeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isValidXmlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function decodeSafeEntities(value: string): string {
  return value.replace(
    ENTITY_REFERENCE_PATTERN,
    (entity: string): string => {
      const body = entity.slice(1, -1);
      const lowerBody = body.toLowerCase();
      const namedValue = FIVE_PREDEFINED_ENTITIES[lowerBody];
      if (namedValue !== undefined) {
        return namedValue;
      }

      const isHex = lowerBody.startsWith("#x");
      const digits = isHex ? lowerBody.slice(2) : lowerBody.slice(1);
      const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
      if (!Number.isInteger(codePoint) || !isValidXmlCodePoint(codePoint)) {
        return entity;
      }

      return String.fromCodePoint(codePoint);
    },
  );
}

function stripMarkup(value: string): string {
  return value.replace(MARKUP_PATTERN, "");
}

/**
 * Convert feed text into the stable display form used by the workflow.
 * Entity decoding is intentionally limited to numeric references and the
 * five XML predefined entities; custom entities are never interpreted.
 */
export function normalizeDisplayText(value: string): string {
  const withoutRawMarkup = stripMarkup(value);
  const decoded = decodeSafeEntities(withoutRawMarkup);
  return collapseUnicodeWhitespace(stripMarkup(decoded).normalize("NFC"));
}

function normalizedKeyPart(value: string): string {
  return normalizeDisplayText(value).toLowerCase();
}

function sourceKeyPart(source: string | null): string {
  return source === null ? "" : normalizedKeyPart(source);
}

function dedupeKey(item: NewsItem): string {
  return `${normalizedKeyPart(item.title)}\u0000${sourceKeyPart(item.source)}`;
}

function publishedTime(item: NewsItem): number {
  return Date.parse(item.publishedAt);
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareTieBreakers(left: NewsItem, right: NewsItem): number {
  const titleOrder = compareStrings(
    normalizedKeyPart(left.title),
    normalizedKeyPart(right.title),
  );
  if (titleOrder !== 0) return titleOrder;

  const sourceOrder = compareStrings(
    sourceKeyPart(left.source),
    sourceKeyPart(right.source),
  );
  if (sourceOrder !== 0) return sourceOrder;

  return compareStrings(left.url, right.url);
}

/**
 * Keep the newest item for every normalized title/source pair.
 */
export function deduplicateNewsItems(items: readonly NewsItem[]): NewsItem[] {
  const newestByKey = new Map<string, NewsItem>();

  for (const item of items) {
    const key = dedupeKey(item);
    const previous = newestByKey.get(key);
    if (previous === undefined) {
      newestByKey.set(key, item);
      continue;
    }

    const itemTime = publishedTime(item);
    const previousTime = publishedTime(previous);
    if (
      itemTime > previousTime ||
      (itemTime === previousTime && compareTieBreakers(item, previous) < 0)
    ) {
      newestByKey.set(key, item);
    }
  }

  return Array.from(newestByKey.values());
}

function compareNewestFirst(left: NewsItem, right: NewsItem): number {
  const leftTime = publishedTime(left);
  const rightTime = publishedTime(right);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return compareTieBreakers(left, right);
}

export function filterAndOrderNewsItems(input: Readonly<{
  items: readonly NewsItem[];
  now: Date;
  windowHours: 24;
  maxResults: number;
}>): NewsItem[] {
  if (!Number.isInteger(input.maxResults) || input.maxResults < 1 || input.maxResults > 10) {
    throw new RangeError("maxResults must be an integer between 1 and 10");
  }

  const nowMs = input.now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("now must be a valid Date");
  }

  const cutoffMs = nowMs - input.windowHours * 60 * 60 * 1000;
  const futureLimitMs = nowMs + 5 * 60 * 1000;
  const currentItems = input.items.filter((item) => {
    const publishedMs = publishedTime(item);
    return (
      Number.isFinite(publishedMs) &&
      publishedMs >= cutoffMs &&
      publishedMs <= futureLimitMs
    );
  });

  return deduplicateNewsItems(currentItems)
    .sort(compareNewestFirst)
    .slice(0, input.maxResults);
}
