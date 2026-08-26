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
import { recordEntitlement } from "@/lib/match-ledger";

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

  const { data: insertedMatches, error: insertError } = await supabase
    .from("matches")
    .insert(matchRows)
    .select("id, member_id_1, member_id_2");

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

  // -------------------------------------------------------------------------
  // Track B4 (billing simplification, __claude__/billing-simplification-plan.md
  // §3.2): decrement the ledger. This is supplementary to matching — a
  // failure here is logged but doesn't fail the response, since matches and
  // the round are already committed and rolling either back would be worse
  // than a member's counter being briefly out of sync (nothing reads it yet).
  // -------------------------------------------------------------------------
  try {
    // One decrement per member per round, not per match row — a double
    // match or rematch this month costs nothing. record_entitlement's
    // one-decrement-per-member-per-month guard (migration 022) would catch
    // a second attempt anyway, but dedup here too so it's not relying on
    // that as the only line of defense.
    const firstMatchIdByMember = new Map<string, string>();
    for (const m of insertedMatches ?? []) {
      if (!firstMatchIdByMember.has(m.member_id_1)) firstMatchIdByMember.set(m.member_id_1, m.id);
      if (!firstMatchIdByMember.has(m.member_id_2)) firstMatchIdByMember.set(m.member_id_2, m.id);
    }

    for (const [memberId, matchId] of firstMatchIdByMember) {
      try {
        await recordEntitlement(supabase, {
          memberId,
          event: "match_delivered",
          delta: -1,
          month: monthDate,
          matchId,
        });
      } catch (e) {
        console.error(`[commit-matches] record_entitlement (match_delivered) failed for ${memberId}:`, e);
      }
    }

    // "Neither" (§3.2): a currently-paying member — active, or canceling
    // (paid through period end and still eligible for matching, migration
    // 020) — who this round neither opted in nor explicitly skipped.
    // Paused members are excluded entirely by the status filter; they keep
    // what they hold. Matched members are already excluded here too, since
    // being matched requires having opted in.
    const { data: billableMembers, error: billableError } = await supabase
      .from("members")
      .select("id")
      .in("status", ["active", "canceling"]);

    const { data: participation, error: participationError } = await supabase
      .from("monthly_participation")
      .select("member_id")
      .eq("month", monthDate);

    const { data: skips, error: skipsError } = await supabase
      .from("monthly_skips")
      .select("member_id")
      .eq("month", monthDate);

    if (billableError || participationError || skipsError) {
      console.error("[commit-matches] failed to load no_response population:", {
        billableError,
        participationError,
        skipsError,
      });
    } else {
      const participatedIds = new Set((participation ?? []).map((p) => p.member_id));
      const skippedIds = new Set((skips ?? []).map((s) => s.member_id));

      const noResponseIds = (billableMembers ?? [])
        .map((m) => m.id)
        .filter((id) => !participatedIds.has(id) && !skippedIds.has(id));

      for (const memberId of noResponseIds) {
        try {
          await recordEntitlement(supabase, {
            memberId,
            event: "no_response",
            delta: -1,
            month: monthDate,
          });
        } catch (e) {
          console.error(`[commit-matches] record_entitlement (no_response) failed for ${memberId}:`, e);
        }
      }
    }
  } catch (e) {
    console.error("[commit-matches] ledger decrement step failed (non-fatal):", e);
  }

  return NextResponse.json({
    committedCount: matchRows.length,
    roundId: round.id,
    month,
  });
}
