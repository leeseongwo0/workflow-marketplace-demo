import { createHash } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const ENV_KEY = "EXECUTOR_PRIVATE_KEY";
const envPath = resolve(process.cwd(), "../../.env");

function publicResult(keypair: Ed25519Keypair): {
  executorPublicKeyBase64: string;
  executorKeyFingerprint: string;
  created: boolean;
} {
  const publicKey = keypair.getPublicKey().toRawBytes();
  return {
    executorPublicKeyBase64: Buffer.from(publicKey).toString("base64"),
    executorKeyFingerprint: createHash("sha256")
      .update(publicKey)
      .digest("hex")
      .slice(0, 16),
    created: false,
  };
}

async function main(): Promise<void> {
  let contents = "";
  try {
    contents = await readFile(envPath, "utf8");
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) {
      throw cause;
    }
  }

  const existing = contents.match(/^EXECUTOR_PRIVATE_KEY=(.+)$/mu)?.[1]?.trim();
  if (existing !== undefined && existing.length > 0) {
    const result = publicResult(Ed25519Keypair.fromSecretKey(existing));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const keypair = Ed25519Keypair.generate();
  const secret = keypair.getSecretKey();
  const line = `${ENV_KEY}=${secret}`;
  const nextContents = /^EXECUTOR_PRIVATE_KEY=.*$/mu.test(contents)
    ? contents.replace(/^EXECUTOR_PRIVATE_KEY=.*$/mu, line)
    : `${contents}${contents.length === 0 || contents.endsWith("\n") ? "" : "\n"}${line}\n`;
  const temporaryPath = `${envPath}.executor-key-${process.pid}`;
  await writeFile(temporaryPath, nextContents, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, envPath);
  await chmod(envPath, 0o600);

  const result = publicResult(keypair);
  process.stdout.write(`${JSON.stringify({ ...result, created: true })}\n`);
}

main().catch(() => {
  process.stderr.write("Executor key generation failed safely\n");
  process.exitCode = 1;
});
