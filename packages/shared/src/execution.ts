import { z } from "zod";

export interface Clock {
  now(): Date;
}

export const newsItemSchema = z.strictObject({
  title: z.string().min(1),
  source: z.string().min(1).nullable(),
  publishedAt: z.iso.datetime({ offset: true }),
  url: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "News item URL must use HTTP or HTTPS"),
});

export type NewsItem = z.infer<typeof newsItemSchema>;

export const googleNewsExecutionInputSchema = z.strictObject({
  query: z.string(),
});

export type GoogleNewsExecutionInput = z.infer<
  typeof googleNewsExecutionInputSchema
>;

export const googleNewsExecutionOutputSchema = z.strictObject({
  items: z.array(newsItemSchema).max(10),
});

export type GoogleNewsExecutionOutput = z.infer<
  typeof googleNewsExecutionOutputSchema
>;
