import { z } from "zod";

import { bundleKeyIdSchema } from "@aiwf/shared";

const canonicalBase64Schema = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);

export const localKeyringSchema = z.strictObject({
  schemaVersion: z.literal("local-keyring/v1"),
  keys: z.record(bundleKeyIdSchema, canonicalBase64Schema),
});

export type LocalKeyring = z.infer<typeof localKeyringSchema>;
