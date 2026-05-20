"use client";

/**
 * FAQ
 *
 * Expandable accordion for frequently asked questions.
 * Used on the home page and /about. Add new entries to the FAQS array below.
 */

import { useState } from "react";

const FAQS = [
  {
    question: "Who is Postpartum Post for?",
    answer:
      "Any parent in Amsterdam — moms, dads, nonbinary parents, co-parents, solo parents. Whether your child is a few weeks old or already at school, if you're looking for connection, you're in the right place. Postpartum just means \"after birth,\" after all 😉",
  },
  {
    question: "Can I subscribe if I'm pregnant or expecting a baby?",
    answer:
      "Absolutely — expectant parents are very welcome. When you set up your profile you can add your due date, and we'll factor it in when matching you. You might be paired with someone who is also pregnant, or with a parent whose baby arrived not long ago. Either way, connecting before your little one arrives can make all the difference when those early weeks begin.",
  },
  {
    question: "How does matching work?",
    answer:
      "Each month, we read through your profile — your neighborhood, your child's age, your availability — and pick one other parent you share common ground with. We warmly introduce you by email. What happens next is totally up to you!",
  },
  {
    question: "Can I skip a month?",
    answer:
      "Yes! Our start-of-the-month match email has a skip link. One click and we'll skip your match for that month, plus adjust your billing automatically. No extra charge, form, or fuss. We get it — we're busy parents, too.",
  },
  {
    question: "Can I pause or cancel?",
    answer:
      "Yes, anytime. On a monthly plan, after three consecutive skips we'll automatically pause your subscription so you're not being charged while things are busy. On a 6-month plan, you can skip as many months as you need — you've already committed, so we'll never auto-pause you. You can cancel anytime from your account, and cancellations take effect at the end of your current billing period.",
  },
  {
    question: "What information is shared with my match?",
    answer:
      "We share only your name and contact email with the parent you've matched with that month in our warm introduction. We never share your personal profile details.",
  },
  {
    question: "How is my personal information protected?",
    answer:
      "We store only what we need to match you. We never sell your data, share it with third parties, or use it for anything other than running the service. You can delete your data via the profile, or your account and all associated data at any time by contacting us. We take privacy really seriously, so please reach out with any concerns!",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="w-full max-w-2xl mx-auto">
      <h2
        className="text-2xl font-semibold text-dark text-center mb-2"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Frequently asked <span className="text-coral italic">questions</span>
      </h2>
      <p className="text-sm text-muted text-center mb-8 max-w-md mx-auto leading-relaxed">
        Still wondering? Here are some things people often ask before joining.
      </p>

      <div className="space-y-2">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-dark leading-snug">
                  {faq.question}
                </span>
                <span
                  className="shrink-0 text-muted transition-transform duration-200"
                  style={{ transform: isOpen ? "rotate(45deg)" : "rotate(0deg)" }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                    <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="px-6 pb-5">
                  <p className="text-sm text-muted leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
