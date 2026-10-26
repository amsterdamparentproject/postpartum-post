/**
 * Build the "email us about this" link shown on error pages. The body carries
 * only the Sentry reference (and Next's digest). Never the page URL, which can
 * contain record ids or tokens.
 */
export function buildReportHref(opts: {
  to: string;
  product: string;
  eventId?: string;
  digest?: string;
}): string {
  const lines = [
    `Hi, something went wrong on ${opts.product}.`,
    "",
    "What I was doing (optional):",
    "",
    "",
    "---",
    "Please keep the lines below, they help us find the problem.",
    opts.eventId ? `Reference: ${opts.eventId}` : null,
    opts.digest ? `Digest: ${opts.digest}` : null,
  ].filter((l): l is string => l !== null);
  const subject = `${opts.product}: something went wrong`;
  return `mailto:${opts.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
