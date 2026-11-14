import { describe, it, expect, vi } from "vitest";
import { getDeskFeed, DESK_FEED_TTL_MS, type FeedDeps, type DeskFeed } from "@/lib/desk-feed";

const feed = (n: number): DeskFeed => ({ events: [], locations: [{ id: String(n) } as never] });
const make = (over: Partial<FeedDeps> = {}): FeedDeps => ({
  read: vi.fn().mockResolvedValue(null),
  write: vi.fn().mockResolvedValue(undefined),
  fetchDesk: vi.fn().mockResolvedValue(feed(2)),
  now: () => 1_000_000_000,
  ...over,
});

describe("getDeskFeed", () => {
  it("serves a fresh cache without calling Desk", async () => {
    const deps = make({ read: vi.fn().mockResolvedValue({ payload: feed(1), fetchedAt: 1_000_000_000 - 1000 }) });
    expect(await getDeskFeed("a", "b", deps)).toEqual(feed(1));
    expect(deps.fetchDesk).not.toHaveBeenCalled();
  });
  it("refreshes a stale cache and stores it", async () => {
    const deps = make({ read: vi.fn().mockResolvedValue({ payload: feed(1), fetchedAt: 1_000_000_000 - DESK_FEED_TTL_MS - 1 }) });
    expect(await getDeskFeed("a", "b", deps)).toEqual(feed(2));
    expect(deps.write).toHaveBeenCalledWith("a..b", feed(2));
  });
  it("serves the stale copy when Desk is down", async () => {
    const deps = make({
      read: vi.fn().mockResolvedValue({ payload: feed(1), fetchedAt: 0 }),
      fetchDesk: vi.fn().mockRejectedValue(new Error("down")),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getDeskFeed("a", "b", deps)).toEqual(feed(1));
  });
  it("returns null on a cold cache with Desk down", async () => {
    const deps = make({ fetchDesk: vi.fn().mockRejectedValue(new Error("down")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getDeskFeed("a", "b", deps)).toBeNull();
  });
});
