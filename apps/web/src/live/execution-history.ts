import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { ExecutionResponse } from "./executor-client";
import { executionResponseSchema } from "./executor-client";

const STORAGE_KEY = "flowmarket.execution-history.v1";
const MAX_PER_OWNER = 10;

export interface ExecutionHistoryEntry {
  executedAtMs: number;
  response: ExecutionResponse;
}

/**
 * Past runs, kept per wallet in this browser.
 *
 * Re-running costs gas and a wallet signature, so leaving the page should not
 * throw away a result the user already paid for. Only what the executor
 * returned is stored, and it is re-validated on read: a tampered or outdated
 * entry is dropped rather than shown.
 */
type Stored = Record<string, ExecutionHistoryEntry[]>;

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Stored;
  } catch {
    return {};
  }
}

function write(value: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota or private mode: the run already happened and is on screen, so
    // failing to remember it is not worth interrupting anything for.
  }
}

export function listExecutionHistory(owner: string): ExecutionHistoryEntry[] {
  const entries = read()[normalizeSuiAddress(owner)];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as ExecutionHistoryEntry).executedAtMs !== "number"
    ) {
      return [];
    }
    const parsed = executionResponseSchema.safeParse(
      (entry as ExecutionHistoryEntry).response,
    );
    return parsed.success
      ? [{ executedAtMs: (entry as ExecutionHistoryEntry).executedAtMs, response: parsed.data }]
      : [];
  });
}

/** Newest first, one entry per execution, oldest dropped past the cap. */
export function rememberExecution(owner: string, response: ExecutionResponse): void {
  const key = normalizeSuiAddress(owner);
  const stored = read();
  const existing = listExecutionHistory(key).filter(
    (entry) => entry.response.executionId !== response.executionId,
  );
  const next = [{ executedAtMs: Date.now(), response }, ...existing].slice(0, MAX_PER_OWNER);
  write({ ...stored, [key]: next });
}

/** Drops one stored run. Used by the list's delete control. */
export function forgetExecution(owner: string, executionId: string): void {
  const key = normalizeSuiAddress(owner);
  const stored = read();
  write({
    ...stored,
    [key]: listExecutionHistory(key).filter(
      (entry) => entry.response.executionId !== executionId,
    ),
  });
}
