/**
 * Shared full-width light-green bar for the opt-in-window banners
 * (JoinReminderBanner, OptinReminderBanner) — rendered above the header by
 * PageLayout, on every page, so both variants look identical no matter
 * which one a given visitor sees. Light green (vs. plain white) so the
 * banner reads as a deliberate callout rather than blending into the header.
 *
 * Content is a single line of text with an inline link CTA (no separate
 * button). The dismiss (×) sits in its own flex column, top-aligned with
 * the text. It's given the exact same font size and line-height as the
 * text (text-sm md:text-base, leading-relaxed) rather than a bigger
 * text-lg/leading-none combo — that mismatch was the actual reason it
 * looked off-center before: two boxes of different heights can't visually
 * line up just by sharing a top edge (which is all `float` or `absolute`
 * positioning was doing). Matching line-height is what makes items-start
 * actually center it against the first line, on one line or several.
 */
export default function OptinBannerBar({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div className="w-full bg-green-light border-b border-green">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        <button
          onClick={onDismiss}
          className="shrink-0 text-sm md:text-base leading-relaxed text-muted hover:text-dark transition"
          aria-label="Dismiss"
        >
          {"×"}
        </button>
      </div>
    </div>
  );
}
