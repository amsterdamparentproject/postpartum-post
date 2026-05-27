"use client";

/**
 * HowMatchingWorks
 *
 * Reusable section explaining the matching process.
 * Used on /how-it-works (standalone, linked from monthly email)
 * and embedded in /about (for prospective members).
 *
 * Mobile: horizontal swipeable carousel, one card at a time, arrow nav.
 * Desktop (md+): vertical list with connector line and step numbers.
 */

import React, { useState, useEffect } from "react";
import { StampSVG } from "@/components/StampIcons";

const STEPS = [
  {
    number: "01",
    title: "Fill in your profile",
    description:
      "Tell us your language, when you're free, and your child's birth month or due date. The more you share, the better we can match you. (But we'll still match you regardless!)",
    icon: (
      <StampSVG fill="rgba(197, 104, 80, 0.08)" stroke="#C56850" background="white">
        <rect x="8" y="6" width="32" height="36" rx="3" fill="#C56850" opacity="0.15" stroke="#C56850" strokeWidth="1.5" />
        <line x1="15" y1="16" x2="33" y2="16" stroke="#C56850" strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="22" x2="33" y2="22" stroke="#C56850" strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="28" x2="25" y2="28" stroke="#C56850" strokeWidth="2" strokeLinecap="round" />
        <circle cx="35" cy="35" r="7" fill="#C56850" />
        <path d="M32 35 L34.5 37.5 L38 33" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </StampSVG>
    ),
  },
  {
    number: "02",
    title: "Choose your topic",
    description:
      "On the 1st of each month, we ask whether you'd like to participate and what you'd like to connect over — coffee, a playdate, or another topic around parenthood. You can also choose to skip that month, at no cost to you.",
    icon: (
      <StampSVG fill="rgba(175, 153, 255, 0.10)" stroke="#AF99FF" background="white">
        <path
          d="M8 10 L28 10 A4 4 0 0 1 32 14 L32 26 A4 4 0 0 1 28 30 L14 30 L6 38 L10 30 L8 30 A4 4 0 0 1 4 26 L4 14 A4 4 0 0 1 8 10 Z"
          fill="#AF99FF" opacity="0.15" stroke="#AF99FF" strokeWidth="1.5"
        />
        <rect x="10" y="17" width="16" height="2" rx="1" fill="#AF99FF" opacity="0.8" />
        <rect x="10" y="22" width="11" height="2" rx="1" fill="#AF99FF" opacity="0.8" />
        <path
          d="M26 28 L44 28 A3 3 0 0 1 47 31 L47 40 A3 3 0 0 1 44 43 L40 43 L44 48 L33 43 L26 43 A3 3 0 0 1 23 40 L23 31 A3 3 0 0 1 26 28 Z"
          fill="#F4EDE6" stroke="#AF99FF" strokeWidth="1.5"
        />
        <rect x="28" y="33" width="14" height="2" rx="1" fill="#AF99FF" opacity="0.6" />
        <rect x="28" y="38" width="9" height="2" rx="1" fill="#AF99FF" opacity="0.6" />
      </StampSVG>
    ),
  },
  {
    number: "03",
    title: "We find your best match",
    description:
      "We compare your profile with every active member and score compatibility. Language comes first, then shared availability, topic, and — based on your preference — how close you live or how similar your children's ages are.",
    icon: (
      <StampSVG fill="rgba(212, 163, 115, 0.10)" stroke="#D4A373" background="white">
        <g transform="rotate(-18, 9.5, 22)">
          <path
            d="M 3,14 H 16 V 19 A 3 3 0 0 1 16 25 V 30 H 3 Z"
            fill="#D4A373" opacity="0.18" stroke="#D4A373" strokeWidth="1.5" strokeLinejoin="round"
          />
        </g>
        <g transform="rotate(18, 37, 22)">
          <path
            d="M 30,14 H 44 V 30 H 30 V 25 A 3 3 0 0 0 30 19 Z"
            fill="#D4A373" opacity="0.18" stroke="#D4A373" strokeWidth="1.5" strokeLinejoin="round"
          />
        </g>
        <line x1="24" y1="4" x2="24" y2="8.5" stroke="#D4A373" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="19" y1="6" x2="21.5" y2="9.5" stroke="#D4A373" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="29" y1="6" x2="26.5" y2="9.5" stroke="#D4A373" strokeWidth="1.5" strokeLinecap="round"/>
      </StampSVG>
    ),
  },
  {
    number: "04",
    title: "Receive your Post",
    description:
      "We introduce you both by email: a warm letter with just the name and contact of the match. We don't share your personal details; that's up to you!",
    icon: (
      <StampSVG fill="rgba(197, 104, 80, 0.08)" stroke="#C56850" background="white">
        <rect x="4" y="14" width="40" height="26" rx="3" fill="#C56850" opacity="0.15" stroke="#C56850" strokeWidth="1.5" />
        <polyline points="4,14 24,28 44,14" stroke="#C56850" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M24 22 C24 19 20 18 20 21 C20 24 24 27 24 27 C24 27 28 24 28 21 C28 18 24 19 24 22 Z"
          fill="#C56850"
        />
      </StampSVG>
    ),
  },
];

// ---------------------------------------------------------------------------
// Mobile carousel
// ---------------------------------------------------------------------------

function MobileCarousel() {
  const [page, setPage] = useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const total = STEPS.length;

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      setPage(p => delta > 0 ? Math.min(p + 1, total - 1) : Math.max(p - 1, 0));
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
          {STEPS.map((step) => (
            <div key={step.number} className="w-full shrink-0 pr-[2px] pb-[2px]">
              <div className="bg-white/80 backdrop-blur rounded-xl border border-border shadow-sm p-6 flex flex-col items-center text-center gap-4 min-h-[220px] justify-center">
                <div className="shrink-0">{step.icon}</div>
                <div>
                  <h3 className="text-sm font-semibold text-dark mb-2">{step.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
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
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Go to step ${i + 1}`}
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
          {...(page >= total - 1 ? { disabled: true } : {})}
          aria-label="Next"
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-dark hover:border-coral/40 transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop list
// ---------------------------------------------------------------------------

function DesktopList() {
  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-[31px] top-10 bottom-10 w-px bg-border" aria-hidden="true" />

      <div className="space-y-4">
        {STEPS.map((step) => (
          <div key={step.number} className="flex gap-5 items-start">
            <div className="shrink-0 w-[62px] flex flex-col items-center mt-[17px]">
              <div className="w-[46px] h-[46px] rounded-full bg-white border border-border shadow-sm flex items-center justify-center text-xs font-bold text-coral z-10">
                {step.number}
              </div>
            </div>
            <div className="flex-1 bg-white/80 backdrop-blur rounded-xl border border-border shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="shrink-0">{step.icon}</div>
                <h3 className="text-sm font-semibold text-dark">{step.title}</h3>
              </div>
              <p className="text-xs text-muted leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function HowMatchingWorks() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <section className="w-full max-w-lg mx-auto">
      <h2
        className="text-2xl font-semibold text-dark text-center mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        How <span className="text-coral">matching</span> works
      </h2>
      <p className="text-sm text-muted text-center mb-10 max-w-md mx-auto leading-relaxed">
        Every match is made by our own purpose-built algorithm (no AI), reviewed with care, and delivered right to your inbox. Our goal is to make conversation feel easy between you both.
      </p>

      {isMobile ? <MobileCarousel /> : <DesktopList />}
    </section>
  );
}
