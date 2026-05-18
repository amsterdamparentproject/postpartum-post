"use client";

import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";

export default function MatchesPage() {
  const { loading, member } = useAccount();

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  return (
    <div className="space-y-6">
      <p className="text-muted text-sm">Your matches will appear here.</p>
    </div>
  );
}
