import { useEffect } from "react";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { create } from "zustand";

import { useWorkflowStore } from "../stores/workflow-store";
import { webConfig } from "./config";
import type { LiveMarketplace, LiveRelease, LiveRoot } from "./sui-objects";
import { loadMarketplace, loadRelease, loadRoot } from "./sui-objects";

/** Catalog entry backed by the deployed WorkflowRelease. */
export const LIVE_WORKFLOW_ID = "google-news-rss";

type LiveStatus = "disabled" | "loading" | "ready" | "error";

type LoadedInput = {
  release: LiveRelease;
  root: LiveRoot;
  marketplace: LiveMarketplace;
};

type LiveReleaseState = {
  status: LiveStatus;
  release: LiveRelease | undefined;
  root: LiveRoot | undefined;
  marketplace: LiveMarketplace | undefined;
  error: string | undefined;
  loaded: (input: LoadedInput) => void;
  failed: (error: string) => void;
};

export const useLiveReleaseStore = create<LiveReleaseState>((set) => ({
  status: webConfig.mode === "live" ? "loading" : "disabled",
  release: undefined,
  root: undefined,
  marketplace: undefined,
  error: undefined,
  loaded: ({ release, root, marketplace }) =>
    set({ status: "ready", release, root, marketplace, error: undefined }),
  failed: (error: string) => set({ status: "error", error }),
}));

/**
 * Pulls the deployed WorkflowRelease once and keeps the catalog entry in step
 * with it. Only the price is copied over — the curated name, blurb and artwork
 * stay as authored, since the on-chain root carries a bare English title that
 * reads worse in the catalog than the copy written for it.
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
        const [release, root, marketplace] = await Promise.all([
          loadRelease({ client, packageId, releaseId: webConfig.releaseId }),
          loadRoot({ client, packageId, rootId: webConfig.rootId }),
          loadMarketplace({ client, packageId, marketplaceId: webConfig.marketplaceId }),
        ]);
        if (cancelled) return;
        if (release.rootId !== root.id) {
          throw new Error("Configured release does not belong to the configured root");
        }
        loaded({ release, root, marketplace });
        updateWorkflow(LIVE_WORKFLOW_ID, { priceMist: Number(release.priceLicense) });
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
