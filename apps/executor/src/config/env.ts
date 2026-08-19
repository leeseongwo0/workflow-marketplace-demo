import { z } from "zod";

const MAX_WALRUS_READ_TIMEOUT_MS = 60_000;
const MAX_WALRUS_BLOB_BYTES = 10 * 1024 * 1024;

const httpsBaseUrl = z.string().trim().min(1).refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      !value.includes("?") &&
      !value.includes("#")
    );
  } catch {
    return false;
  }
}, "must be an HTTPS base URL without credentials, query, or hash");

const positiveBoundedInteger = (maximum: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/u)
    .transform(Number)
    .refine(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= maximum,
      "must be a positive integer within the supported range",
    );

const phase3EnvSchema = z.object({
  SUI_NETWORK: z.literal("testnet").default("testnet"),
  WALRUS_PUBLISHER_URL: httpsBaseUrl,
  WALRUS_AGGREGATOR_URL: httpsBaseUrl,
  WALRUS_READ_TIMEOUT_MS: positiveBoundedInteger(
    MAX_WALRUS_READ_TIMEOUT_MS,
  ).default(10_000),
  WALRUS_MAX_BLOB_BYTES: positiveBoundedInteger(
    MAX_WALRUS_BLOB_BYTES,
  ).default(1_048_576),
  LOCAL_KEYRING_PATH: z
    .string()
    .trim()
    .min(1)
    .default("./data/local-keyring.json"),
});

export type Phase3Env = z.infer<typeof phase3EnvSchema>;

export function parsePhase3Env(
  env: Record<string, string | undefined>,
): Phase3Env {
  const parsed = phase3EnvSchema.safeParse({
    SUI_NETWORK: env["SUI_NETWORK"],
    WALRUS_PUBLISHER_URL: env["WALRUS_PUBLISHER_URL"],
    WALRUS_AGGREGATOR_URL: env["WALRUS_AGGREGATOR_URL"],
    WALRUS_READ_TIMEOUT_MS: env["WALRUS_READ_TIMEOUT_MS"],
    WALRUS_MAX_BLOB_BYTES: env["WALRUS_MAX_BLOB_BYTES"],
    LOCAL_KEYRING_PATH: env["LOCAL_KEYRING_PATH"],
  });

  if (!parsed.success) {
    // Keep Zod's issue details out of the process error: they can contain
    // environment values such as endpoint URLs or filesystem paths.
    throw new Error("Invalid Phase 3 environment configuration");
  }
  return parsed.data;
}

export { phase3EnvSchema };
