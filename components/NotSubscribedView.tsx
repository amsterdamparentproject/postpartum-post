"use client";

import { useEffect, useState } from "react";
import SignupForm from "@/components/SignupForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { getSignupMeta, type SignupMeta } from "@/app/actions/signup";

export default function NotSubscribedView({ email }: { email: string }) {
  const [meta, setMeta] = useState<SignupMeta | null>(null);

  useEffect(() => {
    getSignupMeta().then(setMeta);
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-6">

      {/* Error message */}
      <div className="rounded-xl border border-coral/30 bg-coral/5 px-5 py-4 text-center space-y-1">
        <p className="text-sm font-semibold text-coral">We couldn&apos;t find that email</p>
        <p className="text-sm text-muted leading-relaxed">
          <strong className="text-dark">{email}</strong>{" "}isn&apos;t associated with a subscription.
          Try a different address, or sign up below.
        </p>
      </div>

      {/* Try a different email */}
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
        <MagicLinkRequest />
      </div>

      {/* Subscribe */}
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
        <h2
          className="text-xl font-semibold text-dark mb-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Receive your monthly Post 💌
        </h2>
        <p className="text-sm text-muted mb-6">
          Subscribe and we&apos;ll introduce you to another new parent in Amsterdam each month.
        </p>
        <SignupForm
          first20SpotsRemaining={meta?.first20SpotsRemaining}
          pilotOnly={meta?.pilotOnly ?? true}
        />
      </div>

    </div>
  );
}
