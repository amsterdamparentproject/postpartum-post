/**
 * Auth helpers for Playwright tests.
 *
 * Magic link emails are never fetched from an inbox — instead we generate the
 * link directly via the Supabase admin API and navigate to it in the browser.
 * This keeps tests fast and self-contained while still exercising the full
 * browser-side auth flow (token exchange, session cookie, onAuthStateChange).
 */

import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars in .env.local");
  return createClient(url, key, { db: { schema: "postpartumpost" } });
}

/**
 * Spaces out real calls to admin.auth.admin.generateLink so a run with many
 * signInAs calls in quick succession (matching.spec.ts, partner-member-dual
 * -role.spec.ts, etc.) doesn't itself trip Supabase's "Request rate limit
 * reached" on that endpoint — same root cause, same fix, as
 * __tests__/helpers.ts's getAccessTokenForEmail on the unit-test side.
 * Playwright runs this file's specs sequentially (playwright.config.ts's
 * fullyParallel: false), so this module-level chain sees calls one at a
 * time in practice, but chaining onto one shared promise keeps it correct
 * even if that ever changes.
 */
const AUTH_CALL_GAP_MS = 600;
let authCallGate: Promise<number> = Promise.resolve(0);

function throttledAuthCall<T>(fn: () => Promise<T>): Promise<T> {
  const call = authCallGate.then(async (lastFinishedAt) => {
    const wait = lastFinishedAt + AUTH_CALL_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return fn();
  });
  // Record completion time regardless of outcome, so a failed call still
  // holds the next one's gap — an immediate retry after a 429 would just
  // trip it again.
  authCallGate = call.then(
    () => Date.now(),
    () => Date.now(),
  );
  return call;
}

/**
 * Generate a Supabase magic link for the given email.
 * Returns the action_link URL — navigate to it in Playwright to sign in.
 *
 * Retries on failure, for two distinct causes:
 *  - Diagnosed 2026-07-24: this project's admin.generateLink()
 *    intermittently fails with "unrecognized JWT kid <nil> for algorithm
 *    ES256" — a token with no `kid` header failing to match the project's
 *    single active ECC signing key. Not caused by an @example.com-domain
 *    email (Supabase's mail relay rejects that outright with a different,
 *    unambiguous SMTP error — test emails here already use a real
 *    gmail.com address, see e2e/helpers/db.ts) — this recurs even with a
 *    real, deliverable email. Clears on the next attempt, so a quick retry
 *    is enough.
 *  - Diagnosed 2026-09-28: enough signInAs calls across a full e2e run can
 *    trip Supabase's own "Request rate limit reached" on this same
 *    endpoint — throttledAuthCall above is the main defense (spacing calls
 *    out so the limit is rarely reached at all); the real, multi-second
 *    backoff below is the fallback for whatever that doesn't catch.
 */
export async function generateMagicLink(email: string, path = "/profile"): Promise<string> {
  const supabase = adminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}${path}`;

  const maxAttempts = 4;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await throttledAuthCall(() =>
      supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      })
    );

    if (!error && data.properties?.action_link) {
      return data.properties.action_link;
    }

    lastError = error?.message ?? "no action_link returned";
    if (attempt < maxAttempts) {
      const wait = lastError.toLowerCase().includes("rate limit")
        ? Math.min(2000 * 2 ** (attempt - 1), 8000)
        : 500 * attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw new Error(`generateMagicLink failed after ${maxAttempts} attempts: ${lastError}`);
}

/**
 * Sign a Playwright page in as the given email by navigating to a generated
 * magic link. Waits until the browser has landed on `path` (default /profile).
 */
export async function signInAs(page: Page, email: string, path = "/profile"): Promise<void> {
  const link = await generateMagicLink(email, path);
  await page.goto(link);
  // Use regex — the URL briefly contains a hash fragment (#access_token=...) which
  // Playwright's glob patterns don't match reliably.
  await page.waitForURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")), { timeout: 15_000 });
  // Wait for the Supabase client to process the hash fragment and store the
  // session in localStorage before returning. Without this, a subsequent
  // page.goto() can fire before the session is persisted, leaving the browser
  // unauthenticated on the next navigation.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 }
  );
}
