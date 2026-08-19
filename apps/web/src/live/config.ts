import { normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";

const DEFAULT_SUI_GRPC_URL = "https://fullnode.testnet.sui.io:443";
const DEFAULT_EXECUTOR_URL = "http://127.0.0.1:3001";

const optionalValue = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const httpsUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === ""
  );
}, "must be an HTTPS URL without credentials, query, or hash");

const localExecutorUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === ""
  );
}, "must be an exact loopback HTTP(S) URL");

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/u)
  .transform((value) => normalizeSuiAddress(value));

const inputSchema = z.strictObject({
  network: z.literal("testnet"),
  suiGrpcUrl: httpsUrl,
  executorBaseUrl: localExecutorUrl,
  explorerBaseUrl: optionalValue.pipe(httpsUrl.optional()),
  packageId: optionalValue,
  marketplaceId: optionalValue,
  releaseId: optionalValue,
});

interface WebConfigBase {
  network: "testnet";
  suiGrpcUrl: string;
  executorBaseUrl: string;
  explorerBaseUrl?: string;
}

export type WebConfig =
  | (WebConfigBase & {
      mode: "live";
      packageId: string;
      marketplaceId: string;
      releaseId: string;
    })
  | (WebConfigBase & {
      mode: "fixture" | "configuration_error";
      packageId?: undefined;
      marketplaceId?: undefined;
      releaseId?: undefined;
    });

export function resolveWebConfig(
  env: Record<string, string | undefined>,
): WebConfig {
  const parsed = inputSchema.safeParse({
    network: env["VITE_SUI_NETWORK"] ?? "testnet",
    suiGrpcUrl: env["VITE_SUI_GRPC_URL"] ?? DEFAULT_SUI_GRPC_URL,
    executorBaseUrl: env["VITE_EXECUTOR_BASE_URL"] ?? DEFAULT_EXECUTOR_URL,
    explorerBaseUrl: env["VITE_SUI_EXPLORER_BASE_URL"],
    packageId: env["VITE_SUI_PACKAGE_ID"],
    marketplaceId: env["VITE_MARKETPLACE_ID"],
    releaseId: env["VITE_WORKFLOW_RELEASE_ID"],
  });

  if (!parsed.success) {
    return {
      mode: "configuration_error",
      network: "testnet",
      suiGrpcUrl: DEFAULT_SUI_GRPC_URL,
      executorBaseUrl: DEFAULT_EXECUTOR_URL,
    };
  }

  const base: WebConfigBase = {
    network: parsed.data.network,
    suiGrpcUrl: parsed.data.suiGrpcUrl,
    executorBaseUrl: new URL(parsed.data.executorBaseUrl).origin,
    ...(parsed.data.explorerBaseUrl === undefined
      ? {}
      : { explorerBaseUrl: parsed.data.explorerBaseUrl.replace(/\/+$/u, "") }),
  };
  const ids = [
    parsed.data.packageId,
    parsed.data.marketplaceId,
    parsed.data.releaseId,
  ];
  if (ids.every((value) => value === undefined)) {
    return { ...base, mode: "fixture" };
  }
  if (ids.some((value) => value === undefined)) {
    return { ...base, mode: "configuration_error" };
  }

  const parsedIds = z
    .tuple([address, address, address])
    .safeParse(ids);
  if (!parsedIds.success) {
    return { ...base, mode: "configuration_error" };
  }
  return {
    ...base,
    mode: "live",
    packageId: parsedIds.data[0],
    marketplaceId: parsedIds.data[1],
    releaseId: parsedIds.data[2],
  };
}

export const webConfig = resolveWebConfig(import.meta.env);

export function explorerObjectUrl(
  config: WebConfig,
  objectId: string,
): string | undefined {
  return config.explorerBaseUrl === undefined
    ? undefined
    : `${config.explorerBaseUrl}/object/${normalizeSuiAddress(objectId)}`;
}

export function explorerTransactionUrl(
  config: WebConfig,
  digest: string,
): string | undefined {
  return config.explorerBaseUrl === undefined
    ? undefined
    : `${config.explorerBaseUrl}/tx/${encodeURIComponent(digest)}`;
}
