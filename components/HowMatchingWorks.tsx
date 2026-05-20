/**
 * HowMatchingWorks
 *
 * Reusable section explaining the matching process.
 * Used on /how-it-works (standalone, linked from monthly email)
 * and embedded in /about (for prospective members).
 */

const STEPS = [
  {
    number: "01",
    title: "Fill in your profile",
    description:
      "Tell us your language, when you're free, and your child's birth month or due date. The more you share, the better we can match you. (But we'll still match you regardless!)",
    icon: (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" fill="none">
        <rect x="8" y="6" width="32" height="36" rx="3" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
        <line x1="15" y1="16" x2="33" y2="16" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="22" x2="33" y2="22" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
        <line x1="15" y1="28" x2="25" y2="28" stroke="#D4614A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="35" cy="35" r="7" fill="#D4614A" />
        <path d="M32 35 L34.5 37.5 L38 33" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Choose your topic",
    description:
      "On the 1st of each month, we ask whether you'd like to participate and what you'd like to connect over — coffee, a playdate, or another topic around parenthood. You can also choose to skip that month, at no cost to you.",
    icon: (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" fill="none">
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
    ),
  },
  {
    number: "03",
    title: "We find your best match",
    description:
      "We compare your profile with every active member and score compatibility. Language comes first, then shared availability, topic, and — based on your preference — how close you live or how similar your children's ages are.",
    icon: (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" fill="none">
        {/* Left puzzle piece — angled, tab on right edge */}
        <g transform="rotate(-18, 9.5, 22)">
          <path
            d="M 3,14 H 16 V 19 A 3 3 0 0 1 16 25 V 30 H 3 Z"
            fill="#D4614A" opacity="0.18" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round"
          />
        </g>
        {/* Right puzzle piece — angled, notch on left edge */}
        <g transform="rotate(18, 37, 22)">
          <path
            d="M 30,14 H 44 V 30 H 30 V 25 A 3 3 0 0 0 30 19 Z"
            fill="#D4614A" opacity="0.18" stroke="#D4614A" strokeWidth="1.5" strokeLinejoin="round"
          />
        </g>
        {/* Spark lines at connection point */}
        <line x1="24" y1="4" x2="24" y2="8.5" stroke="#D4614A" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="19" y1="6" x2="21.5" y2="9.5" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="29" y1="6" x2="26.5" y2="9.5" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    number: "04",
    title: "Receive your Post",
    description:
      "We introduce you both by email: a warm letter with just the name and contact of the match. We don't share your personal details; that's up to you!",
    icon: (
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" fill="none">
        <rect x="4" y="14" width="40" height="26" rx="3" fill="#D4614A" opacity="0.15" stroke="#D4614A" strokeWidth="1.5" />
        <polyline points="4,14 24,28 44,14" stroke="#D4614A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M24 22 C24 19 20 18 20 21 C20 24 24 27 24 27 C24 27 28 24 28 21 C28 18 24 19 24 22 Z"
          fill="#D4614A"
        />
      </svg>
    ),
  },
];

const CRITERIA = [
  {
    rank: 1,
    label: "Language",
    detail: "We only pair people who can talk with each other.",
    color: "bg-coral",
    textColor: "text-white",
  },
  {
    rank: 2,
    label: "Availability",
    detail: "Matching schedules means you can actually meet.",
    color: "bg-coral/70",
    textColor: "text-white",
  },
  {
    rank: 3,
    label: "Topic",
    detail: "Shared interests make the first conversation easier.",
    color: "bg-coral/45",
    textColor: "text-white",
  },
  {
    rank: 4,
    label: "Location or children's age",
    detail: "A parent in the neighborhood or with kids close in age — or both!",
    color: "bg-coral/20",
    textColor: "text-dark",
  },
];

export default function HowMatchingWorks() {
  return (
    <section className="w-full max-w-lg mx-auto">

      {/* Heading */}
      <h2
        className="text-2xl font-semibold text-dark text-center mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        How <span className="text-coral italic">matching</span> works
      </h2>
      <p className="text-sm text-muted text-center mb-10 max-w-md mx-auto leading-relaxed">
        Every match is made by our own purpose-built algorithm (no AI), reviewed with care, and delivered like a little letter. Our goal is to make conversation feel easy between you both.
      </p>

      {/* Steps */}
      <div className="relative">
        {/* Vertical connector line — mobile (centered under the bubble) */}
        <div className="block md:hidden absolute left-1/2 -translate-x-1/2 top-[23px] bottom-[23px] w-px bg-border" aria-hidden="true" />
        {/* Vertical connector line — desktop (aligned with the bubble column) */}
        <div className="hidden md:block absolute left-[31px] top-10 bottom-10 w-px bg-border" aria-hidden="true" />

        <div className="space-y-4">
          {STEPS.map((step) => (
            <div key={step.number} className="flex flex-col md:flex-row gap-3 md:gap-5 items-center md:items-start">
              {/* Step number circle — above card on mobile, left of card on md+ */}
              <div className="shrink-0 w-[46px] md:w-[62px] flex flex-col items-center md:mt-[17px]">
                <div className="w-[46px] h-[46px] rounded-full bg-white border border-border shadow-sm flex items-center justify-center text-xs font-bold text-coral z-10">
                  {step.number}
                </div>
              </div>

              {/* Card — full width on mobile, flex-1 on md+ */}
              <div className="w-full md:flex-1 bg-white/80 backdrop-blur rounded-xl border border-border shadow-sm p-5 flex flex-col items-center text-center md:block md:text-left">
                <div className="flex flex-col items-center md:flex-row md:items-center gap-3 mb-2">
                  <div className="shrink-0">{step.icon}</div>
                  <h3 className="text-sm font-semibold text-dark">{step.title}</h3>
                </div>
                <p className="text-xs text-muted leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}
