import { useEffect, useState } from "react";
import { useCurrentClient } from "@mysten/dapp-kit-react";

import { webConfig } from "./config";
import { loadRelease, loadRoot, type LiveRelease, type LiveRoot } from "./sui-objects";

export interface OnChainWorkflow {
  release: LiveRelease;
  root: LiveRoot;
}

export type OnChainWorkflowStatus = "idle" | "loading" | "found" | "missing";

/**
 * Reads a WorkflowRelease (and the root it hangs off) straight from chain.
 *
 * The catalog in workflow-store only knows the hand-written demo entries, so a
 * workflow registered through the UI — whose id is its on-chain release object
 * id — is absent from it and the detail page would otherwise just say
 * "Workflow not found". Everything here comes from chain, so a bad or deleted
 * id resolves to "missing" rather than to stale local data.
 */
export function useOnChainWorkflow(releaseId: string | undefined): {
  status: OnChainWorkflowStatus;
  workflow: OnChainWorkflow | undefined;
} {
  const client = useCurrentClient();
  const [status, setStatus] = useState<OnChainWorkflowStatus>("idle");
  const [workflow, setWorkflow] = useState<OnChainWorkflow | undefined>(undefined);

  useEffect(() => {
    const looksLikeObjectId =
      releaseId !== undefined && /^0x[0-9a-fA-F]{1,64}$/u.test(releaseId);
    if (!looksLikeObjectId || webConfig.mode !== "live") {
      setStatus("idle");
      setWorkflow(undefined);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    const packageId = webConfig.packageId;

    void (async () => {
      try {
        const release = await loadRelease({ client, packageId, releaseId });
        const root = await loadRoot({ client, packageId, rootId: release.rootId });
        if (cancelled) return;
        setWorkflow({ release, root });
        setStatus("found");
      } catch {
        if (cancelled) return;
        setWorkflow(undefined);
        setStatus("missing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, releaseId]);

  return { status, workflow };
}
