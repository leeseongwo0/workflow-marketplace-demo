import { z } from "zod";

export const GOOGLE_NEWS_WORKFLOW_TYPE = "google_news_rss/v1" as const;

const publicInputSchema = z.strictObject({
  query: z.strictObject({
    type: z.literal("string"),
    minLength: z.literal(2),
    maxLength: z.literal(200),
  }),
});

const publicOutputSchema = z.strictObject({
  maxItems: z.literal(10),
  fields: z.tuple([
    z.literal("title"),
    z.literal("source"),
    z.literal("publishedAt"),
    z.literal("url"),
  ]),
});

export const publicWorkflowManifestSchema = z.strictObject({
  schemaVersion: z.literal("public-manifest/v1"),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  workflowType: z.literal(GOOGLE_NEWS_WORKFLOW_TYPE),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  inputSchema: publicInputSchema,
  outputSchema: publicOutputSchema,
});

export type PublicWorkflowManifest = z.infer<
  typeof publicWorkflowManifestSchema
>;

export const googleNewsWorkflowBundleSchema = z.strictObject({
  schemaVersion: z.literal(GOOGLE_NEWS_WORKFLOW_TYPE),
  feedBaseUrl: z.literal("https://news.google.com/rss/search"),
  locale: z.strictObject({
    hl: z.literal("ko"),
    gl: z.literal("KR"),
    ceid: z.literal("KR:ko"),
  }),
  windowHours: z.literal(24),
  maxResults: z.number().int().min(1).max(10),
  requestTimeoutMs: z.number().int().min(1).max(30_000),
  dedupeStrategy: z.literal("normalized_title_and_source"),
});

export type GoogleNewsWorkflowBundle = z.infer<
  typeof googleNewsWorkflowBundleSchema
>;
