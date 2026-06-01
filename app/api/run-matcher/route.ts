/**
 * POST /api/run-matcher
 *
 * Protected monthly matching endpoint. Fetches all members who have opted in
 * via monthly_participation for the current month, runs the scoring + pairing
 * algorithm, and writes results to match_drafts (inside a match_rounds row).
 *
 * Results are NOT written to matches directly — they stay in draft until
 * n8n commits them at EOD the 6th via POST /api/commit-matches.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Request body (JSON):
 *   { dryRun?: boolean }
 *
 * Response:
 *   {
 *     matched: Array<{ member1: {...}, member2: {...}, score: number, breakdown: {...}, qualityTier: string }>,
 *     unmatched: Array<{ id, first_name, last_name, email }>,
 *     roundScore: number,
 *     savedCount: number,   // 0 when dryRun = true
 *     dryRun: boolean
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  geocodeMembers,
  runMatcher,
  type MatchCandidate,
} from "@/lib/matcher";
import { currentMonth, monthToDate } from "@/lib/skip-token";

const QUALITY_THRESHOLDS = {
  GREAT: 1500,
  GOOD: 500,
} as const;

function qualityTier(score: number): "great" | "good" | "needs_work" {
  if (score >= QUALITY_THRESHOLDS.GREAT) return "great";
  if (score >= QUALITY_THRESHOLDS.GOOD) return "good";
  return "needs_work";
}

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[run-matcher] MATCHER_API_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------------
  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // Empty body is fine — treat as non-dry run
  }

  const supabase = createAdminClient();
  const month = currentMonth();       // YYYY-MM
  const monthDate = monthToDate(month); // YYYY-MM-01

  // -------------------------------------------------------------------------
  // Check for existing draft round — prevent double-run
  // -------------------------------------------------------------------------
  if (!dryRun) {
    const { data: existingRound } = await supabase
      .from("match_rounds")
      .select("id, status")
      .eq("month", monthDate)
      .maybeSingle();

    if (existingRound) {
      return NextResponse.json(
        { error: `A match round for ${month} already exists (status: ${existingRound.status})` },
        { status: 409 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // Fetch members who opted in this month
  // -------------------------------------------------------------------------
  const { data: participations, error: participationError } = await supabase
    .from("monthly_participation")
    .select(`
      member_id,
      topic_id,
      members (
        id, first_name, last_name, email, zipcode, lat, lng,
        topic_id, language, match_type, availability, match_priority, children
      )
    `)
    .eq("month", monthDate);

  if (participationError) {
    console.error("[run-matcher] Failed to fetch participations:", participationError);
    return NextResponse.json({ error: "Failed to fetch opted-in members" }, { status: 500 });
  }

  // Merge the per-month topic choice into the member candidate
  const activeMembers = (participations ?? [])
    .map((p) => {
      const member = p.members as unknown as MatchCandidate;
      if (!member) return null;
      // Override topic_id with the per-month choice from monthly_participation
      return { ...member, topic_id: p.topic_id };
    })
    .filter((m): m is MatchCandidate => m !== null);

  if (activeMembers.length < 2) {
    return NextResponse.json({
      matched: [],
      unmatched: activeMembers,
      roundScore: 0,
      savedCount: 0,
      dryRun,
      message: "Not enough opted-in members to match",
    });
  }

  // -------------------------------------------------------------------------
  // Geocode members with zipcodes (uses cached lat/lng when available)
  // -------------------------------------------------------------------------
  let coordMap: Map<string, { lat: number; lng: number }>;
  try {
    coordMap = await geocodeMembers(activeMembers, supabase);
  } catch (err) {
    console.error("[run-matcher] Geocoding failed:", err);
    coordMap = new Map();
  }

  // -------------------------------------------------------------------------
  // Run matching algorithm
  // -------------------------------------------------------------------------
  const { matched, unmatched } = await runMatcher(activeMembers, supabase, coordMap);

  // -------------------------------------------------------------------------
  // Calculate round score (weighted average of pair scores)
  // -------------------------------------------------------------------------
  const roundScore = matched.length
    ? matched.reduce((sum, p) => sum + p.score, 0) / matched.length
    : 0;

  // -------------------------------------------------------------------------
  // Persist to match_rounds + match_drafts (skip if dry run)
  // -------------------------------------------------------------------------
  let savedCount = 0;

  if (!dryRun && matched.length > 0) {
    // Create the round
    const { data: round, error: roundError } = await supabase
      .from("match_rounds")
      .insert({ month: monthDate, status: "draft", round_score: roundScore })
      .select("id")
      .single();

    if (roundError || !round) {
      console.error("[run-matcher] Failed to create match_round:", roundError);
      return NextResponse.json({ error: "Failed to create match round" }, { status: 500 });
    }

    // Insert drafts
    const draftRows = matched.map((pair) => ({
      round_id: round.id,
      member_id_1: pair.a.id,
      member_id_2: pair.b.id,
      score: pair.score,
      breakdown: pair.breakdown,
      match_type: pair.matchType ?? null,
      quality_tier: qualityTier(pair.score),
    }));

    const { error: draftsError, count } = await supabase
      .from("match_drafts")
      .insert(draftRows, { count: "exact" });

    if (draftsError) {
      console.error("[run-matcher] Failed to save match_drafts:", draftsError);
      return NextResponse.json(
        { error: "Matching succeeded but failed to save drafts" },
        { status: 500 }
      );
    }

    savedCount = count ?? draftRows.length;
  }

  // -------------------------------------------------------------------------
  // Build response
  // -------------------------------------------------------------------------
  const responseMatched = matched.map((pair) => ({
    member1: {
      id: pair.a.id,
      first_name: pair.a.first_name,
      last_name: pair.a.last_name,
      email: pair.a.email,
    },
    member2: {
      id: pair.b.id,
      first_name: pair.b.first_name,
      last_name: pair.b.last_name,
      email: pair.b.email,
    },
    score: Math.round(pair.score),
    breakdown: {
      language: Math.round(pair.breakdown.language),
      availability: Math.round(pair.breakdown.availability),
      topic: Math.round(pair.breakdown.topic),
      proximity: Math.round(pair.breakdown.proximity),
      children: Math.round(pair.breakdown.children),
    },
    matchType: pair.matchType,
    qualityTier: qualityTier(pair.score),
  }));

  const responseUnmatched = unmatched.map((m) => ({
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email,
  }));

  return NextResponse.json({
    dryRun,
    matched: responseMatched,
    unmatched: responseUnmatched,
    roundScore: Math.round(roundScore),
    savedCount,
  });
}
