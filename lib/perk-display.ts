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

/**
 * The location shown on a perk card: the neighborhood, else the broader
 * area ("West", "Center"...), else nothing. Never the partner's internal
 * location label or street address — the same on every surface, so the
 * partner preview matches what members see.
 */
export function perkLocationLabel(
  location: { neighborhood: string | null; area: string | null } | null | undefined,
): string | null {
  return location?.neighborhood?.trim() || location?.area?.trim() || null;
}
