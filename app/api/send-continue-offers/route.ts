/**
 * POST /api/send-continue-offers
 *
 * Emails the "keep going?" offer to comped cohort members whose free match is
 * used (see lib/continue-offer-send.ts for exactly who is eligible, and
 * __claude__/dsa-continue-offer.md for the offer itself). Runs monthly on the
 * 10th, at 10:00 (n8n cron `0 0 10 10 * *`), an hour after renew-check and
 * three days after the 7th's match reveal. By then the 7th's commit has spent
 * the free credit and the member has had a few days with their match.
 *
 * Safe to retry or run twice: each member is claimed (members.continue_offer_sent_at,
 * migration 035) before the email goes out, so nobody gets it twice. A failed
 * send releases the claim and the next run tries again.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET, like the other job
 * endpoints (renew-check, commit-matches, send-optin-email).
 *
 * Request body (optional JSON object):
 *   { "dryRun": true }   sends nothing and writes nothing; returns who would get it
 *   { "cohort": "dsa" }  limit to one cohort slug (default: every cohort with an offer)
 *
 * The dry-run flag is strict, as in renew-check: anything ambiguous is a 400.
 *
 * Responses:
 *   200 — { dryRun, cohorts: [...], members: [{ memberId, cohort, outcome }] }
 *   400 — bad body
 *   401 — bad or missing Bearer token
 *   500 — server misconfiguration or a database error
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { sendContinueOffers } from "@/lib/continue-offer-send";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

export async function POST(req: NextRequest) {
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[send-continue-offers] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
  const looksLikeDryRun = (key: string) => /dry.?run/i.test(key);

  for (const key of req.nextUrl.searchParams.keys()) {
    if (looksLikeDryRun(key)) {
      return badRequest('Send the dry-run flag in the JSON body: { "dryRun": true }.');
    }
  }

  let dryRun = false;
  let cohortSlug: string | undefined;
  const rawBody = await req.text();
  if (rawBody.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return badRequest("Request body must be valid JSON.");
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return badRequest("Request body must be a JSON object.");
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (looksLikeDryRun(key)) {
        if (key !== "dryRun" || typeof value !== "boolean") {
          return badRequest('Invalid dry-run flag. Use exactly { "dryRun": true }.');
        }
        dryRun = value;
      } else if (key === "cohort") {
        if (typeof value !== "string" || value.trim() === "") {
          return badRequest('"cohort" must be a non-empty string.');
        }
        cohortSlug = value.trim();
      }
    }
  }

  try {
    const results = await sendContinueOffers(createAdminClient(), {
      stripe: getStripe(),
      siteUrl: SITE_URL,
      dryRun,
      cohortSlug,
    });

    // Member ids only: this response lands in n8n's execution log.
    return NextResponse.json({
      dryRun,
      cohorts: results.map(({ members, ...summary }) => {
        void members;
        return summary;
      }),
      members: results.flatMap((r) =>
        r.members.map((m) => ({ memberId: m.memberId, cohort: r.slug, outcome: m.outcome }))
      ),
    });
  } catch (e) {
    console.error("[send-continue-offers] failed:", e);
    return NextResponse.json({ error: "Failed to send continue offers" }, { status: 500 });
  }
}
