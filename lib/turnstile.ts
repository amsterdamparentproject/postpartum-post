import { headers } from "next/headers";

/**
 * Server half of the Cloudflare Turnstile bot check on the public signup,
 * partner-interest and perk-idea forms (added after the 2026-10-19 spam
 * wave; see __claude__/signup-spam-2026-10-21.md). The browser widget
 * (components/TurnstileWidget.tsx) produces a one-time token; every server
 * action that creates a record from a public form calls this before doing
 * anything else.
 *
 * Configuration:
 *  - NEXT_PUBLIC_TURNSTILE_SITE_KEY — the widget's public key (client).
 *  - TURNSTILE_SECRET_KEY — the widget's secret key (server only).
 * With no secret configured the check is skipped, so deploying this before
 * the keys exist cannot take the forms down. In production that logs an
 * error, since it means the forms are unprotected.
 *
 * Cloudflare's published test keys work locally and in e2e:
 *  site 1x00000000000000000000AA / secret 1x0000000000000000000000000000000AA
 *  (always pass; the site key yields the token XXXX.DUMMY.TOKEN.XXXX).
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; error: string };

const MISSING_TOKEN = "Please complete the verification and try again.";
const FAILED = "Verification failed. Please refresh the page and try again.";

async function clientIp(): Promise<string | undefined> {
  try {
    const h = await headers();
    return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  } catch {
    return undefined; // outside a request scope (tests)
  }
}

export async function verifyTurnstile(token: string | undefined): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY is not set — public forms are unprotected");
    }
    return { ok: true };
  }

  if (!token || typeof token !== "string" || token.length > 2048) {
    return { ok: false, error: MISSING_TOKEN };
  }

  const body = new URLSearchParams({ secret, response: token });
  const ip = await clientIp();
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      // Cloudflare trouble is not the visitor's fault — don't block real people.
      console.error(`[turnstile] siteverify returned HTTP ${res.status}, allowing request`);
      return { ok: true };
    }
    const result = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (result.success === true) return { ok: true };
    console.warn("[turnstile] verification failed:", result["error-codes"]?.join(", ") ?? "unknown");
    return { ok: false, error: FAILED };
  } catch (e) {
    console.error("[turnstile] siteverify unreachable, allowing request:", e);
    return { ok: true };
  }
}
