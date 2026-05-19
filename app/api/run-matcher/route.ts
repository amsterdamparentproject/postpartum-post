/**
 * POST /api/run-matcher
 *
 * Protected monthly matching endpoint. Fetches all active members, runs the
 * scoring + pairing algorithm, and writes the results to postpartumpost.matches.
 *
 * Authentication: Bearer token via MATCHER_API_SECRET env var.
 *
 * Request body (JSON):
 *   { dryRun?: boolean }
 *
 * Response:
 *   {
 *     matched: Array<{ member1: {...}, member2: {...}, score: number, breakdown: {...} }>,
 *     unmatched: Array<{ id, first_name, last_name, email }>,
 *     savedCount: number   // 0 when dryRun = true
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  geocodeMembers,
  runMatcher,
  type MatchCandidate,
} from "@/lib/matcher";

export async function POST(req: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) {
    console.error("[run-matcher] MATCHER_API_SECRET is not set");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
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

  // -------------------------------------------------------------------------
  // Fetch active members
  // -------------------------------------------------------------------------
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select(
      "id, first_name, last_name, email, zipcode, lat, lng, topic_id, language, match_type, availability, match_priority, children"
    )
    .eq("status", "active");

  if (membersError) {
    console.error("[run-matcher] Failed to fetch members:", membersError);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }

  const activeMembers = (members ?? []) as MatchCandidate[];

  if (activeMembers.length < 2) {
    return NextResponse.json({
      matched: [],
      unmatched: activeMembers,
      savedCount: 0,
      message: "Not enough active members to match",
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
    // Non-fatal — proceed with empty coord map; proximity scores will be 0
    coordMap = new Map();
  }

  // -------------------------------------------------------------------------
  // Run matching algorithm
  // -------------------------------------------------------------------------
  const { matched, unmatched } = await runMatcher(
    activeMembers,
    supabase,
    coordMap
  );

  // -------------------------------------------------------------------------
  // Persist matches (skip if dry run)
  // -------------------------------------------------------------------------
  let savedCount = 0;

  if (!dryRun && matched.length > 0) {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const rows = matched.map((pair) => ({
      member_id_1: pair.a.id,
      member_id_2: pair.b.id,
      matched_on: today,
      match_type: pair.matchType ?? null,
    }));

    const { error: insertError, count } = await supabase
      .from("matches")
      .insert(rows, { count: "exact" });

    if (insertError) {
      console.error("[run-matcher] Failed to save matches:", insertError);
      return NextResponse.json(
        { error: "Matching succeeded but failed to save results" },
        { status: 500 }
      );
    }

    savedCount = count ?? rows.length;
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
    savedCount,
  });
}
