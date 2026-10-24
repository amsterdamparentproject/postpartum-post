/**
 * READ-ONLY diagnostic: compares the current match_drafts selection against
 * a fresh run of the live matching algorithm (lib/matcher.ts, ported here
 * verbatim in plain JS to avoid the esbuild/tsx binary mismatch on this VM).
 *
 * Makes NO writes: no inserts/updates/deletes to any table, and — unlike the
 * real algorithm — does NOT geocode missing zipcodes (which would normally
 * write lat/lng back to members). Members without cached coords are scored
 * as "no coords" (half credit), same as the algorithm does before geocoding.
 *
 * Usage: node match-diff.mjs
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

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

const ENABLE_TIME_OF_DAY = false; // lib/flags.ts

const W = {
  LANGUAGE: 1000,
  PARENT_TYPE: 1000,
  AVAILABILITY: 500,
  TOPIC: 250,
  PRIORITY_HIGH: 100,
  PRIORITY_LOW: 50,
};
const MAX_PROXIMITY_KM = 15;
const MAX_CHILD_AGE_GAP_MONTHS = 24;
const MIXED_CHILD_AGE_DISCOUNT = 0.75;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function scoreParentType(a, b) {
  if (!a.parent_type && !b.parent_type) return 0;
  if (!a.parent_type || !b.parent_type) return W.PARENT_TYPE / 2;
  if (a.parent_type === b.parent_type) return W.PARENT_TYPE;
  return 0;
}

function scoreLanguage(a, b) {
  const aHas = (a.language?.length ?? 0) > 0;
  const bHas = (b.language?.length ?? 0) > 0;
  if (!aHas && !bHas) return 0;
  if (!aHas || !bHas) return W.LANGUAGE / 2;
  const setB = new Set(b.language);
  return a.language.some((lang) => setB.has(lang)) ? W.LANGUAGE : 0;
}

function jaccardSimilarity(a, b) {
  if (!a.length && !b.length) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersect = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersect / union;
}

function scoreAvailability(a, b) {
  if (!a.availability && !b.availability) return 0;
  if (!a.availability || !b.availability) return W.AVAILABILITY / 2;
  const dayScore = jaccardSimilarity(a.availability.days, b.availability.days);
  if (!ENABLE_TIME_OF_DAY) return dayScore * W.AVAILABILITY;
  const timeScore = jaccardSimilarity(a.availability.times, b.availability.times);
  return ((dayScore + timeScore) / 2) * W.AVAILABILITY;
}

function scoreTopic(a, b) {
  if (!a.topic_id && !b.topic_id) return 0;
  if (!a.topic_id || !b.topic_id) return W.TOPIC / 2;
  return a.topic_id === b.topic_id ? W.TOPIC : 0;
}

function rawProximityScore(a, b, coordMap) {
  const geoA = coordMap.get(a.id);
  const geoB = coordMap.get(b.id);
  if (!geoA && !geoB) return 0;
  if (!geoA || !geoB) return 0.5;
  const dist = haversineKm(geoA, geoB);
  return Math.max(0, 1 - dist / MAX_PROXIMITY_KM);
}

function ageInMonths(c) {
  const birthDate = new Date(c.birth_year, c.birth_month - 1, 1);
  const diffMs = Date.now() - birthDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

function rawChildrenScore(a, b) {
  const childrenA = a.children ?? [];
  const childrenB = b.children ?? [];
  const aHas = childrenA.length > 0;
  const bHas = childrenB.length > 0;
  if (!aHas && !bHas) return 0;
  if (!aHas || !bHas) return 0.5;
  let best = 0;
  for (const ca of childrenA) {
    for (const cb of childrenB) {
      const gap = Math.abs(ageInMonths(ca) - ageInMonths(cb));
      let raw = Math.max(0, 1 - gap / MAX_CHILD_AGE_GAP_MONTHS);
      if (ca.expected !== cb.expected) raw *= MIXED_CHILD_AGE_DISCOUNT;
      best = Math.max(best, raw);
    }
  }
  return best;
}

function priorityWeights(a, b) {
  const mid = (W.PRIORITY_HIGH + W.PRIORITY_LOW) / 2;
  if (a.match_priority === "proximity" && b.match_priority === "proximity") {
    return { proximityW: W.PRIORITY_HIGH, childrenW: W.PRIORITY_LOW };
  }
  if (a.match_priority === "age" && b.match_priority === "age") {
    return { proximityW: W.PRIORITY_LOW, childrenW: W.PRIORITY_HIGH };
  }
  return { proximityW: mid, childrenW: mid };
}

function maxAchievableScore(a, b, coordMap) {
  let max = 0;
  const aHasLang = (a.language?.length ?? 0) > 0;
  const bHasLang = (b.language?.length ?? 0) > 0;
  if (aHasLang && bHasLang) max += W.LANGUAGE;
  else if (aHasLang || bHasLang) max += W.LANGUAGE / 2;

  if (a.parent_type && b.parent_type && a.parent_type === b.parent_type) max += W.PARENT_TYPE;
  else if (!a.parent_type !== !b.parent_type) max += W.PARENT_TYPE / 2;

  if (a.availability && b.availability) max += W.AVAILABILITY;
  else if (a.availability || b.availability) max += W.AVAILABILITY / 2;

  if (a.topic_id && b.topic_id && a.topic_id === b.topic_id) max += W.TOPIC;
  else if (!a.topic_id !== !b.topic_id) max += W.TOPIC / 2;

  const { proximityW, childrenW } = priorityWeights(a, b);
  const geoA = coordMap.get(a.id);
  const geoB = coordMap.get(b.id);
  if (geoA && geoB) max += proximityW;
  else if (geoA || geoB) max += proximityW / 2;

  const aHasChildren = (a.children?.length ?? 0) > 0;
  const bHasChildren = (b.children?.length ?? 0) > 0;
  if (aHasChildren && bHasChildren) max += childrenW;
  else if (aHasChildren || bHasChildren) max += childrenW / 2;

  return max;
}

function qualityTier(score, maxScore) {
  if (maxScore === 0) return "needs_work";
  const pct = score / maxScore;
  if (pct >= 0.8) return "great";
  if (pct >= 0.4) return "good";
  return "needs_work";
}

function scorePair(a, b, coordMap) {
  const language = scoreLanguage(a, b);
  const parent_type = scoreParentType(a, b);
  const availability = scoreAvailability(a, b);
  const topic = scoreTopic(a, b);
  const { proximityW, childrenW } = priorityWeights(a, b);
  const proximity = rawProximityScore(a, b, coordMap) * proximityW;
  const children = rawChildrenScore(a, b) * childrenW;
  const total = language + parent_type + availability + topic + proximity + children;
  return { a, b, score: total, breakdown: { language, parent_type, availability, topic, proximity, children, total } };
}

function pairKey(aId, bId) {
  return [aId, bId].sort().join(":");
}

function greedyPair(scoredPairs, excludedPairs) {
  const valid = scoredPairs.filter((p) => !excludedPairs.has(pairKey(p.a.id, p.b.id)));
  valid.sort((x, y) => y.score - x.score);
  const matched = [];
  const matchedIds = new Set();
  for (const pair of valid) {
    if (!matchedIds.has(pair.a.id) && !matchedIds.has(pair.b.id)) {
      matched.push(pair);
      matchedIds.add(pair.a.id);
      matchedIds.add(pair.b.id);
    }
  }
  const allMembers = new Map();
  for (const p of scoredPairs) {
    allMembers.set(p.a.id, p.a);
    allMembers.set(p.b.id, p.b);
  }
  const unmatched = [...allMembers.values()].filter((m) => !matchedIds.has(m.id));
  return { matched, unmatched };
}

async function getRecentlyMatchedPairs() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const { data, error } = await supabase
    .from("matches")
    .select("member_id_1, member_id_2")
    .gte("matched_on", sixMonthsAgo.toISOString().split("T")[0]);
  if (error) {
    console.error("Failed to fetch recent matches:", error);
    return new Set();
  }
  const pairs = new Set();
  for (const row of data ?? []) pairs.add(pairKey(row.member_id_1, row.member_id_2));
  return pairs;
}

async function getPermanentExclusions() {
  const { data, error } = await supabase.from("match_exclusions").select("member_id_1, member_id_2");
  if (error) {
    console.error("Failed to fetch exclusions:", error);
    return new Set();
  }
  const pairs = new Set();
  for (const row of data ?? []) pairs.add(pairKey(row.member_id_1, row.member_id_2));
  return pairs;
}

async function runMatcher(members) {
  const uniqueMembers = Array.from(new Map(members.map((m) => [m.id, m])).values());
  const coordMap = new Map();
  for (const m of uniqueMembers) {
    if (m.lat != null && m.lng != null) coordMap.set(m.id, { lat: m.lat, lng: m.lng });
  }

  if (uniqueMembers.length < 2) return { matched: [], unmatched: uniqueMembers, coordMap };

  const [recentPairs, permanentExclusions] = await Promise.all([
    getRecentlyMatchedPairs(),
    getPermanentExclusions(),
  ]);
  const excludedPairs = new Set([...recentPairs, ...permanentExclusions]);

  const scoredPairs = [];
  for (let i = 0; i < uniqueMembers.length; i++) {
    for (let j = i + 1; j < uniqueMembers.length; j++) {
      scoredPairs.push(scorePair(uniqueMembers[i], uniqueMembers[j], coordMap));
    }
  }

  const result = greedyPair(scoredPairs, excludedPairs);

  if (result.unmatched.length === 1) {
    const leftover = result.unmatched[0];
    const willing = result.matched.flatMap((p) => [p.a, p.b]).filter((m) => m.open_to_second_match === true);
    if (willing.length > 0) {
      const best = willing
        .map((m) => ({ member: m, pair: scorePair(m, leftover, coordMap) }))
        .filter(({ member }) => member.id !== leftover.id)
        .sort((x, y) => y.pair.score - x.pair.score)[0];
      if (best) {
        result.matched.push(best.pair);
        result.unmatched = [];
        result.doubleMatchedId = best.member.id;
      }
    }
  }

  return { ...result, coordMap };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function monthToDate(month) {
  return `${month}-01`;
}

async function main() {
  const out = { generatedAt: new Date().toISOString() };

  const month = currentMonth();
  const monthDate = monthToDate(month);

  // ---- Current match_rounds / match_drafts (Alex's current selection) ----
  const { data: round, error: roundErr } = await supabase
    .from("match_rounds")
    .select("id, month, status, round_score, created_at, updated_at")
    .eq("month", monthDate)
    .maybeSingle();

  if (roundErr) {
    console.error("Failed to fetch match_round:", roundErr);
    process.exit(1);
  }

  out.round = round;

  let drafts = [];
  if (round) {
    const { data: draftRows, error: draftsErr } = await supabase
      .from("match_drafts")
      .select("id, member_id_1, member_id_2, score, breakdown, quality_tier, created_at")
      .eq("round_id", round.id);
    if (draftsErr) {
      console.error("Failed to fetch match_drafts:", draftsErr);
      process.exit(1);
    }
    drafts = draftRows ?? [];
  }
  out.draftCount = drafts.length;

  // ---- Current opted-in members for this month (same query as run-matcher) ----
  const { data: participations, error: participationErr } = await supabase
    .from("monthly_participation")
    .select(
      `member_id, topic_id, opted_in_at,
       members ( id, first_name, last_name, email, zipcode, lat, lng, language, parent_type, availability, match_priority, children, open_to_second_match )`
    )
    .eq("month", monthDate);

  if (participationErr) {
    console.error("Failed to fetch monthly_participation:", participationErr);
    process.exit(1);
  }

  const activeMembers = (participations ?? [])
    .map((p) => {
      const member = p.members;
      if (!member) return null;
      return { ...member, topic_id: p.topic_id, opted_in_at: p.opted_in_at };
    })
    .filter((m) => m !== null);

  out.optedInCount = activeMembers.length;

  // Also replicate prod route's EXACT select (no open_to_second_match column
  // fetched there) so the fresh run matches live behavior precisely.
  const activeMembersAsProdFetchesThem = activeMembers.map((m) => ({
    ...m,
    open_to_second_match: undefined,
  }));

  const { matched, unmatched, coordMap, doubleMatchedId } = await runMatcher(activeMembersAsProdFetchesThem);

  const roundScoreFresh = matched.length ? matched.reduce((s, p) => s + p.score, 0) / matched.length : 0;

  out.freshRun = {
    roundScore: roundScoreFresh,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` })),
    doubleMatchedId,
    pairs: matched.map((p) => ({
      key: pairKey(p.a.id, p.b.id),
      member_id_1: p.a.id,
      member_id_2: p.b.id,
      name1: `${p.a.first_name} ${p.a.last_name}`,
      name2: `${p.b.first_name} ${p.b.last_name}`,
      score: p.score,
      breakdown: p.breakdown,
      quality_tier: qualityTier(p.score, maxAchievableScore(p.a, p.b, coordMap)),
    })),
  };

  // ---- Member name lookup for draft rows ----
  const memberIds = new Set();
  for (const d of drafts) {
    memberIds.add(d.member_id_1);
    memberIds.add(d.member_id_2);
  }
  const memberMap = new Map(activeMembers.map((m) => [m.id, m]));
  const missingIds = [...memberIds].filter((id) => !memberMap.has(id));
  if (missingIds.length) {
    const { data: extraMembers } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .in("id", missingIds);
    for (const m of extraMembers ?? []) memberMap.set(m.id, m);
  }

  out.currentDraft = {
    roundScore: round?.round_score ?? null,
    pairs: drafts.map((d) => ({
      key: pairKey(d.member_id_1, d.member_id_2),
      member_id_1: d.member_id_1,
      member_id_2: d.member_id_2,
      name1: memberMap.get(d.member_id_1) ? `${memberMap.get(d.member_id_1).first_name} ${memberMap.get(d.member_id_1).last_name}` : d.member_id_1,
      name2: memberMap.get(d.member_id_2) ? `${memberMap.get(d.member_id_2).first_name} ${memberMap.get(d.member_id_2).last_name}` : d.member_id_2,
      score: d.score,
      breakdown: d.breakdown,
      quality_tier: d.quality_tier,
    })),
  };

  // ---- Diff ----
  const draftPairKeys = new Set(out.currentDraft.pairs.map((p) => p.key));
  const freshPairKeys = new Set(out.freshRun.pairs.map((p) => p.key));

  const unchanged = out.currentDraft.pairs.filter((p) => freshPairKeys.has(p.key));
  const onlyInDraft = out.currentDraft.pairs.filter((p) => !freshPairKeys.has(p.key));
  const onlyInFresh = out.freshRun.pairs.filter((p) => !draftPairKeys.has(p.key));

  // Members whose partner changed
  const draftPartnerOf = new Map();
  for (const p of out.currentDraft.pairs) {
    draftPartnerOf.set(p.member_id_1, { partnerId: p.member_id_2, name: p.name2, score: p.score, tier: p.quality_tier });
    draftPartnerOf.set(p.member_id_2, { partnerId: p.member_id_1, name: p.name1, score: p.score, tier: p.quality_tier });
  }
  const freshPartnerOf = new Map();
  for (const p of out.freshRun.pairs) {
    freshPartnerOf.set(p.member_id_1, { partnerId: p.member_id_2, name: p.name2, score: p.score, tier: p.quality_tier });
    freshPartnerOf.set(p.member_id_2, { partnerId: p.member_id_1, name: p.name1, score: p.score, tier: p.quality_tier });
  }

  const allMemberIdsForDiff = new Set([...draftPartnerOf.keys(), ...freshPartnerOf.keys()]);
  const partnerChanges = [];
  for (const id of allMemberIdsForDiff) {
    const d = draftPartnerOf.get(id);
    const f = freshPartnerOf.get(id);
    const dPartner = d?.partnerId ?? null;
    const fPartner = f?.partnerId ?? null;
    if (dPartner !== fPartner) {
      const name = memberMap.get(id) ? `${memberMap.get(id).first_name} ${memberMap.get(id).last_name}` : id;
      partnerChanges.push({
        memberId: id,
        name,
        draftPartner: d ? { name: d.name, score: Math.round(d.score), tier: d.tier } : null,
        algoPartner: f ? { name: f.name, score: Math.round(f.score), tier: f.tier } : null,
      });
    }
  }

  // Opted-in members missing from the draft round entirely (e.g. opted in after the round ran)
  const draftMemberIds = new Set([...memberIds]);
  const optedInIds = new Set(activeMembers.map((m) => m.id));
  const optedInButNotInDraft = activeMembers.filter((m) => !draftMemberIds.has(m.id));
  const inDraftButNotOptedIn = [...draftMemberIds].filter((id) => !optedInIds.has(id));

  out.diff = {
    unchangedPairCount: unchanged.length,
    onlyInDraft,
    onlyInFresh,
    partnerChanges,
    optedInButNotInDraft: optedInButNotInDraft.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, opted_in_at: m.opted_in_at })),
    inDraftButNotOptedInIds: inDraftButNotOptedIn,
  };

  // Members missing cached coordinates (would be geocoded live, changing proximity scores)
  out.membersWithoutCachedCoords = activeMembers
    .filter((m) => m.zipcode && (m.lat == null || m.lng == null))
    .map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, zipcode: m.zipcode }));

  writeFileSync(resolve(process.cwd(), "__match_diff_output.json"), JSON.stringify(out, null, 2));
  console.log("WROTE __match_diff_output.json");
  console.log(JSON.stringify({
    round: out.round,
    optedInCount: out.optedInCount,
    draftCount: out.draftCount,
    freshMatchedCount: out.freshRun.matchedCount,
    freshUnmatchedCount: out.freshRun.unmatchedCount,
    unchangedPairCount: out.diff.unchangedPairCount,
    onlyInDraftCount: out.diff.onlyInDraft.length,
    onlyInFreshCount: out.diff.onlyInFresh.length,
    partnerChangeCount: out.diff.partnerChanges.length,
    optedInButNotInDraftCount: out.diff.optedInButNotInDraft.length,
    inDraftButNotOptedInCount: out.diff.inDraftButNotOptedInIds.length,
    membersWithoutCachedCoordsCount: out.membersWithoutCachedCoords.length,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
