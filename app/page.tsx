import SignupForm from "@/components/SignupForm";
import PageLayout from "@/components/PageLayout";

export default function Home() {
  return (
    <PageLayout showNav activeRoute="/">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full text-center mb-14">
          <h1
            className="text-5xl sm:text-6xl font-semibold leading-tight mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <span className="text-coral italic">Postpartum</span>{" "}
            <span className="text-dark">Post</span>
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-lg mx-auto">
            A thoughtful subscription pairing new parents with coffee, conversation,
            and real support — delivered to your door and your schedule.
          </p>
        </div>

        <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <h2
            className="text-xl font-semibold text-dark mb-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Join the waitlist
          </h2>
          <p className="text-sm text-muted mb-6">
            Tell us a little about yourself to get started.
          </p>
          <SignupForm />
        </div>
      </main>
    </PageLayout>
  );
}
