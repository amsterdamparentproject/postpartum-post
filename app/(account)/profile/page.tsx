"use client";

import ProfileForm from "@/components/ProfileForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import NotSubscribedView from "@/components/NotSubscribedView";
import { useAccount } from "@/app/(account)/AccountContext";

export default function ProfilePage() {
  const { loading, email, member, topics } = useAccount();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;

  // Not signed in at all — ask them to sign in
  if (!email) return <MagicLinkRequest />;

  // Signed in but no subscription found for this email
  if (!member) return <NotSubscribedView email={email} />;

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      {/* Left column — personal info + match preferences */}
      <div className="space-y-6">
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
            memberId={member.id}
            initialData={member}
            topics={topics}
            mode="profile"
            section="personal"
          />
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <ProfileForm
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
