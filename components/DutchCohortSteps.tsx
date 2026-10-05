import { StampSVG, EnvelopeStamp, GiftStamp } from "@/components/StampIcons";
import type { HowStep } from "@/components/HowMatchingWorks";

/** Steps for the Dutch Speaking Academy page, rendered by HowMatchingWorks. */
export const DSA_STEPS: HowStep[] = [
  {
    number: "01",
    title: "Join Dutch for Parents",
    description: (
      <>
        <a
          href="https://dutchspeakingacademy.nl/dutch-for-parents-academy/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-coral transition-colors"
        >
          Register for the course
        </a>
        . After signing up, you&apos;ll receive your free code for Postpartum Post.
      </>
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
      "Your course comes with one free match with another student. Use your Dutch for Parents code to claim it.",
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
      "After your free match, we'll email you a special offer for Dutch for Parents students to keep you practicing Dutch even after the course ends. Completely optional.",
    icon: <GiftStamp background="white" />,
  },
];
