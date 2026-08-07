import type { ReactNode } from "react";

/**
 * "Your monthly smidge of whimsy" — a piece of art from the community,
 * featured on the match page.
 *
 * To add a new month:
 *   1. Drop the image into /public/whimsy/ (e.g. /public/whimsy/2026-09.jpg)
 *   2. Add a new entry to the END of `whimsyHistory` below (newest last)
 *   3. Deploy
 *
 * The match page always shows the LAST entry in `whimsyHistory` — every
 * older entry stays in the array as a record of past features, it's just
 * no longer displayed. Set `whimsyHistory` to `[]` to hide the section
 * entirely (e.g. no submissions that month).
 *
 * `description` accepts any React node, so feel free to use JSX (styled
 * spans, <br /> line breaks, multiple paragraphs, etc.) instead of a plain
 * string.
 */

export interface WhimsyEntry {
  /** Path under /public — e.g. "/whimsy/2026-07.jpg" */
  imageSrc: string;
  /** Alt text for the image (accessibility) */
  imageAlt: string;
  title: string;
  author: string;
  /** Optional — displayed after the author's name, e.g. "By E. Siega, age 2.5 years" or "By A. Apte, age almost 4" */
  authorAge?: string | number;
  /** "YYYY-MM" — when it was created" */
  featuredMonth: string;
    /** "YYYY-MM" — displayed after the author as "Month Year" */
  createdMonth: string;
  /** Optional caption from the artist — plain text or JSX */
  description?: ReactNode;
}

export const whimsyHistory: WhimsyEntry[] = [
  {
    imageSrc: "/whimsy/2026-07.jpg",
    imageAlt: "An image of a dresser with many stickers on it",
    title: "A Lumberjack Landscape",
    author: "E. Siega",
    authorAge: 2.5,
    createdMonth: "2026-02",
    featuredMonth: "2026-07",
    description: (
      <>
        E. created this piece silently in her room one Saturday morning, unbeknownst to her
        parents. This artwork spawned a series of <i>&quot;Who&quot;</i> and{" "}
        <i>&quot;Why&quot;</i> around the lumberjack, out of which a song was born:
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
  },
  {
    imageSrc: "/whimsy/2026-08.jpg",
    imageAlt: "Chalk drawing on pavement of a colorful shell-like shape",
    title: "A Friendly Virus",
    author: "A. Apte",
    authorAge: "almost 4",
    createdMonth: "2026-07",
    featuredMonth: "2026-08",
    description: (
      <>
        A quote from the artist: <i>&quot;It&apos;s a friendly virus, it doesn&apos;t cause you
        any feelings.&quot;</i>
      </>
    ),
  },
];

/** The feature currently shown on match pages — the most recent entry, or null if none. */
export const monthlyFeature: WhimsyEntry | null =
  whimsyHistory.length > 0 ? whimsyHistory[whimsyHistory.length - 1] : null;
