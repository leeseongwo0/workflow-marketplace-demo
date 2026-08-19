import { describe, expect, it } from "vitest";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import {
  canonicalJson,
  canonicalJsonBytes,
  encodeReceiptMessageBcs,
} from "@aiwf/shared";

import {
  EXECUTION_CHALLENGE_DOMAIN,
  InMemoryChallengeStore,
} from "../src/execution/challenge.js";
import { Ed25519ReceiptSigner } from "../src/receipt/ed25519-receipt-signer.js";
import { SuiPersonalMessageVerifier } from "../src/wallet/sui-personal-message-verifier.js";
import { sha256Hex } from "../src/crypto/hash.js";

const FIXED_NOW_MS = Date.parse("2026-08-17T09:00:00.000Z");
const CHALLENGE_ID = "11111111-1111-4111-8111-111111111111";
const CHALLENGE_NONCE = Uint8Array.from(
  { length: 32 },
  (_value, index) => index + 1,
);
const WALLET_SEED = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0x10 + index,
);
const OTHER_WALLET_SEED = Uint8Array.from(
  { length: 32 },
  (_value, index) => 0x80 + index,
);

function mutableClock(initialMs = FIXED_NOW_MS): {
  now(): Date;
  set(value: number): void;
} {
  let currentMs = initialMs;
  return {
    now: () => new Date(currentMs),
    set: (value) => {
      currentMs = value;
    },
  };
}

function deterministicRandom() {
  return {
    uuid: () => CHALLENGE_ID,
    bytes: (length: number) => {
      if (length !== CHALLENGE_NONCE.length) {
        throw new Error(`unexpected random length ${length}`);
      }
      return CHALLENGE_NONCE.slice();
    },
  };
}

function challengeStore(clock = mutableClock(), ttlMs = 300_000) {
  return {
    clock,
    store: new InMemoryChallengeStore({
      clock,
      ttlMs,
      random: deterministicRandom(),
    }),
  };
}

function issueChallenge(
  store: InMemoryChallengeStore,
  runnerAddress = "0x1",
  query = "  Sui   blockchain  ",
) {
  return store.issue({
    runnerAddress,
    releaseId: "0x2",
    licenseId: "0x3",
    query,
  });
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("deterministic execution challenges", () => {
  it("uses a frozen clock, normalizes addresses/query, and emits canonical challenge bytes", () => {
    const { store } = challengeStore();
    const challenge = issueChallenge(store);

    expect(challenge.payload).toMatchObject({
      domain: EXECUTION_CHALLENGE_DOMAIN,
      challengeId: CHALLENGE_ID,
      runnerAddress: `0x${"0".repeat(63)}1`,
      releaseId: `0x${"0".repeat(63)}2`,
      licenseId: `0x${"0".repeat(63)}3`,
      issuedAtMs: FIXED_NOW_MS,
      expiresAtMs: FIXED_NOW_MS + 300_000,
    });
    expect(challenge.normalizedQuery).toBe("Sui blockchain");
    expect(challenge.payload.inputHash).toBe(
      sha256Hex(canonicalJsonBytes({ query: "Sui blockchain" })),
    );
    expect(challenge.message).toEqual(canonicalJsonBytes(challenge.payload));
    expect(new TextDecoder().decode(challenge.message)).toBe(
      canonicalJson(challenge.payload),
    );
    expect(new Uint8Array(Buffer.from(challenge.payload.nonce, "base64"))).toEqual(
      CHALLENGE_NONCE,
    );
  });

  it("expires exactly at the boundary and remains usable one millisecond before it", () => {
    const clock = mutableClock();
    const store = new InMemoryChallengeStore({
      clock,
      ttlMs: 100,
      random: deterministicRandom(),
    });
    issueChallenge(store);

    clock.set(FIXED_NOW_MS + 99);
    expect(store.load(CHALLENGE_ID).payload.expiresAtMs).toBe(
      FIXED_NOW_MS + 100,
    );
    clock.set(FIXED_NOW_MS + 100);
    expectCode(() => store.load(CHALLENGE_ID), "CHALLENGE_EXPIRED");
  });

  it("rejects unknown and consumed challenge IDs", () => {
    const { store } = challengeStore();
    issueChallenge(store);

    expectCode(() => store.load("22222222-2222-4222-8222-222222222222"), "CHALLENGE_NOT_FOUND");
    expect(store.consumeAfterVerification(CHALLENGE_ID).payload.challengeId).toBe(
      CHALLENGE_ID,
    );
    expectCode(() => store.load(CHALLENGE_ID), "CHALLENGE_ALREADY_USED");
    expectCode(
      () => store.consumeAfterVerification(CHALLENGE_ID),
      "CHALLENGE_ALREADY_USED",
    );
  });

  const invalidCases: Array<readonly [
    string,
    {
      runnerAddress?: string;
      releaseId?: string;
      licenseId?: string;
      query?: string;
    },
    string,
  ]> = [
    ["too-short query", { query: "x" }, "INVALID_QUERY"],
    ["reserved when operator", { query: "Sui when:1d" }, "INVALID_QUERY_OPERATOR"],
    ["malformed runner address", { runnerAddress: "not-an-address" }, "INVALID_REQUEST"],
    ["malformed release address", { releaseId: "not-an-address" }, "INVALID_REQUEST"],
    ["malformed license address", { licenseId: "not-an-address" }, "INVALID_REQUEST"],
  ];

  it.each(invalidCases)("rejects %s", (_label, input, code) => {
    const { store } = challengeStore();
    expectCode(
      () =>
        store.issue({
          runnerAddress: input.runnerAddress ?? "0x1",
          releaseId: input.releaseId ?? "0x2",
          licenseId: input.licenseId ?? "0x3",
          query: input.query ?? "Sui blockchain",
        }),
      code,
    );
  });

  it("allows only one concurrent consumer to pass the consume point", async () => {
    const { store } = challengeStore();
    issueChallenge(store);
    const results = await Promise.allSettled([
      Promise.resolve().then(() => store.consumeAfterVerification(CHALLENGE_ID)),
      Promise.resolve().then(() => store.consumeAfterVerification(CHALLENGE_ID)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : undefined).toMatchObject({
      code: "CHALLENGE_ALREADY_USED",
    });
  });
});

describe("Sui personal-message verification", () => {
  const wallet = Ed25519Keypair.fromSecretKey(WALLET_SEED);
  const otherWallet = Ed25519Keypair.fromSecretKey(OTHER_WALLET_SEED);

  it("accepts a real Sui Ed25519 personal-message signature", async () => {
    const { store } = challengeStore();
    const challenge = issueChallenge(store, wallet.toSuiAddress());
    const signature = (await wallet.signPersonalMessage(challenge.message)).signature;
    const verifier = new SuiPersonalMessageVerifier();

    await expect(
      verifier.verify({
        message: challenge.message,
        signature,
        expectedAddress: wallet.toSuiAddress(),
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a signature from the wrong wallet and a modified challenge message", async () => {
    const { store } = challengeStore();
    const challenge = issueChallenge(store, wallet.toSuiAddress());
    const signature = (await wallet.signPersonalMessage(challenge.message)).signature;
    const verifier = new SuiPersonalMessageVerifier();
    const modifiedMessage = challenge.message.slice();
    modifiedMessage[0] = (modifiedMessage[0] ?? 0) ^ 1;

    await expect(
      verifier.verify({
        message: challenge.message,
        signature,
        expectedAddress: otherWallet.toSuiAddress(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_SIGNATURE" });
    await expect(
      verifier.verify({
        message: modifiedMessage,
        signature,
        expectedAddress: wallet.toSuiAddress(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_SIGNATURE" });
  });

  it("rejects malformed signatures without consuming the challenge", async () => {
    const { store } = challengeStore();
    issueChallenge(store, wallet.toSuiAddress());
    const verifier = new SuiPersonalMessageVerifier();

    await expect(
      verifier.verify({
        message: store.load(CHALLENGE_ID).message,
        signature: "not-a-serialized-sui-signature",
        expectedAddress: wallet.toSuiAddress(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_SIGNATURE" });
    expect(store.load(CHALLENGE_ID).payload.challengeId).toBe(CHALLENGE_ID);
  });
});

describe("Ed25519 receipt signer", () => {
  const message = encodeReceiptMessageBcs({
    releaseId: `0x${"1".repeat(64)}`,
    licenseId: `0x${"2".repeat(64)}`,
    runner: `0x${"3".repeat(64)}`,
    inputHash: new Uint8Array(32).fill(0x04),
    outputHash: new Uint8Array(32).fill(0x05),
    executedAtMs: 1723900000000n,
    nonceHash: new Uint8Array(32).fill(0x06),
  });

  it("signs raw BCS bytes and verifies with the returned raw public key", async () => {
    const signer = new Ed25519ReceiptSigner(WALLET_SEED);
    const signature = await signer.sign(message);
    const publicKey = signer.publicKey();
    const verifier = new Ed25519PublicKey(publicKey);

    expect(publicKey).toHaveLength(32);
    expect(signature).toHaveLength(64);
    await expect(verifier.verify(message, signature)).resolves.toBe(true);
    const tampered = message.slice();
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    await expect(verifier.verify(tampered, signature)).resolves.toBe(false);
  });

  it("maps malformed executor key material to a typed, secret-safe error", () => {
    let caught: unknown;
    try {
      new Ed25519ReceiptSigner(new Uint8Array(31));
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ code: "RECEIPT_SIGN_FAILED" });
    expect(caught instanceof Error ? caught.message : String(caught)).not.toContain(
      Buffer.from(WALLET_SEED).toString("base64"),
    );
  });
});
