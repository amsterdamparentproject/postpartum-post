"use client";

import { useRef, useEffect } from "react";
import ProfileForm, { type ProfileFormHandle } from "@/components/ProfileForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import NotSubscribedView from "@/components/NotSubscribedView";
import { useAccount } from "@/app/(account)/AccountContext";
import { useProfileSave } from "@/app/(account)/ProfileSaveContext";

export default function ProfilePage() {
  const { loading, email, member, topics } = useAccount();
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
    <div className="grid md:grid-cols-2 gap-6 items-start">
      {/* Left column — personal info + match preferences */}
      <div className="space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            ref={personalRef}
            memberId={member.id}
            initialData={member}
            topics={topics}
            mode="profile"
            section="personal"
          />
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            ref={prefsRef}
            memberId={member.id}
            initialData={member}
            topics={topics}
            mode="profile"
            section="preferences"
          />
        </div>
      </div>

      {/* Right column — availability & children */}
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
        <ProfileForm
          ref={detailsRef}
          memberId={member.id}
          initialData={member}
          topics={topics}
          mode="profile"
          section="details"
        />
      </div>
    </div>
  );
}
