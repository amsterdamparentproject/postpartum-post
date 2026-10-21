"use server";

import { headers } from "next/headers";

/**
 * Counts how often the Turnstile check works, is blocked or fails, so we can
 * see how many real visitors a blocker or a misconfiguration costs us.
 *
 * Sent from the server, not the browser: the people we most want to count are
 * the ones whose ad/privacy blocker stops Cloudflare's script, and those same
 * blockers very often stop Umami's browser script too. The browser's call to
 * this action goes to our own site, which blockers rarely touch, and we
 * forward the event to Umami from here.
 *
 * Events: "Turnstile: passed" (the check completed), "Turnstile: blocked"
 * (Cloudflare's script never loaded), "Turnstile: error" (it loaded but could
 * not run), "Turnstile: checkbox shown" (Cloudflare wanted a click).
 * Lost visitors ≈ (blocked + error) / (passed + blocked + error), per `form`.
 *
 * Only reports from the live site (production build on postpartumpost.com), so
 * local dev, e2e and deploy previews never mix into the numbers.
 */

const LABELS = {
  passed: "passed",
  blocked: "blocked",
  error: "error",
  checkbox: "checkbox shown",
} as const;

const FORMS = new Set(["signup", "partner_lead", "perk_idea"]);
const LIVE_HOST = /(^|\.)postpartumpost\.com$/;

export type TurnstileOutcome = keyof typeof LABELS;

export async function reportTurnstileOutcome(outcome: string, form: string, path: string): Promise<void> {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (process.env.NODE_ENV !== "production" || !websiteId) return;
  if (!Object.hasOwn(LABELS, outcome) || !FORMS.has(form)) return;

  try {
    const h = await headers();
    const host = (h.get("host") ?? "").split(":")[0];
    if (!LIVE_HOST.test(host)) return;

    const ip = h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
    await fetch("https://gateway.umami.is/api/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": h.get("user-agent") ?? "unknown",
        ...(ip ? { "X-Forwarded-For": ip } : {}),
      },
      body: JSON.stringify({
        type: "event",
        payload: {
          website: websiteId,
          hostname: host,
          url: path.startsWith("/") ? path.slice(0, 200) : "/",
          language: (h.get("accept-language") ?? "en").split(",")[0],
          name: `Turnstile: ${LABELS[outcome as TurnstileOutcome]}`,
          data: { form },
        },
      }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // measurement must never affect the form
  }
}
