import PageLayout from "@/components/PageLayout";
import RematchForm from "@/components/RematchForm";

export default async function Rematch({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string }>;
}) {
  const { member_id } = await searchParams;

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {member_id ? (
          <RematchForm memberId={member_id} />
        ) : (
          <p className="text-muted text-center">
            This link doesn&apos;t look right. Please use the rematch link from your email.
          </p>
        )}
      </main>
    </PageLayout>
  );
}
