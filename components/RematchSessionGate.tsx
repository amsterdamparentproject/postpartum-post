"use client";

/**
 * Resolves the current user's member ID from the browser session,
 * then redirects to /rematch with both member_id and match_id.
 *
 * Used when arriving from the match reveal page (/matches/[id]),
 * which is token-gated and doesn't know which member is viewing.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { getMemberProfile } from "@/app/actions/profile";

export default function RematchSessionGate({ matchId }: { matchId: string }) {
  const router = useRouter();

  useEffect(() => {
    async function resolve() {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        // Not signed in — /matches will prompt for magic link
        router.replace("/matches");
        return;
      }
      const member = await getMemberProfile(user.email);
      if (!member) {
        router.replace("/matches");
        return;
      }
      router.replace(`/rematch?member_id=${member.id}&match_id=${matchId}`);
    }
    resolve();
  }, [matchId, router]);

  return <p className="text-muted text-sm">Loading…</p>;
}
