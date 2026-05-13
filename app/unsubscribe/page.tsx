import Image from "next/image";
import Link from "next/link";
import UnsubscribeForm from "@/components/UnsubscribeForm";

export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string }>;
}) {
  const { member_id } = await searchParams;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Postpartum Post" width={40} height={40} />
          <span
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        {member_id ? (
          <UnsubscribeForm memberId={member_id} />
        ) : (
          <p className="text-muted text-center">
            This link doesn&apos;t look right. Please use the unsubscribe link from your email.
          </p>
        )}
      </main>

      <footer className="py-8 text-center text-sm text-muted border-t border-border">
        © {new Date().getFullYear()} Postpartum Post. All rights reserved.
      </footer>
    </div>
  );
}
