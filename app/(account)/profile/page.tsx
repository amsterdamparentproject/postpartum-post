"use client";

import ProfileForm from "@/components/ProfileForm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";

export default function ProfilePage() {
  const { loading, member, topics } = useAccount();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
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
  );
}
