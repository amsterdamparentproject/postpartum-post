"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/app/(account)/AccountContext";
import { getSubscriptionDetails } from "@/app/actions/profile";
import CanceledMemberCard from "@/components/CanceledMemberCard";

/**
 * Account-wide notice for a canceled member, rendered by the account layout
 * above the tab nav so it shows on every tab. Looks up whether a live
 * subscription is left (that decides whether Resume is offered) and keeps the
 * banner mounted once shown, so the "Everything has ended" confirmation
 * survives the member refresh that follows ending.
 */
export default function CanceledMemberBanner() {
  const { member, accessToken, refreshMember } = useAccount();
  const isCanceling = member?.status === "canceling";
  const [hasLiveSubscription, setHasLiveSubscription] = useState(false);
  const [shown, setShown] = useState(false);
  const roundsLeft = member?.matches_remaining ?? 0;

  useEffect(() => {
    if (!isCanceling || !accessToken) return;
    getSubscriptionDetails(accessToken).then((data) => {
      const live = data !== null;
      setHasLiveSubscription(live);
      // Nothing to resume into and no rounds left: nothing to say. Once
      // shown, stay shown (see docblock).
      if (live || roundsLeft > 0) setShown(true);
    });
  }, [isCanceling, accessToken, roundsLeft]);

  if (!shown || !member || !accessToken) return null;

  return (
    <div className="mb-6">
      <CanceledMemberCard
        accessToken={accessToken}
        roundsLeft={roundsLeft}
        hasLiveSubscription={hasLiveSubscription}
        // The card only mounts after the member has loaded (client-side), so
        // reading the URL here can't mismatch the server render.
        openEndDialog={new URLSearchParams(window.location.search).get("end") === "1"}
        onEnded={() => {
          refreshMember();
        }}
      />
    </div>
  );
}
