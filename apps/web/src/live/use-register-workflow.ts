import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";

import type { Workflow } from "../stores/workflow-store";
import { useWorkflowStore } from "../stores/workflow-store";
import { webConfig } from "./config";
import {
  buildCreateWorkflowRootTransaction,
  buildPublishReleaseTransaction,
  findOwnedRoots,
} from "./registration";
import { loadRelease } from "./sui-objects";

export type RegisterStatus =
  | "idle"
  | "creating_root"
  | "publishing"
  | "confirming"
  | "success"
  | "error";

const STEP_LABEL: Partial<Record<RegisterStatus, string>> = {
  creating_root: "워크플로 루트를 만드는 중… (지갑 서명 1/2)",
  publishing: "워크플로를 등록하는 중… (지갑 서명 2/2)",
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

    void (async () => {
      try {
        const roots = await findOwnedRoots({ client, packageId, owner: account.address });
        const releaseIds = roots
          .map((root) => root.latestReleaseId)
          .filter((id): id is string => id !== undefined);

        const releases = await Promise.all(
          releaseIds.map(async (releaseId) => {
            try {
              return await loadRelease({ client, packageId, releaseId });
            } catch {
              return undefined;
            }
          }),
        );

        if (cancelled) return;
        const mapped: Workflow[] = releases
          .filter((release): release is NonNullable<typeof release> => release !== undefined)
          .map((release) => ({
            id: release.id,
            name: release.title,
            priceMist: Number(release.priceMist),
            users: 0,
            likes: 0,
            creator: `${release.creator.slice(0, 6)}…${release.creator.slice(-4)}`,
            lastUpdate: "방금 등록",
            description: release.description,
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
    setStatus("creating_root");
    await new Promise((resolve) => window.setTimeout(resolve, 1100));
    setStatus("publishing");
    await new Promise((resolve) => window.setTimeout(resolve, 1300));
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

    try {
      // create_workflow_root transfers the new root to the sender rather than
      // returning it, so it cannot be chained into the publish call — the root
      // has to exist as an owned object first. An existing root is reused so
      // only the first registration costs two signatures.
      let roots = await findOwnedRoots({ client, packageId, owner: account.address });
      if (roots.length === 0) {
        setStatus("creating_root");
        const created = await dAppKit.signAndExecuteTransaction({
          transaction: await buildCreateWorkflowRootTransaction({
            packageId,
            name: input.title,
          }),
          account,
          network: "testnet",
        });
        if (created.$kind !== "Transaction") throw new Error("루트 생성 거래가 완료되지 않았습니다.");

        roots = [];
        for (let attempt = 0; attempt < 5 && roots.length === 0; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          roots = await findOwnedRoots({ client, packageId, owner: account.address });
        }
        if (roots.length === 0) throw new Error("생성된 루트를 아직 확인하지 못했습니다.");
      }

      const root = roots[roots.length - 1];
      if (root === undefined) throw new Error("생성된 루트를 아직 확인하지 못했습니다.");

      setStatus("publishing");
      const published = await dAppKit.signAndExecuteTransaction({
        transaction: await buildPublishReleaseTransaction({
          packageId,
          rootId: root.id,
          title: input.title,
          description: input.description,
          priceMist: input.priceMist,
          version: { major: 1, minor: 0, patch: 0 },
        }),
        account,
        network: "testnet",
      });
      if (published.$kind !== "Transaction") throw new Error("등록 거래가 완료되지 않았습니다.");

      setStatus("confirming");
      let confirmed = false;
      for (let attempt = 0; attempt < 5 && !confirmed; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        const after = await findOwnedRoots({ client, packageId, owner: account.address });
        confirmed = after.some((candidate) => candidate.latestReleaseId !== undefined);
      }
      if (!confirmed) throw new Error("등록된 워크플로를 아직 확인하지 못했습니다.");

      setStatus("success");
    } catch (cause) {
      setError(messageFor(cause));
      setStatus("error");
    }
  };

  return {
    status,
    stepLabel: STEP_LABEL[status],
    busy: status === "creating_root" || status === "publishing" || status === "confirming",
    error,
    rehearsing,
    register,
    rehearse,
    reset,
  };
}
