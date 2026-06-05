/**
 * Feature flags — flip these to enable/disable features without removing code.
 *
 * ENABLE_TIME_OF_DAY
 *   Controls whether "Time of day" availability (Morning / Afternoon) is shown
 *   in the profile form and factored into match scoring.
 *   Disabled while the member pool is small to avoid over-constraining matches.
 *   Re-enable once the pool grows enough that availability precision helps.
 */
export const ENABLE_TIME_OF_DAY = true;
