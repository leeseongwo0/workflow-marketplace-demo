import { useCurrentAccount } from "@mysten/dapp-kit-react";

import { listRegisteredReleases } from "./registered-releases";

export interface SellerPanel {
  /** Chain-read values are used where they exist; otherwise these stand in. */
  sample: boolean;
  earnedSui: string;
  executionCount: number;
  lastExecutedLabel: string;
  licenceTerms: string;
}

/*
 * A workflow registered through this app has no sales and no runs yet, so its
 * real numbers are all zero and show nothing about what the screen is for.
 * These stand-ins exist to make the layout legible, and the panel labels itself
 * as sample data so nobody reads them as earnings.
 */
const SAMPLE: Omit<SellerPanel, "sample"> = {
  earnedSui: "0.882 SUI",
  executionCount: 6,
  lastExecutedLabel: "2시간 전",
  licenceTerms: "실행 무제한 · 만료 없음",
};

/**
 * The seller panel for a workflow, or undefined when the viewer is not its
 * seller.
 *
 * Ownership comes from the registrations this browser made with the connected
 * wallet, so the panel only ever appears on a workflow the viewer registered
 * themselves. Someone else's listing never shows it.
 */
export function useSellerPanel(workflowId: string | undefined): SellerPanel | undefined {
  const account = useCurrentAccount();
  if (account === null || workflowId === undefined) return undefined;

  const registered = listRegisteredReleases(account.address).some(
    (entry) => entry.releaseId === workflowId,
  );
  if (!registered) return undefined;

  return { sample: true, ...SAMPLE };
}
