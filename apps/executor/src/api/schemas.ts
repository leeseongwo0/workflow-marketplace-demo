import { z } from "zod";

export const executionChallengeRequestSchema = z.strictObject({
  runnerAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/u),
  releaseId: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/u),
  licenseId: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/u),
  query: z.string().max(1_000),
});

export const executionRequestSchema = z.strictObject({
  challengeId: z.uuid(),
  walletSignature: z.string().min(1).max(8_192),
});

export type ExecutionChallengeRequest = z.infer<
  typeof executionChallengeRequestSchema
>;

export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
