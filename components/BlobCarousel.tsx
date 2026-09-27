"use client";

import type { ReactNode } from "react";
import Carousel from "@/components/Carousel";

// ---------------------------------------------------------------------------
// Blob card design tokens — same palette as PersonaCards (green, purple, tan).
// Indexes cycle, so any number of cards works.
// ---------------------------------------------------------------------------

const BLOB_SHAPES = [
  "62% 38% 46% 54% / 60% 44% 56% 40%",
  "38% 62% 54% 46% / 44% 56% 40% 60%",
  "54% 46% 38% 62% / 56% 40% 60% 44%",
  "28% 72% 42% 58% / 68% 32% 62% 38%",
];

const BLOB_BORDERS = [
  "rgba(212, 224, 155, 0.70)",
  "rgba(175, 153, 255, 0.45)",
  "rgba(212, 163, 115, 0.55)",
  "rgba(212, 224, 155, 0.70)",
];

const BLOB_FILLS = [
  "rgba(212, 224, 155, 0.18)",
  "rgba(175, 153, 255, 0.10)",
  "rgba(212, 163, 115, 0.12)",
  "rgba(212, 224, 155, 0.18)",
];

const BLOB_HIGHLIGHTS = ["#8A9E3A", "#7B6FD4", "#C07830", "#8A9E3A"];

/** The colors for the card at `index`: border, soft fill, and highlight (text) color. */
export function blobColors(index: number) {
  const i = index % BLOB_SHAPES.length;
  return { shape: BLOB_SHAPES[i], border: BLOB_BORDERS[i], fill: BLOB_FILLS[i], highlight: BLOB_HIGHLIGHTS[i] };
}

/**
 * The blob cards from /partners ("What's a Post Perk?"): each item inside a
 * white blob with an organic border radius and a pastel border, in the
 * shared Carousel. The caller renders the contents with the colors from
 * blobColors(index).
 */
export default function BlobCarousel<T>({
  items,
  renderItem,
  getKey,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
}) {
  return (
    <Carousel
      items={items}
      getKey={getKey}
      renderItem={(item, index) => {
        const { shape, border } = blobColors(index);
        return (
          <div
            className="flex-1 bg-white/90 backdrop-blur shadow-sm p-[18px] min-h-[225px] flex flex-col items-center justify-center gap-4 text-center"
            style={{ borderRadius: shape, border: `1.5px solid ${border}` }}
          >
            {renderItem(item, index)}
          </div>
        );
      }}
    />
  );
}
