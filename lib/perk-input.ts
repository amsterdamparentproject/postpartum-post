/**
 * The single perk field set — shared by the partner portal form
 * (PartnerPerkForm), both admin forms (AdminPerkForm, EditPerkForm) and all
 * three save actions (savePartnerPerk, addPerkForPartner, updatePerkAdmin).
 * Pure: no Supabase, safe to import from client components and to
 * unit-test directly. The DB-side checks (location ownership, syncing
 * perk_locations) live in lib/perk-save.ts.
 *
 * See db/migrations/027_simplify_perks.sql, db/migrations/030_perk_tweaks.sql,
 * db/migrations/031_perk_multi_location.sql, and
 * __claude__/perks-simplification-plan.md.
 */

/**
 * How a member redeems the perk. The link (`url`) is separate: any perk can
 * have one, as "where to redeem" or "learn more" — only 'online' requires it.
 *   code       show/enter a code (in person or at checkout)
 *   in_person  just show up — the description says how
 *   online     follow the link; the discount applies there, no code
 */
export type RedemptionType = "code" | "in_person" | "online";

/**
 * How often a member can redeem the perk. `monthly` (default) is the
 * standard Post Perks model, once per calendar month. `once` is for
 * intro offers -- e.g. "20% off your first class" -- redeemable a
 * single time per member, ever. Enforced in
 * db/migrations/028_perk_intro_offers.sql; the app never needs to check
 * it itself beyond reading it for display (see listMemberPerks in
 * app/(account)/my-perks/actions.ts).
 */
export type PerkFrequency = "monthly" | "once";

export const REDEMPTION_TYPES: RedemptionType[] = ["code", "in_person", "online"];

export const REDEMPTION_TYPE_LABELS: Record<RedemptionType, string> = {
  code: "Code",
  in_person: "In person",
  online: "Online",
};

// Mirrors the check constraints in 027_simplify_perks.sql (title) and 030_perk_tweaks.sql (description).
export const PERK_TITLE_MAX = 60;
export const PERK_DESCRIPTION_MAX = 300;
export const PERK_SAVINGS_MAX = 9999; // matches the check constraint in 031_perk_estimated_savings.sql

export type PerkInput = {
  /** Any number of the partner's own locations (db/migrations/031_perk_multi_location.sql) -- independent of is_online. */
  location_ids: string[];
  /** Partner-agnostic "Online" location -- can be combined with location_ids. */
  is_online: boolean;
  title: string;
  description: string;
  redemption_type: RedemptionType;
  redemption_code: string;
  url: string; // "" = none (cards fall back to the partner's website)
  expires_at: string; // "" = no expiry
  exclusive: boolean;
  frequency: PerkFrequency;
  /** Whole euros as typed; "" = none. Partners suggest it; admin can override. */
  estimated_savings: string;
};

/** The perk columns every save path writes, already trimmed and validated. Locations are saved separately (see lib/perk-save.ts). */
export type PerkRow = {
  title: string;
  description: string;
  is_online: boolean;
  redemption_type: RedemptionType;
  redemption_code: string | null;
  url: string | null;
  expires_at: string | null;
  exclusive: boolean;
  frequency: PerkFrequency;
  estimated_savings: number | null;
};

/** What the forms and list cards read back for a saved perk. */
export type SavedPerkFields = PerkRow & {
  id: string;
  location_ids: string[];
};

export function emptyPerkInput(): PerkInput {
  return {
    location_ids: [],
    is_online: false,
    title: "",
    description: "",
    redemption_type: "code",
    redemption_code: "",
    url: "",
    expires_at: "",
    exclusive: false,
    frequency: "monthly",
    estimated_savings: "",
  };
}

export function perkToInput(perk: SavedPerkFields): PerkInput {
  return {
    location_ids: perk.location_ids,
    is_online: perk.is_online,
    title: perk.title,
    description: perk.description,
    redemption_type: perk.redemption_type,
    redemption_code: perk.redemption_code ?? "",
    url: perk.url ?? "",
    expires_at: perk.expires_at ?? "",
    exclusive: perk.exclusive,
    frequency: perk.frequency,
    estimated_savings: perk.estimated_savings == null ? "" : String(perk.estimated_savings),
  };
}

/** A new perk's starting locations: the partner's only location, if exactly one. */
export function defaultLocationIds(locations: { id: string }[]): string[] {
  return locations.length === 1 ? [locations[0].id] : [];
}

/**
 * Trims, applies the length limits, requires what the chosen redemption type
 * needs (a code for 'code', a link for 'online'), and clears the code for any
 * other type — so switching away from Code never leaves a stale code stored.
 * The link is kept for every type. Locations (location_ids/is_online) are
 * validated and saved separately -- see resolvePerkLocations/savePerkLocations
 * in lib/perk-save.ts -- since they're a join table, not a plain column.
 */
export function normalizePerkInput(
  input: PerkInput,
): { ok: true; row: PerkRow } | { ok: false; error: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  const code = input.redemption_code.trim();
  const url = input.url.trim();

  if (!title || !description) {
    return { ok: false, error: "Headline and description are required" };
  }
  if (title.length > PERK_TITLE_MAX) {
    return { ok: false, error: `Keep the headline under ${PERK_TITLE_MAX} characters` };
  }
  if (description.length > PERK_DESCRIPTION_MAX) {
    return { ok: false, error: `Keep the description under ${PERK_DESCRIPTION_MAX} characters` };
  }
  const savingsText = input.estimated_savings.trim();
  let estimated_savings: number | null = null;
  if (savingsText) {
    if (!/^\d+$/.test(savingsText) || Number(savingsText) > PERK_SAVINGS_MAX) {
      return { ok: false, error: `Savings must be a whole number of euros, 0–${PERK_SAVINGS_MAX}` };
    }
    estimated_savings = Number(savingsText);
  }
  if (!REDEMPTION_TYPES.includes(input.redemption_type)) {
    return { ok: false, error: "Pick how members redeem it" };
  }
  if (input.redemption_type === "code" && !code) {
    return { ok: false, error: "Add the code members should use" };
  }
  if (input.redemption_type === "online" && !url) {
    return { ok: false, error: "Add the link where members get the discount" };
  }

  return {
    ok: true,
    row: {
      title,
      description,
      is_online: input.is_online,
      redemption_type: input.redemption_type,
      redemption_code: input.redemption_type === "code" ? code : null,
      url: url || null,
      expires_at: input.expires_at || null,
      exclusive: input.exclusive,
      frequency: input.frequency,
      estimated_savings,
    },
  };
}
