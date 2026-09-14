/**
 * Signals that a session was just minted by a magic-link verification,
 * seconds ago — the one case where AccountContext/PartnerContext's
 * "authenticated but no matching row" lookup should retry with a
 * refreshed token before concluding the visitor isn't a member/partner
 * (see those files' docblocks for the JWT-kid flake this covers).
 *
 * Without this signal, that retry-with-refresh dance has no way to tell
 * "just signed in, might still be flaky" apart from "an ordinary
 * pre-existing session that happens not to belong to a member/partner" —
 * onAuthStateChange fires the same 'INITIAL_SESSION' event either way,
 * since the actual sign-in event already fired (and its listener already
 * unmounted) on the /auth/confirm page before router.replace() navigated
 * here. Every such ordinary visit was paying the same 3-attempt,
 * up-to-two-refreshSession-calls cost as a genuine fresh sign-in.
 *
 * sessionStorage (not a module-level flag) because it must survive the
 * client-side navigation from /auth/confirm to the destination page, and
 * must NOT survive a new tab or a later visit.
 */

const KEY = "pp:fresh-signin";
const FRESH_WINDOW_MS = 15_000;

export function markFreshSignIn(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private browsing, etc.) — the retry dance just
    // won't fire; a genuine flake becomes a rarer "not signed in" report
    // instead of a crash.
  }
}

/** Reads and clears the signal — a one-time check, not a standing flag. */
export function consumeFreshSignIn(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw !== null && Date.now() - Number(raw) < FRESH_WINDOW_MS;
  } catch {
    return false;
  }
}
