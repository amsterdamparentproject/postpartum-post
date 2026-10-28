/**
 * Feature flags — flip these to enable/disable features without removing code.
 *
 * ENABLE_TIME_OF_DAY
 *   Controls whether "Time of day" availability (Morning / Afternoon) is shown
 *   in the profile form and factored into match scoring.
 *   Disabled while the member pool is small to avoid over-constraining matches.
 *   Re-enable once the pool grows enough that availability precision helps.
 */
export const ENABLE_TIME_OF_DAY = false;

/**
 * ENABLE_GIVEAWAY
 *   Shows the "Enter the giveaway" callout/checkbox on the /perks suggestion
 *   form and the giveaway line in the /perks hero, and lets submitPerkIdea
 *   accept giveaway entries (perk_giveaway_entries). The October 2026
 *   giveaway is over; the scaffolding (form, server action, table, terms page,
 *   comp tooling) is kept so another giveaway is a flag flip plus copy/date
 *   updates in PerkIdeaForm, the thank-you message, and /terms/giveaway.
 */
export const ENABLE_GIVEAWAY = false;
