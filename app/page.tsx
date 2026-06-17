import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
import PersonaCards from "@/components/PersonaCards";
import SubscribeSection from "@/components/SubscribeSection";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase";
import WordMark from "@/components/WordMark";

const FIRST20_TOTAL = 20;

// Statically prerender the homepage and regenerate at most every 5 minutes,
// so the FIRST20 spots-remaining count refreshes without a per-request Stripe
// call. Avoid reading Request-time APIs (searchParams, cookies, headers) here —
// they would opt the route into per-request dynamic rendering.
export const revalidate = 300;

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.floor(seconds / 60));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

async function getActiveMemberStats(): Promise<{ count: number; lastJoinedAt: Date | null; recentCount: number } | null> {
  try {
    const supabase = createAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [
      { count, error: countError },
      { data, error: lastError },
      { count: recentCount, error: recentError },
    ] = await Promise.all([
      supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("members").select("created_at").eq("status", "active").order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").gte("created_at", thirtyDaysAgo),
    ]);
    if (countError) return null;
    return {
      count: count ?? 0,
      lastJoinedAt: data?.created_at && !lastError ? new Date(data.created_at) : null,
      recentCount: recentError ? 0 : (recentCount ?? 0),
    };
  } catch {
    return null;
  }
}

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
  const [first20SpotsRemaining, memberStats] = await Promise.all([
    getFirst20SpotsRemaining(),
    getActiveMemberStats(),
  ]);

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

        {/* Member stats */}
        {memberStats !== null && memberStats.count > 0 && (
          <div className="w-full max-w-md mb-12 text-center">
            <h2
              className="text-2xl text-dark text-center mb-6"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              <WordMark size="text-2xl" /> stats
            </h2>
            <ul className="space-y-2">
              <li className="flex items-center justify-center gap-3 text-sm text-dark">
                <EnvelopeLogo width={22} height={16} className="shrink-0" />
                <span><span className="font-bold text-coral bg-white/80 rounded-full px-2 py-0.5" style={{ border: "1.5px solid rgba(212, 224, 155, 0.70)" }}>{memberStats.count} {memberStats.count === 1 ? "member" : "members"}</span> getting a match next month</span>
              </li>
              {memberStats.lastJoinedAt && (
                <li className="flex items-center justify-center gap-3 text-sm text-dark">
                  <EnvelopeLogo width={22} height={16} className="shrink-0" />
                  <span>Last member joined <span className="font-bold text-coral bg-white/80 rounded-full px-2 py-0.5" style={{ border: "1.5px solid rgba(175, 153, 255, 0.45)" }}>{formatRelativeTime(memberStats.lastJoinedAt)}</span></span>
                </li>
              )}
              {memberStats.recentCount > 0 && (
                <li className="flex items-center justify-center gap-3 text-sm text-dark">
                  <EnvelopeLogo width={22} height={16} className="shrink-0" />
                  <span><span className="font-bold text-coral bg-white/80 rounded-full px-2 py-0.5" style={{ border: "1.5px solid rgba(212, 163, 115, 0.55)" }}>{memberStats.recentCount} joined</span> in the last month</span>
                </li>
              )}
            </ul>
            <a
              href="#subscribe-form"
              className="inline-block mt-6 bg-coral text-white text-sm font-semibold rounded-full px-5 py-2 hover:opacity-90 transition-opacity"
            >
              Are you our member #{memberStats.count + 1}?
            </a>
          </div>
        )}

        {/* Signup form */}
        <div id="subscribe-form" className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <SubscribeSection first20SpotsRemaining={first20SpotsRemaining} pilotOnly={pilotOnly} />
        </div>

      </main>
    </PageLayout>
  );
}
