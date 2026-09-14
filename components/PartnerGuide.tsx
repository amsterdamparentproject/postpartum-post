import Link from "next/link";

const LAST_UPDATED = "September 2026";

/**
 * The Post Perks partnership terms, drafted 2026-09 with Alex directly
 * (no lawyer pass — deliberately plain, short, and low-friction, matching
 * how lightweight the rest of the partner relationship is). Static content:
 * update this file (and LAST_UPDATED above) when the terms change, same as
 * any terms/agreement page. Living here as a portal tab instead of a
 * one-off document sent per partner, since the terms are the same for
 * everyone and a partner should always be able to look them up.
 */
export default function PartnerGuide() {
  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl text-dark mb-1" style={{ fontFamily: "var(--font-serif)" }}>
          Partnership guide
        </h1>
        <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
      </div>

      <p className="text-sm text-dark leading-relaxed">
        Thanks for partnering with Post Perks! Here&apos;s how the partnership works.
      </p>

      <section className="space-y-2">
        <h2 className="text-coral font-semibold">Creating, updating, and removing perks</h2>
        <p className="text-sm text-dark leading-relaxed">
          You manage your perk anytime from the Your Perks tab:
        </p>
        <ul className="text-sm text-dark leading-relaxed list-disc pl-5 space-y-1">
          <li><b>Creating</b> a perk goes through a quick review — usually within 5 business days — before it&apos;s live.</li>
          <li><b>Updating</b> a perk goes through that same review before your changes take effect.</li>
          <li><b>Removing</b> a perk: submit your request by the 23rd of the month, and we&apos;ll make sure it&apos;s off the platform starting the 1st of the next month.</li>
        </ul>
        <p className="text-sm text-dark leading-relaxed">
          This is also how the partnership itself winds down — whenever either of us wants to stop,
          it just means removing the perk. There&apos;s no separate cancellation process, and no fixed
          end date otherwise.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-coral font-semibold">What you get</h2>
        <p className="text-sm text-dark leading-relaxed">Here&apos;s what you get as a Post Perks partner:</p>
        <ul className="text-sm text-dark leading-relaxed list-disc pl-5 space-y-1">
          <li>Your perk featured on Postpartum Post&apos;s monthly match page, seen by all matched members</li>
          <li>
            Your company featured on our{" "}
            <Link href="/perks" className="text-coral hover:underline underline-offset-2">
              public Perks page
            </Link>{" "}
          </li>
          <li>
            On social media (Instagram and LinkedIn): A partnership announcement, plus a minimum of 1
            perk highlight per year
          </li>
          <li>In Amsterdam Parent Project&apos;s <Link href="https://amsterdamparentproject.com/newsletter" className="text-coral hover:underline underline-offset-2">
              newsletter
            </Link>: A minimum of 2 inclusions on the activity list per year</li>
        </ul>
        <p className="text-sm text-dark leading-relaxed">
          This costs you nothing. It&apos;s a straight trade — your discount for this exposure.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-coral font-semibold">No exclusivity</h2>
        <p className="text-sm text-dark leading-relaxed">
          You&apos;re free to offer the same or similar deals through other communities or
          partnerships — we&apos;re not asking for anything exclusive here.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-dark">Using each other&apos;s name</h2>
        <p className="text-sm text-dark leading-relaxed">
          We&apos;ll use your business name, logo, and a link to your site when we promote your perk.
          You&apos;re welcome to mention that you&apos;re a Post Perks partner with Amsterdam Parent
          Project — on your site, socials, wherever. If either of us wants the other to stop using our
          name/logo, just ask and we will.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-coral font-semibold">A couple of practical notes</h2>
        <p className="text-sm text-dark leading-relaxed">
          You&apos;re responsible for actually honoring the perk you&apos;ve offered when a member
          redeems it. We&apos;re just the middleman connecting you with our members — we&apos;re not
          liable for how the redemption itself goes.
        </p>
      </section>
    </div>
  );
}
