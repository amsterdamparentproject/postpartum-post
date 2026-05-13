import Image from "next/image";
import Link from "next/link";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";

async function getMemberFromSession(sessionId: string) {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const memberId = session.metadata?.member_id;
    if (!memberId) return null;

    const supabase = createAdminClient();
    const { data } = await supabase
      .from("members")
      .select("id, first_name")
      .eq("id", memberId)
      .single();

    return data;
  } catch {
    return null;
  }
}

export default async function Success({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const member = session_id ? await getMemberFromSession(session_id) : null;

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
        <div className="max-w-lg w-full text-center">
          <div className="text-5xl mb-6">💌</div>
          <h1
            className="text-4xl font-semibold text-dark mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {member ? `Welcome, ${member.first_name}!` : "You're in!"}
          </h1>
          <p className="text-lg text-muted leading-relaxed mb-10">
            You're now a Postpartum Post member. Here's what happens next.
          </p>

          <div className="text-left space-y-4 mb-10">
            {[
              { date: "1st of the month", text: "You'll get an email to choose your topic for the month — or skip if life is hectic." },
              { date: "5th of the month", text: "Sign-ups close. We start making matches." },
              { date: "7th of the month", text: "Your intro postcard lands in your inbox with a prompt to get the conversation going." },
              { date: "14th of the month", text: "If you'd like a different match, you can request a re-match." },
              { date: "21st of the month", text: "A nudge postcard — in case life got in the way." },
            ].map(({ date, text }) => (
              <div key={date} className="flex gap-4">
                <span className="text-coral font-semibold text-sm w-36 shrink-0 pt-0.5">{date}</span>
                <p className="text-dark text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted mb-8">
            Keep an eye on your inbox — your first match is on its way.
          </p>

          <Link
            href="/"
            className="py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
          >
            Back to home
          </Link>
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-muted border-t border-border">
        © {new Date().getFullYear()} Postpartum Post. All rights reserved.
      </footer>
    </div>
  );
}
