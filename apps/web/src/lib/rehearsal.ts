const STORAGE_KEY = "fm.rehearsal";

/**
 * Rehearsal is hidden behind `?rehearsal=1` rather than a build flag, so the
 * demo build does not have to be rebuilt to turn it off before a presentation.
 * Someone opening the plain link never sees it.
 *
 * The flag sticks for the browser session once seen, so navigating around the
 * app does not drop it; `?rehearsal=0` clears it.
 */
export function isRehearsalEnabled(search: string): boolean {
  const param = new URLSearchParams(search).get("rehearsal");
  try {
    if (param === "1") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (param === "0") {
      sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data throw on access; fall back to the
    // URL alone rather than losing the feature entirely.
    return param === "1";
  }
}
