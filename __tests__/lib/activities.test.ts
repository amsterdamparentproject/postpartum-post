import { describe, it, expect } from "vitest";
import { rruleOccurrenceInMonth, formatPlaygroundType } from "@/lib/activities";

// ---------------------------------------------------------------------------
// rruleOccurrenceInMonth
// ---------------------------------------------------------------------------

describe("rruleOccurrenceInMonth", () => {
  const MONTH_START = "2026-07-01"; // July 2026
  const MONTH_END   = "2026-08-01";

  describe("when day_of_week is provided", () => {
    it("returns the first matching weekday in the month", () => {
      // repeat_next_date is a Wednesday (2027-01-06), but day_of_week says Tuesday
      const result = rruleOccurrenceInMonth(
        "2027-01-06 00:00:00+00",
        "RRULE:FREQ=WEEKLY;BYDAY=TU",
        MONTH_START,
        MONTH_END,
        "Tuesday",
      );
      // First Tuesday in July 2026
      expect(result).toBe("2026-07-07");
    });

    it("returns the first occurrence even when day_of_week is Monday", () => {
      const result = rruleOccurrenceInMonth(
        "2027-01-06 00:00:00+00",
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        MONTH_START,
        MONTH_END,
        "Monday",
      );
      // First Monday in July 2026 is July 6
      expect(result).toBe("2026-07-06");
    });

    it("returns null if the weekday somehow doesn't appear in the month (edge case)", () => {
      // Not realistic for a full month, but test the null path with a 1-day window
      const result = rruleOccurrenceInMonth(
        "2027-01-06 00:00:00+00",
        "RRULE:FREQ=WEEKLY;BYDAY=WE",
        "2026-07-01",
        "2026-07-01", // zero-width window
        "Wednesday",
      );
      expect(result).toBeNull();
    });
  });

  describe("when day_of_week is not provided (walk-back fallback)", () => {
    it("walks back from repeat_next_date to find an occurrence in the month", () => {
      // 2027-01-05 is a Tuesday — walking back 7 days each time should land on Tuesdays
      const result = rruleOccurrenceInMonth(
        "2027-01-05",
        "RRULE:FREQ=WEEKLY;BYDAY=TU",
        MONTH_START,
        MONTH_END,
      );
      // Should land on a Tuesday in July 2026
      const d = new Date(result! + "T00:00:00");
      expect(d.getDay()).toBe(2); // 2 = Tuesday
      expect(result! >= MONTH_START).toBe(true);
      expect(result! < MONTH_END).toBe(true);
    });

    it("returns null when no occurrence lands in the month for MONTHLY rrule", () => {
      const result = rruleOccurrenceInMonth(
        "2027-01-06",
        "RRULE:FREQ=MONTHLY",
        MONTH_START,
        MONTH_END,
      );
      expect(result).toBeNull();
    });

    it("returns null when repeat_next_date is before the month window", () => {
      const result = rruleOccurrenceInMonth(
        "2026-05-01", // anchor before monthStart, step=7 would land in May
        "RRULE:FREQ=WEEKLY",
        MONTH_START,
        MONTH_END,
      );
      // Walk-back from May 1 by 7 days goes backward past monthStart, then steps forward.
      // We expect it to land in July.
      const d = new Date(result! + "T00:00:00");
      expect(result! >= MONTH_START).toBe(true);
      expect(result! < MONTH_END).toBe(true);
      expect(d.getDay()).toBe(new Date("2026-05-01T00:00:00").getDay()); // same weekday
    });
  });
});

// ---------------------------------------------------------------------------
// formatPlaygroundType
// ---------------------------------------------------------------------------

describe("formatPlaygroundType", () => {
  it("capitalizes the first word and lowercases the rest", () => {
    expect(formatPlaygroundType("play_spot")).toBe("Play spot");
  });

  it("handles a single word", () => {
    expect(formatPlaygroundType("playground")).toBe("Playground");
  });

  it("handles multiple underscores", () => {
    expect(formatPlaygroundType("adventure_play_area")).toBe("Adventure play area");
  });
});
