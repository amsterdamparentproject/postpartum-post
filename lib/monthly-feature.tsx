import type { ReactNode } from "react";

/**
 * "Your monthly smidge of whimsy" — a piece of art from the community,
 * featured on the match page.
 *
 * To update each month:
 *   1. Drop the image into /public/whimsy/ (e.g. /public/whimsy/2026-07.jpg)
 *   2. Update the fields below to match
 *   3. Deploy
 *
 * Set `monthlyFeature` to `null` to hide the section entirely (e.g. no
 * submissions that month). This is a single "current" feature, not keyed by
 * month — every match page (regardless of which month it's for) shows
 * whatever is configured here at the time it's viewed.
 *
 * `description` accepts any React node, so feel free to use JSX (styled
 * spans, <br /> line breaks, multiple paragraphs, etc.) instead of a plain
 * string.
 */

export interface MonthlyFeature {
  /** Path under /public — e.g. "/whimsy/2026-07.jpg" */
  imageSrc: string;
  /** Alt text for the image (accessibility) */
  imageAlt: string;
  title: string;
  author: string;
  /** Optional — displayed after the author's name, e.g. "By E. Siega, age 2.5 years" */
  authorAge?: number;
  /** "YYYY-MM" — displayed after the author as "Month Year" */
  featuredMonth: string;
  /** Optional caption from the artist — plain text or JSX */
  description?: ReactNode;
}

export const monthlyFeature: MonthlyFeature | null = {
  imageSrc: "/whimsy/2026-07.jpg",
  imageAlt: "An image of a dresser with many stickers on it",
  title: "A Lumberjack Landscape",
  author: "E. Siega",
  authorAge: 2.5,
  featuredMonth: "2026-02",
  description: (
    <>
      E. created this piece silently in her room one Saturday morning, unbeknownst to her
      parents. This artwork spawned a series of <i>&quot;Who&quot;</i> and <i>&quot;Why&quot;</i> around the lumberjack, out of
      which a song was born:
      <br />
      <br />
      <span className="text-muted text-xs">
        Behold the mighty lumberjack who chops the trees all day
        <br />
        And when the trees fall down he takes the wood away.
        <br />
        The trees get turned to lumber by the lumberjack crew
        <br />
        And then it gets transported to me and you.
      </span>
    </>
  ),
};
