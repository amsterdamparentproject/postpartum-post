import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms and conditions for using Postpartum Post.",
  openGraph: {
    title: "Terms of Service · Postpartum Post",
    description: "The terms and conditions for using Postpartum Post.",
  },
};

export default function TermsOfService() {
  return (
    <PageLayout showNav>
      <main className="flex-1 w-full px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <h1
            className="text-4xl text-dark mb-2 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Terms of Service
          </h1>
          <p className="text-muted text-sm mb-10">Last updated: June 2026</p>

          <div className="space-y-10 text-dark leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold mb-3">About Postpartum Post</h2>
              <p>
                Postpartum Post is a monthly matchmaking service for new and expecting parents in Amsterdam,
                operated by Amsterdam Parent Project. Each month, we introduce you to one other
                parent nearby.
              </p>
              <p className="mt-3">
                By signing up for a subscription, you agree to these Terms of Service.
                If you have questions, email us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Eligibility</h2>
              <p>
                Postpartum Post is intended for parents and expecting parents in Amsterdam.
                You must be at least 18 years old to subscribe. By signing up, you confirm that
                the information you provide is accurate and that you are signing up for yourself.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Subscriptions and billing</h2>
              <p className="mb-3">
                Postpartum Post is a paid subscription service. Pricing is as follows:
              </p>
              <ul className="list-disc list-inside space-y-2 mb-4">
                <li><strong>Founding members rate</strong> — €5/month, locked in for as long as you stay subscribed</li>
                <li><strong>3-month subscription</strong> — €8/month, billed every 3 months</li>
                <li><strong>Monthly subscription</strong> — €12/month, billed monthly</li>
              </ul>
              <p>
                Subscriptions renew automatically. Payments are processed securely by Stripe.
                You can manage your subscription — including cancellation — at any time via the
                Billing tab in your profile. Cancellations take effect at the end of your current
                billing period.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Skipping and pausing</h2>
              <p>
                You can skip any month by selecting the skip option in your monthly matching email.
                If you skip, you won't receive a match introduction that month, and your subscription
                continues as normal. There is no charge for skipping.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Refunds</h2>
              <p>
                Because Postpartum Post delivers a personal, handcrafted introduction each month,
                we don't offer refunds once a match has been sent. If you experience a technical
                issue or believe there's been an error with your billing, please get in touch and
                we'll make it right.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">The matching service</h2>
              <p>
                We put genuine care into every match — but we can't guarantee compatibility or that
                a connection will form. Postpartum Post is an introduction service, not a social
                network. What happens after the introduction is up to you and your match.
              </p>
              <p className="mt-3">
                We match based on the profile information you provide. The more complete your profile,
                the better your match is likely to be.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Safety and conduct</h2>
              <p className="mb-3">
                By joining Postpartum Post, you agree to our{" "}
                <Link href="/community-guidelines" className="underline underline-offset-2 hover:text-coral transition-colors">
                  Community Guidelines
                </Link>
                . In summary, the following behaviors are not permitted:
              </p>
              <ul className="list-disc list-inside space-y-2 mb-4">
                <li>Harassment, threats, or intimidation of any kind</li>
                <li>Continued unwanted contact after a match has signaled they're not interested</li>
                <li>Sharing a match's contact details with anyone else</li>
                <li>Discriminatory behavior — including racist, homophobic, or transphobic conduct</li>
                <li>Using the service to sell, recruit, solicit money, or promote a product or ideology</li>
                <li>Misrepresenting yourself — including falsely claiming to be a parent or expecting</li>
                <li>Any behavior that threatens the physical safety of another member or their child</li>
              </ul>
              <p className="mb-3">
                When we receive a report of a conduct violation, we review it and take action proportionate
                to the severity. For serious safety concerns — threats, physical harm, stalking, or anything
                involving a child's safety — we may suspend a member from matching immediately, pending review.
                Permanent removal is decided after that review. We may also remove a member at our discretion
                for conduct that undermines the safety or trust of the community, even where it doesn't fit
                a specific category above.
              </p>
              <p>
                Members removed for conduct are not entitled to a refund. Their subscription will be canceled
                at the end of the current billing period. If you believe a removal was made in error, you may
                appeal by emailing{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Intellectual property</h2>
              <p>
                All content on Postpartum Post — including text, design, and branding — is the
                property of Amsterdam Parent Project and protected by copyright. You may not
                reproduce or redistribute any content without our written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Limitation of liability</h2>
              <p>
                Postpartum Post is provided as-is. We are not liable for any indirect or
                consequential damages arising from your use of the service, including any
                interactions with your matches. Our total liability to you for any claim related
                to the service will not exceed the amount you paid us in the three months prior
                to the claim.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Changes to these terms</h2>
              <p>
                We may update these terms from time to time. If we make significant changes,
                we'll let you know by email. Continuing to use Postpartum Post after changes
                are posted means you accept the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Governing law</h2>
              <p>
                These terms are governed by Dutch law. Any disputes will be subject to the
                jurisdiction of the courts of Amsterdam, the Netherlands.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Contact</h2>
              <p>
                Questions about these terms? Email us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>.
              </p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-border text-sm text-muted">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-coral transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
