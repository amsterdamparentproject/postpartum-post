/**
 * GET /matches/[id]?token=<hmac>
 *
 * Private match reveal page. Requires both:
 *   1. A valid HMAC-signed link token (encodes the match ID — see lib/match-token.ts)
 *   2. Being signed in as one of the two members on *this* match
 *
 * The token alone used to be sufficient (anyone with the link could view).
 * That's no longer the case: the client checks the browser's Supabase
 * session and the server independently re-verifies it (see
 * app/actions/match-page.ts) before returning any contact details. A
 * signed-in member of a different match gets nothing back, even with a
 * valid link.
 *
 * This file just resolves the route params and renders the client-side
 * shell that owns the auth gate + data fetch. See MatchPageClient.tsx for
 * everything else.
 */

import type { Metadata } from "next";
import MatchPageClient from "@/app/matches/[id]/MatchPageClient";
import MonthlyWhimsy from "@/app/matches/[id]/MonthlyWhimsy";
import { listPublicPerks } from "@/lib/public-perks";

export const metadata: Metadata = {
  title: "Your Match · Postpartum Post",
  robots: { index: false },
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function MatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;
  // Live perks are public data (same as /perks), so they're fetched here;
  // MatchPageClient only renders them once the viewer is authorized.
  const perks = await listPublicPerks({ liveOnly: true });

  return (
    <MatchPageClient
      matchId={id}
      token={token}
      monthlyWhimsy={<MonthlyWhimsy />}
      perks={perks}
    />
  );
}
