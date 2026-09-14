import { describe, expect, it } from "vitest";

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { SuiSealSessionAuthority } from "../src/execution/seal-session-authority.js";

const PACKAGE_ID = `0x${"1".repeat(64)}`;
const CHALLENGE_ID = "33333333-3333-4333-8333-333333333333";

const fakeSuiClient = {
  core: {
    getObject: async () => ({ object: { version: "1" } }),
  },
} as never;

describe("SuiSealSessionAuthority", () => {
  it("completes a session signed by the address it was started for", async () => {
    const wallet = Ed25519Keypair.generate();
    const authority = new SuiSealSessionAuthority({
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });

    const personalMessage = await authority.begin({
      challengeId: CHALLENGE_ID,
      runnerAddress: wallet.toSuiAddress(),
    });
    const { signature } = await wallet.signPersonalMessage(personalMessage);

    const sessionKey = await authority.complete({
      challengeId: CHALLENGE_ID,
      signature,
    });

    expect(sessionKey.getAddress()).toBe(wallet.toSuiAddress());
    expect(sessionKey.isExpired()).toBe(false);
  });

  it("rejects completion with a signature from a different address", async () => {
    const runner = Ed25519Keypair.generate();
    const impostor = Ed25519Keypair.generate();
    const authority = new SuiSealSessionAuthority({
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });

    const personalMessage = await authority.begin({
      challengeId: CHALLENGE_ID,
      runnerAddress: runner.toSuiAddress(),
    });
    const { signature } = await impostor.signPersonalMessage(personalMessage);

    await expect(
      authority.complete({ challengeId: CHALLENGE_ID, signature }),
    ).rejects.toMatchObject({ code: "INVALID_WALLET_SIGNATURE" });
  });

  it("rejects completing a session that was never started", async () => {
    const authority = new SuiSealSessionAuthority({
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });

    await expect(
      authority.complete({ challengeId: "unknown", signature: "anything" }),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
  });

  it("rejects completing the same challenge twice", async () => {
    const wallet = Ed25519Keypair.generate();
    const authority = new SuiSealSessionAuthority({
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });

    const personalMessage = await authority.begin({
      challengeId: CHALLENGE_ID,
      runnerAddress: wallet.toSuiAddress(),
    });
    const { signature } = await wallet.signPersonalMessage(personalMessage);

    await authority.complete({ challengeId: CHALLENGE_ID, signature });

    await expect(
      authority.complete({ challengeId: CHALLENGE_ID, signature }),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
  });
});
