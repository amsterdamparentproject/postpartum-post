/**
 * Matcher test suite — 10 scenarios
 *
 * Tests are organized around the exported pure functions (parentTypeCompatible,
 * scorePair) and the async orchestrator (runMatcher).  No network calls are
 * made — proximity is exercised by injecting a pre-computed coordMap, and the
 * Supabase client is replaced with a lightweight inline stub.
 *
 * Weight constants mirror the private W object in lib/matcher.ts:
 *   LANGUAGE: 1000  |  PARENT_TYPE: 1000  |  AVAILABILITY: 500  |  TOPIC: 250
 *   PRIORITY_HIGH: 100  |  PRIORITY_LOW: 50  |  MID: 75
 */

import { describe, it, expect } from "vitest";
import {
  parentTypeCompatible,
  scorePair,
  runMatcher,
  type MatchCandidate,
} from "@/lib/matcher";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Builds a MatchCandidate with every optional field null unless overridden. */
function member(
  overrides: Partial<MatchCandidate> & { id: string }
): MatchCandidate {
  return {
    first_name: "Test",
    last_name: "Member",
    email: `${overrides.id}@test.com`,
    zipcode: null,
    lat: null,
    lng: null,
    topic_id: null,
    language: null as string[] | null,
    parent_type: null,
    availability: null,
    match_priority: null,
    children: null,
    open_to_second_match: false,
    ...overrides,
  };
}

/** Coord map with no entries — proximity scores 0 for every pair. */
const NO_COORDS = new Map<string, { lat: number; lng: number }>();

/**
 * Minimal Supabase stub for runMatcher.
 * runMatcher only reads from the matches table (via getRecentlyMatchedPairs).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(recentRows: { member_id_1: string; member_id_2: string }[] = []): any {
  return {
    from: () => ({
      select: () => ({
        gte: () => Promise.resolve({ data: recentRows, error: null }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Language scoring
// ---------------------------------------------------------------------------

describe("Scenario 1: Language scoring", () => {
  it("awards 1000pts when both members share at least one language", () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(1000);
  });

  it("awards 1000pts when a bilingual member shares one language with a monolingual member", () => {
    const a = member({ id: "a", language: ["english", "dutch"] });
    const b = member({ id: "b", language: ["dutch"] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(1000);
  });

  it("awards 0pts when the two language lists have no overlap", () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["dutch"] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(0);
  });

  it("awards 500pts (half) when one member has no language preference (null or empty)", () => {
    const a = member({ id: "a", language: ["english"] });
    const noLang = member({ id: "b", language: null });
    const emptyLang = member({ id: "c", language: [] });
    expect(scorePair(a, noLang, NO_COORDS).breakdown.language).toBe(500);
    expect(scorePair(a, emptyLang, NO_COORDS).breakdown.language).toBe(500);
  });

  it("awards 0pts when both members have no language preference", () => {
    const a = member({ id: "a", language: null });
    const b = member({ id: "b", language: [] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — parent_type is a preference, not a hard exclusion
// ---------------------------------------------------------------------------

describe("Scenario 2: parent_type mismatches are penalised but not excluded", () => {
  it("parentTypeCompatible always returns true", () => {
    const mom = member({ id: "a", parent_type: "mom" });
    const dad = member({ id: "b", parent_type: "dad" });
    expect(parentTypeCompatible(mom, dad)).toBe(true);
  });

  it("mom + dad can be matched but scores 0 for parent_type", () => {
    const a = member({ id: "a", language: ["english"], parent_type: "mom" });
    const b = member({ id: "b", language: ["english"], parent_type: "dad" });
    const pair = scorePair(a, b, NO_COORDS);
    expect(pair.breakdown.parent_type).toBe(0);
  });

  it("runMatcher can pair a mom and a dad when no better option exists", async () => {
    const a = member({ id: "a", language: ["english"], parent_type: "mom" });
    const b = member({ id: "b", language: ["english"], parent_type: "dad" });
    const { matched } = await runMatcher([a, b], mockSupabase(), NO_COORDS);
    expect(matched).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — parent_type null / anyone → compatible with everything
// ---------------------------------------------------------------------------

describe("Scenario 3: null and 'anyone' parent_type is compatible with anything", () => {
  it("is compatible when one is null", () => {
    const mom = member({ id: "a", parent_type: "mom" });
    const noPreference = member({ id: "b", parent_type: null });
    expect(parentTypeCompatible(mom, noPreference)).toBe(true);
    expect(parentTypeCompatible(noPreference, mom)).toBe(true);
  });

  it("is compatible when both are null", () => {
    const a = member({ id: "a", parent_type: null });
    const b = member({ id: "b", parent_type: null });
    expect(parentTypeCompatible(a, b)).toBe(true);
  });

  it("is compatible when either is 'anyone'", () => {
    const anyone = member({ id: "a", parent_type: "anyone" });
    const dad = member({ id: "b", parent_type: "dad" });
    expect(parentTypeCompatible(anyone, dad)).toBe(true);
    expect(parentTypeCompatible(dad, anyone)).toBe(true);
  });

  it("awards 1000pts when both share the same non-anyone parent_type", () => {
    const a = member({ id: "a", parent_type: "mom" });
    const b = member({ id: "b", parent_type: "mom" });
    expect(scorePair(a, b, NO_COORDS).breakdown.parent_type).toBe(1000);
  });

  it("awards 1000pts when both are 'anyone'", () => {
    const a = member({ id: "a", parent_type: "anyone" });
    const b = member({ id: "b", parent_type: "anyone" });
    expect(scorePair(a, b, NO_COORDS).breakdown.parent_type).toBe(1000);
  });

  it("awards 0pts when only one is 'anyone' (compatible but not a shared preference)", () => {
    const anyone = member({ id: "a", parent_type: "anyone" });
    const mom = member({ id: "b", parent_type: "mom" });
    expect(scorePair(anyone, mom, NO_COORDS).breakdown.parent_type).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Availability Jaccard similarity
// ---------------------------------------------------------------------------

describe("Scenario 4: Availability Jaccard similarity scales score", () => {
  const baseAvailability = {
    days: ["monday", "tuesday", "wednesday", "thursday"],
    times: ["morning", "afternoon"],
  };

  it("scores high overlap pair at 300pts (Jaccard days=0.6, times ignored)", () => {
    // Shares mon/tue/wed (3) but not thu; B adds fri. Union=5. J=3/5=0.6
    // ENABLE_TIME_OF_DAY=false → days only. Score = 0.6 * 500 = 300
    const a = member({ id: "a", availability: baseAvailability });
    const b = member({
      id: "b",
      availability: {
        days: ["monday", "tuesday", "wednesday", "friday"],
        times: ["morning", "afternoon"],
      },
    });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBe(300);
  });

  it("scores zero overlap pair at 0pts", () => {
    const a = member({ id: "a", availability: baseAvailability });
    const c = member({
      id: "c",
      availability: { days: ["friday"], times: ["evening"] },
    });
    expect(scorePair(a, c, NO_COORDS).breakdown.availability).toBe(0);
  });

  it("high-overlap pair availability score exceeds low-overlap pair", () => {
    const a = member({ id: "a", availability: baseAvailability });
    const b = member({
      id: "b",
      availability: {
        days: ["monday", "tuesday", "wednesday", "friday"],
        times: ["morning", "afternoon"],
      },
    });
    const c = member({
      id: "c",
      availability: { days: ["friday"], times: ["evening"] },
    });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBeGreaterThan(
      scorePair(a, c, NO_COORDS).breakdown.availability
    );
  });

  it("awards 250pts (half) when one member has no availability set", () => {
    const a = member({ id: "a", availability: baseAvailability });
    const b = member({ id: "b", availability: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBe(250);
  });

  it("awards 0pts when both members have no availability set", () => {
    const a = member({ id: "a", availability: null });
    const b = member({ id: "b", availability: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Topic scoring
// ---------------------------------------------------------------------------

describe("Scenario 5: Topic scoring", () => {
  const TOPIC_A = "topic-uuid-1111";
  const TOPIC_B = "topic-uuid-2222";

  it("awards 250pts when both members share the same topic", () => {
    const a = member({ id: "a", topic_id: TOPIC_A });
    const b = member({ id: "b", topic_id: TOPIC_A });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(250);
  });

  it("awards 0pts when both have different topics", () => {
    const a = member({ id: "a", topic_id: TOPIC_A });
    const b = member({ id: "b", topic_id: TOPIC_B });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(0);
  });

  it("awards 125pts (half) when one member has no topic", () => {
    const a = member({ id: "a", topic_id: TOPIC_A });
    const b = member({ id: "b", topic_id: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(125);
  });

  it("awards 0pts when both members have no topic", () => {
    const a = member({ id: "a", topic_id: null });
    const b = member({ id: "b", topic_id: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — match_priority='proximity' weights proximity over children
// ---------------------------------------------------------------------------

describe("Scenario 6: match_priority='proximity' upweights proximity over children", () => {
  // A is at Amsterdam Centraal, B is ~5 km north.
  // rawProximity ≈ 1 - 5/15 ≈ 0.667 → breakdown.proximity ≈ 66.7 (× 100)
  // Children have a 12-month gap → rawChildren = 0.5 → breakdown.children = 25 (× 50)
  const coordMap = new Map([
    ["a", { lat: 52.3676, lng: 4.9041 }],
    ["b", { lat: 52.4126, lng: 4.9041 }], // ~5 km north
  ]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const pastDate = new Date(now);
  pastDate.setMonth(pastDate.getMonth() - 12);
  const pastMonth = pastDate.getMonth() + 1;
  const pastYear = pastDate.getFullYear();

  it("proximity breakdown exceeds children breakdown when both prefer proximity", () => {
    const a = member({
      id: "a",
      zipcode: "1012",
      lat: 52.3676,
      lng: 4.9041,
      match_priority: "proximity",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      zipcode: "1013",
      lat: 52.4126,
      lng: 4.9041,
      match_priority: "proximity",
      children: [{ birth_month: pastMonth, birth_year: pastYear, expected: false }],
    });
    const { breakdown } = scorePair(a, b, coordMap);
    expect(breakdown.proximity).toBeGreaterThan(breakdown.children);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — match_priority='age' weights children over proximity
// ---------------------------------------------------------------------------

describe("Scenario 7: match_priority='age' upweights children over proximity", () => {
  const coordMap = new Map([
    ["a", { lat: 52.3676, lng: 4.9041 }],
    ["b", { lat: 52.4126, lng: 4.9041 }],
  ]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const pastDate = new Date(now);
  pastDate.setMonth(pastDate.getMonth() - 12);
  const pastMonth = pastDate.getMonth() + 1;
  const pastYear = pastDate.getFullYear();

  it("children breakdown exceeds proximity breakdown when both prefer age", () => {
    const a = member({
      id: "a",
      zipcode: "1012",
      lat: 52.3676,
      lng: 4.9041,
      match_priority: "age",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      zipcode: "1013",
      lat: 52.4126,
      lng: 4.9041,
      match_priority: "age",
      children: [{ birth_month: pastMonth, birth_year: pastYear, expected: false }],
    });
    const { breakdown } = scorePair(a, b, coordMap);
    expect(breakdown.children).toBeGreaterThan(breakdown.proximity);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Children age gap scoring
// ---------------------------------------------------------------------------

describe("Scenario 8: Children age gap scoring", () => {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  // A child born 25 months ago
  const farPast = new Date(now);
  farPast.setMonth(farPast.getMonth() - 25);
  const farPastMonth = farPast.getMonth() + 1;
  const farPastYear = farPast.getFullYear();

  it("scores near-maximum when both members have same-month children (gap = 0)", () => {
    const a = member({
      id: "a",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    // gap=0 → rawScore=1.0; mid weight=75 → breakdown.children = 75
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(75);
  });

  it("scores 0 when the closest child pair is 25+ months apart", () => {
    const a = member({
      id: "a",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      children: [{ birth_month: farPastMonth, birth_year: farPastYear, expected: false }],
    });
    // gap=25 months >= MAX(24) → rawScore=0 → breakdown.children = 0
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(0);
  });

  it("scores half weight (37.5) when one member has no children set", () => {
    const a = member({
      id: "a",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({ id: "b", children: null });
    // rawScore=0.5 × mid weight 75 = 37.5
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(37.5);
  });

  it("scores 0 when both members have no children set", () => {
    const a = member({ id: "a", children: null });
    const b = member({ id: "b", children: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(0);
  });

  it("treats expected children as younger than same-month newborns (due date used as age)", () => {
    // Due next month → age ≈ −1. Newborn → age ≈ 0. Gap = 1 month.
    // rawScore = 1 − 1/24 ≈ 0.958. × 75 ≈ 71.9 — high but slightly below 75.
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const nextMonthYear = curMonth === 12 ? curYear + 1 : curYear;
    const a = member({
      id: "a",
      children: [{ birth_month: nextMonth, birth_year: nextMonthYear, expected: true }],
    });
    const b = member({
      id: "b",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const score = scorePair(a, b, NO_COORDS).breakdown.children;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(75); // slightly penalised vs same-month
  });

  it("ranks two pregnant members with close due dates higher than those with distant due dates", () => {
    // Close pair: both due next month → gap = 0 → score = 75
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const nextMonthYear = curMonth === 12 ? curYear + 1 : curYear;

    // Distant pair: one due next month, one due in 7 months → gap = 6 months
    const farDate = new Date(now);
    farDate.setMonth(farDate.getMonth() + 7);
    const farMonth = farDate.getMonth() + 1;
    const farYear = farDate.getFullYear();

    const dueSoon1 = member({
      id: "ds1",
      children: [{ birth_month: nextMonth, birth_year: nextMonthYear, expected: true }],
    });
    const dueSoon2 = member({
      id: "ds2",
      children: [{ birth_month: nextMonth, birth_year: nextMonthYear, expected: true }],
    });
    const dueLater = member({
      id: "dl",
      children: [{ birth_month: farMonth, birth_year: farYear, expected: true }],
    });

    const closePairScore = scorePair(dueSoon1, dueSoon2, NO_COORDS).breakdown.children;
    const distantPairScore = scorePair(dueSoon1, dueLater, NO_COORDS).breakdown.children;

    expect(closePairScore).toBeGreaterThan(distantPairScore);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — 6-month window excludes recently matched pairs
// ---------------------------------------------------------------------------

describe("Scenario 9: 6-month window excludes recently matched pairs", () => {
  it("does not pair two members who were matched within the last 6 months", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] }); // perfect match otherwise
    const supabase = mockSupabase([{ member_id_1: "a", member_id_2: "b" }]);
    const { matched, unmatched } = await runMatcher([a, b], supabase, NO_COORDS);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(2);
  });

  it("still pairs other members even when one pair is excluded", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] }); // excluded with A
    const c = member({ id: "c", language: ["english"] });
    const d = member({ id: "d", language: ["english"] });
    // A+B are recently matched. All 4 share a language so A→C/D and B→C/D
    // are still valid. The A+B pair itself should never appear in results.
    const supabase = mockSupabase([{ member_id_1: "a", member_id_2: "b" }]);
    const { matched } = await runMatcher([a, b, c, d], supabase, NO_COORDS);

    // A+B should never be paired together
    const abPair = matched.find(
      (p) =>
        (p.a.id === "a" && p.b.id === "b") ||
        (p.a.id === "b" && p.b.id === "a")
    );
    expect(abPair).toBeUndefined();

    // The other 4-way matchable pool should result in 2 pairs
    expect(matched).toHaveLength(2);
    const matchedIds = matched.flatMap((p) => [p.a.id, p.b.id]);
    expect(matchedIds).toContain("c");
    expect(matchedIds).toContain("d");
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — Greedy algorithm picks highest-score pair first
// ---------------------------------------------------------------------------

// (Scenarios 11–12 are below Scenario 10)

describe("Scenario 10: Greedy algorithm assigns highest-score pair first", () => {
  it("picks the best scoring pair, leaving the third member unmatched", async () => {
    // score(A, B) = 1000 — shared language
    // score(A, C) = 400  — shared availability
    // score(B, C) = 0    — nothing in common
    const a = member({
      id: "a",
      language: ["english"],
      availability: { days: ["monday", "tuesday", "wednesday", "thursday"], times: ["morning", "afternoon"] },
    });
    const b = member({
      id: "b",
      language: ["english"],
      // no availability → availability score with A = 0
    });
    const c = member({
      id: "c",
      language: ["dutch"],
      availability: {
        days: ["monday", "tuesday", "wednesday", "friday"],
        times: ["morning", "afternoon"],
      },
    });

    const { matched, unmatched } = await runMatcher(
      [a, b, c],
      mockSupabase(),
      NO_COORDS
    );

    // A+B should win (language=1000 beats availability=400)
    expect(matched).toHaveLength(1);
    const pairedIds = [matched[0].a.id, matched[0].b.id];
    expect(pairedIds).toContain("a");
    expect(pairedIds).toContain("b");

    // C is left without a partner
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].id).toBe("c");
  });

  it("correctly pairs four members into two optimal pairs", async () => {
    // A↔B: 1000 (language English), C↔D: 1000 (language Dutch)
    // All cross pairs: 0
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    const c = member({ id: "c", language: ["dutch"] });
    const d = member({ id: "d", language: ["dutch"] });

    const { matched, unmatched } = await runMatcher(
      [a, b, c, d],
      mockSupabase(),
      NO_COORDS
    );

    expect(matched).toHaveLength(2);
    expect(unmatched).toHaveLength(0);

    const pairA = matched.find(
      (p) => p.a.id === "a" || p.b.id === "a"
    )!;
    const pairC = matched.find(
      (p) => p.a.id === "c" || p.b.id === "c"
    )!;

    expect([pairA.a.id, pairA.b.id]).toContain("b");
    expect([pairC.a.id, pairC.b.id]).toContain("d");
  });
});

// ---------------------------------------------------------------------------
// Scenario 11 — Odd-pool: open_to_second_match absorbs the leftover
// ---------------------------------------------------------------------------

describe("Scenario 11: Odd-pool resolution via open_to_second_match", () => {
  it("pairs the leftover with the best willing candidate when pool is odd", async () => {
    // A↔B matched (both English). C is the leftover.
    // B is open_to_second_match; A is not.
    // B scores higher with C (shared language) than A does, so B gets the second match.
    const a = member({ id: "a", language: ["english"], open_to_second_match: false });
    const b = member({ id: "b", language: ["english", "dutch"], open_to_second_match: true });
    const c = member({ id: "c", language: ["dutch"] });

    const { matched, unmatched, doubleMatchedId } = await runMatcher(
      [a, b, c],
      mockSupabase(),
      NO_COORDS
    );

    // All three are matched — no one left out
    expect(unmatched).toHaveLength(0);
    // Three pairs total: A↔B (original) + B↔C (second match)
    expect(matched).toHaveLength(2);
    // B is the double-matched member
    expect(doubleMatchedId).toBe("b");
    // C appears in one of the pairs
    const cPair = matched.find((p) => p.a.id === "c" || p.b.id === "c");
    expect(cPair).toBeDefined();
  });

  it("leaves the leftover unmatched when no willing candidate exists", async () => {
    const a = member({ id: "a", language: ["english"], open_to_second_match: false });
    const b = member({ id: "b", language: ["english"], open_to_second_match: false });
    const c = member({ id: "c", language: ["dutch"] });

    const { matched, unmatched, doubleMatchedId } = await runMatcher(
      [a, b, c],
      mockSupabase(),
      NO_COORDS
    );

    expect(matched).toHaveLength(1);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].id).toBe("c");
    expect(doubleMatchedId).toBeUndefined();
  });

  it("does not attempt odd-pool resolution when pool is even", async () => {
    const a = member({ id: "a", language: ["english"], open_to_second_match: true });
    const b = member({ id: "b", language: ["english"] });
    const c = member({ id: "c", language: ["dutch"] });
    const d = member({ id: "d", language: ["dutch"] });

    const { matched, unmatched, doubleMatchedId } = await runMatcher(
      [a, b, c, d],
      mockSupabase(),
      NO_COORDS
    );

    expect(matched).toHaveLength(2);
    expect(unmatched).toHaveLength(0);
    expect(doubleMatchedId).toBeUndefined();
  });

  it("picks the willing candidate with the highest score against the leftover", async () => {
    // A↔B matched. C is the leftover. B shares a language with C; A does not.
    // B should be picked over A even if A is also willing.
    const a = member({ id: "a", language: ["english"], open_to_second_match: true });
    const b = member({ id: "b", language: ["english", "dutch"], open_to_second_match: true });
    const c = member({ id: "c", language: ["dutch"] });

    const { doubleMatchedId } = await runMatcher(
      [a, b, c],
      mockSupabase(),
      NO_COORDS
    );

    // B scores 1000 with C (shared dutch); A scores 0 with C — B must be chosen
    expect(doubleMatchedId).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — Self-match prevention
// ---------------------------------------------------------------------------

describe("Scenario 12: A member is never matched with themselves", () => {
  it("does not produce a self-pair even when the same ID appears twice in the pool", async () => {
    const a = member({ id: "a", language: ["english"] });
    const duplicate = member({ id: "a", language: ["english"] }); // same ID

    const { matched, unmatched } = await runMatcher(
      [a, duplicate],
      mockSupabase(),
      NO_COORDS
    );

    expect(matched).toHaveLength(0);
    expect(unmatched.map((m) => m.id)).toContain("a");
  });

  it("does not use the leftover member as their own odd-pool double-match", async () => {
    const a = member({ id: "a", language: ["english"], open_to_second_match: true });
    const b = member({ id: "b", language: ["english"], open_to_second_match: true });
    const leftover = member({ id: "b", language: ["english"] }); // same ID as b

    const { doubleMatchedId } = await runMatcher(
      [a, b, leftover],
      mockSupabase(),
      NO_COORDS
    );

    // b must not be matched with itself
    expect(doubleMatchedId).not.toBe("b");
  });
});

// ---------------------------------------------------------------------------
// Scenario 12 — Monthly participation: topic_id flows through to scoring
// ---------------------------------------------------------------------------

describe("Scenario 12: Per-month topic_id from monthly_participation is used for scoring", () => {
  const COFFEE_ID = "topic-uuid-coffee";
  const PLAYDATE_ID = "topic-uuid-playdate";

  it("scores 250pts when members' per-month topic choices match", () => {
    // Simulates run-matcher merging monthly_participation.topic_id into the candidate
    const a = member({ id: "a", topic_id: COFFEE_ID });
    const b = member({ id: "b", topic_id: COFFEE_ID });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(250);
  });

  it("scores 0pts when members chose different topics this month", () => {
    const a = member({ id: "a", topic_id: COFFEE_ID });
    const b = member({ id: "b", topic_id: PLAYDATE_ID });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(0);
  });

  it("prefers a same-topic pair over a cross-topic pair at equal language score", async () => {
    // All four share English, so language is equal across all pairs.
    // A and B both chose coffee; C and D both chose playdate.
    // Matcher should produce A↔B and C↔D (same topic) over A↔C or A↔D.
    const a = member({ id: "a", language: ["english"], topic_id: COFFEE_ID });
    const b = member({ id: "b", language: ["english"], topic_id: COFFEE_ID });
    const c = member({ id: "c", language: ["english"], topic_id: PLAYDATE_ID });
    const d = member({ id: "d", language: ["english"], topic_id: PLAYDATE_ID });

    const { matched } = await runMatcher([a, b, c, d], mockSupabase(), NO_COORDS);

    expect(matched).toHaveLength(2);
    const pairA = matched.find((p) => p.a.id === "a" || p.b.id === "a")!;
    expect([pairA.a.id, pairA.b.id]).toContain("b");
    const pairC = matched.find((p) => p.a.id === "c" || p.b.id === "c")!;
    expect([pairC.a.id, pairC.b.id]).toContain("d");
  });
});
