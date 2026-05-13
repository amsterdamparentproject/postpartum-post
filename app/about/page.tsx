import Image from "next/image";
import Link from "next/link";

export default function About() {
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
        <nav className="flex gap-6 text-sm font-medium text-muted">
          <Link href="/about" className="text-dark font-semibold">
            About
          </Link>
        </nav>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 w-full">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="rounded-2xl overflow-hidden border border-border">
            <Image
              src="/logo.png"
              alt="About Postpartum Post"
              width={600}
              height={700}
              className="w-full h-full object-cover"
            />
          </div>

          <div>
            <h1
              className="text-4xl font-semibold text-dark mb-6 leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              About{" "}
              <span className="text-coral italic">Postpartum Post</span>
            </h1>
            <div className="space-y-4 text-muted leading-relaxed">
              <p>
                The postpartum period is one of the most transformative — and often
                isolating — times in a parent&apos;s life. We created Postpartum Post
                to change that.
              </p>
              <p>
                We match new parents in the same neighborhood for coffee and
                conversation, so you never have to navigate early parenthood alone.
                Whether you&apos;re in the thick of newborn nights or looking for a
                friendly face at the park, we&apos;re here to help you find your people.
              </p>
              <p>
                Our subscriptions are thoughtfully designed to fit around nap
                schedules, feeding sessions, and everything in between. You choose
                the topic, the language, and we handle the rest.
              </p>
            </div>
            <Link
              href="/"
              className="inline-block mt-8 py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
            >
              Sign up today
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-muted border-t border-border">
        © {new Date().getFullYear()} Postpartum Post. All rights reserved.
      </footer>
    </div>
  );
}
