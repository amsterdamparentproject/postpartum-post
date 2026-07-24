/**
 * POST /api/send-meetup-reminder
 *
 * Sends the "one week left to meet up" reminder to both members of every
 * eligible match in the current month's round. Called by n8n on a fixed
 * monthly cron (the 23rd) — no in-route date gating, same as
 * /api/run-matcher and /api/commit-matches; the cron schedule is the only
 * thing deciding when this runs.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Request body:
 *   {
 *     dryRun?: boolean,  // only send to TEST_EMAIL, regardless of real match membership
 *     month?: string,    // YYYY-MM override for testing / manual re-runs (defaults to current month)
 *   }
 *
 * Response:
 *   { dryRun: boolean, month: string, totalMatches: number, sent: number, skipped: number, failed: number, details: [...] }
 *
 * Error responses:
 *   401 — bad or missing Bearer token
 *   500 — DB failure or email send error
 */

import { NextRequest, NextResponse } from "next/server";
import { runMeetupReminder } from "@/lib/meetup-reminder";

const TEST_EMAIL = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[send-meetup-reminder] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------------
  let dryRun = false;
  let month: string | undefined;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
    if (body?.month && typeof body.month === "string") month = body.month;
  } catch {
    // Empty body is fine — treat as non-dry run, current month
  }

  // -------------------------------------------------------------------------
  // Send
  // -------------------------------------------------------------------------
  try {
    const result = await runMeetupReminder(dryRun ? TEST_EMAIL : undefined, month);
    return NextResponse.json({ dryRun, ...result });
  } catch (err) {
    console.error("[send-meetup-reminder] failed:", err);
    return NextResponse.json({ error: "Failed to send reminders" }, { status: 500 });
  }
}
