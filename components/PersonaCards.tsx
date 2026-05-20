"use client";

import React, { useState, useEffect } from "react";
import { StampSVG } from "@/components/StampIcons";

// ---------------------------------------------------------------------------
// Icons — each drawn in 48×48 coordinate space, wrapped in StampSVG
// ---------------------------------------------------------------------------

function ProfileIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke}>
      <rect x="8" y="6" width="32" height="36" rx="3" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
      <line x1="15" y1="16" x2="33" y2="16" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="22" x2="33" y2="22" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="28" x2="25" y2="28" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="35" cy="35" r="7" fill="#D4614A" />
      <path d="M32 35 L34.5 37.5 L38 33" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </StampSVG>
  );
}

function ChatIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke}>
      <path
        d="M8 10 L28 10 A4 4 0 0 1 32 14 L32 26 A4 4 0 0 1 28 30 L14 30 L6 38 L10 30 L8 30 A4 4 0 0 1 4 26 L4 14 A4 4 0 0 1 8 10 Z"
        fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5"
      />
      <rect x="10" y="17" width="16" height="2" rx="1" fill="#D4614A" opacity="0.8" />
      <rect x="10" y="22" width="11" height="2" rx="1" fill="#D4614A" opacity="0.8" />
      <path
        d="M26 28 L44 28 A3 3 0 0 1 47 31 L47 40 A3 3 0 0 1 44 43 L40 43 L44 48 L33 43 L26 43 A3 3 0 0 1 23 40 L23 31 A3 3 0 0 1 26 28 Z"
        fill="#F5EEE6" stroke="#D4614A" strokeWidth="1.5"
      />
      <rect x="28" y="33" width="14" height="2" rx="1" fill="#D4614A" opacity="0.6" />
      <rect x="28" y="38" width="9" height="2" rx="1" fill="#D4614A" opacity="0.6" />
    </StampSVG>
  );
}

function CoffeeIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke}>
      <path d="M10 21 L13 37 H33 L36 21 Z" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="12" y1="27" x2="34" y2="27" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M36 25 Q44 25 44 30 Q44 36 36 36" fill="none" stroke="#D4614A" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="23" cy="39" rx="15" ry="2.5" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
      <path d="M17 17 Q18.5 14.5 17 12" fill="none" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 15 Q24.5 12.5 23 10" fill="none" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M29 17 Q30.5 14.5 29 12" fill="none" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
    </StampSVG>
  );
}

function PlaneIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke}>
      <path d="M6 40 L42 8 L36 38 Z" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="6" y1="40" x2="25" y2="25" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M25 25 L36 38 L18 34 Z" fill="#D4614A" opacity="0.30" stroke="#D4614A" strokeWidth="0.8" strokeLinejoin="round" />
    </StampSVG>
  );
}

function EnvelopeIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke}>
      <rect x="4" y="14" width="40" height="26" rx="3" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
      <polyline points="4,14 24,28 44,14" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 22 C24 19 20 18 20 21 C20 24 24 27 24 27 C24 27 28 24 28 21 C28 18 24 19 24 22 Z" fill="#D4614A" />
    </StampSVG>
  );
}

// ---------------------------------------------------------------------------
// Design tokens — 3 shapes, 3 border colors, cycling per card
// ---------------------------------------------------------------------------

const CARD_SHAPES = [
  "62% 38% 46% 54% / 60% 44% 56% 40%",
  "38% 62% 54% 46% / 44% 56% 40% 60%",
  "54% 46% 38% 62% / 56% 40% 60% 44%",
  "28% 72% 42% 58% / 68% 32% 62% 38%",
  "72% 28% 58% 42% / 32% 68% 38% 62%",
];

const SHAPE_SEQUENCE = [0, 3, 4, 1, 2, 3];
const COLOR_SEQUENCE = [0, 1, 2, 1, 0, 2];

// Coral, warm gold, soft sage
const BORDER_COLORS = [
  "rgba(212, 97, 74, 0.40)",
  "rgba(196, 158, 90, 0.50)",
  "rgba(120, 170, 150, 0.50)",
];

const STAMP_FILLS = [
  "rgba(212, 97, 74, 0.08)",
  "rgba(196, 158, 90, 0.10)",
  "rgba(120, 170, 150, 0.10)",
];

// Full-opacity versions for text highlights and stamp frames
const HIGHLIGHT_COLORS = [
  "#D4614A",
  "#C49E5A",
  "#78AA96",
];

// ---------------------------------------------------------------------------
// Persona data
// ---------------------------------------------------------------------------

const PERSONAS: { icon: (fill: string, stroke: string) => React.ReactNode; text: (color: string) => React.ReactNode }[] = [
  { icon: (f, s) => <ProfileIcon fill={f} stroke={s} />,  text: (c) => <>For the <strong style={{ color: c }}>mom-to-be</strong> who&apos;s done all the research and still feels unprepared</> },
  { icon: (f, s) => <ChatIcon fill={f} stroke={s} />,     text: (c) => <>For the postpartum dad who wants to hang out on his <strong style={{ color: c }}>papadag</strong></> },
  { icon: (f, s) => <ChatIcon fill={f} stroke={s} />,     text: (c) => <>For the parent who&apos;s staring at <strong style={{ color: c }}>150 unread</strong> WhatsApp group messages</> },
  { icon: (f, s) => <PlaneIcon fill={f} stroke={s} />,    text: (c) => <>For the <strong style={{ color: c }}>couple who moved</strong> here six months before the baby came</> },
  { icon: (f, s) => <EnvelopeIcon fill={f} stroke={s} />, text: (c) => <>For the <strong style={{ color: c }}>new mom</strong> who hasn&apos;t left the house in a week</> },
  { icon: (f, s) => <CoffeeIcon fill={f} stroke={s} />,   text: (c) => <>For the parent who knows everyone&apos;s birth story but <strong style={{ color: c }}>hasn&apos;t met anyone</strong> for coffee</> },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PersonaCards() {
  const [perPage, setPerPage] = useState(2);
  const [page, setPage] = useState(0);
  const touchStartX = React.useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setPerPage(mq.matches ? 2 : 1);
      setPage(0);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const totalPages = Math.ceil(PERSONAS.length / perPage);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      setPage(p => delta > 0
        ? Math.min(p + 1, totalPages - 1)
        : Math.max(p - 1, 0)
      );
    }
    touchStartX.current = null;
  }

  return (
    <div>
      {/* Slide track */}
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${page * 100}%)` }}
        >
          {Array.from({ length: totalPages }).map((_, pageIndex) => (
            <div key={pageIndex} className="w-full shrink-0 flex gap-4 pr-[2px] pb-[2px]">
              {PERSONAS.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((persona, cardIndex) => {
                const global = pageIndex * perPage + cardIndex;
                const shapeI = SHAPE_SEQUENCE[global];
                const colorI = COLOR_SEQUENCE[global];
                return (
                  <div
                    key={cardIndex}
                    className="flex-1 bg-white/90 backdrop-blur shadow-sm p-6 min-h-[250px] md:min-h-0 flex flex-col items-center justify-center gap-4 text-center"
                    style={{
                      borderRadius: CARD_SHAPES[shapeI],
                      border: `1.5px solid ${BORDER_COLORS[colorI]}`,
                    }}
                  >
                    {persona.icon(STAMP_FILLS[colorI], HIGHLIGHT_COLORS[colorI])}
                    <p className="text-sm text-dark leading-relaxed">{persona.text(HIGHLIGHT_COLORS[colorI])}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Controls: back arrow · dots · forward arrow */}
      <div className="flex items-center justify-center gap-4 mt-5">
        <button
          onClick={() => setPage(p => p - 1)}
          {...(page === 0 ? { disabled: true } : {})}
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
                i === page
                  ? "w-5 h-2 bg-coral"
                  : "w-2 h-2 bg-border hover:bg-coral/40"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => setPage(p => p + 1)}
          {...(page >= totalPages - 1 ? { disabled: true } : {})}
          aria-label="Next"
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-dark hover:border-coral/40 transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}
