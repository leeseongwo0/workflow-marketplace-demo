import { SuiGrpcClient } from "@mysten/sui/grpc";
import { pathToFileURL } from "node:url";

import { createExecutorApp } from "./api/app.js";
import { parsePhase4Env, type Phase4Env } from "./config/phase4-env.js";
import { InMemoryChallengeStore } from "./execution/challenge.js";
import { ExecutionService } from "./execution/execution-service.js";
import { loadEnclaveIdentityKey } from "./identity/enclave-identity.js";
import { LocalDemoKeyProvider } from "./key-provider/local-demo-key-provider.js";
import { Ed25519ReceiptSigner } from "./receipt/ed25519-receipt-signer.js";
import { HttpRssFeedLoader } from "./rss/http-rss-feed-loader.js";
import { LocalBindingsReleaseProvider } from "./sui/local-bindings-release-provider.js";
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

export async function createExecutorRuntime(
  environment: Record<string, string | undefined> = process.env,
): Promise<ExecutorRuntime> {
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
  // The chain has nowhere to store executionBindings yet (see
  // LocalBindingsReleaseProvider); this fills them in from a local trusted
  // file, matching LocalDemoKeyProvider's own local-trust boundary below.
  const releaseProvider = new LocalBindingsReleaseProvider({
    inner: suiVerifier,
    bindingsPath: env.LOCAL_EXECUTION_BINDINGS_PATH,
  });
  const blobStore = new WalrusBlobStore({
    baseUrl: env.WALRUS_AGGREGATOR_URL,
    timeoutMs: env.WALRUS_READ_TIMEOUT_MS,
    maxResponseBytes: env.WALRUS_MAX_BLOB_BYTES,
  });
  const keyProvider = new LocalDemoKeyProvider({
    keyringPath: env.LOCAL_KEYRING_PATH,
  });
  // Prefer the enclave-attested identity key (shared with the sibling Rust
  // process's /get_attestation) over a bare EXECUTOR_PRIVATE_KEY — the
  // schema guarantees exactly one of these is configured. Using the
  // attested key is what lets a signature be tied back to a specific,
  // verified enclave measurement instead of an arbitrary key nobody vouched
  // for.
  let receiptSigner: Ed25519ReceiptSigner;
  if (env.ENCLAVE_IDENTITY_KEY_PATH !== undefined) {
    const identityKey = await loadEnclaveIdentityKey({
      path: env.ENCLAVE_IDENTITY_KEY_PATH,
    });
    receiptSigner = new Ed25519ReceiptSigner(identityKey);
  } else if (env.EXECUTOR_PRIVATE_KEY !== undefined) {
    receiptSigner = new Ed25519ReceiptSigner(env.EXECUTOR_PRIVATE_KEY);
  } else {
    // Unreachable: phase4EnvSchema's refine requires exactly one of these.
    throw new Error("No executor signing key configured");
  }
  const rssLoader = new HttpRssFeedLoader();
  const executionService = new ExecutionService({
    challenges,
    walletVerifier: new SuiPersonalMessageVerifier(suiClient),
    licenseVerifier: suiVerifier,
    releaseProvider,
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
  const runtime = await createExecutorRuntime(environment);
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
