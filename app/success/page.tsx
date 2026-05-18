import type { Metadata } from "next";
import PageLayout from "@/components/PageLayout";
import ProfileForm from "@/components/ProfileForm";

export const metadata: Metadata = {
  title: "Welcome",
  robots: { index: false },
};
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";
import { getTopics } from "@/app/actions/profile";

async function getMemberFromSession(sessionId: string) {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const memberId = session.metadata?.member_id;
    if (!memberId) return null;

    const supabase = createAdminClient();
    const { data } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, zipcode, language, topic_id, match_type, availability, match_priority, stripe_customer_id, consecutive_skips")
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
  const [member, topics] = await Promise.all([
    session_id ? getMemberFromSession(session_id) : Promise.resolve(null),
    getTopics(),
  ]);

  return (
    <PageLayout showNav>
      <main className="flex-1 px-6 py-16 max-w-lg mx-auto w-full">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-4">💌</div>
          <h1
            className="text-3xl font-semibold text-dark mb-2"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {member ? `Welcome, ${member.first_name}!` : "You're in!"}
          </h1>
          <p className="text-muted text-md leading-relaxed mt-2 mb-6">
            You&apos;re now a Postpartum Post member! 🎉 Welcome to our cozy, joyful, local community of parents showing up and building the village together.
          </p>
          <h2 className="my-2 text-coral font-semibold">One last step:</h2>
          <p className="text-muted text-sm leading-relaxed">
            Tell us a bit about yourself so we can find you the best match each month. You can always change these details later!
          </p>
        </div>

        {member ? (
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
            <ProfileForm
              memberId={member.id}
              initialData={member}
              topics={topics}
              mode="onboarding"
            />
          </div>
        ) : (
          <div className="text-center text-muted text-sm">
            <p>Your profile link is in your welcome email — check your inbox.</p>
          </div>
        )}
      </main>
    </PageLayout>
  );
}
