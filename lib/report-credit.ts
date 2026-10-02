/**
 * Reasons that earn the reporter +1 match back. They have already spent a match
 * credit on this match (the debit lands on the 6th), and there is no automatic
 * replacement match, so for a no-show or a safety problem the credit is the
 * remedy. The other reasons (already know them, not a good fit, other) are
 * recorded and excluded but not credited.
 */
export const REPORT_CREDIT_REASONS = new Set(["no_response", "safety_concern", "harassment"]);
