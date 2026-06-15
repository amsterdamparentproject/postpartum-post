import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "How we treat each other at Postpartum Post — and how we keep the community safe.",
  openGraph: {
    title: "Community Guidelines · Postpartum Post",
    description: "How we treat each other at Postpartum Post — and how we keep the community safe.",
  },
};

export default function CommunityGuidelines() {
  return (
    <PageLayout showNav>
      <main className="flex-1 w-full px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <h1
            className="text-4xl text-dark mb-4 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Community Guidelines
          </h1>
          <p className="text-dark leading-relaxed mb-10">
            Postpartum Post introduces real people to each other — often at a vulnerable, tender time in their lives.
            We don't do heavy vetting at the door, which means the safety and warmth of this community rests on all of us.
            These guidelines are what we ask every member to agree to, and what we use to keep the community a good place to be.
          </p>

          <div className="space-y-10 text-dark leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold mb-3">Be who you say you are</h2>
              <p>
                Postpartum Post is for parents and expecting parents who are 18 or older. By joining, you confirm that's you.
                We can't verify everything — and that's okay — but misrepresenting yourself to gain access to other members is a serious violation of trust, and of these guidelines.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Meet safely</h2>
              <p className="mb-3">A few things we ask of everyone:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Consider meeting in a public place the first time — a café, a park, anywhere with other people around.</li>
                <li>You never owe anyone a second meeting. One cup of coffee and a friendly goodbye is always enough.</li>
                <li>Don't share your match's contact details with anyone else.</li>
                <li>If something feels off, trust that feeling — and{" "}
                  <Link href="mailto:post@amsterdamparentproject.nl?subject=Postpartum%20Post%3A%20Report" className="underline underline-offset-2 hover:text-coral transition-colors">
                    tell us
                  </Link>.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Be kind</h2>
              <p>
                Everyone here is doing their best in the thick of early parenthood. We ask that you treat your matches
                — and anyone else you connect with through this community — with warmth and respect.
                This means no harassment, no discrimination, and no cruelty. Racist, homophobic, transphobic, or otherwise
                hateful behavior toward a match will lead to removal.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">No selling, recruiting, or soliciting</h2>
              <p>
                Postpartum Post is for connection, not business. Please don't use it to pitch products, recruit
                for MLMs, solicit money, or pressure anyone into a group or belief system. A match who came hoping
                for a friend and got a sales pitch is not a good experience for anyone.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Respect people's boundaries after a meeting</h2>
              <p>
                If a match doesn't respond or signals they'd rather not stay in touch, please respect that.
                Continued unwanted contact — messages, showing up uninvited, or finding someone through other channels
                after they've asked you not to — is not okay and will be treated as a serious violation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">How to report a concern</h2>
              <p>
                If something felt off, you don't need proof and you don't need to be certain. That's enough to tell us.
                We read every report, and we keep all reports confidential — we will never tell the other person
                who reported them, or that a report was made.
              </p>
              <p className="mt-3">
                You can{" "}
                <Link href="mailto:post@amsterdamparentproject.nl?subject=Postpartum%20Post%3A%20Report" className="underline underline-offset-2 hover:text-coral transition-colors">
                  submit a report here
                </Link>
                {" "}— no login required. We'll acknowledge it within 24 hours and resolve it within 72.
                If you're ever in immediate danger, contact emergency services: <strong>112</strong> in the Netherlands.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">What happens when someone breaks the rules</h2>
              <p>
                When we receive a report, a real person reads it. Depending on the severity:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-3">
                <li>We may issue a warning.</li>
                <li>We may suspend a member from matching while we review.</li>
                <li>We may permanently remove a member from the community.</li>
              </ul>
              <p className="mt-3">
                For anything involving physical safety, harm to a child, threats, or stalking, we suspend immediately
                and investigate after. The safety of the person who reported comes first.
              </p>
              <p className="mt-3">
                Members removed for conduct are not entitled to a refund. Their subscription is canceled at
                the end of the current billing period so no further charges occur.
              </p>
              <p className="mt-3">
                If you believe you were removed in error, you can appeal by emailing{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>
                . We'll review it with fresh eyes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Questions?</h2>
              <p>
                Email us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>
                . These guidelines exist because we care about this community — if something here is unclear,
                we want to know.
              </p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-border text-sm text-muted space-x-4">
            <Link href="/terms" className="underline underline-offset-2 hover:text-coral transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="underline underline-offset-2 hover:text-coral transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
