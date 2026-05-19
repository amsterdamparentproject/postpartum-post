import SignupForm from "@/components/SignupForm";
import PageLayout from "@/components/PageLayout";
import AnimatedMail from "@/components/AnimatedMail";
import { SubscribeIcon, ChatBubbleIcon, LetterHeartIcon } from "@/components/StepIcons";
import { getStripe } from "@/lib/stripe";

const FIRST20_TOTAL = 20;

async function getFirst20SpotsRemaining(): Promise<number | null> {
  const couponId = process.env.STRIPE_FIRST20_COUPON_ID;
  if (!couponId) return null;
  try {
    const stripe = getStripe();
    const coupon = await stripe.coupons.retrieve(couponId);
    return Math.max(0, FIRST20_TOTAL - (coupon.times_redeemed ?? 0));
  } catch {
    return null;
  }
}

const FAQ = [
  {
    q: "Who is Postpartum Post for?",
    a: "Any new parent in Amsterdam — moms, dads, co-parents, solo parents. Whether your little one is a few weeks old or already toddling, if you're in the postpartum chapter and looking for connection, you're in the right place.",
  },
  {
    q: "How does matching work?",
    a: "Each month, we read through your profile — your neighbourhood, your little one's age, your availability — and hand-pick one other parent we think you'll click with. We introduce you by email, like a little letter. What happens next is up to you.",
  },
  {
    q: "How much does it cost?",
    a: "Plans start at €8/month on a 6-month subscription, or €12/month if you'd prefer to go month-to-month. Our first 20 subscribers get a special forever price of €5/month — a thank-you for believing in us early.",
  },
  {
    q: "Can I skip a month?",
    a: "Yes — every month we'll send you a short email with a one-click skip link. Tap it and we'll skip your match for that month and adjust your billing automatically. No forms, no explanations needed.",
  },
  {
    q: "Can I pause or cancel?",
    a: "Yes, anytime. After three consecutive skips we'll automatically pause your subscription so you're not charged while things are busy. You can also cancel anytime from your account — cancellations take effect at the end of your current billing period.",
  },
  {
    q: "Is my information shared with my match?",
    a: "We share only what you'd expect: your first name and a bit about you and your little one. We never share your address or contact details. Your match gets a warm introduction from us — what comes next is up to both of you.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: <SubscribeIcon />,
    title: "Subscribe",
    description: "Choose your plan and tell us your name. That's all we need to get started.",
  },
  {
    icon: <ChatBubbleIcon />,
    title: "Tell us about yourself",
    description: "A short form about your neighborhood, your little one, and when you're free.",
  },
  {
    icon: <LetterHeartIcon />,
    title: "Receive your Post",
    description: "Each month, we'll introduce you to a new parent nearby — by email, like a little letter.",
  },
];

export default async function Home() {
  const first20SpotsRemaining = await getFirst20SpotsRemaining();

  return (
    <PageLayout showNav activeRoute="/">
      <main className="flex-1 flex flex-col items-center px-6 py-16">

        {/* Hero */}
        <div className="max-w-2xl w-full text-center mb-10">
          <h1
            className="text-5xl sm:text-6xl font-semibold leading-tight mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral italic">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </h1>
          <p className="text-xl text-dark font-medium leading-relaxed mb-3">
            Amsterdam is full of new parents just like you —{" "}
            <span className="text-coral italic">let us introduce you.</span>
          </p>
          <p className="text-base text-muted leading-relaxed max-w-lg mx-auto">
            Every month, we match you with another new parent in your neighborhood
            for coffee, a playdate, or a walk in the park.
          </p>
        </div>

        {/* Animated envelope */}
        <AnimatedMail />

        {/* How it works */}
        <div className="w-full max-w-2xl mt-14 mb-12">
          <h2
            className="text-2xl font-semibold text-dark text-center mb-8"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map(({ icon, title, description }, i) => (
              <div key={i} className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 text-center">
                <div className="flex justify-center mb-3">{icon}</div>
                <h3 className="text-sm font-semibold text-dark mb-2">{title}</h3>
                <p className="text-xs text-muted leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Signup form */}
        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <h2
            className="text-xl font-semibold text-dark mb-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Receive your monthly Post 💌
          </h2>
          <p className="text-sm text-muted mb-6">
            Once you&apos;re subscribed, we&apos;ll get started finding you your first match!
          </p>
          <SignupForm first20SpotsRemaining={first20SpotsRemaining} />
        </div>

        {/* FAQ */}
        <div className="w-full max-w-2xl mt-16 mb-4">
          <h2
            className="text-2xl font-semibold text-dark text-center mb-8"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Questions
          </h2>
          <div className="space-y-3">
            {FAQ.map(({ q, a }, i) => (
              <details key={i} className="group bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm">
                <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-sm font-semibold text-dark list-none select-none">
                  {q}
                  <span className="ml-4 shrink-0 text-muted transition-transform group-open:rotate-45 text-lg leading-none">+</span>
                </summary>
                <p className="px-6 pb-5 text-sm text-muted leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Attribution */}
        <p className="text-xs text-muted mt-8 mb-2 text-center">
          Run by{" "}
          <a
            href="https://amsterdamparentproject.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-coral transition-colors"
          >
            Alex from Amsterdam Parent Project
          </a>
        </p>

      </main>
    </PageLayout>
  );
}
