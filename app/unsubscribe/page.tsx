import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import UnsubscribeForm from "@/components/UnsubscribeForm";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false },
};

export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string }>;
}) {
  const { member_id } = await searchParams;

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {member_id ? (
          <UnsubscribeForm memberId={member_id} />
        ) : (
          <p className="text-muted text-center">
            This link doesn&apos;t look right. Please use the unsubscribe link from your email.
          </p>
        )}
      </main>
    </PageLayout>
  );
}
