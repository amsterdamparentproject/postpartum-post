import type { Metadata } from "next";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Postpartum Post collects, uses, and protects your personal information.",
  openGraph: {
    title: "Privacy Policy · Postpartum Post",
    description: "How Postpartum Post collects, uses, and protects your personal information.",
  },
};

export default function PrivacyPolicy() {
  return (
    <PageLayout showNav>
      <main className="flex-1 w-full px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <h1
            className="text-4xl font-semibold text-dark mb-2 leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Privacy Policy
          </h1>
          <p className="text-muted text-sm mb-10">Last updated: June 2026</p>

          <div className="space-y-10 text-dark leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold mb-3">Who we are</h2>
              <p>
                Postpartum Post is a service of Amsterdam Parent Project, based in Amsterdam, the Netherlands.
                Amsterdam Parent Project is the data controller responsible for your personal information.
              </p>
              <p className="mt-3">
                You can reach us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">What we collect and why</h2>
              <p className="mb-4">We collect only the information we need to run the service.</p>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-1">Account information</h3>
                  <p>
                    Your name and email address, collected when you sign up. We use these to create your account,
                    send your monthly match introduction, and communicate with you about your subscription.
                    The legal basis is <em>performance of a contract</em>.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Profile information</h3>
                  <p>
                    Details you add to your profile — such as your neighborhood, your children's ages, your
                    availability, and your interests. This is what we use to find you a good match each month.
                    Providing this information is voluntary, but the more you share, the better your matches will be.
                    The legal basis is <em>performance of a contract</em>.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Monthly matching preferences</h3>
                  <p>
                    Each month, we send you an email asking which topic you'd like to connect over.
                    Your response (or your choice to skip) is recorded so we can include or exclude you
                    from that month's match run.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Payment information</h3>
                  <p>
                    Payments are processed by Stripe. We do not store your card details — Stripe handles all
                    payment data under their own{" "}
                    <a
                      href="https://stripe.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-coral transition-colors"
                    >
                      privacy policy
                    </a>
                    . We receive confirmation of your subscription status from Stripe.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Analytics</h3>
                  <p>
                    We use Umami for website analytics. Umami is a privacy-first tool that does not use cookies
                    and does not collect personal data. It gives us aggregate information about how people use
                    the site, so we can improve it.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Who we share your data with</h2>
              <p className="mb-3">We do not sell or rent your personal data. We share it only with the services that help us run Postpartum Post:</p>
              <ul className="list-disc list-inside space-y-2 text-dark">
                <li><strong>Stripe</strong> — payment processing and subscription management</li>
                <li><strong>Resend</strong> — email delivery (match introductions, monthly emails, account notifications)</li>
                <li><strong>Supabase</strong> — secure database hosting for your account and profile data</li>
                <li><strong>Umami</strong> — privacy-first website analytics (no personal data shared)</li>
              </ul>
              <p className="mt-3">
                Each of these providers processes data only as necessary to deliver their service, and is bound by
                appropriate data processing agreements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">How long we keep your data</h2>
              <p>
                We keep your account and profile information for as long as your subscription is active.
                If you cancel, we retain your data for up to 12 months in case you return, then delete it.
                You can request deletion at any time (see below).
              </p>
              <p className="mt-3">
                <strong>Safety records.</strong> If a member is removed from Postpartum Post for a conduct
                violation, we retain a limited safety record — including their name, email address, and
                Stripe customer ID — beyond ordinary account deletion. This record exists so that a removed
                member cannot quietly rejoin, and to defend against any future legal claim. The legal basis
                is our legitimate interest in protecting other members and the integrity of the community,
                and the establishment or defense of legal claims — both recognized grounds under GDPR.
                This retention is an exception to the right to erasure, as permitted by Article 17(3) of the GDPR.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Your rights under GDPR</h2>
              <p className="mb-3">Because we're based in the EU, you have the following rights over your personal data:</p>
              <ul className="list-disc list-inside space-y-2 text-dark">
                <li><strong>Access</strong> — request a copy of the data we hold about you</li>
                <li><strong>Rectification</strong> — ask us to correct inaccurate data</li>
                <li><strong>Erasure</strong> — ask us to delete your data</li>
                <li><strong>Portability</strong> — receive your data in a machine-readable format</li>
                <li><strong>Restriction</strong> — ask us to limit how we process your data</li>
                <li><strong>Objection</strong> — object to processing based on legitimate interests</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, email us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>
                . We'll respond within 30 days.
              </p>
              <p className="mt-3">
                You also have the right to lodge a complaint with the Dutch Data Protection Authority (
                <a
                  href="https://www.autoriteitpersoonsgegevens.nl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-coral transition-colors"
                >
                  Autoriteit Persoonsgegevens
                </a>
                ).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Cookies</h2>
              <p>
                Postpartum Post uses only essential cookies necessary to keep you signed in and to process
                your subscription securely. We do not use tracking or advertising cookies. Our analytics
                tool (Umami) is cookieless.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Changes to this policy</h2>
              <p>
                If we make significant changes to this policy, we'll let you know by email. The "last updated"
                date at the top of this page will always reflect the most recent version.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Questions?</h2>
              <p>
                Email us at{" "}
                <a href="mailto:post@amsterdamparentproject.nl" className="underline underline-offset-2 hover:text-coral transition-colors">
                  post@amsterdamparentproject.nl
                </a>
                . We're happy to help.
              </p>
            </section>

          </div>

          <div className="mt-12 pt-8 border-t border-border text-sm text-muted">
            <Link href="/terms" className="underline underline-offset-2 hover:text-coral transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
