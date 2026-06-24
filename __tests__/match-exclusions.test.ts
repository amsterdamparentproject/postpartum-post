/**
 * Match exclusions test suite
 *
 * Covers four areas:
 *   1. getPermanentExclusions() — builds the correct pair-key set
 *   2. runMatcher() — permanently excluded pairs are never matched
 *   3. addExclusion() server action — rejects duplicates, self-exclusions, unknown emails
 *   4. requestRematch() server action — inserts an exclusion row; skips if one already exists
 *
 * All Supabase I/O is replaced with inline stubs.
 * next/navigation.redirect is mocked so server action tests don't throw.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPermanentExclusions,
  runMatcher,
  type MatchCandidate,
} from "@/lib/matcher";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Build a MatchCandidate with sensible defaults. */
function member(overrides: Partial<MatchCandidate> & { id: string }): MatchCandidate {
  return {
    first_name: "Test",
    last_name: "Member",
    email: `${overrides.id}@test.com`,
    zipcode: null,
    lat: null,
    lng: null,
    topic_id: null,
    language: null,
    parent_type: null,
    availability: null,
    match_priority: null,
    children: null,
    open_to_second_match: false,
    ...overrides,
  };
}

const NO_COORDS = new Map<string, { lat: number; lng: number }>();

// ---------------------------------------------------------------------------
// Scenario A — getPermanentExclusions builds pair keys correctly
// ---------------------------------------------------------------------------

describe("getPermanentExclusions: builds pair-key set", () => {
  it("returns an empty set when the table has no rows", async () => {
    const supabase = {
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    };
    const result = await getPermanentExclusions(supabase as never);
    expect(result.size).toBe(0);
  });

  it("produces a sorted 'id1:id2' key regardless of column order in the DB", async () => {
    // member_id_1='b', member_id_2='a' → key should be 'a:b' (alphabetically sorted)
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ member_id_1: "b", member_id_2: "a" }],
            error: null,
          }),
      }),
    };
    const result = await getPermanentExclusions(supabase as never);
    expect(result.has("a:b")).toBe(true);
    expect(result.has("b:a")).toBe(false);
  });

  it("produces the same key regardless of which member is id_1 vs id_2", async () => {
    const supabaseNormal = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ member_id_1: "alice", member_id_2: "bob" }],
            error: null,
          }),
      }),
    };
    const supabaseFlipped = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [{ member_id_1: "bob", member_id_2: "alice" }],
            error: null,
          }),
      }),
    };
    const r1 = await getPermanentExclusions(supabaseNormal as never);
    const r2 = await getPermanentExclusions(supabaseFlipped as never);
    // Both should produce the same single key
    expect([...r1]).toEqual([...r2]);
  });

  it("handles multiple exclusion rows", async () => {
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({
            data: [
              { member_id_1: "a", member_id_2: "b" },
              { member_id_1: "c", member_id_2: "d" },
              { member_id_1: "e", member_id_2: "a" },
            ],
            error: null,
          }),
      }),
    };
    const result = await getPermanentExclusions(supabase as never);
    expect(result.size).toBe(3);
    expect(result.has("a:b")).toBe(true);
    expect(result.has("c:d")).toBe(true);
    expect(result.has("a:e")).toBe(true);
  });

  it("returns an empty set and logs when the query errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      from: () => ({
        select: () =>
          Promise.resolve({ data: null, error: new Error("DB error") }),
      }),
    };
    const result = await getPermanentExclusions(supabase as never);
    expect(result.size).toBe(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[matcher]"),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Scenario B — runMatcher respects permanent exclusions
// ---------------------------------------------------------------------------

/**
 * Dual-table mock: handles both the `matches` table (gte chain for recent pairs)
 * and the `match_exclusions` table (plain select for permanent exclusions).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(
  recentRows: { member_id_1: string; member_id_2: string }[] = [],
  exclusionRows: { member_id_1: string; member_id_2: string }[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    from: (table: string) => {
      if (table === "match_exclusions") {
        return {
          select: () => Promise.resolve({ data: exclusionRows, error: null }),
        };
      }
      // matches table — recent pairs query chains .gte()
      return {
        select: () => ({
          gte: () => Promise.resolve({ data: recentRows, error: null }),
        }),
      };
    },
  };
}

describe("runMatcher: permanent exclusions prevent pairing", () => {
  it("does not pair two members in match_exclusions", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    const supabase = mockSupabase([], [{ member_id_1: "a", member_id_2: "b" }]);
    const { matched, unmatched } = await runMatcher([a, b], supabase, NO_COORDS);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(2);
  });

  it("excludes the pair regardless of column order in the DB row", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    // Stored with IDs reversed
    const supabase = mockSupabase([], [{ member_id_1: "b", member_id_2: "a" }]);
    const { matched } = await runMatcher([a, b], supabase, NO_COORDS);
    expect(matched).toHaveLength(0);
  });

  it("still matches other valid pairs when one pair is permanently excluded", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] }); // excluded with a
    const c = member({ id: "c", language: ["english"] });
    const d = member({ id: "d", language: ["english"] });
    const supabase = mockSupabase([], [{ member_id_1: "a", member_id_2: "b" }]);
    const { matched } = await runMatcher([a, b, c, d], supabase, NO_COORDS);

    // a+b must never appear together
    const abPair = matched.find(
      (p) =>
        (p.a.id === "a" && p.b.id === "b") ||
        (p.a.id === "b" && p.b.id === "a")
    );
    expect(abPair).toBeUndefined();

    // The remaining two pairs should still be matched (a+c or a+d, b+c or b+d, etc.)
    expect(matched).toHaveLength(2);
  });

  it("treats permanent exclusions and recent-match exclusions as additive", async () => {
    // a+b recently matched, c+d permanently excluded
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    const c = member({ id: "c", language: ["english"] });
    const d = member({ id: "d", language: ["english"] });
    const supabase = mockSupabase(
      [{ member_id_1: "a", member_id_2: "b" }],
      [{ member_id_1: "c", member_id_2: "d" }]
    );
    const { matched } = await runMatcher([a, b, c, d], supabase, NO_COORDS);

    const abPair = matched.find(
      (p) => (p.a.id === "a" || p.b.id === "a") && (p.a.id === "b" || p.b.id === "b")
    );
    const cdPair = matched.find(
      (p) => (p.a.id === "c" || p.b.id === "c") && (p.a.id === "d" || p.b.id === "d")
    );

    expect(abPair).toBeUndefined();
    expect(cdPair).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario C — addExclusion server action
// ---------------------------------------------------------------------------

describe("addExclusion: validates and inserts exclusion rows", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns not_found when the email doesn't match any member", async () => {
    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }));

    const { addExclusion } = await import("@/app/(account)/matches/actions");
    const result = await addExclusion("member-1", "unknown@example.com");
    expect(result).toEqual({ success: false, error: "not_found" });
  });

  it("returns self when the email belongs to the requesting member", async () => {
    const MEMBER_ID = "member-self-123";

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: MEMBER_ID, first_name: "Alice", last_name: "A", email: "alice@example.com" },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }));

    const { addExclusion } = await import("@/app/(account)/matches/actions");
    const result = await addExclusion(MEMBER_ID, "alice@example.com");
    expect(result).toEqual({ success: false, error: "self" });
  });

  it("returns already_excluded when an exclusion already exists for the pair", async () => {
    let callCount = 0;

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "members") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "target-id", first_name: "Bob", last_name: "B", email: "bob@example.com" },
                      error: null,
                    }),
                }),
              }),
            };
          }
          // match_exclusions — first call is the existence check
          callCount++;
          return {
            select: () => ({
              or: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id: "existing-exclusion-id" }, error: null }),
              }),
            }),
          };
        },
      }),
    }));

    const { addExclusion } = await import("@/app/(account)/matches/actions");
    const result = await addExclusion("member-1", "bob@example.com");
    expect(result).toEqual({ success: false, error: "already_excluded" });
    expect(callCount).toBeGreaterThan(0);
  });

  it("returns success with the new exclusion when all checks pass", async () => {
    const NOW = new Date().toISOString();

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "members") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "target-id", first_name: "Carol", last_name: "C", email: "carol@example.com" },
                      error: null,
                    }),
                }),
              }),
            };
          }
          // match_exclusions
          return {
            select: () => ({
              or: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "new-exclusion-id", created_at: NOW }, error: null }),
              }),
            }),
          };
        },
      }),
    }));

    const { addExclusion } = await import("@/app/(account)/matches/actions");
    const result = await addExclusion("member-1", "carol@example.com");
    expect(result).toEqual({
      success: true,
      exclusion: {
        id: "new-exclusion-id",
        otherMemberName: "Carol C",
        otherMemberEmail: "carol@example.com",
        createdAt: NOW,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario D — requestRematch server action
// ---------------------------------------------------------------------------

// Silence next/navigation.redirect in tests
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("requestRematch: inserts match_exclusion on rematch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("inserts a match_exclusion row when none exists", async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const MATCH = { id: "match-1", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                eq: () => ({
                  or: () => ({
                    single: () => Promise.resolve({ data: MATCH, error: null }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            };
          }
          if (table === "members") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            };
          }
          // match_exclusions
          return {
            select: () => ({
              or: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            insert: insertSpy,
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    await requestRematch("m1", "no_response", "match-1").catch(() => {
      // redirect() throws in the test environment — that's expected
    });

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        member_id_1: "m1",
        member_id_2: "m2",
        created_by: "rematch_request",
      })
    );
  });

  it("skips the insert when an exclusion already exists for the pair", async () => {
    const insertSpy = vi.fn();
    const MATCH = { id: "match-1", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                eq: () => ({
                  or: () => ({
                    single: () => Promise.resolve({ data: MATCH, error: null }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            };
          }
          // match_exclusions — existing row found
          return {
            select: () => ({
              or: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id: "existing-excl" }, error: null }),
              }),
            }),
            insert: insertSpy,
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    await requestRematch("m1", "no_response", "match-1").catch(() => {});

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("throws when the match is not found", async () => {
    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                single: () => Promise.resolve({ data: null, error: new Error("not found") }),
              }),
            }),
          }),
        }),
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    await expect(requestRematch("m1", "no_response", "missing-match-id")).rejects.toThrow(
      "Match not found"
    );
  });

  it("sets flagged_for_review=true for safety_concern", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    const MATCH = { id: "match-1", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                eq: () => ({
                  or: () => ({
                    single: () => Promise.resolve({ data: MATCH, error: null }),
                  }),
                }),
              }),
              update: updateSpy,
            };
          }
          return {
            select: () => ({
              or: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    await requestRematch("m1", "safety_concern", "match-1").catch(() => {});

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ flagged_for_review: true })
    );
  });

  it("sets flagged_for_review=true for harassment", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    const MATCH = { id: "match-1", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                eq: () => ({
                  or: () => ({
                    single: () => Promise.resolve({ data: MATCH, error: null }),
                  }),
                }),
              }),
              update: updateSpy,
            };
          }
          return {
            select: () => ({
              or: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    await requestRematch("m1", "harassment", "match-1").catch(() => {});

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ flagged_for_review: true })
    );
  });

  it("sets flagged_for_review=false for benign reasons", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    const MATCH = { id: "match-1", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                eq: () => ({
                  or: () => ({
                    single: () => Promise.resolve({ data: MATCH, error: null }),
                  }),
                }),
              }),
              update: updateSpy,
            };
          }
          return {
            select: () => ({
              or: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    for (const reason of ["no_response", "already_met", "not_a_good_fit", "other"]) {
      vi.resetModules();
      await requestRematch("m1", reason, "match-1").catch(() => {});
    }

    // Every call must have flagged_for_review=false
    for (const call of updateSpy.mock.calls) {
      expect(call[0]).toMatchObject({ flagged_for_review: false });
    }
  });

  it("writes rematch_requested, rematch_reason, and rematch_requested_by to the match row", async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    const MATCH = { id: "match-1", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                eq: () => ({
                  or: () => ({
                    single: () => Promise.resolve({ data: MATCH, error: null }),
                  }),
                }),
              }),
              update: updateSpy,
            };
          }
          return {
            select: () => ({
              or: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    await requestRematch("m1", "no_response", "match-1").catch(() => {});

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        rematch_requested: true,
        rematch_reason: "no_response",
        rematch_requested_by: "m1",
      })
    );
  });

  it("falls back to the current-month match when no matchId is provided", async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const MATCH = { id: "month-match", member_id_1: "m1", member_id_2: "m2" };

    vi.doMock("@/lib/supabase", () => ({
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === "matches") {
            return {
              select: () => ({
                or: () => ({
                  gte: () => ({
                    order: () => ({
                      limit: () => ({
                        single: () => Promise.resolve({ data: MATCH, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            };
          }
          if (table === "members") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              or: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            insert: insertSpy,
          };
        },
      }),
    }));

    const { requestRematch } = await import("@/app/actions/rematch");
    // No matchId passed — should resolve via the fallback path
    await requestRematch("m1", "no_response").catch(() => {});

    expect(insertSpy).toHaveBeenCalledOnce();
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ member_id_1: "m1", member_id_2: "m2" })
    );
  });
});
