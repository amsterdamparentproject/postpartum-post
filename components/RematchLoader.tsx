"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "@/app/(account)/AccountContext";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import RematchForm from "@/components/RematchForm";
import { getRematchMatches, type ActiveMatch } from "@/app/actions/rematch";

function RematchLoaderInner() {
  const { loading, member, accessToken } = useAccount();
  const matchId = useSearchParams().get("match_id") ?? undefined;
  const [matches, setMatches] = useState<ActiveMatch[] | null>(null);

  useEffect(() => {
    if (!member || !accessToken) return;
    getRematchMatches(accessToken).then(setMatches);
  }, [member, accessToken]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member || !accessToken) return <MagicLinkRequest />;
  if (!matches) return <p className="text-muted text-sm text-center">Loading…</p>;

  return (
    <div className="flex justify-center py-8">
      <RematchForm accessToken={accessToken} activeMatches={matches} preselectMatchId={matchId} />
    </div>
  );
}

export default function RematchLoader() {
  return (
    <Suspense fallback={null}>
      <RematchLoaderInner />
    </Suspense>
  );
}
