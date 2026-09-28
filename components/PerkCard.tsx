import type { ReactNode } from "react";
import Sparkle from "@/components/Sparkle";
import { formatExpiry } from "@/lib/perk-display";

// The Post Perks wordmark green (PostPerksWordMark).
const PERK_GREEN = "#8A9E3A";

export type PerkCardPerk = {
  title: string;
  description: string;
  expires_at: string | null;
  exclusive: boolean;
  /** 'once' = an intro offer, redeemable a single time per member ever. */
  frequency?: "monthly" | "once";
};

export type PerkCardPartner = {
  business_name: string;
  image_url: string | null;
};

/**
 * A perk as members see it: partner photo (or a green block with the Post
 * Perks sparkle), partner name, headline, description, and a footer with
 * the Exclusive badge (solid wordmark green + sparkle, so it stands out),
 * where, and when it expires.
 *
 * Presentational only — no code, no redeem button. The reveal flow ("Use
 * this perk", see __claude__/perks-simplification-plan.md) wraps this later.
 * `badge` is a slot on the photo's top-right corner (e.g. the partner
 * portal's review status), and `onClick` makes the whole card a button.
 * `actionLabel` is shown in an overlay on hover/keyboard focus of a
 * clickable card: "Edit perk" in the partner portal, "Redeem now" on a
 * live perk for members. On touch screens there's no hover, so a tap goes
 * straight to the action.
 *
 * Shared by the partner portal's "Your Perks" tab (a live preview) and,
 * later, the members' /perks page and match page.
 */
export default function PerkCard({
  perk,
  partner,
  locationLabel,
  badge,
  onClick,
  actionLabel,
  umamiEvent,
}: {
  perk: PerkCardPerk;
  partner: PerkCardPartner;
  locationLabel?: string | null;
  badge?: ReactNode;
  onClick?: () => void;
  actionLabel?: string;
  /** Optional data-umami-event label for the members' /my-perks and match-page
   *  uses of this card. Left unset for the partner portal/admin uses so their
   *  edit clicks aren't tracked as member perk engagement. */
  umamiEvent?: string;
}) {
  const expiry = formatExpiry(perk.expires_at);
  const body = (
    <>
      {/* Cream, not green, behind the fallback: the sparkle itself is light green
          and would wash out on a green block. */}
      <div className={`relative aspect-[16/9] ${partner.image_url ? "bg-border/40" : "bg-cream"}`}>
        {partner.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- partner photos can be on any host (older pasted URLs)
          <img src={partner.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkle className="w-20 h-auto" />
          </div>
        )}
        {badge && <div className="absolute top-3 right-3">{badge}</div>}
      </div>

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted truncate">{partner.business_name}</p>
        <h3 className="text-lg leading-snug text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          {perk.title}
        </h3>
        <p className="text-sm text-dark/80 leading-relaxed line-clamp-2">{perk.description}</p>

        <div className="mt-auto pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {perk.exclusive && (
            <span
              className="flex items-center gap-1 pl-1 pr-2.5 py-0.5 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: PERK_GREEN }}
            >
              <Sparkle className="w-4 h-4" />
              Exclusive
            </span>
          )}
          {perk.frequency === "once" && (
            <span className="pl-2.5 pr-2.5 py-0.5 rounded-full text-xs font-bold text-white bg-dark">
              Intro offer
            </span>
          )}
          {locationLabel && <span className="truncate max-w-[12rem]">{locationLabel}</span>}
          {expiry && <span className={`ml-auto ${expiry === "Expired" ? "text-coral" : ""}`}>{expiry}</span>}
        </div>
      </div>
    </>
  );

  const shell =
    "w-full text-left bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col";

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel ? `${actionLabel}: ${perk.title}` : undefined}
      data-umami-event={umamiEvent}
      data-umami-event-perk={umamiEvent ? perk.title : undefined}
      className={`group relative ${shell} hover:border-coral/40 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-coral/40`}
    >
      {body}
      {actionLabel && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-green/70 backdrop-blur-[2px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="text-xl leading-snug text-dark line-clamp-3" style={{ fontFamily: "var(--font-serif)" }}>
            {perk.title}
          </span>
          <span className="px-5 py-2.5 rounded-full bg-coral text-white text-sm font-semibold shadow-md">
            {actionLabel}
          </span>
        </span>
      )}
    </button>
  ) : (
    <div className={shell}>{body}</div>
  );
}
