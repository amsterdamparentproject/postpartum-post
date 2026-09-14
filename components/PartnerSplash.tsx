"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import PartnerLeadForm from "@/components/PartnerLeadForm";
import { StampSVG } from "@/components/StampIcons";
import Sparkle from "@/components/Sparkle";
import WordMark from "@/components/WordMark";
import EnvelopeLogo from "@/components/EnvelopeLogo";

// ---------------------------------------------------------------------------
// Category icons — same stamp-frame language as PersonaCards' icons
// (components/PersonaCards.tsx), drawn fresh for these three because that
// file's icons are illustrating personas, not perk categories.
// ---------------------------------------------------------------------------

function DumbbellIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <rect x="14" y="21" width="20" height="6" rx="3" fill={stroke} opacity="0.6" />
      <rect x="5" y="13" width="11" height="22" rx="3" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <rect x="32" y="13" width="11" height="22" rx="3" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
    </StampSVG>
  );
}

function CupIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <path d="M11 20 L14 38 H34 L37 20 Z" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="13" y1="26" x2="35" y2="26" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M37 24 Q45 24 45 29 Q45 35 37 35" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 16 Q19.5 13.5 18 11" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 14 Q25.5 11.5 24 9" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M30 16 Q31.5 13.5 30 11" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </StampSVG>
  );
}

function BlocksIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <rect x="6" y="24" width="16" height="16" rx="2" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <rect x="26" y="24" width="16" height="16" rx="2" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <rect x="16" y="6" width="16" height="16" rx="2" fill={stroke} opacity="0.30" stroke={stroke} strokeWidth="1.5" />
    </StampSVG>
  );
}

function MusicNoteIcon({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <StampSVG fill={fill} stroke={stroke} background="white">
      <circle cx="16" cy="36" r="6" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <circle cx="34" cy="32" r="6" fill={stroke} opacity="0.15" stroke={stroke} strokeWidth="1.5" />
      <line x1="22" y1="36" x2="22" y2="10" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="40" y1="32" x2="40" y2="8" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M22 10 L40 8 L40 16 L22 18 Z" fill={stroke} opacity="0.5" />
    </StampSVG>
  );
}

// ---------------------------------------------------------------------------
// Card design tokens — same palette as PersonaCards (green, purple, tan)
// ---------------------------------------------------------------------------

const CARD_SHAPES = [
  "62% 38% 46% 54% / 60% 44% 56% 40%",
  "38% 62% 54% 46% / 44% 56% 40% 60%",
  "54% 46% 38% 62% / 56% 40% 60% 44%",
  "28% 72% 42% 58% / 68% 32% 62% 38%",
];

const BORDER_COLORS = [
  "rgba(212, 224, 155, 0.70)",
  "rgba(175, 153, 255, 0.45)",
  "rgba(212, 163, 115, 0.55)",
  "rgba(212, 224, 155, 0.70)",
];

const STAMP_FILLS = [
  "rgba(212, 224, 155, 0.18)",
  "rgba(175, 153, 255, 0.10)",
  "rgba(212, 163, 115, 0.12)",
  "rgba(212, 224, 155, 0.18)",
];

const HIGHLIGHT_COLORS = ["#8A9E3A", "#7B6FD4", "#C07830", "#8A9E3A"];

// Illustrative only — no partners are live yet, so these aren't real
// listings. Categories match postpartumpost.perk_categories (see
// db/migrations/024_perks.sql) so the examples stay honest about what
// kinds of perks the taxonomy actually supports.
const EXAMPLE_PERKS: { icon: (fill: string, stroke: string) => React.ReactNode; text: (color: string) => React.ReactNode }[] = [
  {
    icon: (f, s) => <CupIcon fill={f} stroke={s} />,
    text: (c) => <>A <strong style={{ color: c }}>free babyccino</strong> with coffee at your cafe</>,
  },
  {
    icon: (f, s) => <DumbbellIcon fill={f} stroke={s} />,
    text: (c) => <><strong style={{ color: c }}>€5 off</strong> their first parent &amp; toddler yoga class</>,
  },
  {
    icon: (f, s) => <BlocksIcon fill={f} stroke={s} />,
    text: (c) => <><strong style={{ color: c }}>Free parent entry</strong> with a child ticket at your play cafe</>,
  },
  {
    icon: (f, s) => <MusicNoteIcon fill={f} stroke={s} />,
    text: (c) => <><strong style={{ color: c }}>20% off</strong> your baby music class</>,
  },
];

/**
 * /partners — a public splash page pitching the idea to businesses and
 * capturing their interest, regardless of session state (see that page's
 * docblock). Lead capture is the primary CTA (own section, always
 * visible). Sign-in for existing partners is a single link near the top
 * to /partners/login, rather than an inline widget — keeps this page
 * focused on the pitch instead of also carrying sign-in mechanics.
 */
/**
 * Sparkle divider above "What's a Post Perk?" — plays the shared .wiggle
 * keyframe (app/globals.css) once when scrolled into view, rather than on
 * hover like SubscribeSection's envelope or GiftBow's group-hover variant,
 * since there's nothing to hover here as the page scrolls past it.
 */
function AnimatedSparkleDivider() {
  const ref = useRef<HTMLDivElement>(null);
  const [wiggling, setWiggling] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setWiggling(true);
          // Reset once the animation finishes so scrolling away and back
          // (or a later remount) can retrigger it.
          setTimeout(() => setWiggling(false), 550);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center mb-4">
      <Sparkle className={`w-20 h-auto${wiggling ? " wiggle" : ""}`} />
    </div>
  );
}

/**
 * Carousel for the example-perk cards — mirrors PersonaCards' pagination
 * exactly (2-per-page desktop / 1-per-page mobile, swipe + arrows + dots)
 * so the two feel like the same visual system.
 */
function ExampleCarousel() {
  const [mounted, setMounted] = useState(false);
  const [perPage, setPerPage] = useState(2);
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);

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

  const totalPages = Math.ceil(EXAMPLE_PERKS.length / perPage);

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
            <div key={pageIndex} className="w-full shrink-0 flex gap-4 px-1 pt-1 pb-2">
              {EXAMPLE_PERKS.slice(pageIndex * perPage, (pageIndex + 1) * perPage).map((perk, cardIndex) => {
                const global = pageIndex * perPage + cardIndex;
                return (
                  <div
                    key={cardIndex}
                    className="flex-1 bg-white/90 backdrop-blur shadow-sm p-[18px] min-h-[225px] flex flex-col items-center justify-center gap-4 text-center"
                    style={{
                      borderRadius: CARD_SHAPES[global],
                      border: `1.5px solid ${BORDER_COLORS[global]}`,
                    }}
                  >
                    {perk.icon(STAMP_FILLS[global], HIGHLIGHT_COLORS[global])}
                    <p className="text-sm text-dark leading-relaxed max-w-[24ch]">{perk.text(HIGHLIGHT_COLORS[global])}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

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
    </div>
  );
}

export default function PartnerSplash() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="max-w-2xl mx-auto text-center mb-8">
        <div className="flex justify-center mb-6">
          <EnvelopeLogo width={72} height={54} />
        </div>
        <h1 className="text-3xl md:text-4xl leading-snug" style={{ fontFamily: "var(--font-serif)" }}>
          <span className="text-coral">We&apos;re introducing new parents to each other</span>{" "}
          <span className="text-dark">— and to the local businesses that support them.</span>
        </h1>
        <p className="mt-6 text-base text-dark leading-relaxed max-w-lg mx-auto">
          <WordMark size="text-base" />{" "}connects local businesses with members —
          new and expecting parents across Amsterdam — through a Post Perk they&apos;re excited to
          use with their match.
        </p>
      </div>

      {/* Sign in — secondary, for existing partners */}
      <p className="text-center text-sm text-muted mb-12">
        Are you an existing partner?{" "}
        <Link
          href="/partners/login"
          className="text-coral hover:text-coral-dark font-medium underline underline-offset-2 whitespace-nowrap"
        >
          Manage your Post Perks here
        </Link>
      </p>

      <AnimatedSparkleDivider />

      {/* What's a perk */}
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl text-dark mb-4" style={{ fontFamily: "var(--font-serif)" }}>
          What&apos;s a <span className="text-coral">Post Perk</span>?
        </h2>
        <p className="text-base text-dark leading-relaxed max-w-lg mx-auto">
          A perk is a discount, freebie, or exclusive offer you give Postpartum Post
          members, in exchange for a spot in front of an audience that&apos;s actively
          building their new-parent routines in Amsterdam. We want your perk to be{" "}
          <strong>the friendly introduction to their new favorite thing to do as a parent</strong>.
        </p>
      </div>

      {/* Examples */}
      <div className="w-full max-w-sm md:max-w-xl mx-auto">
        <h2 className="text-2xl text-dark text-center mb-6" style={{ fontFamily: "var(--font-serif)" }}>
          Post Perks look like this
        </h2>
        <ExampleCarousel />
      </div>

      {/* What partners get — icon + bold coral header on its own line,
          description below it, each left-aligned. (Tried folding the
          description into the same line as the header, centered like the
          homepage stats list — too ragged once the sentences run long.) */}
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl text-dark mb-6" style={{ fontFamily: "var(--font-serif)" }}>
          What partners get
        </h2>
        <ul className="max-w-lg mx-auto text-left space-y-6">
          <li className="flex items-start gap-3">
            <EnvelopeLogo width={22} height={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-coral">A relevant audience</p>
              <p className="text-sm text-dark leading-relaxed mt-1">
                Reach new and expecting parents who are actively looking for what
                you offer, without the effort of social media.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <EnvelopeLogo width={22} height={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-coral">Co-promotion</p>
              <p className="text-sm text-dark leading-relaxed mt-1">
                We feature your perk across Amsterdam Parent Project's  <a
                  href="https://amsterdamparentproject.nl"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-umami-event="Partners: APP Website Link"
                  className="underline underline-offset-2 hover:text-coral transition-colors"
                >
                  programs
                </a>,{" "}
                <a
                  href="https://amsterdamparentproject.nl/newsletter"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-umami-event="Partners: Newsletter Link"
                  className="underline underline-offset-2 hover:text-coral transition-colors"
                >
                  newsletter
                </a>{" "}
                (850+ highly-engaged, local parents),{" "}
                <a
                  href="https://instagram.com/amsterdamparentproject"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-umami-event="Partners: Instagram Link"
                  className="underline underline-offset-2 hover:text-coral transition-colors"
                >
                  Instagram
                </a>
                , and{" "}
                <a
                  href="https://www.linkedin.com/company/amsterdam-parent-project"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-umami-event="Partners: LinkedIn Link"
                  className="underline underline-offset-2 hover:text-coral transition-colors"
                >
                  LinkedIn
                </a>
                .
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <EnvelopeLogo width={22} height={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-coral">It costs nothing but the perk itself</p>
              <p className="text-sm text-dark leading-relaxed mt-1">
                No partnership fee or cut. You give members a discount or freebie; we give you
                the introduction. It's our mission and our joy to help both sides discover each other.
              </p>
            </div>
          </li>
        </ul>
      </div>

      {/* Lead capture — primary CTA */}
      <div className="max-w-lg mx-auto">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <div className="flex justify-center mb-6">
            <Sparkle className="w-16 h-auto" />
          </div>
          <h2 className="text-2xl text-dark mb-2" style={{ fontFamily: "var(--font-serif)" }}>
            Interested in offering a Post Perk?
          </h2>
          <p className="text-muted mb-6">
            Tell us about your business to kickstart the discussion on a perk that works for you and our members.
          </p>
          <PartnerLeadForm defaultEmail="" />
        </div>
      </div>
    </div>
  );
}
