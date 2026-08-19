import { SuiGrpcClient } from "@mysten/sui/grpc";
import { pathToFileURL } from "node:url";

import { createExecutorApp } from "./api/app.js";
import { parsePhase4Env, type Phase4Env } from "./config/phase4-env.js";
import { InMemoryChallengeStore } from "./execution/challenge.js";
import { ExecutionService } from "./execution/execution-service.js";
import { LocalDemoKeyProvider } from "./key-provider/local-demo-key-provider.js";
import { Ed25519ReceiptSigner } from "./receipt/ed25519-receipt-signer.js";
import { HttpRssFeedLoader } from "./rss/http-rss-feed-loader.js";
import { SuiGrpcObjectReader } from "./sui/sui-grpc-object-reader.js";
import { SuiLicenseVerifier } from "./sui/sui-license-verifier.js";
import { SystemClock } from "./system-clock.js";
import { SuiPersonalMessageVerifier } from "./wallet/sui-personal-message-verifier.js";
import { WalrusBlobStore } from "./walrus/walrus.js";

export interface ExecutorRuntime {
  app: ReturnType<typeof createExecutorApp>;
  env: Phase4Env;
  challenges: InMemoryChallengeStore;
  executionService: ExecutionService;
}

export function createExecutorRuntime(
  environment: Record<string, string | undefined> = process.env,
): ExecutorRuntime {
  const env = parsePhase4Env(environment);
  const clock = new SystemClock();
  const challenges = new InMemoryChallengeStore({
    clock,
    ttlMs: env.CHALLENGE_TTL_MS,
  });

  const suiClient = new SuiGrpcClient({
    network: "testnet",
    baseUrl: env.SUI_GRPC_URL,
  });
  const objectReader = new SuiGrpcObjectReader(suiClient);
  const suiVerifier = new SuiLicenseVerifier({
    reader: objectReader,
    packageId: env.SUI_PACKAGE_ID,
  });
  const blobStore = new WalrusBlobStore({
    baseUrl: env.WALRUS_AGGREGATOR_URL,
    timeoutMs: env.WALRUS_READ_TIMEOUT_MS,
    maxResponseBytes: env.WALRUS_MAX_BLOB_BYTES,
  });
  const keyProvider = new LocalDemoKeyProvider({
    keyringPath: env.LOCAL_KEYRING_PATH,
  });
  const receiptSigner = new Ed25519ReceiptSigner(env.EXECUTOR_PRIVATE_KEY);
  const rssLoader = new HttpRssFeedLoader();
  const executionService = new ExecutionService({
    challenges,
    walletVerifier: new SuiPersonalMessageVerifier(),
    licenseVerifier: suiVerifier,
    releaseProvider: suiVerifier,
    blobStore,
    keyProvider,
    loadFeed: rssLoader.load.bind(rssLoader),
    clock,
    receiptSigner,
  });

  return {
    app: createExecutorApp({
      challenges,
      executionService,
      corsOrigin: env.CORS_ORIGIN,
    }),
    env,
    challenges,
    executionService,
  };
}

export async function startExecutor(
  environment: Record<string, string | undefined> = process.env,
): Promise<ExecutorRuntime> {
  const runtime = createExecutorRuntime(environment);
  await runtime.app.listen({
    host: runtime.env.EXECUTOR_HOST,
    port: runtime.env.EXECUTOR_PORT,
  });
  return runtime;
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  startExecutor().catch(() => {
    // Keep startup failures secret-safe; configuration errors never include
    // private keys, decrypted bundles, or full environment objects.
    process.exitCode = 1;
  });
}
