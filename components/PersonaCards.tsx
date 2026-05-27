"use client";

import React, { useState, useEffect } from "react";
import { StampSVG } from "@/components/StampIcons";

// ---------------------------------------------------------------------------
// Icons — each drawn in 48×48 coordinate space, wrapped in StampSVG
// ---------------------------------------------------------------------------

function ProfileIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <rect x="8" y="6" width="32" height="36" rx="3" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <line x1="15" y1="16" x2="33" y2="16" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="22" x2="33" y2="22" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="28" x2="25" y2="28" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx="35" cy="35" r="7" fill={stroke} />
      <path d="M32 35 L34.5 37.5 L38 33" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </StampSVG>
  );
}

function ChatIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <path
        d="M8 10 L28 10 A4 4 0 0 1 32 14 L32 26 A4 4 0 0 1 28 30 L14 30 L6 38 L10 30 L8 30 A4 4 0 0 1 4 26 L4 14 A4 4 0 0 1 8 10 Z"
        fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5"
      />
      <rect x="10" y="17" width="16" height="2" rx="1" fill={stroke} opacity="0.8" />
      <rect x="10" y="22" width="11" height="2" rx="1" fill={stroke} opacity="0.8" />
      <path
        d="M26 28 L44 28 A3 3 0 0 1 47 31 L47 40 A3 3 0 0 1 44 43 L40 43 L44 48 L33 43 L26 43 A3 3 0 0 1 23 40 L23 31 A3 3 0 0 1 26 28 Z"
        fill="#F4EDE6" stroke={stroke} strokeWidth="1.5"
      />
      <rect x="28" y="33" width="14" height="2" rx="1" fill={stroke} opacity="0.6" />
      <rect x="28" y="38" width="9" height="2" rx="1" fill={stroke} opacity="0.6" />
    </StampSVG>
  );
}

function CoffeeIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <path d="M10 21 L13 37 H33 L36 21 Z" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="12" y1="27" x2="34" y2="27" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M36 25 Q44 25 44 30 Q44 36 36 36" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="23" cy="39" rx="15" ry="2.5" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <path d="M17 17 Q18.5 14.5 17 12" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 15 Q24.5 12.5 23 10" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M29 17 Q30.5 14.5 29 12" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </StampSVG>
  );
}

function PlaneIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <path d="M6 40 L42 8 L36 38 Z" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="6" y1="40" x2="25" y2="25" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M25 25 L36 38 L18 34 Z" fill={stroke} opacity="0.30" stroke={stroke} strokeWidth="0.8" strokeLinejoin="round" />
    </StampSVG>
  );
}

function TulipIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      {/* Soil mound */}
      <ellipse cx="24" cy="44" rx="13" ry="2.5" fill={stroke} opacity="0.25" />
      {/* Stem */}
      <line x1="24" y1="43" x2="24" y2="26" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      {/* Left leaf */}
      <path d="M23 36 C14 32 10 22 16 19 Q19 28 23 36Z" fill={stroke} opacity="0.30" />
      {/* Right leaf */}
      <path d="M25 31 C34 27 38 17 32 14 Q29 23 25 31Z" fill={stroke} opacity="0.30" />
      {/* Left outer petal */}
      <path d="M20 26 C14 22 13 10 18 6 C21 3 23 14 23 24Z" fill={stroke} opacity="0.50" />
      {/* Right outer petal */}
      <path d="M28 26 C34 22 35 10 30 6 C27 3 25 14 25 24Z" fill={stroke} opacity="0.50" />
      {/* Center petal */}
      <path d="M21 26 C21 16 22 7 24 4 C26 7 27 16 27 26Z" fill={stroke} opacity="0.85" />
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
  "46% 54% 66% 34% / 36% 64% 52% 48%",
  "64% 36% 34% 66% / 58% 42% 46% 54%",
];

const SHAPE_SEQUENCE = [0, 3, 4, 1, 5, 2];
const COLOR_SEQUENCE = [0, 1, 2, 0, 1, 2];

// Green, purple, tan
const BORDER_COLORS = [
  "rgba(212, 224, 155, 0.70)",
  "rgba(175, 153, 255, 0.45)",
  "rgba(212, 163, 115, 0.55)",
];

const STAMP_FILLS = [
  "rgba(212, 224, 155, 0.18)",
  "rgba(175, 153, 255, 0.10)",
  "rgba(212, 163, 115, 0.12)",
];

// Full-opacity versions for text highlights and stamp frames
const HIGHLIGHT_COLORS = [
  "#8A9E3A",
  "#7B6FD4",
  "#C07830",
];

// ---------------------------------------------------------------------------
// Persona data
// ---------------------------------------------------------------------------

const PERSONAS: { icon: (fill: string, stroke: string) => React.ReactNode; text: (color: string) => React.ReactNode }[] = [
  { icon: (f, s) => <ChatIcon fill={f} stroke={s} />,       text: (c) => <>For the parent who&apos;s staring at <strong style={{ color: c }}>150 unread</strong> WhatsApp group messages</> },
  { icon: (f, s) => <ProfileIcon fill={f} stroke={s} />,    text: (c) => <>For the <strong style={{ color: c }}>mom-to-be</strong> who still has questions only another mom can answer</> },
  { icon: (f, s) => <CoffeeIcon fill={f} stroke={s} />,     text: (c) => <>For the <strong style={{ color: c }}>introverted parent</strong> who&apos;s running on empty but still craves connection</> },
  { icon: (f, s) => <ChatIcon fill={f} stroke={s} />,       text: (c) => <>For the postpartum dad who wants to hang out on his <strong style={{ color: c }}>papadag</strong></> },
  { icon: (f, s) => <PlaneIcon fill={f} stroke={s} />,      text: (c) => <>For the <strong style={{ color: c }}>couple who moved</strong> here six months before the baby came</> },
  { icon: (f, s) => <CoffeeIcon fill={f} stroke={s} />,     text: (c) => <>For the parent who knows everyone&apos;s birth story but <strong style={{ color: c }}>hasn&apos;t met anyone</strong> in real life</> },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PersonaCards() {
  const [mounted, setMounted] = useState(false);
  const [perPage, setPerPage] = useState(2);
  const [page, setPage] = useState(0);
  const touchStartX = React.useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
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
            <div key={pageIndex} className="w-full shrink-0 flex gap-4 px-1 pt-1 pb-2">
              {PERSONAS.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((persona, cardIndex) => {
                const global = pageIndex * perPage + cardIndex;
                const shapeI = SHAPE_SEQUENCE[global];
                const colorI = COLOR_SEQUENCE[global];
                return (
                  <div
                    key={cardIndex}
                    className="flex-1 bg-white/90 backdrop-blur shadow-sm p-[18px] min-h-[225px] flex flex-col items-center justify-center gap-4 text-center"
                    style={{
                      borderRadius: CARD_SHAPES[shapeI],
                      border: `1.5px solid ${BORDER_COLORS[colorI]}`,
                    }}
                  >
                    {persona.icon(STAMP_FILLS[colorI], HIGHLIGHT_COLORS[colorI])}
                    <p className="text-sm text-dark leading-relaxed max-w-[24ch]">{persona.text(HIGHLIGHT_COLORS[colorI])}</p>
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
                i === page
                  ? "w-5 h-2 bg-coral"
                  : "w-2 h-2 bg-border hover:bg-coral/40"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => setPage(p => p + 1)}
          disabled={mounted && page >= totalPages - 1}
          aria-label="Next"
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-dark hover:border-coral/40 transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}
