import { StampSVG, EnvelopeStamp, GiftStamp, SparkleStamp } from "@/components/StampIcons";
import type { HowStep } from "@/components/HowMatchingWorks";
import type { CohortPerk } from "@/lib/cohort-perk";
import Sparkle from "@/components/Sparkle";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import Link from "next/link";

// DSA's own color, sampled from its logo, used as an accent next to Post's coral.
export const DSA_TERRACOTTA = "#B1502B";

/**
 * Step 0: the optional member perk. It sits before "Join Dutch Speaking
 * Academy" because the discount can only be applied at DSA checkout, not
 * afterward. /my-perks handles both paths (sign in, or join to unlock).
 */
export function dsaPerkStep(perk: CohortPerk): HowStep {
  return {
    number: "00",
    badge: <Sparkle className="w-4 h-4 md:w-6 md:h-6" />,
    title: perk.estimatedSavings
      ? `Just for members: Save €${perk.estimatedSavings} on your course`
      : "Just for members: Activate your member perk",
    description: (
      <>
        For existing Postpartum Post members, activate your{" "}
        <PostPerksWordMark size="text-sm" plural={false} /> for {perk.title}
        {perk.estimatedSavings ? <> — saving €{perk.estimatedSavings}</> : null}. Do this before you
        register, because the discount can&apos;t be added afterward! Not a Postpartum Post member
        yet? Joining takes a minute, and you can claim your free match either way.
      </>
    ),
    icon: <SparkleStamp background="white" />,
    // One label for everyone: /my-perks opens the perk for a signed-in member,
    // and for anyone else offers sign-in plus the membership signup, keeping
    // the perk link through either.
    action: (
      <Link
        href={`/my-perks?perk=${perk.slug ?? perk.id}`}
        data-umami-event="DSA: Claim member discount"
        className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-full text-sm font-bold text-white hover:brightness-110 hover:-translate-y-0.5 transition"
        style={{ backgroundColor: "#8A9E3A" }}
      >
        Claim your member discount
        <span aria-hidden="true">→</span>
      </Link>
    ),
  };
}

/** Steps for the Dutch Speaking Academy page, rendered by HowMatchingWorks. */
export const DSA_STEPS: HowStep[] = [
  {
    number: "01",
    title: "Join Dutch Speaking Academy",
    description:
      "Register for a course with Dutch Speaking Academy. After signing up, you'll receive your free code for Postpartum Post, which will enable you to join the Dutch Speaking Academy cohort on Postpartum Post.",
    action: (
      <a
        href="https://dutchspeakingacademy.nl/dutch-for-parents-academy/"
        target="_blank"
        rel="noopener noreferrer"
        data-umami-event="DSA: Register for a course"
        className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-full text-sm font-bold text-white hover:brightness-110 hover:-translate-y-0.5 transition"
        style={{ backgroundColor: DSA_TERRACOTTA }}
      >
        Register for a course
        <span aria-hidden="true">→</span>
      </a>
    ),
    icon: (
      <StampSVG fill="rgba(197, 104, 80, 0.08)" stroke="#C56850" background="white">
        <path d="M4 20 L24 10 L44 20 L24 30 Z" fill="#C56850" opacity="0.15" stroke="#C56850" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 25 V34 C12 37 18 40 24 40 C30 40 36 37 36 34 V25" fill="none" stroke="#C56850" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="44" y1="20" x2="44" y2="31" stroke="#C56850" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="44" cy="33" r="2" fill="#C56850" />
      </StampSVG>
    ),
  },
  {
    number: "02",
    title: "Sign up here with your code",
    description:
      "Your course comes with one free match with another student. Use your Dutch Speaking Academy code to claim it.",
    icon: (
      <StampSVG fill="rgba(175, 153, 255, 0.10)" stroke="#AF99FF" background="white">
        <circle cx="16" cy="24" r="9" fill="#AF99FF" opacity="0.15" stroke="#AF99FF" strokeWidth="1.5" />
        <circle cx="16" cy="24" r="3" fill="#AF99FF" opacity="0.8" />
        <line x1="25" y1="24" x2="43" y2="24" stroke="#AF99FF" strokeWidth="2" strokeLinecap="round" />
        <line x1="36" y1="24" x2="36" y2="31" stroke="#AF99FF" strokeWidth="2" strokeLinecap="round" />
        <line x1="42" y1="24" x2="42" y2="30" stroke="#AF99FF" strokeWidth="2" strokeLinecap="round" />
      </StampSVG>
    ),
  },
  {
    number: "03",
    title: "Opt in, get matched, meet up",
    description:
      "Opt in between the 1st and the 5th of next month. Your match is revealed on the 7th. You decide when and how to meet.",
    icon: <EnvelopeStamp background="white" />,
  },
  {
    number: "04",
    title: "Continue with a special discount",
    description:
      "After your free match, we'll email you a special offer just for Dutch Speaking Academy students who want to continue. Completely optional, but a wonderful way to keep practicing Dutch — even after the course ends!",
    icon: <GiftStamp background="white" />,
  },
];
