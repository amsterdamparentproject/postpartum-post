"use client";

import React, { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Icons — reused from HowMatchingWorks (non-animated)
// ---------------------------------------------------------------------------

function ProfileIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none">
      <rect x="8" y="6" width="32" height="36" rx="3" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
      <line x1="15" y1="16" x2="33" y2="16" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="22" x2="33" y2="22" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="28" x2="25" y2="28" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="35" cy="35" r="7" fill="#D4614A" />
      <path d="M32 35 L34.5 37.5 L38 33" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none">
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
    </svg>
  );
}

function PuzzleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none">
      <g transform="rotate(-18, 9.5, 22)">
        <path d="M 3,14 H 16 V 19 A 3 3 0 0 1 16 25 V 30 H 3 Z"
          fill="#D4614A" opacity="0.18" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <g transform="rotate(18, 37, 22)">
        <path d="M 30,14 H 44 V 30 H 30 V 25 A 3 3 0 0 0 30 19 Z"
          fill="#D4614A" opacity="0.18" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <line x1="24" y1="4" x2="24" y2="8.5" stroke="#D4614A" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="19" y1="6" x2="21.5" y2="9.5" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="29" y1="6" x2="26.5" y2="9.5" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CoffeeIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none">
      {/* Cup body — tapered, wider at top */}
      <path d="M10 21 L13 37 H33 L36 21 Z"
        fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Coffee surface line */}
      <line x1="12" y1="27" x2="34" y2="27" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* Handle */}
      <path d="M36 25 Q44 25 44 30 Q44 36 36 36"
        fill="none" stroke="#D4614A" strokeWidth="1.8" strokeLinecap="round" />
      {/* Saucer */}
      <ellipse cx="23" cy="39" rx="15" ry="2.5"
        fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
      {/* Steam — three wavy lines */}
      <path d="M17 17 Q18.5 14.5 17 12" fill="none" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 15 Q24.5 12.5 23 10" fill="none" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M29 17 Q30.5 14.5 29 12" fill="none" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none">
      {/* Main body — nose pointing upper-right */}
      <path d="M6 40 L42 8 L36 38 Z"
        fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Fold crease from tail to mid-body */}
      <line x1="6" y1="40" x2="25" y2="25" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      {/* Lower wing / tail flap */}
      <path d="M25 25 L36 38 L18 34 Z"
        fill="#D4614A" opacity="0.30" stroke="#D4614A" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none">
      <rect x="4" y="14" width="40" height="26" rx="3" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
      <polyline points="4,14 24,28 44,14" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 22 C24 19 20 18 20 21 C20 24 24 27 24 27 C24 27 28 24 28 21 C28 18 24 19 24 22 Z"
        fill="#D4614A" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Design tokens — 3 shapes, 3 border colors, cycling per card
// ---------------------------------------------------------------------------

const CARD_SHAPES = [
  "62% 38% 46% 54% / 60% 44% 56% 40%",
  "38% 62% 54% 46% / 44% 56% 40% 60%",
  "54% 46% 38% 62% / 56% 40% 60% 44%",
  "28% 72% 42% 58% / 68% 32% 62% 38%", // tall, left-leaning
  "72% 28% 58% 42% / 32% 68% 38% 62%", // tall, right-leaning
];

const ICON_BLOBS = [
  "58% 42% 40% 60% / 40% 58% 42% 60%",
  "40% 60% 58% 42% / 58% 40% 60% 42%",
  "50% 50% 42% 58% / 42% 60% 58% 40%",
  "30% 70% 40% 60% / 65% 35% 60% 40%", // tall, left-leaning
  "70% 30% 60% 40% / 35% 65% 40% 60%", // tall, right-leaning
];

// Hand-shuffled so shapes and colors feel random rather than strictly sequential.
// Two tall shapes (3 & 4) are spread across different pages for variety.
const SHAPE_SEQUENCE = [0, 3, 4, 1, 2, 3];
const COLOR_SEQUENCE = [0, 1, 2, 1, 0, 2];

// Coral, warm gold, soft sage
const BORDER_COLORS = [
  "rgba(212, 97, 74, 0.40)",
  "rgba(196, 158, 90, 0.50)",
  "rgba(120, 170, 150, 0.50)",
];

// Full-opacity versions for text highlights — one per border color
const HIGHLIGHT_COLORS = [
  "#D4614A", // coral
  "#C49E5A", // warm gold
  "#78AA96", // soft sage
];

const ICON_BG_COLORS = [
  "rgba(212, 97, 74, 0.10)",
  "rgba(196, 158, 90, 0.12)",
  "rgba(120, 170, 150, 0.12)",
];

// ---------------------------------------------------------------------------
// Persona data
// ---------------------------------------------------------------------------

const PERSONAS: { icon: React.ReactNode; text: (color: string) => React.ReactNode }[] = [
  { icon: <ProfileIcon />,  text: (c) => <>For the <strong style={{ color: c }}>mom-to-be</strong> who&apos;s done all the research and still feels unprepared</> },
  { icon: <ChatIcon />,     text: (c) => <>For the postpartum dad who wants to hang out on his <strong style={{ color: c }}>papadag</strong></> },
  { icon: <ChatIcon />,     text: (c) => <>For the parent who&apos;s staring at <strong style={{ color: c }}>150 unread</strong> WhatsApp group messages</> },
  { icon: <PlaneIcon />,    text: (c) => <>For the <strong style={{ color: c }}>couple who moved</strong> here six months before the baby came</> },
  { icon: <EnvelopeIcon />, text: (c) => <>For the <strong style={{ color: c }}>new mom</strong> who hasn&apos;t left the house in a week</> },
  { icon: <CoffeeIcon />,   text: (c) => <>For the parent who knows everyone&apos;s birth story but <strong style={{ color: c }}>hasn&apos;t met anyone</strong> for coffee</> },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PersonaCards() {
  const [perPage, setPerPage] = useState(2);
  const [page, setPage] = useState(0);

  // Switch between 1-up (mobile) and 2-up (md+) without a library
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setPerPage(mq.matches ? 2 : 1);
      setPage(0); // reset so we never land on an out-of-range page
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const totalPages = Math.ceil(PERSONAS.length / perPage);

  return (
    <div>
      {/* Slide track */}
      <div className="overflow-hidden">
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
                    className="flex-1 bg-white/90 backdrop-blur shadow-sm p-6 min-h-[220px] md:min-h-0 flex flex-col items-center justify-center gap-4 text-center"
                    style={{
                      borderRadius: CARD_SHAPES[shapeI],
                      border: `1.5px solid ${BORDER_COLORS[colorI]}`,
                    }}
                  >
                    <div
                      className="w-14 h-14 flex items-center justify-center shrink-0"
                      style={{
                        borderRadius: ICON_BLOBS[shapeI],
                        backgroundColor: ICON_BG_COLORS[colorI],
                      }}
                    >
                      {persona.icon}
                    </div>
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
          disabled={page === 0}
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
          disabled={page === totalPages - 1}
          aria-label="Next"
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-dark hover:border-coral/40 transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}
