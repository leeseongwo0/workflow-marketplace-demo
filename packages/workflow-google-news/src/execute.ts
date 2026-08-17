import type {
  Clock,
  GoogleNewsExecutionOutput,
  GoogleNewsWorkflowBundle,
} from "./schema.js";
import {
  googleNewsExecutionOutputSchema,
  googleNewsWorkflowBundleSchema,
} from "./schema.js";
import { GoogleNewsWorkflowError } from "./errors.js";
import { buildGoogleNewsFeedUrl } from "./build-feed-url.js";
import { filterAndOrderNewsItems } from "./normalize.js";
import { parseGoogleNewsRss } from "./parse-rss.js";

export type RssFeedLoader = (input: Readonly<{
  url: URL;
  timeoutMs: number;
}>) => Promise<string>;

export async function executeGoogleNewsWorkflow(input: Readonly<{
  bundle: GoogleNewsWorkflowBundle;
  query: string;
  clock: Clock;
  loadFeed: RssFeedLoader;
}>): Promise<GoogleNewsExecutionOutput> {
  const bundle = googleNewsWorkflowBundleSchema.parse(input.bundle);
  const url = buildGoogleNewsFeedUrl({ query: input.query, bundle });
  const now = input.clock.now();

  let xml: string;
  try {
    xml = await input.loadFeed({
      url,
      timeoutMs: bundle.requestTimeoutMs,
    });
  } catch (error) {
    if (error instanceof GoogleNewsWorkflowError) throw error;
    throw new GoogleNewsWorkflowError(
      "RSS_UPSTREAM_ERROR",
      "RSS feed loader failed",
    );
  }

  const parsedItems = parseGoogleNewsRss(xml);
  const items = filterAndOrderNewsItems({
    items: parsedItems,
    now,
    windowHours: bundle.windowHours,
    maxResults: bundle.maxResults,
  });

  return googleNewsExecutionOutputSchema.parse({ items });
}
