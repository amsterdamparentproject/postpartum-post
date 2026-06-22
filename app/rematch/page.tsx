import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import RematchForm from "@/components/RematchForm";
import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/skip-token";

export const metadata: Metadata = {
  title: "Request a Rematch",
  robots: { index: false },
};

export type ActiveMatch = {
  matchId: string;
  partnerFirstName: string;
  partnerLastName: string;
  partnerEmail: string;
};

async function getActiveMatches(memberId: string): Promise<ActiveMatch[]> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  const { data } = await supabase
    .from("matches")
    .select(`
      id,
      member_id_1,
      member_id_2,
      rematch_requested,
      member1:member_id_1 ( first_name, last_name, email ),
      member2:member_id_2 ( first_name, last_name, email )
    `)
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .gte("matched_on", monthDate)
    .eq("rematch_requested", false);

  return (data ?? []).map((match) => {
    const isM1 = match.member_id_1 === memberId;
    const partnerRaw = isM1 ? match.member2 : match.member1;
    const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw;
    return {
      matchId: match.id,
      partnerFirstName: (partner as { first_name: string })?.first_name ?? "",
      partnerLastName: (partner as { last_name: string })?.last_name ?? "",
      partnerEmail: (partner as { email: string })?.email ?? "",
    };
  });
}

export default async function Rematch({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string; match_id?: string }>;
}) {
  const { member_id, match_id } = await searchParams;

  if (!member_id) {
    return (
      <PageLayout>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
          <p className="text-muted text-center">
            This link doesn&apos;t look right. Please use the rematch link from your email.
          </p>
        </main>
      </PageLayout>
    );
  }

  const activeMatches = await getActiveMatches(member_id);

  // If a specific match_id was passed (e.g. from the match card quick action),
  // pre-select it by moving it to the front of the list.
  const orderedMatches = match_id
    ? [...activeMatches].sort((a, b) => (a.matchId === match_id ? -1 : b.matchId === match_id ? 1 : 0))
    : activeMatches;

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <RematchForm memberId={member_id} activeMatches={orderedMatches} />
      </main>
    </PageLayout>
  );
}
