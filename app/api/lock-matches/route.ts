/**
 * POST /api/lock-matches
 *
 * Locks the current month's match round, making match_drafts read-only.
 * Called by n8n on the morning of the 7th, after match emails have gone out.
 *
 * A locked round cannot be modified. This is the terminal state.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Request body:
 *   { month?: "YYYY-MM" }   — override for testing / manual runs
 *
 * Response:
 *   { roundId: string, month: string, lockedAt: string }
 *
 * Error responses:
 *   401 — bad or missing Bearer token
 *   404 — no round found for the month
 *   409 — round is not in 'committed' state (still draft, or already locked)
 *   500 — DB failure
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[lock-matches] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------------
  let month = currentMonth();
  try {
    const body = await req.json();
    if (body?.month && typeof body.month === "string") month = body.month;
  } catch {
    // Empty body is fine
  }

  const monthDate = monthToDate(month);
  const supabase = createAdminClient();

  // -------------------------------------------------------------------------
  // Load the round
  // -------------------------------------------------------------------------
  const { data: round, error: roundError } = await supabase
    .from("match_rounds")
    .select("id, status")
    .eq("month", monthDate)
    .maybeSingle();

  if (roundError) {
    console.error("[lock-matches] Failed to load match_round:", roundError);
    return NextResponse.json({ error: "Failed to load match round" }, { status: 500 });
  }

  if (!round) {
    return NextResponse.json(
      { error: `No match round found for ${month}` },
      { status: 404 }
    );
  }

  if (round.status !== "committed") {
    return NextResponse.json(
      { error: `Round for ${month} is '${round.status}' — only committed rounds can be locked` },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // Lock the round
  // -------------------------------------------------------------------------
  const lockedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("match_rounds")
    .update({ status: "locked", locked_at: lockedAt })
    .eq("id", round.id);

  if (updateError) {
    console.error("[lock-matches] Failed to lock round:", updateError);
    return NextResponse.json({ error: "Failed to lock match round" }, { status: 500 });
  }

  return NextResponse.json({ roundId: round.id, month, lockedAt });
}
