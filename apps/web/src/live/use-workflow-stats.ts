import { useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { normalizeSuiAddress } from "@mysten/sui/utils";

import { webConfig } from "./config";
import { useLiveReleaseStore } from "./live-release";
import type { ExecutionStats } from "./sui-objects";
import { loadExecutionStats, loadVault } from "./sui-objects";

export interface WorkflowStats {
  executions: ExecutionStats;
  earnedMist: bigint;
  unlimitedRuns: boolean;
  neverExpires: boolean;
}

/**
 * On-chain activity for the deployed release, for the seller only.
 *
 * Ownership is decided by the payout vault: whoever it pays out to is the one
 * who registered the workflow. Returning undefined for everyone else means the
 * panel never renders for a browsing buyer, so earnings cannot leak by a UI
 * mistake further up.
 */
export function useWorkflowStats(enabled: boolean): WorkflowStats | undefined {
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const release = useLiveReleaseStore((s) => s.release);
  const [stats, setStats] = useState<WorkflowStats | undefined>(undefined);

  useEffect(() => {
    if (
      !enabled ||
      webConfig.mode !== "live" ||
      release === undefined ||
      account === null
    ) {
      setStats(undefined);
      return;
    }

    let cancelled = false;
    const packageId = webConfig.packageId;
    const viewer = normalizeSuiAddress(account.address);

    void (async () => {
      try {
        const vault = await loadVault({
          client,
          packageId,
          vaultId: webConfig.vaultId,
        });
        if (cancelled) return;
        if (vault.owner !== viewer) {
          setStats(undefined);
          return;
        }
        const executions = await loadExecutionStats({
          client,
          packageId,
          releaseId: release.id,
        });
        if (cancelled) return;
        setStats({
          executions,
          earnedMist: vault.balanceMist,
          unlimitedRuns: release.maxRuns === undefined,
          neverExpires: release.maxDurationMs === undefined,
        });
      } catch {
        if (!cancelled) setStats(undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, client, account, release]);

  return stats;
}
