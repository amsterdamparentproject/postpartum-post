/**
 * Display helpers for perk cards (components/PerkCard.tsx). Pure, so they
 * can be unit-tested and used by any surface that shows a perk to members.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days from `today` to a "YYYY-MM-DD" date, both taken as calendar days. */
function daysUntil(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / MS_PER_DAY);
}

/**
 * "Expires in 3 weeks" style label, or null for a perk with no expiry.
 * Far-off dates show the date itself ("Expires Mar 1") instead of a count.
 */
export function formatExpiry(expiresAt: string | null, today: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt, today);
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days < 14) return `Expires in ${days} days`;
  if (days < 60) return `Expires in ${Math.round(days / 7)} weeks`;
  const [y, m, d] = expiresAt.split("-").map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Expires ${date}`;
}

export type PerkLocationLite = { neighborhood: string | null; area: string | null };

// Named locations beyond this many collapse into "+N more" -- keeps the
// label from swamping the card when a perk lists many locations.
const PERK_LOCATION_LABEL_SHOWN = 2;

function singleLocationName(loc: PerkLocationLite): string | null {
  return loc.neighborhood?.trim() || loc.area?.trim() || null;
}

/**
 * The location shown on a perk card, since a perk can have any number of
 * locations plus an independent Online flag
 * (db/migrations/031_perk_multi_location.sql):
 *   - each location's neighborhood, else its broader area ("West",
 *     "Center"...), comma-separated, capped at PERK_LOCATION_LABEL_SHOWN
 *     with the rest folded into "+N more"
 *   - "Online" prepended when is_online, combined as "Online, Jordaan"
 *   - null when there's nothing to show
 * Never the partner's internal location label or street address — the
 * same on every surface, so the partner preview matches what members see.
 */
export function perkLocationLabel(
  locations: PerkLocationLite[],
  isOnline?: boolean,
): string | null {
  const names = locations.map(singleLocationName).filter((n): n is string => !!n);
  const shown = names.slice(0, PERK_LOCATION_LABEL_SHOWN);
  const rest = names.length - shown.length;
  const locationPart = shown.length === 0 ? null : rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");

  if (isOnline && locationPart) return `Online, ${locationPart}`;
  if (isOnline) return "Online";
  return locationPart;
}
