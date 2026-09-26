"use client";

import type { ReactNode } from "react";
import { LISTING_KINDS, type ListingKind } from "@/lib/listing-kinds";

export type ListRowAction =
  | { label: string; href: string; external?: boolean }
  | { label: string; onClick: () => void };

/**
 * One row in the match page's List view — the same layout as the Local
 * spots map popups (components/ActivitiesMap.tsx), just roomier: a square
 * on the left (partner photo for perks, otherwise the kind's color + icon),
 * a type chip in the kind's color, the title, an optional coral meta line
 * (date/time, distance…), the description, optional extras (age chips…),
 * and one coral action. Colors, labels and icons come from
 * lib/listing-kinds.ts, shared with the map.
 */
export default function ListRow({
  kind,
  title,
  imageUrl,
  belowImage,
  chipAside,
  meta,
  description,
  extras,
  action,
  mapsUrl,
  highlight = false,
}: {
  kind: ListingKind;
  title: string;
  imageUrl?: string | null;
  /** Shown under the image/icon square, e.g. who's free for an event. */
  belowImage?: ReactNode;
  /** Shown to the right of the chip. */
  chipAside?: ReactNode;
  meta?: ReactNode;
  description?: string | null;
  extras?: ReactNode;
  action?: ListRowAction | null;
  /** When there's an address, a secondary "Open in Google Maps" link. */
  mapsUrl?: string | null;
  /** Recommended items get a ring in their kind's color. */
  highlight?: boolean;
}) {
  const k = LISTING_KINDS[kind];
  const actionClass =
    "inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-md bg-coral text-white text-xs font-medium transition-opacity hover:opacity-80";
  const secondaryActionClass =
    "inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-md border border-border text-dark text-xs font-medium transition-colors hover:border-coral hover:text-coral";

  return (
    <div
      className="rounded-xl border border-border bg-white p-3 flex gap-3 items-start transition-shadow hover:shadow-sm"
      style={highlight ? { borderColor: k.color, boxShadow: `0 0 0 1px ${k.color}66` } : undefined}
    >
      <div className="shrink-0 flex flex-col items-center gap-1.5">
        <div
          className="w-16 h-16 shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
          style={{ background: k.color }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- partner photos can be on any host
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex" dangerouslySetInnerHTML={{ __html: k.icon(28) }} />
          )}
        </div>
        {belowImage}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1 px-2 rounded-full text-[11px] font-bold leading-[18px]"
            style={{ background: k.color, color: k.ink }}
          >
            {kind === "perk" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/sparkle.svg" alt="" className="w-2.5 h-2.5" style={{ filter: "brightness(0) invert(1)" }} />
            )}
            {k.label}
          </span>
          {chipAside}
        </div>
        <p className="font-semibold text-dark text-base leading-snug">{title}</p>
        {meta && <p className="text-xs text-coral">{meta}</p>}
        {description && <p className="text-dark text-sm leading-relaxed">{description}</p>}
        {extras}
        {(action || mapsUrl) && (
          <div className="flex flex-wrap gap-2">
            {action &&
              ("href" in action ? (
                <a
                  href={action.href}
                  {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={actionClass}
                >
                  {action.label} →
                </a>
              ) : (
                <button type="button" onClick={action.onClick} className={actionClass}>
                  {action.label} →
                </button>
              ))}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={secondaryActionClass}>
                Open in Google Maps →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
