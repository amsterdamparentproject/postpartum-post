import { cohortHeader, COHORT_HEADER_PRELOAD } from "@/lib/emails/welcome-cohort";
import type { MeetupMode } from "@/lib/meetup-mode";

/**
 * Per-cohort email extras, keyed by cohorts.slug. Everything is optional: a
 * cohort with no entry (or an entry without a given field) gets the generic
 * version of that piece, so a new cohort sends sensible emails before anyone
 * writes it a bespoke one.
 *
 * Plain code on purpose (not a column): copy and images are reviewed in git
 * like every other email. The slug must match cohorts.slug exactly; a
 * mismatch silently falls back to the generic email.
 */
/**
 * Per-cohort pieces of the private match page (/matches/[id]). Every field is
 * optional; a cohort without them still gets the local/online treatment, just
 * with the standard logo and wording.
 */
export type CohortMatchPageConfig = {
  /** Replaces the envelope logo at the top of the page. The path is under /public. */
  banner?: { src: string; alt: string; width: number; height: number };
  /** One line under the header, said to both members. Plain text. */
  intro?: string;
  /** Conversation starters shown to pairs meeting by video (or deciding). Plain text. */
  starters?: { text: string; translation: string }[];
  /** Subject of the "Email {name}" button. */
  emailSubject?: (ctx: { topic: string | null; mode: MeetupMode }) => string;
};

export type CohortConfig = {
  /** Replaces the standard header at the top of the cohort's welcome and opt-in emails. */
  headerHtml?: string;
  /** Goes in the email's <head> so the header image above loads early. */
  headerPreload?: string;
  /** Extra paragraph in the opt-in email, plain text (escaped by the template). */
  optinNote?: { lead?: string; body: string };
  /** Welcome email: sentence about who the member will be matched with. Plain text. */
  welcomeMatchLine?: string;
  /** Welcome email: closing sentence saying the match is a gift and nothing renews. Plain text. */
  welcomeGiftLine?: string;
  /** Welcome email: closing sentence about what happens after the free match. Plain text. */
  welcomeContinueLine?: string;
  /** The cohort's version of the match page. */
  matchPage?: CohortMatchPageConfig;
};

export const COHORT_CONFIG: Record<string, CohortConfig> = {
  dsa: {
    headerHtml: cohortHeader(),
    headerPreload: COHORT_HEADER_PRELOAD,
    optinNote: {
      lead: "Live outside Amsterdam?",
      body: "No problem: Dutch Speaking Academy parents live all over, so you can be matched wherever you are. If you live near each other, try to meet in person! If not, a video call is a great way to practice Dutch together. You'll agree on what works once you're introduced.",
    },
    welcomeMatchLine:
      "Every round starts with a hand-picked introduction, delivered via email. Your match will be another parent from Dutch Speaking Academy to practice real Dutch with, in person if you live nearby or on a video call if you don't.",
    welcomeGiftLine: "Your match is a gift from your course — no charge, and nothing renews on its own.",
    welcomeContinueLine:
      "If you want to continue practicing Dutch and/or meeting new parents afterwards, keep an eye on your inbox after the next round has finished!",
    matchPage: {
      // The same double-branded banner as the cohort emails.
      banner: {
        src: "/email-images/welcome-dsa.png",
        alt: "Dutch Speaking Academy and Postpartum Post",
        width: 600,
        height: 200,
      },
      intro: "You're both part of the Dutch Speaking Academy community, so this match is a chance to practice real Dutch with another parent.",
      starters: [
        { text: "Hoe heet je kindje en hoe oud is het?", translation: "What's your little one's name, and how old are they?" },
        { text: "Hoe slaapt je kindje de laatste tijd?", translation: "How has your little one been sleeping lately?" },
        { text: "Waar kom je oorspronkelijk vandaan?", translation: "Where are you originally from?" },
        { text: "Hoe lang woon je al in Nederland?", translation: "How long have you lived in the Netherlands?" },
        { text: "Welk Nederlands woord vind jij het moeilijkst?", translation: "Which Dutch word do you find the hardest?" },
        { text: "Wat doe je het liefst als je een uurtje voor jezelf hebt?", translation: "What do you like to do most when you have an hour to yourself?" },
      ],
      emailSubject: ({ topic, mode }) => {
        const tag = "(Dutch Speaking Academy × Postpartum Post)";
        if (mode === "online") return `Let's set up a video call! ${tag}`;
        if (mode === "unknown") return `Let's plan our meetup! ${tag}`;
        return `Let's meet for a ${topic || "hang"}! ${tag}`;
      },
    },
  },
};

/** The config for a cohort slug, or an empty one (all generic) when there is none. */
export function getCohortConfig(slug: string | null | undefined): CohortConfig {
  return (slug && COHORT_CONFIG[slug]) || {};
}
