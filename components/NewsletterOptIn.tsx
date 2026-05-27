"use client";

import { useState } from "react";
import { subscribeToNewsletter } from "@/app/actions/newsletter";

interface NewsletterOptInProps {
  email: string;
}

export default function NewsletterOptIn({ email }: NewsletterOptInProps) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setLoading(true);
    setError(null);
    try {
      const result = await subscribeToNewsletter({
        email,
        tags: ["postpartum-post-member"],
        referringSite: "postpartumpost.com",
      });
      if (!result.success) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubscribed(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
      <h2 className="text-base font-semibold text-dark mb-3">APP newsletter</h2>
      <p className="text-sm text-muted leading-relaxed mb-4">
        Amsterdam Parent Project&apos;s newsletter is a twice-monthly email digest of upcoming
        activities for babies, toddlers, and parents, plus advice from local parenting experts.
      </p>

      {subscribed ? (
        <p className="text-sm font-medium text-dark">Already subscribed! ✓</p>
      ) : (
        <>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="text-sm font-semibold text-white bg-coral hover:bg-coral-dark px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Subscribing…" : "Subscribe"}
          </button>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
