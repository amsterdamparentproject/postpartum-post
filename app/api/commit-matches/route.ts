/**
 * POST /api/commit-matches
 *
 * Promotes the current month's match_drafts into the matches table and marks
 * the match_round as 'committed'. Called by n8n at EOD the 6th of each month.
 *
 * After committing, send-match-emails should be triggered (separately or by
 * extending this endpoint) to dispatch the match reveal emails.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Request body: none required (month defaults to current month).
 *   { month?: "YYYY-MM" }   — override for testing / manual runs
 *
 * Response:
 *   {
 *     committedCount: number,
 *     roundId: string,
 *     month: string
 *   }
 *
 * Error responses:
 *   401 — bad or missing Bearer token
 *   404 — no draft round found for the month
 *   409 — round already committed or locked
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
    console.error("[commit-matches] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse body — month defaults to current month
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
  // Load the draft round for this month
  // -------------------------------------------------------------------------
  const { data: round, error: roundError } = await supabase
    .from("match_rounds")
    .select("id, status")
    .eq("month", monthDate)
    .maybeSingle();

  if (roundError) {
    console.error("[commit-matches] Failed to load match_round:", roundError);
    return NextResponse.json({ error: "Failed to load match round" }, { status: 500 });
  }

  if (!round) {
    return NextResponse.json(
      { error: `No match round found for ${month}` },
      { status: 404 }
    );
  }

  if (round.status !== "draft") {
    return NextResponse.json(
      { error: `Round for ${month} is already ${round.status} — cannot commit again` },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // Load the drafts for this round
  // -------------------------------------------------------------------------
  const { data: drafts, error: draftsError } = await supabase
    .from("match_drafts")
    .select("member_id_1, member_id_2")
    .eq("round_id", round.id);

  if (draftsError) {
    console.error("[commit-matches] Failed to load match_drafts:", draftsError);
    return NextResponse.json({ error: "Failed to load match drafts" }, { status: 500 });
  }

  if (!drafts || drafts.length === 0) {
    return NextResponse.json(
      { error: `No drafts found for round ${round.id}` },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // Insert into matches
  // -------------------------------------------------------------------------
  const matchRows = drafts.map((d) => ({
    member_id_1: d.member_id_1,
    member_id_2: d.member_id_2,
    matched_on: monthDate,
  }));

  const { error: insertError } = await supabase.from("matches").insert(matchRows);

  if (insertError) {
    console.error("[commit-matches] Failed to insert matches:", insertError);
    return NextResponse.json({ error: "Failed to commit matches" }, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // Mark the round as committed
  // -------------------------------------------------------------------------
  const { error: updateError } = await supabase
    .from("match_rounds")
    .update({ status: "committed", committed_at: new Date().toISOString() })
    .eq("id", round.id);

  if (updateError) {
    // Matches were written — log the error but don't fail the response,
    // since rolling back at this point would leave orphaned matches.
    console.error(
      "[commit-matches] Matches written but failed to update round status:",
      updateError
    );
  }

  return NextResponse.json({
    committedCount: matchRows.length,
    roundId: round.id,
    month,
  });
}
