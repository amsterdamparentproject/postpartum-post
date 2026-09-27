/**
 * The single perk field set — shared by the partner portal form
 * (PartnerPerkForm), both admin forms (AdminPerkForm, EditPerkForm) and all
 * three save actions (savePartnerPerk, addPerkForPartner, updatePerkAdmin).
 * Pure: no Supabase, safe to import from client components and to
 * unit-test directly. The DB-side check (location ownership)
 * live in lib/perk-save.ts.
 *
 * See db/migrations/027_simplify_perks.sql and
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

export const REDEMPTION_TYPES: RedemptionType[] = ["code", "in_person", "online"];

export const REDEMPTION_TYPE_LABELS: Record<RedemptionType, string> = {
  code: "Code",
  in_person: "In person",
  online: "Online",
};

// Mirrors the check constraints in 027_simplify_perks.sql.
export const PERK_TITLE_MAX = 60;
export const PERK_DESCRIPTION_MAX = 160;

export type PerkInput = {
  location_id: string | null;
  title: string;
  description: string;
  redemption_type: RedemptionType;
  redemption_code: string;
  url: string; // "" = none (cards fall back to the partner's website)
  expires_at: string; // "" = no expiry
  exclusive: boolean;
};

/** The perk columns every save path writes, already trimmed and validated. */
export type PerkRow = {
  title: string;
  description: string;
  redemption_type: RedemptionType;
  redemption_code: string | null;
  url: string | null;
  expires_at: string | null;
  exclusive: boolean;
};

/** What the forms and list cards read back for a saved perk. */
export type SavedPerkFields = PerkRow & {
  id: string;
  location_id: string | null;
};

export function emptyPerkInput(): PerkInput {
  return {
    location_id: null,
    title: "",
    description: "",
    redemption_type: "code",
    redemption_code: "",
    url: "",
    expires_at: "",
    exclusive: false,
  };
}

export function perkToInput(perk: SavedPerkFields): PerkInput {
  return {
    location_id: perk.location_id,
    title: perk.title,
    description: perk.description,
    redemption_type: perk.redemption_type,
    redemption_code: perk.redemption_code ?? "",
    url: perk.url ?? "",
    expires_at: perk.expires_at ?? "",
    exclusive: perk.exclusive,
  };
}

/** A new perk's starting location: the partner's only location, if exactly one. */
export function defaultLocationId(locations: { id: string }[]): string | null {
  return locations.length === 1 ? locations[0].id : null;
}

/**
 * Trims, applies the length limits, requires what the chosen redemption type
 * needs (a code for 'code', a link for 'online'), and clears the code for any
 * other type — so switching away from Code never leaves a stale code stored.
 * The link is kept for every type.
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
      redemption_type: input.redemption_type,
      redemption_code: input.redemption_type === "code" ? code : null,
      url: url || null,
      expires_at: input.expires_at || null,
      exclusive: input.exclusive,
    },
  };
}
