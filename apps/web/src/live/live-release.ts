import { useEffect } from "react";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { create } from "zustand";

import { useWorkflowStore } from "../stores/workflow-store";
import { webConfig } from "./config";
import type { LiveMarketplace, LiveRelease } from "./sui-objects";
import { loadMarketplace, loadRelease } from "./sui-objects";

/** Catalog entry backed by the deployed WorkflowRelease. */
export const LIVE_WORKFLOW_ID = "google-news-rss";

type LiveStatus = "disabled" | "loading" | "ready" | "error";

type LiveReleaseState = {
  status: LiveStatus;
  release: LiveRelease | undefined;
  marketplace: LiveMarketplace | undefined;
  error: string | undefined;
  loaded: (input: { release: LiveRelease; marketplace: LiveMarketplace }) => void;
  failed: (error: string) => void;
};

export const useLiveReleaseStore = create<LiveReleaseState>((set) => ({
  status: webConfig.mode === "live" ? "loading" : "disabled",
  release: undefined,
  marketplace: undefined,
  error: undefined,
  loaded: ({ release, marketplace }) =>
    set({ status: "ready", release, marketplace, error: undefined }),
  failed: (error: string) => set({ status: "error", error }),
}));

/**
 * Pulls the deployed WorkflowRelease once and keeps the catalog entry in step
 * with it. Only the on-chain facts are copied over — the curated name, blurb
 * and artwork stay as authored, since the chain has no equivalent for them.
 *
 * A failure is not fatal: the catalog keeps its authored values so the
 * marketplace still renders, and the purchase path is what gets blocked.
 */
export function useLoadLiveRelease(): void {
  const client = useCurrentClient();
  const loaded = useLiveReleaseStore((s) => s.loaded);
  const failed = useLiveReleaseStore((s) => s.failed);
  const updateWorkflow = useWorkflowStore((s) => s.updateWorkflow);

  useEffect(() => {
    if (webConfig.mode !== "live") return;

    let cancelled = false;
    const packageId = webConfig.packageId;

    void (async () => {
      try {
        const [release, marketplace] = await Promise.all([
          loadRelease({ client, packageId, releaseId: webConfig.releaseId }),
          loadMarketplace({ client, packageId, marketplaceId: webConfig.marketplaceId }),
        ]);
        if (cancelled) return;
        loaded({ release, marketplace });
        updateWorkflow(LIVE_WORKFLOW_ID, { priceMist: Number(release.priceMist) });
      } catch (cause) {
        if (cancelled) return;
        failed(cause instanceof Error ? cause.message : "Failed to read on-chain release");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, loaded, failed, updateWorkflow]);
}
