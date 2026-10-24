/**
 * ONE-TIME backfill: populate match_draft_snapshots for the September 2026
 * round, which was generated (2026-09-05) and will be committed before
 * migration 025 / the snapshot-writing code existed.
 *
 *   'original' — reconstructed from __match_diff_output.json's freshRun.pairs
 *                (a fresh matcher run captured 2026-09-06, verified to match
 *                the round's stored round_score to 8+ significant figures —
 *                i.e. this is what /api/run-matcher actually proposed on the 5th).
 *   'final'    — read live from current match_drafts for the round. Only
 *                inserted if no 'final' rows exist yet for this round (so
 *                it's a no-op if the new commit-matches code already wrote
 *                them for real).
 *
 * Safe to run more than once — checks for existing rows per snapshot_type
 * before inserting either one. Makes no changes to match_drafts/match_rounds/
 * matches — only adds rows to match_draft_snapshots.
 *
 * Requires migration 025_match_draft_snapshots.sql to already be applied.
 *
 * Usage: node scripts/backfill-sept-snapshots.mjs
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.production") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars in .env.production");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: { schema: "postpartumpost" },
});

async function main() {
  const diffPath = resolve(process.cwd(), "__match_diff_output.json");
  const diff = JSON.parse(readFileSync(diffPath, "utf8"));

  const roundId = diff.round?.id;
  if (!roundId) {
    console.error("No round id found in __match_diff_output.json — was it regenerated since?");
    process.exit(1);
  }
  console.log(`Round: ${roundId} (month ${diff.round.month}, status ${diff.round.status})`);

  // ---- 'original' ----
  const { count: existingOriginalCount, error: origCheckErr } = await supabase
    .from("match_draft_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .eq("snapshot_type", "original");

  if (origCheckErr) {
    console.error("Failed to check existing 'original' snapshots:", origCheckErr);
    process.exit(1);
  }

  if (existingOriginalCount && existingOriginalCount > 0) {
    console.log(`'original' snapshots already present (${existingOriginalCount} rows) — skipping.`);
  } else {
    const originalRows = diff.freshRun.pairs.map((p) => ({
      round_id: roundId,
      member_id_1: p.member_id_1,
      member_id_2: p.member_id_2,
      score: p.score,
      breakdown: p.breakdown,
      quality_tier: p.quality_tier,
      snapshot_type: "original",
    }));
    const { error: insErr, count } = await supabase
      .from("match_draft_snapshots")
      .insert(originalRows, { count: "exact" });
    if (insErr) {
      console.error("Failed to insert 'original' snapshots:", insErr);
      process.exit(1);
    }
    console.log(`Inserted ${count ?? originalRows.length} 'original' snapshot rows (from __match_diff_output.json).`);
  }

  // ---- 'final' ----
  const { count: existingFinalCount, error: finalCheckErr } = await supabase
    .from("match_draft_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .eq("snapshot_type", "final");

  if (finalCheckErr) {
    console.error("Failed to check existing 'final' snapshots:", finalCheckErr);
    process.exit(1);
  }

  if (existingFinalCount && existingFinalCount > 0) {
    console.log(`'final' snapshots already present (${existingFinalCount} rows) — commit-matches already captured them for real. Skipping.`);
  } else {
    const { data: currentDrafts, error: draftsErr } = await supabase
      .from("match_drafts")
      .select("member_id_1, member_id_2, score, breakdown, quality_tier")
      .eq("round_id", roundId);
    if (draftsErr) {
      console.error("Failed to read current match_drafts:", draftsErr);
      process.exit(1);
    }
    if (!currentDrafts || currentDrafts.length === 0) {
      console.log("No current match_drafts rows found — nothing to backfill for 'final' (has the round been reassigned away entirely?).");
    } else {
      const finalRows = currentDrafts.map((d) => ({
        round_id: roundId,
        member_id_1: d.member_id_1,
        member_id_2: d.member_id_2,
        score: d.score,
        breakdown: d.breakdown,
        quality_tier: d.quality_tier,
        snapshot_type: "final",
      }));
      const { error: insErr2, count: count2 } = await supabase
        .from("match_draft_snapshots")
        .insert(finalRows, { count: "exact" });
      if (insErr2) {
        console.error("Failed to insert 'final' snapshots:", insErr2);
        process.exit(1);
      }
      console.log(`Inserted ${count2 ?? finalRows.length} 'final' snapshot rows (from current match_drafts as of right now).`);
      console.log("NOTE: if you run this BEFORE tonight's commit and you still plan to reassign pairs after this, re-run this script again after commit finishes — 'final' should reflect your actual last edit, not a mid-edit snapshot.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
