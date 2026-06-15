import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
import PersonaCards from "@/components/PersonaCards";
import SubscribeSection from "@/components/SubscribeSection";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase";
import WordMark from "@/components/WordMark";

const FIRST20_TOTAL = 20;

// Statically prerender the homepage and regenerate at most every 5 minutes,
// so the FIRST20 spots-remaining count refreshes without a per-request Stripe
// call. Avoid reading Request-time APIs (searchParams, cookies, headers) here —
// they would opt the route into per-request dynamic rendering.
export const revalidate = 300;

async function getFirst20SpotsRemaining(): Promise<number | null> {
  const priceId = process.env.STRIPE_FOUNDING_MEMBER_PRICE_ID;
  if (!priceId) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("member_id")
      .eq("stripe_price_id", priceId);
    if (error) return null;
    const uniqueMembers = new Set((data ?? []).map((r) => r.member_id)).size;
    return Math.max(0, FIRST20_TOTAL - uniqueMembers);
  } catch {
    return null;
  }
}


// Set to false to open general subscriptions (€8/mo and €12/mo plans).
// Also flips to false automatically when FIRST20 sells out.
const PILOT_ONLY = true;

export default async function Home() {
  const first20SpotsRemaining = await getFirst20SpotsRemaining();

  const pilotOnly = first20SpotsRemaining === 0 ? false : PILOT_ONLY;

  return (
    <PageLayout showNav activeRoute="/">
      <main className="flex-1 flex flex-col items-center px-6 px-6 md:py-16">

        {/* Hero */}
        <div className="max-w-xl w-full text-center mb-10">
          <h1
            className="text-5xl hidden md:block leading-tight text-center"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral">Amsterdam is full of parents like you.</span>{" "}<span className="block text-dark">Let us introduce you.</span>
          </h1>
          <h1
            className="text-3xl max-w-lg mt-6 md:hidden leading-tight text-center mx-auto"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral">Amsterdam is full of parents like you.</span>{" "}
            <span className="text-dark">Let us introduce you.</span>
          </h1>
          <p className="mt-6 text-base text-dark leading-relaxed max-w-lg mx-auto">
            Instead of searching for community, get it delivered right to you. Every month, we send you a curated friendship starter pack: a match with someone local who's navigating pregnancy or early parenthood like you, plus neighborhood activities handpicked for your families.
          </p>
        </div>

        {/* Persona cards */}
        <div className="w-full max-w-sm md:max-w-xl mt-2 md:mt-6 mb-12">
          <h2
            className="text-2xl text-dark text-center mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            We made <WordMark size="text-2xl"/> for you
          </h2>
          <p className="mb-8 italic text-center text-base text-dark leading-relaxed max-w-lg mx-auto">For new parents at every stage, from pregnancy to age 4</p>
          <PersonaCards />
        </div>

        {/* Animated envelope */}
        <AnimatedMail />

        {/* Alex intro */}
        <div id="alex-intro" className="w-full max-w-md mt-12 mb-6 text-center">
          <h2
            className="text-2xl text-dark text-center mx-auto"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Delivered with joy by <span className="text-coral">someone who gets it</span>
          </h2>
        </div>
        <div className="w-full max-w-lg mb-12 px-2 flex flex-col sm:flex-row items-center gap-6">
          <div
            className="shrink-0 overflow-hidden w-24 h-24"
            style={{ borderRadius: "62% 38% 46% 54% / 60% 44% 56% 40%" }}
          >
            <Image
              src="/alex.jpg"
              alt="Alex, founder of Postpartum Post"
              width={96}
              height={96}
              className="object-cover w-24 h-24"
            />
          </div>
          <div>
            <p className="text-sm text-dark leading-relaxed">
              Hi, I&apos;m Alex 👋🏻 I'm a local toddler mom and someone who knows exactly how isolating and overwhelming parenthood can feel. Becoming a mom abroad and dealing with burnout led me to start the nonprofit {" "}
              <a
                href="https://amsterdamparentproject.nl"
                target="_blank"
                rel="noopener noreferrer"
                data-umami-event="Bio: Amsterdam Parent Project"
                className="underline underline-offset-2 hover:text-coral transition-colors"
              >
                Amsterdam Parent Project
              </a>
              {" "}— where I&apos;ve been running new parent support programs long enough to see that <b>the right connection at the right time changes <i>everything</i></b> in parenthood. Postpartum Post is my way of making that easier to find.
            </p>
            {/* FAQ link */}
            <p className="text-xs text-muted mt-4 mb-2">
              Have questions?{" "}
              <a
                href="/about"
                className="underline underline-offset-2 hover:text-coral transition-colors"
              >
                Visit the About page
              </a>
            </p>
          </div>
        </div>

        {/* Signup form */}
        <div id="subscribe-form" className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <SubscribeSection first20SpotsRemaining={first20SpotsRemaining} pilotOnly={pilotOnly} />
        </div>

      </main>
    </PageLayout>
  );
}
