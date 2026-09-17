import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";

import type { Workflow } from "../stores/workflow-store";
import { useWorkflowStore } from "../stores/workflow-store";
import { webConfig } from "./config";
import {
  buildRegisterWorkflowTransaction,
  findOwnedAgentProfile,
} from "./registration";
import {
  listRegisteredReleases,
  rememberRegisteredRelease,
} from "./registered-releases";
import { loadRelease, loadRoot } from "./sui-objects";
import { findCreatedObjects, requireCreated } from "./tx-effects";

export type RegisterStatus =
  | "idle"
  | "publishing"
  | "confirming"
  | "success"
  | "error";

const STEP_LABEL: Partial<Record<RegisterStatus, string>> = {
  publishing: "워크플로를 등록하는 중… (지갑 서명)",
  confirming: "체인에서 등록이 확정되기를 기다리는 중…",
};

function messageFor(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const message = raw.toLowerCase();
  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return "지갑에서 서명을 취소했습니다.";
  }
  if (message.includes("insufficient") || message.includes("balance") || message.includes("gas")) {
    return "테스트넷 SUI 잔액이 부족합니다. faucet으로 충전한 뒤 다시 시도해 주세요.";
  }
  return raw;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Chain-backed listings this wallet published, newest first. */
export function useRegisteredWorkflows(): {
  workflows: Workflow[];
  loading: boolean;
  refresh: () => void;
} {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const upsertWorkflows = useWorkflowStore((s) => s.upsertWorkflows);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (account === null || webConfig.mode !== "live") {
      setWorkflows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const packageId = webConfig.packageId;
    const owner = account.address;

    void (async () => {
      try {
        // The ids come from this browser, everything shown comes from chain:
        // a release that no longer reads back simply drops out of the list.
        const entries = listRegisteredReleases(owner);
        const loaded = await Promise.all(
          entries.map(async (entry) => {
            try {
              const [release, root] = await Promise.all([
                loadRelease({ client, packageId, releaseId: entry.releaseId }),
                loadRoot({ client, packageId, rootId: entry.rootId }),
              ]);
              return release.rootId === root.id ? { release, root } : undefined;
            } catch {
              return undefined;
            }
          }),
        );

        if (cancelled) return;
        const mapped: Workflow[] = loaded
          .filter((value): value is NonNullable<typeof value> => value !== undefined)
          .map(({ release, root }) => ({
            id: release.id,
            name: root.name,
            priceMist: Number(release.priceLicense),
            users: 0,
            likes: 0,
            creator: shortAddress(owner),
            lastUpdate: "방금 등록",
            description: root.description,
            category: "featured" as const,
            icon: "🆕",
            accent: "from-mint/70 to-lime/60",
            // No bundle behind a browser registration, so it cannot be executed.
            onChainOnly: true,
          }));

        setWorkflows(mapped.reverse());
        // Mirror into the catalog so detail pages can resolve these ids.
        upsertWorkflows(mapped);
      } catch {
        if (!cancelled) setWorkflows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, client, nonce, upsertWorkflows]);

  return { workflows, loading, refresh };
}

export function useRegisterWorkflow() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const dAppKit = useDAppKit();

  const [status, setStatus] = useState<RegisterStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [rehearsing, setRehearsing] = useState(false);

  const reset = () => {
    setStatus("idle");
    setError(undefined);
    setRehearsing(false);
  };

  const rehearse = async () => {
    setError(undefined);
    setRehearsing(true);
    setStatus("publishing");
    await new Promise((resolve) => window.setTimeout(resolve, 1400));
    setStatus("confirming");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    setStatus("success");
  };

  const register = async (input: {
    title: string;
    description: string;
    priceMist: bigint;
  }) => {
    if (account === null || network !== "testnet" || webConfig.mode !== "live") {
      setError("지갑 연결과 온체인 정보가 준비되지 않았습니다.");
      setStatus("error");
      return;
    }
    setError(undefined);
    setRehearsing(false);

    const packageId = webConfig.packageId;
    const owner = account.address;

    try {
      // An AgentProfile is the creator identity every root hangs off. Reusing
      // the existing one keeps a wallet's listings under a single identity
      // instead of minting a throwaway profile per registration.
      const agentProfileId = await findOwnedAgentProfile({ client, packageId, owner });

      setStatus("publishing");
      const published = await dAppKit.signAndExecuteTransaction({
        transaction: buildRegisterWorkflowTransaction({
          packageId,
          sender: owner,
          agentProfileId,
          creatorName: shortAddress(owner),
          title: input.title,
          description: input.description,
          priceMist: input.priceMist,
        }),
        account,
        network: "testnet",
      });
      if (published.$kind !== "Transaction") throw new Error("등록 거래가 완료되지 않았습니다.");

      setStatus("confirming");
      const created = await findCreatedObjects({
        client,
        digest: published.Transaction.digest,
      });
      const rootId = requireCreated(created, `${packageId}::agent::WorkflowRoot`);
      const releaseId = requireCreated(created, `${packageId}::agent::WorkflowRelease`);
      rememberRegisteredRelease(owner, { rootId, releaseId });

      setStatus("success");
    } catch (cause) {
      setError(messageFor(cause));
      setStatus("error");
    }
  };

  return {
    status,
    stepLabel: STEP_LABEL[status],
    busy: status === "publishing" || status === "confirming",
    error,
    rehearsing,
    register,
    rehearse,
    reset,
  };
}
