import { describe, it, expect } from "vitest";
import {
  emptyPerkInput,
  normalizePerkInput,
  PERK_DESCRIPTION_MAX,
  PERK_TITLE_MAX,
  type PerkInput,
} from "@/lib/perk-input";

/** Pure — no DB. The one place perk field rules live (lib/perk-input.ts). */

function input(overrides: Partial<PerkInput> = {}): PerkInput {
  return {
    ...emptyPerkInput(),
    title: "20% off your first class",
    description: "Valid on any weekday class.",
    redemption_type: "code",
    redemption_code: "POSTPARTUMPOST20",
    ...overrides,
  };
}

describe("normalizePerkInput", () => {
  it("trims and passes a valid code perk through", () => {
    const result = normalizePerkInput(input({ title: "  20% off  ", redemption_code: " CODE " }));
    expect(result).toEqual({
      ok: true,
      row: {
        title: "20% off",
        description: "Valid on any weekday class.",
        redemption_type: "code",
        redemption_code: "CODE",
        url: null,
        expires_at: null,
        exclusive: false,
      },
    });
  });

  it("requires a headline and description", () => {
    expect(normalizePerkInput(input({ title: "  " })).ok).toBe(false);
    expect(normalizePerkInput(input({ description: "" })).ok).toBe(false);
  });

  it("enforces the length limits", () => {
    expect(normalizePerkInput(input({ title: "x".repeat(PERK_TITLE_MAX) })).ok).toBe(true);
    expect(normalizePerkInput(input({ title: "x".repeat(PERK_TITLE_MAX + 1) })).ok).toBe(false);
    expect(normalizePerkInput(input({ description: "x".repeat(PERK_DESCRIPTION_MAX + 1) })).ok).toBe(false);
  });

  it("requires a code for a code perk", () => {
    expect(normalizePerkInput(input({ redemption_code: " " })).ok).toBe(false);
  });

  it("requires a link for an online perk", () => {
    expect(normalizePerkInput(input({ redemption_type: "online", url: " " })).ok).toBe(false);
    expect(normalizePerkInput(input({ redemption_type: "online", url: "https://example.com" })).ok).toBe(true);
  });

  it("keeps an optional link on code and in-person perks", () => {
    const code = normalizePerkInput(input({ url: " https://example.com/book " }));
    const inPerson = normalizePerkInput(input({ redemption_type: "in_person", url: "https://example.com/cafe" }));
    expect(code.ok && code.row.url).toBe("https://example.com/book");
    expect(inPerson.ok && inPerson.row.url).toBe("https://example.com/cafe");
    expect(inPerson.ok && inPerson.row.redemption_code).toBeNull();
  });

  it("needs neither for an in-person perk", () => {
    const result = normalizePerkInput(input({ redemption_type: "in_person", redemption_code: "" }));
    expect(result.ok).toBe(true);
  });

  it("clears a stale code when the type isn't Code", () => {
    const online = normalizePerkInput(
      input({ redemption_type: "online", redemption_code: "STALE", url: "https://example.com" }),
    );
    expect(online.ok && online.row.redemption_code).toBeNull();
  });

  it("turns an empty expiry into null and keeps a set one", () => {
    const none = normalizePerkInput(input({ expires_at: "" }));
    const set = normalizePerkInput(input({ expires_at: "2026-12-31" }));
    expect(none.ok && none.row.expires_at).toBeNull();
    expect(set.ok && set.row.expires_at).toBe("2026-12-31");
  });

  it("rejects an unknown redemption type", () => {
    expect(normalizePerkInput(input({ redemption_type: "bogus" as PerkInput["redemption_type"] })).ok).toBe(false);
  });
});
