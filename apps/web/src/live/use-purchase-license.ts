import { useState } from "react";
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";

import { useWorkflowStore } from "../stores/workflow-store";
import { webConfig } from "./config";
import { LIVE_WORKFLOW_ID, useLiveReleaseStore } from "./live-release";
import { findOwnedLicense } from "./sui-objects";
import { buildPurchaseLicenseTransaction } from "./transactions";

/**
 * "confirming" is separate from "signing" on purpose: the wallet returning a
 * signature does not mean the license exists. Nothing is reported as purchased
 * until the LicensePass is actually readable from chain.
 */
export type PurchaseStatus =
  | "idle"
  | "signing"
  | "confirming"
  | "success"
  | "error";

export type PurchaseFailure =
  | "rejected"
  | "insufficient_funds"
  | "already_owned"
  | "wrong_network"
  | "not_ready"
  | "unknown";

const FAILURE_MESSAGES: Record<PurchaseFailure, string> = {
  rejected: "지갑에서 서명을 취소했습니다.",
  insufficient_funds: "테스트넷 SUI 잔액이 부족합니다. faucet으로 충전한 뒤 다시 시도해 주세요.",
  already_owned: "이미 이 워크플로의 라이선스를 보유하고 있습니다.",
  wrong_network: "지갑이 testnet에 연결되어 있지 않습니다.",
  not_ready: "온체인 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  unknown: "구매를 완료하지 못했습니다.",
};

function classify(cause: unknown): PurchaseFailure {
  const message = (cause instanceof Error ? cause.message : String(cause)).toLowerCase();
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return "rejected";
  }
  if (message.includes("insufficient") || message.includes("balance") || message.includes("gas")) {
    return "insufficient_funds";
  }
  if (message.includes("already")) return "already_owned";
  return "unknown";
}

async function findLicenseWithRetry(input: Parameters<typeof findOwnedLicense>[0]) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const license = await findOwnedLicense(input);
    if (license !== undefined) return license;
    if (attempt < 3) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 750));
    }
  }
  return undefined;
}

/**
 * `allowRepurchase` is wired to rehearsal mode, not left on by default.
 *
 * The deployed contract keeps no buyer registry, so it happily sells a second
 * LicensePass to an address that already holds one — the "already owned" stop
 * below is this app's, to keep someone from paying twice by accident. During
 * rehearsal that stop is what prevents practising the real purchase, so it is
 * lifted there and nowhere else.
 */
export function usePurchaseLicense(options?: { allowRepurchase?: boolean }) {
  const allowRepurchase = options?.allowRepurchase ?? false;
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const dAppKit = useDAppKit();
  const release = useLiveReleaseStore((s) => s.release);
  const purchaseWorkflow = useWorkflowStore((s) => s.purchaseWorkflow);

  const [status, setStatus] = useState<PurchaseStatus>("idle");
  const [failure, setFailure] = useState<PurchaseFailure | undefined>(undefined);
  const [digest, setDigest] = useState<string | undefined>(undefined);
  const [rehearsing, setRehearsing] = useState(false);

  const reset = () => {
    setStatus("idle");
    setFailure(undefined);
    setDigest(undefined);
    setRehearsing(false);
  };

  /**
   * Replays the purchase screens without touching the chain, so the flow can be
   * practised repeatedly. The deployed contract refuses a second purchase from
   * an address that already holds a license and has no refund entry point, so
   * rehearsing the real thing would otherwise mean a fresh wallet every run.
   *
   * Reached only when the caller opts in — see lib/rehearsal.
   */
  const rehearse = async () => {
    setFailure(undefined);
    setDigest(undefined);
    setRehearsing(true);
    setStatus("signing");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    setStatus("confirming");
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    setStatus("success");
  };

  const fail = (reason: PurchaseFailure) => {
    setFailure(reason);
    setStatus("error");
  };

  const purchase = async () => {
    if (account === null || webConfig.mode !== "live" || release === undefined) {
      fail("not_ready");
      return;
    }
    if (network !== "testnet") {
      fail("wrong_network");
      return;
    }

    setFailure(undefined);
    setDigest(undefined);
    setRehearsing(false);

    try {
      const owner = account.address;
      if (!allowRepurchase) {
        const alreadyOwned = await findOwnedLicense({
          client,
          packageId: webConfig.packageId,
          owner,
          releaseId: release.id,
        });
        if (alreadyOwned !== undefined) {
          fail("already_owned");
          return;
        }
      }

      setStatus("signing");
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildPurchaseLicenseTransaction({
          packageId: webConfig.packageId,
          marketplaceConfigId: webConfig.marketplaceId,
          releaseId: release.id,
          vaultId: webConfig.vaultId,
          priceMist: release.priceLicense,
        }),
        account,
        network: "testnet",
      });
      if (result.$kind !== "Transaction") {
        fail("unknown");
        return;
      }

      setStatus("confirming");
      setDigest(result.Transaction.digest);
      const license = await findLicenseWithRetry({
        client,
        packageId: webConfig.packageId,
        owner,
        releaseId: release.id,
      });
      if (license === undefined) {
        // The transaction landed but the object is not readable yet; treating
        // this as success would show a license the user cannot use.
        fail("not_ready");
        return;
      }

      purchaseWorkflow(LIVE_WORKFLOW_ID);
      setStatus("success");
    } catch (cause) {
      fail(classify(cause));
    }
  };

  return {
    status,
    digest,
    rehearsing,
    failureMessage: failure === undefined ? undefined : FAILURE_MESSAGES[failure],
    failure,
    purchase,
    rehearse,
    reset,
  };
}
