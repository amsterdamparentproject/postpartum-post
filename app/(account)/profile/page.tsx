"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import NotSubscribedView from "@/components/NotSubscribedView";
import { useAccount } from "@/app/(account)/AccountContext";

type OptinParam = "coffee" | "playdate" | "skip";

function OptinBanner() {
  const searchParams = useSearchParams();
  const optin = searchParams.get("optin") as OptinParam | null;
  const [showBanner, setShowBanner] = useState(!!optin);

  if (!showBanner || !optin) return null;

  return (
    <div className="bg-[#caadff]/30 border border-[#caadff] rounded-2xl px-5 py-4 flex items-start justify-between gap-4">
      <p className="text-sm text-dark leading-relaxed">
        {optin === "skip"
          ? "You're skipping your match this month — all good! We've automatically adjusted your billing cycle so that you won't be charged. See you next month 💌"
          : <>You&apos;re in! 🎉 We&apos;re excited to arrange your next <span className="font-semibold">{optin}</span>! Make sure your profile is up to date so we can find you the best match this month.</>
        }
      </p>
      <button
        onClick={() => setShowBanner(false)}
        className="shrink-0 text-muted hover:text-dark transition text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { loading, email, member } = useAccount();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!email)  return <MagicLinkRequest />;
  if (!member) return <NotSubscribedView email={email} />;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <OptinBanner />
      </Suspense>
      <div className="grid md:grid-cols-2 gap-6 items-start">
      {/* Left column — personal info + match preferences */}
      <div className="space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            initialData={member}
            mode="profile"
            section="personal"
          />
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            initialData={member}
            mode="profile"
            section="preferences"
          />
        </div>
      </div>

      {/* Right column — availability & children */}
      <div className="space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            initialData={member}
            mode="profile"
            section="details"
          />
        </div>
      </div>
    </div>
    </div>
  );
}
