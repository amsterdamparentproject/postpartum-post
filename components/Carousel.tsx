"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The paging carousel from /partners ("What's a Post Perk?"): mirrors
 * PersonaCards' pagination — 2 per page on desktop, 1 on mobile, swipe +
 * arrows + dots. Content-agnostic: BlobCarousel wraps items in blobs; the
 * public perk carousels (PublicPerksCarousel) render PerkCards.
 *
 * With a single item the card keeps half width on desktop (instead of
 * stretching across), and the arrows/dots hide when there's only one page.
 */
export default function Carousel<T>({
  items,
  renderItem,
  getKey,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
}) {
  const [mounted, setMounted] = useState(false);
  const [perPage, setPerPage] = useState(2);
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    // All setState calls live in `update` (called below, not synchronously in
    // the effect body) — what the set-state-in-effect lint rule requires.
    const update = () => {
      setMounted(true);
      setPerPage(mq.matches ? 2 : 1);
      setPage(0);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      setPage((p) => (delta > 0 ? Math.min(p + 1, totalPages - 1) : Math.max(p - 1, 0)));
    }
    touchStartX.current = null;
  }

  return (
    <div>
      <div className="overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${page * 100}%)` }}
        >
          {Array.from({ length: totalPages }).map((_, pageIndex) => (
            <div key={pageIndex} className="w-full shrink-0 flex justify-center gap-4 px-1 pt-1 pb-2">
              {items.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((item, cardIndex) => {
                const index = pageIndex * perPage + cardIndex;
                return (
                  <div
                    key={getKey ? getKey(item, index) : index}
                    className={`flex ${perPage > 1 ? "flex-1 max-w-[calc(50%-0.5rem)]" : "flex-1"}`}
                  >
                    {renderItem(item, index)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-5">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={mounted && page === 0}
            aria-label="Previous"
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-dark hover:border-coral/40 transition disabled:opacity-25 disabled:cursor-not-allowed"
          >
            ←
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                aria-label={`Go to page ${i + 1}`}
                className={`rounded-full transition-all duration-200 ${
                  i === page ? "w-5 h-2 bg-coral" : "w-2 h-2 bg-border hover:bg-coral/40"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={mounted && page >= totalPages - 1}
            aria-label="Next"
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-dark hover:border-coral/40 transition disabled:opacity-25 disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
