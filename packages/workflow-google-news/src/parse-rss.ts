import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { NewsItem } from "./schema.js";
import { GoogleNewsWorkflowError } from "./errors.js";
import { normalizeDisplayText } from "./normalize.js";

const FORBIDDEN_DECLARATION_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/iu;

const parser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  parseTagValue: false,
  processEntities: false,
  trimValues: false,
  // Keep feed text intact so markup can be removed deterministically after
  // parsing. This also prevents nested title/source elements from changing
  // the text order in the parsed object.
  stopNodes: ["..title", "..source", "..pubDate", "..publishedAt", "..link", "..url", "..guid", "..dc:date"],
});

type ParsedObject = Record<string, unknown>;

function isParsedObject(value: unknown): value is ParsedObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((part) => readText(part))
      .filter((part): part is string => part !== undefined);
    return parts.length > 0 ? parts.join(" ") : undefined;
  }

  if (!isParsedObject(value)) return undefined;

  const textNode = value["#text"];
  if (typeof textNode === "string") return textNode;

  const parts = Object.values(value)
    .map((part) => readText(part))
    .filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function getText(object: ParsedObject, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readText(object[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseError(): GoogleNewsWorkflowError {
  return new GoogleNewsWorkflowError(
    "RSS_PARSE_ERROR",
    "RSS feed XML could not be parsed",
  );
}

function normalizeItemUrl(value: string): string | undefined {
  const normalized = normalizeDisplayText(value);
  if (normalized.length === 0) return undefined;

  try {
    const parsedUrl = new URL(normalized);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return undefined;
    }
    return parsedUrl.toString();
  } catch {
    return undefined;
  }
}

function parseItem(value: unknown): NewsItem | undefined {
  if (!isParsedObject(value)) return undefined;

  const rawTitle = getText(value, "title");
  const title = rawTitle === undefined ? "" : normalizeDisplayText(rawTitle);
  if (title.length === 0) return undefined;

  const rawDate = getText(value, "pubDate", "publishedAt", "dc:date");
  if (rawDate === undefined) return undefined;
  const date = new Date(normalizeDisplayText(rawDate));
  if (!Number.isFinite(date.getTime())) return undefined;

  const rawUrl = getText(value, "link", "url", "guid");
  if (rawUrl === undefined) return undefined;
  const url = normalizeItemUrl(rawUrl);
  if (url === undefined) return undefined;

  const rawSource = getText(value, "source");
  const normalizedSource =
    rawSource === undefined ? "" : normalizeDisplayText(rawSource);

  return {
    title,
    source: normalizedSource.length > 0 ? normalizedSource : null,
    publishedAt: date.toISOString(),
    url,
  };
}

export function parseGoogleNewsRss(xml: string): NewsItem[] {
  try {
    if (typeof xml !== "string" || FORBIDDEN_DECLARATION_PATTERN.test(xml)) {
      throw parseError();
    }

    const validationResult = XMLValidator.validate(xml);
    if (validationResult !== true) {
      throw parseError();
    }

    const parsed: unknown = parser.parse(xml);
    if (!isParsedObject(parsed)) throw parseError();

    const rootKeys = Object.keys(parsed);
    if (rootKeys.length !== 1 || rootKeys[0] !== "rss") {
      throw parseError();
    }

    const root = parsed["rss"];
    if (!isParsedObject(root)) throw parseError();
    const channel = root["channel"];
    if (!isParsedObject(channel)) return [];

    const rawItems = channel["item"];
    const itemValues =
      rawItems === undefined
        ? []
        : Array.isArray(rawItems)
          ? rawItems
          : [rawItems];

    return itemValues
      .map((item) => parseItem(item))
      .filter((item): item is NewsItem => item !== undefined);
  } catch (error) {
    if (error instanceof GoogleNewsWorkflowError) throw error;
    throw parseError();
  }
}
