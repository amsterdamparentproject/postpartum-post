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
 * Generate a Supabase magic link for the given email.
 * Returns the action_link URL — navigate to it in Playwright to sign in.
 *
 * Retries a couple of times on failure: diagnosed 2026-07-24, this project's
 * admin.generateLink() intermittently fails with "unrecognized JWT kid
 * <nil> for algorithm ES256" — a token with no `kid` header failing to
 * match the project's single active ECC signing key. Not caused by an
 * @example.com-domain email (Supabase's mail relay rejects that outright
 * with a different, unambiguous SMTP error — test emails here already use a
 * real gmail.com address, see e2e/helpers/db.ts) — this recurs even with a
 * real, deliverable email. Looks like a Supabase-side quirk specific to
 * this one Admin API endpoint rather than anything fixable here, so this
 * retries around it rather than papering over it silently: a genuine,
 * persistent failure (bad project config, wrong keys, etc.) still exhausts
 * the retries and throws.
 */
export async function generateMagicLink(email: string): Promise<string> {
  const supabase = adminClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/profile`;

  const maxAttempts = 3;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (!error && data.properties?.action_link) {
      return data.properties.action_link;
    }

    lastError = error?.message ?? "no action_link returned";
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  throw new Error(`generateMagicLink failed after ${maxAttempts} attempts: ${lastError}`);
}

/**
 * Sign a Playwright page in as the given email by navigating to a generated
 * magic link. Waits until the browser has landed on /profile.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const link = await generateMagicLink(email);
  await page.goto(link);
  // Use regex — the URL briefly contains a hash fragment (#access_token=...) which
  // Playwright's glob patterns don't match reliably.
  await page.waitForURL(/\/profile/, { timeout: 15_000 });
  // Wait for the Supabase client to process the hash fragment and store the
  // session in localStorage before returning. Without this, a subsequent
  // page.goto() can fire before the session is persisted, leaving the browser
  // unauthenticated on the next navigation.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 }
  );
}
