import { normalizeSuiAddress } from "@mysten/sui/utils";

const STORAGE_KEY = "flowmarket.registered-releases.v1";

/**
 * Remembers which releases this browser registered, keyed by the wallet that
 * paid for them.
 *
 * A WorkflowRelease is a shared object and the root no longer points at its
 * releases, so there is nothing on chain to list them back by owner. Only ids
 * are kept here — the listing itself is re-read from chain on every load, so a
 * stale or forged entry shows nothing rather than wrong data. Scoping by
 * address is what stops one wallet's listings from appearing under another.
 */
export interface RegisteredRelease {
  rootId: string;
  releaseId: string;
}

type Stored = Record<string, RegisteredRelease[]>;

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
    // Private mode or a full quota: registration still worked on chain, the
    // listing just will not survive a reload.
  }
}

function isEntry(value: unknown): value is RegisteredRelease {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RegisteredRelease).rootId === "string" &&
    typeof (value as RegisteredRelease).releaseId === "string"
  );
}

export function listRegisteredReleases(owner: string): RegisteredRelease[] {
  const entries = read()[normalizeSuiAddress(owner)];
  return Array.isArray(entries) ? entries.filter(isEntry) : [];
}

export function rememberRegisteredRelease(
  owner: string,
  entry: RegisteredRelease,
): void {
  const key = normalizeSuiAddress(owner);
  const stored = read();
  const existing = listRegisteredReleases(key);
  if (existing.some((candidate) => candidate.releaseId === entry.releaseId)) return;
  write({ ...stored, [key]: [...existing, entry] });
}
