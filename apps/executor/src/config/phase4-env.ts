import { z } from "zod";

const MAX_CHALLENGE_TTL_MS = 300_000;
const MAX_WALRUS_READ_TIMEOUT_MS = 60_000;
const MAX_BLOB_BYTES = 10 * 1024 * 1024;

const httpsBaseUrlSchema = z.string().trim().min(1).refine((value) => {
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

const positiveInteger = (maximum: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/u)
    .transform(Number)
    .refine(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= maximum,
      "must be a positive integer within the supported range",
    );

const portSchema = z
  .string()
  .trim()
  .regex(/^\d+$/u)
  .transform(Number)
  .refine(
    (value) => Number.isSafeInteger(value) && value >= 1 && value <= 65_535,
    "must be a valid TCP port",
  );

const packageIdSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{1,64}$/u);

const corsOriginSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    if (value === "*" || value.includes("*")) return false;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.username === "" &&
        url.password === "" &&
        url.pathname === "/" &&
        url.search === "" &&
        url.hash === ""
      );
    } catch {
      return false;
    }
  }, "must be one exact HTTP(S) origin")
  .transform((value) => new URL(value).origin);

const phase4EnvSchema = z.object({
  SUI_NETWORK: z.literal("testnet").default("testnet"),
  SUI_GRPC_URL: httpsBaseUrlSchema,
  SUI_PACKAGE_ID: packageIdSchema,
  WALRUS_AGGREGATOR_URL: httpsBaseUrlSchema,
  WALRUS_READ_TIMEOUT_MS: positiveInteger(
    MAX_WALRUS_READ_TIMEOUT_MS,
  ).default(10_000),
  WALRUS_MAX_BLOB_BYTES: positiveInteger(MAX_BLOB_BYTES).default(1_048_576),
  LOCAL_KEYRING_PATH: z.string().trim().min(1).default("./data/local-keyring.json"),
  EXECUTOR_PRIVATE_KEY: z.string().trim().min(1),
  EXECUTOR_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  EXECUTOR_PORT: portSchema.default(3_001),
  CHALLENGE_TTL_MS: positiveInteger(MAX_CHALLENGE_TTL_MS).default(
    MAX_CHALLENGE_TTL_MS,
  ),
  CORS_ORIGIN: corsOriginSchema.default("http://127.0.0.1:5173"),
});

export type Phase4Env = z.infer<typeof phase4EnvSchema>;

export function parsePhase4Env(
  env: Record<string, string | undefined>,
): Phase4Env {
  const parsed = phase4EnvSchema.safeParse({
    SUI_NETWORK: env["SUI_NETWORK"],
    SUI_GRPC_URL: env["SUI_GRPC_URL"],
    SUI_PACKAGE_ID: env["SUI_PACKAGE_ID"],
    WALRUS_AGGREGATOR_URL: env["WALRUS_AGGREGATOR_URL"],
    WALRUS_READ_TIMEOUT_MS: env["WALRUS_READ_TIMEOUT_MS"],
    WALRUS_MAX_BLOB_BYTES: env["WALRUS_MAX_BLOB_BYTES"],
    LOCAL_KEYRING_PATH: env["LOCAL_KEYRING_PATH"],
    EXECUTOR_PRIVATE_KEY: env["EXECUTOR_PRIVATE_KEY"],
    EXECUTOR_HOST: env["EXECUTOR_HOST"],
    EXECUTOR_PORT: env["EXECUTOR_PORT"],
    CHALLENGE_TTL_MS: env["CHALLENGE_TTL_MS"],
    CORS_ORIGIN: env["CORS_ORIGIN"],
  });

  if (!parsed.success) {
    // Do not expose Zod issues: they can contain endpoint, path, or key data.
    throw new Error("Invalid Phase 4 environment configuration");
  }
  return parsed.data;
}

export { phase4EnvSchema };

export const parseExecutorEnv = parsePhase4Env;
