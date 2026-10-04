import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";

const description = "The rules for the Post Perks giveaway from Postpartum Post: what you can win, how to enter, and how winners are picked.";

export const metadata: Metadata = {
  title: "Giveaway Terms",
  description,
  openGraph: {
    title: "Giveaway Terms · Postpartum Post",
    description,
  },
};

/**
 * Terms for the "win 1 of 3 free matches" giveaway on /perks (the entry form
 * is components/PerkIdeaForm.tsx). Free, promotional prize draw: no purchase,
 * random pick, adults only. Winners are announced Wed 21 Oct 2026.
 */
export default function GiveawayTerms() {
  return (
    <PageLayout showNav>
      <main className="flex-1 w-full px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <h1
            className="text-4xl text-dark mb-2 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Giveaway Terms
          </h1>
          <p className="text-muted text-sm mb-10">Last updated: September 2026</p>

          <div className="space-y-10 text-dark leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold mb-3">Who&apos;s running it</h2>
              <p>
                This giveaway is run by Amsterdam Parent Project, the organization behind Postpartum Post, to celebrate
                the launch of Post Perks and to thank you for sharing your favorite local spots with us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">What you can win</h2>
              <p>
                Three winners each receive one free round of Postpartum Post: a hand-picked match, including access to
                Post Perks, for one monthly round. The prize has no cash value and can&apos;t be exchanged for money.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">How to enter</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>
                  Share a favorite local spot using the form on our{" "}
                  <Link href="/perks" className="underline underline-offset-2 hover:text-coral transition-colors">
                    Perks page
                  </Link>{" "}
                  and check &ldquo;Yes, enter me in the giveaway!&rdquo;
                </li>
                <li>Add your email address so we can reach you if you win. Your name is optional.</li>
                <li>
                  It&apos;s free to enter. You don&apos;t need to buy anything or subscribe to Postpartum Post.
                </li>
                <li>
                  Each favorite spot you share counts as one entry, and there&apos;s no limit: share as many as you like
                  for more chances to win. (Each person can win once.)
                </li>
                <li>You must be 18 or older to enter.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">How winners are picked</h2>
              <p>
                Winners are chosen at random from all valid entries received before the drawing, so every entry has the same chance, and the more spots you share, the more chances you have. Each person can win only once: if your entry is drawn again, we&apos;ll draw another. We&apos;ll announce
                the winners on <strong>Wednesday, October 21, 2026</strong>, and we&apos;ll email each winner at the
                address they entered with. We don&apos;t select winners by any other criteria.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Your details</h2>
              <p>
                We use your email address (and your name, if you gave it) only to run this giveaway. We won&apos;t use
                it for anything else, and we don&apos;t sign you up for anything by entering. The one exception is the email box on the same form, labeled &ldquo;Get notified when it becomes a Perk&rdquo;: the email you give there is also used to tell you if the place you suggested becomes a Post Perk, and for nothing else. You can read more in
                our{" "}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-coral transition-colors">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Changes</h2>
              <p>
                If we ever need to change or cancel the giveaway, we&apos;ll update this page and let entrants know by
                email.
              </p>
            </section>

            <section>
              <p>
                Questions? Email us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>
                .
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-border text-sm text-muted space-x-4">
            <Link href="/terms" className="underline underline-offset-2 hover:text-coral transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="underline underline-offset-2 hover:text-coral transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
