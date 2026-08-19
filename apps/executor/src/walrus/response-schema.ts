import { z } from "zod";

const BLOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/u;

const blobIdSchema = z.string().regex(BLOB_ID_PATTERN);

const newlyCreatedSchema = z
  .object({
    blobObject: z
      .object({
        id: z.string().min(1),
        blobId: blobIdSchema,
      })
      .passthrough(),
  })
  .passthrough();

const alreadyCertifiedSchema = z
  .object({
    blobId: blobIdSchema,
    event: z
      .object({
        txDigest: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

const walrusUploadResponseSchema = z
  .strictObject({
    newlyCreated: newlyCreatedSchema.optional(),
    alreadyCertified: alreadyCertifiedSchema.optional(),
  })
  .superRefine((value, context) => {
    const hasNewlyCreated = value.newlyCreated !== undefined;
    const hasAlreadyCertified = value.alreadyCertified !== undefined;
    if (hasNewlyCreated === hasAlreadyCertified) {
      context.addIssue({
        code: "custom",
        message: "Walrus upload response must contain exactly one result shape",
      });
    }
  });

export { walrusUploadResponseSchema };

export { BLOB_ID_PATTERN as walrusBlobIdPattern };
