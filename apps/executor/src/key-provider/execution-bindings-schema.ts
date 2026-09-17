import { z } from "zod";

import { bundleKeyIdSchema } from "@aiwf/shared";

const releaseIdSchema = z.string().regex(/^0x[0-9a-f]{64}$/u);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/u);

export const executionBindingsEntrySchema = z.strictObject({
  workflowType: z.literal("google_news_rss/v1"),
  encryptedBundleHash: sha256HexSchema,
  publicManifestHash: sha256HexSchema,
  keyId: bundleKeyIdSchema,
});

export type ExecutionBindingsEntry = z.infer<typeof executionBindingsEntrySchema>;

export const localExecutionBindingsSchema = z.strictObject({
  schemaVersion: z.literal("local-execution-bindings/v1"),
  releases: z.record(releaseIdSchema, executionBindingsEntrySchema),
});

export type LocalExecutionBindings = z.infer<typeof localExecutionBindingsSchema>;
