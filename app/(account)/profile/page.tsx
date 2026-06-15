"use client";

import { useRef, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProfileForm, { type ProfileFormHandle } from "@/components/ProfileForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import NotSubscribedView from "@/components/NotSubscribedView";
import { useAccount } from "@/app/(account)/AccountContext";
import { useProfileSave } from "@/app/(account)/ProfileSaveContext";

type OptinParam = "coffee" | "playdate" | "skip" | "already_skip";

function OptinBanner() {
  const searchParams = useSearchParams();
  const optin = searchParams.get("optin") as OptinParam | null;
  const [showBanner, setShowBanner] = useState(!!optin);

  if (!showBanner || !optin) return null;

  return (
    <div className="bg-[#caadff]/30 border border-[#caadff] rounded-2xl px-5 py-4 flex items-start justify-between gap-4">
      <p className="text-sm text-dark leading-relaxed">
        {optin === "skip" || optin === "already_skip"
          ? "You're skipping your match this month — all good! We've automatically adjusted your billing cycle so that you're not charged this month. See you next month 💌"
          : <>You're in! 🎉 We're excited to arrange your next <span className="font-semibold">{optin}</span>! Make sure your profile is up to date so we can find you the best match this month.</>
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
  const { registerSave, unregisterSave, setSaveState } = useProfileSave();

  const personalRef = useRef<ProfileFormHandle>(null);
  const prefsRef    = useRef<ProfileFormHandle>(null);
  const detailsRef  = useRef<ProfileFormHandle>(null);

  useEffect(() => {
    registerSave(() => {
      setSaveState({ saving: true, saved: false });
      personalRef.current?.save();
      prefsRef.current?.save();
      detailsRef.current?.save();
      setTimeout(() => {
        setSaveState({ saving: false, saved: true });
        setTimeout(() => setSaveState({ saving: false, saved: false }), 3000);
      }, 800);
    });
    return () => unregisterSave();
  }, [registerSave, unregisterSave, setSaveState]);

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
            ref={personalRef}
            memberId={member.id}
            initialData={member}

            mode="profile"
            section="personal"
          />
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            ref={prefsRef}
            memberId={member.id}
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
            ref={detailsRef}
            memberId={member.id}
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
