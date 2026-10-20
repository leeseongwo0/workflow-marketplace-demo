import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";

import { webConfig } from "./config";
import { LIVE_WORKFLOW_ID, useLiveReleaseStore } from "./live-release";
import { findOwnedLicense } from "./sui-objects";

/**
 * Which catalog entries the connected wallet actually holds a license for.
 *
 * The chain is the source of truth here rather than local state: a purchase
 * that did not land, or a different wallet, has to show up as "not owned".
 * Only google-news-rss exists on chain, so that is the only id this can return.
 */
export function useOwnedWorkflowIds(): {
  ids: string[];
  loading: boolean;
  refresh: () => void;
} {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const release = useLiveReleaseStore((s) => s.release);
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (account === null || webConfig.mode !== "live" || release === undefined) {
      setIds([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const packageId = webConfig.packageId;

    void (async () => {
      try {
        const license = await findOwnedLicense({
          client,
          packageId,
          owner: account.address,
          releaseId: release.id,
        });
        if (cancelled) return;
        setIds(license === undefined ? [] : [LIVE_WORKFLOW_ID]);
      } catch {
        if (!cancelled) setIds([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, client, release, nonce]);

  return { ids, loading, refresh };
}
